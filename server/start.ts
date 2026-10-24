import { createStudyServer } from './app.js';
import { siteHandler } from './site.js';
const port = Number(process.env.PORT ?? 4173);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer from 0 to 65535.');
const app = createStudyServer(siteHandler);
console.log(`Study Room ${process.env.STUDY_DEPLOYMENT_MODE === 'hosted' ? 'hosted' : 'local demo'}: ${await app.listen(port)}`);
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, async () => { await app.close(); process.exit(0); });
