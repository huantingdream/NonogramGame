import { scoreOrder } from './score.js';
export const emptyStats = () => ({summary: {total: 0, wins: 0, totalSeconds: 0}, best: [], recent: []});
export function summarizePlays(plays) {
  const result = emptyStats();
  const best = new Map();
  for (const p of plays) {
    result.summary.total++; result.summary.totalSeconds += p.elapsedSeconds;
    if (!p.gameOver) result.summary.wins++;
    if (p.gameOver && !['2048','watermelon'].includes(p.game)) continue;
    const old = best.get(p.game), completions = (old?.completions || 0) + 1;
    const compare = (a,b) => {
      for (const [field,direction] of scoreOrder(p.game)) {
        const key = field === 'createdAt' ? 'ts' : field, diff = a[key] - b[key];
        if (diff) return direction === 'asc' ? diff : -diff;
      }
      return 0;
    };
    best.set(p.game, {...(!old || compare(p,old) < 0 ? p : old), completions});
  }
  result.best = [...best.values()];
  result.recent = [...plays].sort((a,b) => b.ts-a.ts || b.id.localeCompare(a.id)).slice(0,20);
  return result;
}
