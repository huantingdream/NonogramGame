import { formatElapsed } from './utils.js';

export function scoreOrder(game) {
  if (game === 'reaction') return [['averageMs', 'asc'], ['createdAt', 'asc']];
  if (game === 'aim') return [['hits', 'desc'], ['shots', 'asc'], ['createdAt', 'asc']];
  return [['elapsedSeconds', 'asc'], ['createdAt', 'asc']];
}
export function scoreHeading(game) {
  return game === 'reaction' ? '平均反应最快榜' : game === 'aim' ? '瞄准命中榜' : '最快完成榜';
}
export function scoreLabel(score) {
  if (score.game === 'reaction') return `${score.averageMs} ms`;
  if (score.game === 'aim') return `${score.hits} 命中`;
  return formatElapsed(score.elapsedSeconds);
}
export function scoreDetail(score) {
  if (score.game === 'reaction') return '5 次平均';
  if (score.game === 'aim') return `准确率 ${score.shots ? Math.round(score.hits / score.shots * 100) : 0}%`;
  return `题目 #${String(score.puzzleId).padStart(4, '0')}`;
}
export function trainingMetrics(score) {
  const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
  if (score.game === 'reaction') {
    if (!integer(score.averageMs, 1, 86400000)) throw new Error('反应成绩无效');
    return { averageMs: score.averageMs };
  }
  if (score.game === 'aim') {
    if (!integer(score.shots, 0, 10000) || !integer(score.hits, 0, score.shots) ||
        !integer(score.averageMs, score.hits ? 1 : 0, score.hits ? 30000 : 0)) throw new Error('瞄准成绩无效');
    return { hits: score.hits, shots: score.shots, averageMs: score.averageMs };
  }
  return {};
}
