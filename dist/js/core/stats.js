// 个人战绩：本机记录每一局结果（最多保留 300 条），展示总览、各游戏最佳与最近成绩。
import { escapeHtml, formatElapsed } from './utils.js';
import { scoreLabel } from './score.js';
import { pop, staggerPop } from './motion.js';

const STATS_KEY = 'gejian:stats';
const MAX_PLAYS = 300;

let games = [];

function read() {
  try {
    const data = JSON.parse(localStorage.getItem(STATS_KEY) || '{}');
    if (Array.isArray(data.plays)) return data;
  } catch (_) {}
  return { plays: [] };
}

function write(data) {
  try { localStorage.setItem(STATS_KEY, JSON.stringify(data)); } catch (_) {}
}

// 按游戏主指标比较两条成绩，返回较优者（与排行榜排序口径一致）
function better(a, b) {
  if (!a) return b;
  if (a.game === 'reaction') return a.averageMs <= b.averageMs ? a : b;
  if (a.game === 'aim') return a.hits !== b.hits ? (a.hits > b.hits ? a : b) : (a.shots <= b.shots ? a : b);
  if (a.game === '2048' || a.game === 'watermelon') return a.points >= b.points ? a : b;
  return a.elapsedSeconds <= b.elapsedSeconds ? a : b;
}

export function recordPlay(score, gameOver) {
  if (!score || !score.game) return;
  const data = read();
  data.plays.push({
    game: score.game,
    size: score.size,
    difficulty: score.difficulty,
    elapsedSeconds: score.elapsedSeconds || 0,
    averageMs: score.averageMs ?? null,
    hits: score.hits ?? null,
    shots: score.shots ?? null,
    points: score.points ?? null,
    gameOver: Boolean(gameOver),
    ts: Date.now()
  });
  if (data.plays.length > MAX_PLAYS) data.plays = data.plays.slice(-MAX_PLAYS);
  write(data);
}

function configLabel(play) {
  const game = games.find((item) => item.id === play.game);
  const size = game?.sizes.find((option) => Number(option.value) === Number(play.size))?.label || '';
  const difficulty = game?.difficulties.find((option) => option.value === play.difficulty)?.label || '';
  return [size, difficulty].filter(Boolean).join(' · ');
}

function render() {
  const overview = document.querySelector('#statsOverview');
  const bestList = document.querySelector('#statsBestList');
  const recentList = document.querySelector('#statsRecentList');
  const { plays } = read();

  const wins = plays.filter((play) => !play.gameOver);
  const totalSeconds = plays.reduce((sum, play) => sum + (play.elapsedSeconds || 0), 0);
  overview.innerHTML = `
    <div><span>总对局</span><strong>${plays.length}</strong></div>
    <div><span>完成次数</span><strong>${wins.length}</strong></div>
    <div><span>累计游戏时间</span><strong>${formatElapsed(Math.round(totalSeconds))}</strong></div>
  `;

  const bestByGame = new Map();
  for (const play of plays) {
    if (play.gameOver) continue;
    bestByGame.set(play.game, better(bestByGame.get(play.game), play));
  }
  const bestRows = games
    .filter((game) => bestByGame.has(game.id))
    .map((game) => {
      const best = bestByGame.get(game.id);
      const count = plays.filter((play) => play.game === game.id && !play.gameOver).length;
      return `<div><span class="stats-game-icon" aria-hidden="true"><img src="./assets/icons/game-${escapeHtml(game.id)}.svg" alt="" loading="lazy"></span> ${escapeHtml(game.name)} <small>${escapeHtml(configLabel(best))} · 完成 ${count} 次</small><strong>${escapeHtml(scoreLabel(best))}</strong></div>`;
    });
  bestList.innerHTML = bestRows.length ? bestRows.join('') : '<p class="stats-empty">还没有完成过任何一局，去玩一把吧。</p>';

  const recent = plays.slice(-10).reverse();
  recentList.innerHTML = recent.length
    ? recent.map((play) => {
        const game = games.find((item) => item.id === play.game);
        const date = new Date(play.ts);
        const dateText = `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        return `<div><span class="stats-game-icon" aria-hidden="true">${game ? `<img src="./assets/icons/game-${escapeHtml(game.id)}.svg" alt="" loading="lazy">` : ''}</span> ${escapeHtml(game?.name || play.game)} <small>${escapeHtml(configLabel(play))} · ${dateText}${play.gameOver ? ' · 未通关' : ''}</small><strong>${escapeHtml(scoreLabel(play))}</strong></div>`;
      }).join('')
    : '<p class="stats-empty">暂无记录。</p>';

  // 总览数字与两行列表依次弹入
  overview.querySelectorAll('strong').forEach((element, index) => pop(element, index * 70));
  staggerPop(bestList.querySelectorAll(':scope > div'), 40, 300);
  staggerPop(recentList.querySelectorAll(':scope > div'), 30, 240);
}

export function initStats({ games: registeredGames }) {
  games = registeredGames;
  const modal = document.querySelector('#statsModal');
  document.querySelector('#statsButton').addEventListener('click', () => {
    render();
    modal.showModal();
  });
  document.querySelectorAll('[data-close-stats]').forEach((button) => {
    button.addEventListener('click', () => modal.close());
  });
  modal.addEventListener('click', (event) => {
    if (event.target === modal) modal.close();
  });
}
