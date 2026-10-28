import { playBatchSchema } from '../shared/validation.js';
const selectPlay = `id,game,size,difficulty,elapsed_seconds AS elapsedSeconds,game_over AS gameOver,
  average_ms AS averageMs,hits,shots,points,played_at AS playedAt`;
const toPlay = ({playedAt, ...row}) => ({...row, gameOver: Boolean(row.gameOver), ts: new Date(playedAt).getTime()});
export function registerPersonalStats(app, {pool, requireUser, parse, fail}) {
  app.post('/api/me/plays', async request => {
    const user = await requireUser(request);
    const {accountId, plays} = parse(playBatchSchema, request.body);
    // An upload queued under A must not inherit B's cookie after another tab switches accounts.
    if (accountId !== user.id) throw fail(409, 'account-changed', '登录账号已变化，请切回原账号同步战绩。');
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      for (const p of plays) {
        await connection.execute(`INSERT INTO personal_plays
          (user_id,id,game,size,difficulty,elapsed_seconds,game_over,average_ms,hits,shots,points,played_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=personal_plays.id`,
          [user.id,p.id,p.game,p.size,p.difficulty,p.elapsedSeconds,p.gameOver,p.averageMs,p.hits,p.shots,p.points,new Date(p.ts)]);
      }
      await connection.commit();
      return {accountId: user.id, savedIds: plays.map(p => p.id)};
    } catch(error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  });
  app.get('/api/me/stats', async request => {
    const user = await requireUser(request);
    const connection = await pool.getConnection();
    try {
      // One snapshot keeps totals, best and recent consistent while other devices upload.
      await connection.beginTransaction();
      const [[summary]] = await connection.execute(`SELECT COUNT(*) AS total,
        COALESCE(SUM(game_over=FALSE),0) AS wins,COALESCE(SUM(elapsed_seconds),0) AS totalSeconds
        FROM personal_plays WHERE user_id=?`, [user.id]);
      const [recent] = await connection.execute(`SELECT ${selectPlay} FROM personal_plays
        WHERE user_id=? ORDER BY played_at DESC,id DESC LIMIT 20`, [user.id]);
      const [best] = await connection.execute(`SELECT * FROM (
        SELECT ${selectPlay},COUNT(*) OVER (PARTITION BY game) AS completions,
          ROW_NUMBER() OVER (PARTITION BY game ORDER BY
            CASE WHEN game='reaction' THEN average_ms END ASC,
            CASE WHEN game='aim' THEN hits END DESC,
            CASE WHEN game='aim' THEN shots END ASC,
            CASE WHEN game IN ('2048','watermelon','tetris') THEN points END DESC,
            CASE WHEN game NOT IN ('reaction','aim') THEN elapsed_seconds END ASC,
            played_at ASC,id ASC) AS position
        FROM personal_plays WHERE user_id=? AND (game_over=FALSE OR game IN ('2048','watermelon','tetris'))
      ) ranked WHERE position=1`, [user.id]);
      await connection.commit();
      return {accountId: user.id, summary: Object.fromEntries(Object.entries(summary).map(([k,v]) => [k,Number(v)])),
        recent: recent.map(toPlay), best: best.map(({position,...p}) => toPlay(p))};
    } catch(error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  });
}
