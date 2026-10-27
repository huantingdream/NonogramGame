// One-time administrative export. Never deploy this script or its output publicly.
// Requires the owner's explicit permission to export authentication hashes.
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const { clientId, clientSecret } = require(path.join(process.env.FIREBASE_TOOLS_PATH, 'lib/api.js'));
  const cfg = JSON.parse(fs.readFileSync(path.join(process.env.HOME, '.config/configstore/firebase-tools.json'), 'utf8'));
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: cfg.tokens.refresh_token, client_id: clientId(), client_secret: clientSecret() }),
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error(`Firebase authorization HTTP ${response.status}`);
  const token = (await response.json()).access_token;
  const get = async url => {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`${new URL(url).pathname}: HTTP ${r.status}`);
    return r.json();
  };
  const project = process.env.FIREBASE_PROJECT || 'nonogram-9d316';
  const out = process.env.EXPORT_DIR;
  if (!out || !path.isAbsolute(out)) throw new Error('EXPORT_DIR must be an absolute private directory');
  fs.mkdirSync(out, { recursive: true, mode: 0o700 }); fs.chmodSync(out, 0o700);
  const save = (name, data) => fs.writeFileSync(path.join(out, name), JSON.stringify(data), { mode: 0o600 });
  const config = await get(`https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`);
  // Store only the hash parameters, never refresh/access tokens or unrelated auth settings.
  save('hash-config.json', config.signIn?.hashConfig || {});
  let users = [], pageToken = '';
  do {
    const page = await get(`https://identitytoolkit.googleapis.com/v1/projects/${project}/accounts:batchGet?maxResults=1000&nextPageToken=${encodeURIComponent(pageToken)}`);
    users.push(...(page.users || [])); pageToken = page.nextPageToken || '';
  } while (pageToken);
  save('users.json', { users });
  let documents = []; pageToken = '';
  do {
    const page = await get(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/scores?pageSize=1000&pageToken=${encodeURIComponent(pageToken)}`);
    documents.push(...(page.documents || [])); pageToken = page.nextPageToken || '';
  } while (pageToken);
  save('scores.json', { documents });
  console.log(JSON.stringify({ users: users.length, usersWithPasswordHash: users.filter(u => u.passwordHash).length, scores: documents.length, hashConfigFields: Object.keys(config.signIn?.hashConfig || {}) }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
