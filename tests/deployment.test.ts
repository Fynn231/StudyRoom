import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createStudyServer } from '../server/app.js';
import { assertLocalDeployment } from '../server/deployment.js';
import { createInferenceHandler } from '../server/ai.js';

test('deployment configuration rejects unknown modes and public origin settings in local mode', () => {
  assert.doesNotThrow(() => assertLocalDeployment({}));
  assert.doesNotThrow(() => assertLocalDeployment({ STUDY_DEPLOYMENT_MODE: 'local' }));
  for (const mode of ['', 'production', 'HOSTED', ' local', 'unknown']) {
    assert.throws(() => assertLocalDeployment({ STUDY_DEPLOYMENT_MODE: mode }), /STUDY_DEPLOYMENT_MODE/);
  }
  assert.throws(() => assertLocalDeployment({ STUDY_PUBLIC_ORIGIN: 'https://study.example' }), /STUDY_PUBLIC_ORIGIN.*hosted/);
});

test('hosted origin config requires one canonical exact HTTPS DNS origin, never a trust wildcard', () => {
  for (const origin of ['', 'http://study.example', 'https://study.example/', 'https://study.example/path', 'https://study.example?x=1', 'https://study.example#x', 'https://user:password@study.example', 'https://*.example', 'https://study.example,https://other.example', 'https://STUDY.example', 'https://study.example:443', 'https://localhost', 'https://127.0.0.1', 'https://[::1]', 'null']) {
    assert.throws(() => assertLocalDeployment({ STUDY_DEPLOYMENT_MODE: 'hosted', STUDY_PUBLIC_ORIGIN: origin }), /STUDY_PUBLIC_ORIGIN/, origin);
  }
  for (const origin of ['https://study.example', 'https://study.example:8443']) {
    assert.throws(() => assertLocalDeployment({ STUDY_DEPLOYMENT_MODE: 'hosted', STUDY_PUBLIC_ORIGIN: origin }), /Hosted mode is unavailable.*authentication/);
  }
});

test('explicit hosted mode fails closed before listeners or AI operator setup', () => {
  const previous = process.env.STUDY_DEPLOYMENT_MODE;
  process.env.STUDY_DEPLOYMENT_MODE = 'hosted';
  try {
    assert.throws(() => createStudyServer(), /Hosted mode is unavailable.*authentication/i);
    assert.throws(() => createInferenceHandler({ executable: process.execPath, script: '/not-launched.cjs' }), /Hosted mode is unavailable.*authentication/i);
  } finally {
    if (previous === undefined) delete process.env.STUDY_DEPLOYMENT_MODE; else process.env.STUDY_DEPLOYMENT_MODE = previous;
  }
});

test('normal and AI launchers exit nonzero in hosted mode, even with an exact HTTPS origin', () => {
  for (const script of ['server/start.ts', 'server/start-ai.ts']) {
    const child = spawnSync(process.execPath, ['--import', 'tsx', script], {
      cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 3000,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, PORT: '0', STUDY_DEPLOYMENT_MODE: 'hosted', STUDY_PUBLIC_ORIGIN: 'https://study.example' },
    });
    assert.equal(child.error, undefined, `${script}: must exit instead of listening`);
    assert.equal(child.status, 1);
    assert.match(child.stderr, /Hosted mode is unavailable.*authentication/i);
    assert.doesNotMatch(child.stdout, /local demo/);
  }
});

test('hosted configuration accepts only public project keys and an explicit Render proxy policy',()=>{
 const base={STUDY_DEPLOYMENT_MODE:'hosted',STUDY_PUBLIC_ORIGIN:'https://study.example',SUPABASE_URL:'https://synthetic.invalid',SUPABASE_ANON_KEY:'sb_publishable_synthetic',STUDY_PROXY_POLICY:'render'};
 assert.doesNotThrow(()=>assertLocalDeployment(base));
 for(const key of ['sb_secret_synthetic','service_role','',`e30.${Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')}.synthetic`])assert.throws(()=>assertLocalDeployment({...base,SUPABASE_ANON_KEY:key}));
 assert.throws(()=>assertLocalDeployment({...base,STUDY_PROXY_POLICY:'trust-all'}),/proxy|PROXY/i);
});
