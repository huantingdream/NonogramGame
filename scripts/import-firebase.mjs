// Run inside the private server environment after copying exports to /migration.
// Idempotent import: existing users/password upgrades and existing scores are never overwritten.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPool } from '../server/db.js';
import { migrate } from '../server/migrate.js';
import { scoreSchema } from '../shared/validation.js';
const dir = process.env.IMPORT_DIR || '/migration';
const users = JSON.parse(await readFile(resolve(dir,'users.json'),'utf8')).users;
const documents = JSON.parse(await readFile(resolve(dir,'scores.json'),'utf8')).documents;
const pool = createPool();
await migrate(pool);
const connection = await pool.getConnection();
const decode = fields => Object.fromEntries(Object.entries(fields).map(([key,value]) => [key,
  value.stringValue ?? value.timestampValue ?? (value.integerValue !== undefined ? Number(value.integerValue) : value.doubleValue ?? value.booleanValue ?? null)]));
try {
  await connection.beginTransaction();
  let insertedUsers = 0, insertedScores = 0;
  const canonical = new Map();
  for (const u of [...users].sort((a,b) => Number(b.lastLoginAt || b.createdAt)-Number(a.lastLoginAt || a.createdAt))) {
    const email = u.email.trim().toLowerCase();
    if (!canonical.has(email)) canonical.set(email,u.localId);
  }
  for (const u of users) {
    if (!u.localId || !u.email || !u.passwordHash || !u.salt) throw new Error('Account missing required migration fields');
    const [existing] = await connection.execute('SELECT id,email FROM users WHERE id=?',[u.localId]);
    if (existing.length) {
      if (existing.length !== 1 || existing[0].email !== u.email.trim().toLowerCase()) throw new Error('Account identity conflict; import cancelled');
      continue;
    }
    await connection.execute('INSERT INTO users (id,email,login_email,display_name,legacy_hash,legacy_salt,disabled,email_verified,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [u.localId,u.email.trim().toLowerCase(),canonical.get(u.email.trim().toLowerCase())===u.localId ? u.email.trim().toLowerCase() : null,(u.displayName||`玩家${u.localId.slice(0,6)}`).slice(0,20),u.passwordHash,u.salt,!!u.disabled,!!u.emailVerified,new Date(Number(u.createdAt))]);
    insertedUsers++;
  }
  for (const doc of documents) {
    const data = decode(doc.fields), id = doc.name.split('/').at(-1);
    const { uid, nickname, createdAt, ...score } = data;
    score.game ||= 'nonogram';
    scoreSchema.parse(score);
    const [existing] = await connection.execute('SELECT id FROM scores WHERE user_id=? AND game=? AND size=? AND difficulty=? AND puzzle_seed=?',[uid,score.game,score.size,score.difficulty,score.puzzleSeed]);
    if (existing.length) continue;
    await connection.execute('INSERT INTO scores (id,user_id,nickname,game,size,difficulty,elapsed_seconds,puzzle_id,puzzle_seed,average_ms,hits,shots,points,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [id,uid,nickname,score.game,score.size,score.difficulty,score.elapsedSeconds,score.puzzleId,score.puzzleSeed,score.averageMs??null,score.hits??null,score.shots??null,score.points??null,new Date(createdAt)]);
    insertedScores++;
  }
  // Verify every exported identity and score before committing, including old game-less records.
  for(const u of users) {
    const [[row]] = await connection.execute('SELECT email,legacy_hash,password_hash FROM users WHERE id=?',[u.localId]);
    if (!row || row.email !== u.email.trim().toLowerCase() || (!row.password_hash && row.legacy_hash !== u.passwordHash)) throw new Error('Account verification failed');
  }
  for(const doc of documents) {
    const d=decode(doc.fields);
    const [[row]]=await connection.execute('SELECT nickname,elapsed_seconds,average_ms,hits,shots,points FROM scores WHERE user_id=? AND game=? AND size=? AND difficulty=? AND puzzle_seed=?',[d.uid,d.game||'nonogram',d.size,d.difficulty,d.puzzleSeed]);
    if (!row || row.nickname!==d.nickname || row.elapsed_seconds!==d.elapsedSeconds || ['average_ms','hits','shots','points'].some((key,i)=>row[key] !== (d[['averageMs','hits','shots','points'][i]]??null))) throw new Error('Score verification failed');
  }
  await connection.commit();
  console.log(JSON.stringify({ verifiedUsers:users.length, verifiedScores:documents.length, insertedUsers, insertedScores, duplicateEmailAccounts:users.length-canonical.size }));
} catch(error) { await connection.rollback(); console.error('Import rolled back:', error.name, error.message.slice(0,200)); process.exitCode=1; }
finally { connection.release(); await pool.end(); }
