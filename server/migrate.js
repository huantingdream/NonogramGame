import { readdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createPool } from './db.js';
export async function migrate(pool) {
  const connection = await pool.getConnection();
  try {
    const [[lock]] = await connection.query("SELECT GET_LOCK('gejian_schema', 30) AS acquired");
    if (!lock.acquired) throw new Error('Could not acquire schema migration lock');
    await connection.query('CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(255) PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    const [rows] = await connection.query('SELECT name FROM schema_migrations');
    const done = new Set(rows.map(row => row.name));
    const directory = new URL('./migrations/', import.meta.url);
    for (const file of (await readdir(directory)).filter(f => /^\d+[-\w]*\.sql$/.test(f)).sort()) {
      if (done.has(file)) continue;
      const sql = await readFile(new URL(file, directory), 'utf8');
      for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) await connection.query(statement);
      await connection.execute('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
    }
  } finally { await connection.query("SELECT RELEASE_LOCK('gejian_schema')"); connection.release(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pool = createPool();
  try { await migrate(pool); console.log('Database migrations applied'); } finally { await pool.end(); }
}
