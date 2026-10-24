import { createServer } from 'vite';
import { createStudyServer } from './app.js';
const port = Number(process.env.PORT ?? 4173);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer from 0 to 65535.');
const app = createStudyServer((req, res) => vite.middlewares(req, res));
const vite = await createServer({ server: { middlewareMode: true, host: '127.0.0.1', allowedHosts: ['localhost'], hmr: { server: app.http } }, appType: 'spa' });
console.log(`Study Room local demo (development): ${await app.listen(port)}`);
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, async () => { await vite.close(); await app.close(); process.exit(0); });
