import type { IncomingMessage, ServerResponse } from 'node:http';
import { spawn } from 'node:child_process';
import { isAbsolute } from 'node:path';
import { assertLocalDeployment } from './deployment.js';
import { validateRequest, validatePlan, type StudyRequest } from '../src/aiStudy.js';

export type InferenceConfig = { executable: string; script: string; timeoutMs?: number };
export function inferenceConfig(): InferenceConfig | undefined {
  const executable = process.env.STUDY_AI_EXECUTABLE, script = process.env.STUDY_AI_SCRIPT;
  return executable && script && isAbsolute(executable) && isAbsolute(script) ? { executable, script } : undefined;
}
function infer(config: InferenceConfig, request: StudyRequest, signal: AbortSignal): Promise<unknown> {
  return new Promise((resolve, reject) => {
    // Server-operator configuration only; never commands, arguments or environment from HTTP.
    const child = spawn(config.executable, [config.script], { shell: false, detached: true, stdio: ['pipe', 'pipe', 'ignore'], env: { HOME: process.env.HOME, PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, LANG: 'en_US.UTF-8' } });
    let output = '', bytes = 0, settled = false;
    const finish = (error?: Error, value?: unknown) => { if (settled) return; settled = true; clearTimeout(timer); signal.removeEventListener('abort', abort); if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } } error ? reject(error) : resolve(value); };
    const abort = () => finish(new Error('Cancelled'));
    const timer = setTimeout(() => finish(new Error('Timeout')), Math.min(60000, Math.max(100, config.timeoutMs ?? 60000)));
    signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort();
    child.on('error', () => finish(new Error('Unavailable')));
    child.stdin.on('error', () => finish(new Error('Unavailable')));
    child.stdout.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > 32768) finish(new Error('Output limit')); else output += chunk.toString('utf8'); });
    child.on('close', code => { if (code !== 0) finish(new Error('Unavailable')); else { try { finish(undefined, JSON.parse(output)); } catch { finish(new Error('Invalid output')); } } });
    child.stdin.end(JSON.stringify(request));
  });
}
export function createInferenceHandler(config?: InferenceConfig) {
  assertLocalDeployment();
  const hosted = process.env.STUDY_DEPLOYMENT_MODE === 'hosted';
  if (hosted) config = undefined;
  let liveVerified = false, busy = false;
  const calls: number[] = [];
  const active = new Set<AbortController>();
  const handle = async function (req: IncomingMessage, res: ServerResponse): Promise<void> {
    const send = (status: number, data: unknown) => { if (!res.destroyed) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); } };
    if (req.url === '/api/ai/status' && req.method === 'GET') { send(200, { configured: !!config, liveVerified }); return; }
    if (req.url === '/api/model/health' && req.method === 'POST') { send(200, { status: 'ok' }); return; }
    if (req.url !== '/api/ai/plan') { send(404, { error: 'Not found.' }); return; }
    if (req.method !== 'POST') { send(405, { error: 'Use POST.' }); return; }
    if (hosted) { send(503, { error: 'Hosted AI is disabled. The offline roadmap is available.' }); return; }
    if (req.headers.origin !== `http://${req.headers.host}` || (req.headers['sec-fetch-site'] !== undefined && req.headers['sec-fetch-site'] !== 'same-origin')) { send(403, { error: 'Same-origin browser action required.' }); return; }
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] ?? '') || req.headers['content-encoding']) { send(415, { error: 'Use uncompressed JSON.' }); return; }
    if (Number(req.headers['content-length'] ?? 0) > 24576) { send(413, { error: 'Selection too large.' }); return; }
    const controller = new AbortController(); active.add(controller);
    const abort = () => controller.abort(); req.once('aborted', abort); res.once('close', abort);
    let readTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      let bytes = 0; const chunks: Buffer[] = [];
      readTimer = setTimeout(() => { send(408, { error: 'Request timed out.' }); req.destroy(); }, 5000);
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 24576) { send(413, { error: 'Selection too large.' }); return; } chunks.push(chunk); }
      clearTimeout(readTimer);
      let request: StudyRequest;
      try { request = validateRequest(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)))); } catch { send(400, { error: 'Review your selected excerpts, answers and time budget.' }); return; }
      if (!config) { send(503, { error: 'AI is not configured. The offline roadmap is still available.' }); return; }
      const now = Date.now(); while (calls.length && calls[0] <= now - 60000) calls.shift();
      if (busy || calls.length >= 4) { send(429, { error: 'AI is busy or its local limit was reached. Wait a minute; your plan is unchanged.' }); return; }
      calls.push(now); busy = true;
      try {
        const output = await infer(config, request, controller.signal);
        const envelope = output as { plan?: unknown; verification?: Record<string, unknown> };
        const plan = validatePlan(envelope?.plan, request);
        const v = envelope?.verification;
        const verification = v?.provider === 'openai-codex' && v.serverReportedModel === 'gpt-6.1-sol' && v.endpointHost === 'chatgpt.com' && v.toolsEnabled === false && v.maxRetries === 0 ? { provider: 'openai-codex', serverReportedModel: 'gpt-6.1-sol', endpointHost: 'chatgpt.com', toolsEnabled: false, maxRetries: 0 } : undefined;
        if (!verification || !v || Object.keys(v).length !== 5 || Object.keys(envelope).sort().join('|') !== 'plan|verification') throw new Error('Missing provider verification');
        liveVerified = true; send(200, { requestId: request.requestId, plan, verification });
      } catch { send(502, { error: 'AI could not return a valid plan. Your current progress is unchanged. Try the offline roadmap or retry explicitly.' }); }
      finally { busy = false; }
    } catch { send(400, { error: 'Could not read request.' }); }
    finally { active.delete(controller); if (readTimer) clearTimeout(readTimer); req.removeListener('aborted', abort); res.removeListener('close', abort); }
  };
  return Object.assign(handle, { close: () => { for (const controller of active) controller.abort(); } });
}
