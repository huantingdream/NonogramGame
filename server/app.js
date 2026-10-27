import Fastify from 'fastify';
import { registerPersonalStats } from './personal-stats.js';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import staticFiles from '@fastify/static';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { hashPassword, verifyPassword, verifyLegacyPassword } from './password.js';
import { filterSchema, scoreSchema, loginSchema, registerSchema } from '../shared/validation.js';
import { scoreOrder } from '../shared/score.js';
const digest = token => createHash('sha256').update(token).digest('hex');
const publicUser = row => ({ uid: row.id, email: row.email, displayName: row.display_name });
const fail = (statusCode, code, message) => Object.assign(new Error(message), { statusCode, code });
const columns = { averageMs: 'average_ms', hits: 'hits', shots: 'shots', points: 'points', elapsedSeconds: 'elapsed_seconds', createdAt: 'created_at' };
export async function buildApp({ pool, origin = 'http://localhost:7100', secure = false, logger = false, legacyConfig = null, serveStatic = true, staticRoot = null, limits = true }) {
  const app = Fastify({ logger, trustProxy: (process.env.TRUSTED_PROXIES || "loopback").split(","), bodyLimit: 16 * 1024, requestTimeout: 15000 });
  await app.register(cookie);
  await app.register(helmet, { contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'blob:'], connectSrc: ["'self'"], fontSrc: ["'self'"],
    objectSrc: ["'none'"], frameAncestors: ["'none'"], upgradeInsecureRequests: secure ? [] : null
  } }, strictTransportSecurity: secure ? { maxAge: 31536000 } : false });
  if (limits) await app.register(rateLimit, { max: 120, timeWindow: '1 minute', errorResponseBuilder: () => ({ statusCode: 429, code: 'auth/too-many-requests', message: '尝试次数过多，请稍后再试。' }) });
  const cookieOptions = { path: '/', httpOnly: true, secure, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30 };
  const cookieName = secure ? '__Host-gejian_session' : 'gejian_session';
  const dummyHash = await hashPassword(randomBytes(32).toString('hex'));
  app.setErrorHandler((error, request, reply) => {
    const status = error.statusCode || 500;
    if (status >= 500) request.log.error({ code: error.code, requestId: request.id }, 'Request failed');
    reply.code(status).send({ code: status >= 500 ? 'internal-error' : error.code || 'bad-request', message: status >= 500 ? '服务暂时不可用，请稍后重试。' : error.message });
  });
  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/')) return;
    reply.header('Cache-Control', 'no-store');
    if (!['GET','HEAD','OPTIONS'].includes(request.method)) {
      if (request.headers['x-gejian-request'] !== '1' || (request.headers.origin && request.headers.origin !== origin) || request.headers['sec-fetch-site'] === 'cross-site') {
        throw fail(403, 'csrf-rejected', '请求来源无效，请刷新页面后重试。');
      }
    }
  });
  async function sessionUser(request) {
    const token = request.cookies[cookieName];
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const [rows] = await pool.execute('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP(3) AND u.disabled=FALSE', [digest(token)]);
    return rows[0] || null;
  }
  async function requireUser(request) {
    const user = await sessionUser(request);
    if (!user) throw fail(401, 'auth-required', '登录状态已过期，请重新登录。');
    return user;
  }
  async function createSession(userId, request, reply) {
    if (request.cookies[cookieName]) await pool.execute('DELETE FROM sessions WHERE token_hash=?', [digest(request.cookies[cookieName])]);
    const token = randomBytes(32).toString('hex');
    await pool.execute('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 30 DAY))', [digest(token),userId]);
    reply.setCookie(cookieName, token, cookieOptions);
  }
  function parse(schema, data) {
    const parsed = schema.safeParse(data);
    if (!parsed.success) throw fail(400, 'invalid-input', '提交的数据无效，请检查邮箱、密码、昵称或游戏成绩。');
    return parsed.data;
  }
  const authLimits = limits ? { config: { rateLimit: { max: 20, timeWindow: '15 minutes' } } } : {};
  registerPersonalStats(app, {pool, requireUser, parse, fail});
  app.get('/api/health', async () => { await pool.query('SELECT 1'); return { status: 'ok' }; });
  app.get('/api/auth/me', async request => { const user = await sessionUser(request); return { user: user ? publicUser(user) : null }; });
  app.post('/api/auth/register', authLimits, async (request, reply) => {
    const { email, password, nickname } = parse(registerSchema, request.body);
    const user = { id: randomUUID(), email, display_name: nickname };
    const passwordHash = await hashPassword(password);
    try { await pool.execute('INSERT INTO users (id,email,login_email,display_name,password_hash) VALUES (?,?,?,?,?)', [user.id,email,email,nickname,passwordHash]); }
    catch(error) { if (error.code === 'ER_DUP_ENTRY') throw fail(409, 'auth/email-already-in-use', '这个邮箱已经注册，可以直接登录。'); throw error; }
    await createSession(user.id, request, reply);
    reply.code(201); return { user: publicUser(user) };
  });
  app.post('/api/auth/login', authLimits, async (request, reply) => {
    const { email, password } = parse(loginSchema, request.body);
    const [rows] = await pool.execute('SELECT * FROM users WHERE email=? ORDER BY login_email IS NOT NULL DESC,created_at DESC,id', [email]);
    let user = null;
    // Imported duplicate emails retain distinct UIDs. Prefer the most recently active canonical account,
    // then try the other original password. Never merge scores or silently discard an identity.
    for (const candidate of rows) {
      const valid = candidate.legacy_hash && !candidate.password_hash
        ? await verifyLegacyPassword(password, candidate.legacy_hash, candidate.legacy_salt, legacyConfig)
        : await verifyPassword(password, candidate.password_hash || dummyHash);
      if (valid && !candidate.disabled) { user = candidate; break; }
    }
    if (!rows.length) await verifyPassword(password, dummyHash);
    if (!user) throw fail(401, 'auth/invalid-credential', '邮箱或密码不正确。');
    if (!user.password_hash) await pool.execute('UPDATE users SET password_hash=?,legacy_hash=NULL,legacy_salt=NULL WHERE id=? AND password_hash IS NULL', [await hashPassword(password), user.id]);
    await createSession(user.id, request, reply); return { user: publicUser(user) };
  });
  app.post('/api/auth/logout', async (request, reply) => {
    if (request.cookies[cookieName]) await pool.execute('DELETE FROM sessions WHERE token_hash=?', [digest(request.cookies[cookieName])]);
    reply.clearCookie(cookieName, { path: '/', secure, httpOnly: true, sameSite: 'lax' }); return { ok: true };
  });
  app.post('/api/scores', async request => {
    const user = await requireUser(request);
    const s = parse(scoreSchema, request.body);
    try {
      await pool.execute(`INSERT INTO scores (id,user_id,nickname,game,size,difficulty,elapsed_seconds,puzzle_id,puzzle_seed,average_ms,hits,shots,points)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [randomUUID(),user.id,user.display_name,s.game,s.size,s.difficulty,s.elapsedSeconds,s.puzzleId,s.puzzleSeed,s.averageMs??null,s.hits??null,s.shots??null,s.points??null]);
      return { duplicate: false };
    } catch(error) { if (error.code === 'ER_DUP_ENTRY') return { duplicate: true }; throw error; }
  });
  app.get('/api/leaderboard', async request => {
    await requireUser(request);
    const filter = parse(filterSchema, { ...request.query, size: Number(request.query.size) });
    // SQL identifiers come only from the static scoreOrder/columns maps; user input is parameterized.
    const order = scoreOrder(filter.game).map(([key,direction]) => `${columns[key]} ${direction}`).join(',');
    const [rows] = await pool.execute(`SELECT id,user_id AS uid,nickname,game,elapsed_seconds AS elapsedSeconds,puzzle_id AS puzzleId,average_ms AS averageMs,hits,shots,points FROM scores WHERE game=? AND size=? AND difficulty=? ORDER BY ${order},id ASC LIMIT 20`, [filter.game,filter.size,filter.difficulty]);
    return { scores: rows };
  });
  if (serveStatic) {
    const root = staticRoot || fileURLToPath(new URL('../dist', import.meta.url));
    if (!existsSync(root)) throw new Error('Run npm run build before starting the server');
    await app.register(staticFiles, { root, maxAge: 0, setHeaders(response, path) {
      if (/\/assets\/[^/]+-[a-zA-Z0-9_-]{8,}\.(js|css)$/.test(path)) response.header('Cache-Control', 'public, max-age=31536000, immutable');
      else if (path.endsWith('.html')) response.header('Cache-Control', 'no-cache');
    } });
  }
  return app;
}
