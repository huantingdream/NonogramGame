import { readFile } from 'node:fs/promises';
import { createPool } from './db.js';
import { migrate } from './migrate.js';
import { buildApp } from './app.js';
const production = process.env.NODE_ENV === 'production';
const origin = process.env.APP_ORIGIN || 'http://localhost:7100';
if (production && !origin.startsWith('https://')) throw new Error('Production APP_ORIGIN must use HTTPS');
const pool = createPool();
await migrate(pool);
const legacyConfig = process.env.LEGACY_HASH_CONFIG_FILE ? JSON.parse(await readFile(process.env.LEGACY_HASH_CONFIG_FILE, 'utf8')) : null;
const app = await buildApp({ pool, origin, secure: production, legacyConfig, logger: { level: 'info', redact: ['req.headers.cookie','req.headers.authorization','res.headers["set-cookie"]'] } });
const cleanup = setInterval(() => pool.execute('DELETE FROM sessions WHERE expires_at<UTC_TIMESTAMP(3)').catch(() => app.log.error('Session cleanup failed')), 3600000);
cleanup.unref();
let closing = false;
async function shutdown() { if (closing) return; closing = true; clearInterval(cleanup); await app.close(); await pool.end(); }
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
try { await app.listen({ port: Number(process.env.PORT || 3100), host: process.env.HOST || '127.0.0.1' }); }
catch(error) { await pool.end(); throw error; }
