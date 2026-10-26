// 每日挑战：日期 + 游戏 + 规格 推出确定性种子，所有玩家同题；
// 完成任意一款即打卡，连续打卡天数持久化在本机。
import { escapeHtml, setNextSeed, showToast } from './utils.js';
import { pop } from './motion.js?v=20261026-4';

const DAILY_KEY = 'gejian:daily';

// 各游戏的每日固定规格（size 为排行榜编码，与 firestore 规则一致）
const DAILY_CONFIG = {
  nonogram: { size: 10, difficulty: 'normal' },
  sudoku: { size: 9, difficulty: 'normal' },
  minesweeper: { size: 256, difficulty: 'normal' },
  '2048': { size: 16, difficulty: 'normal' },
  slitherlink: { size: 107, difficulty: 'normal' },
  hashi: { size: 209, difficulty: 'normal' },
  watermelon: { size: 450, difficulty: 'normal' },
  netwalk: { size: 507, difficulty: 'normal' },
  akari: { size: 610, difficulty: 'normal' },
  nurikabe: { size: 710, difficulty: 'normal' },
  kenken: { size: 806, difficulty: 'normal' }
};

let games = [];
let selectGame = null;
let dailyRequest = 0;

export function todayKey(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function hash(text) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619) >>> 0;
  }
  return value >>> 0;
}

export function dailySeed(dateKey, gameId, size, difficulty) {
  return hash(`${dateKey}|${gameId}|${size}|${difficulty}`);
}

function read() {
  try {
    const data = JSON.parse(localStorage.getItem(DAILY_KEY) || '{}');
    if (data && typeof data.completed === 'object') return data;
  } catch (_) {}
  return { completed: {} };
}

function write(data) {
  try { localStorage.setItem(DAILY_KEY, JSON.stringify(data)); } catch (_) {}
}

// 连续打卡：从今天（或昨天，今天还没打卡时）往前数连续有记录的天数
export function currentStreak() {
  const { completed } = read();
  let streak = 0;
  let offset = completed[todayKey(0)]?.length ? 0 : -1;
  if (offset === -1 && !completed[todayKey(-1)]?.length) return 0;
  while (completed[todayKey(offset)]?.length) {
    streak += 1;
    offset -= 1;
  }
  return streak;
}

export function dailyGames() {
  return games.filter((game) => DAILY_CONFIG[game.id]);
}

// 一局结束时调用：若该成绩正是今日挑战题（种子匹配），记录打卡
export function recordIfDaily(score, gameOver) {
  if (gameOver || !score?.game) return false;
  const config = DAILY_CONFIG[score.game];
  if (!config) return false;
  const expected = dailySeed(todayKey(), score.game, score.size, score.difficulty);
  if (score.puzzleSeed !== expected) return false;
  const data = read();
  const key = todayKey();
  const list = new Set(data.completed[key] || []);
  const isNewDay = list.size === 0;
  list.add(score.game);
  data.completed[key] = [...list];
  write(data);
  const game = games.find((item) => item.id === score.game);
  showToast(`✅ 今日「${game?.name || score.game}」挑战完成${isNewDay ? `，连续打卡 ${currentStreak()} 天` : ''}`);
  return true;
}

function render() {
  const key = todayKey();
  const { completed } = read();
  const done = new Set(completed[key] || []);
  const list = dailyGames();
  document.querySelector('#dailyDate').textContent = `${key.replaceAll('-', ' / ')} · 共 ${list.length} 款`;
  // 连续打卡 3 天起带小火苗，数字弹一下强化反馈
  const streak = currentStreak();
  const streakEl = document.querySelector('#dailyStreak');
  streakEl.innerHTML = `${streak >= 3 ? '<span class="streak-flame" aria-hidden="true">🔥</span> ' : ''}${streak} 天`;
  const progressEl = document.querySelector('#dailyProgress');
  progressEl.textContent = `${done.size} / ${list.length}`;
  pop(streakEl);
  pop(progressEl, 70);
  document.querySelector('#dailyList').innerHTML = list.map((game) => {
    const config = DAILY_CONFIG[game.id];
    const size = game.sizes.find((option) => Number(option.value) === config.size)?.label || '';
    const difficulty = game.difficulties.find((option) => option.value === config.difficulty)?.label || '';
    const finished = done.has(game.id);
    return `<button type="button" class="daily-item ${finished ? 'done' : ''}" data-daily-game="${escapeHtml(game.id)}">
      <span class="daily-item-icon" aria-hidden="true"><img src="./assets/icons/game-${escapeHtml(game.id)}.svg" alt="" loading="lazy"></span>
      <span class="daily-item-copy"><strong>${escapeHtml(game.name)}</strong><small>${escapeHtml([size, difficulty].filter(Boolean).join(' · '))}</small></span>
      <span class="daily-item-state">${finished ? '✓ 已完成' : '未挑战'}</span>
    </button>`;
  }).join('');
}

export function initDaily({ games: registeredGames, onSelect }) {
  games = registeredGames;
  selectGame = onSelect;
  const modal = document.querySelector('#dailyModal');
  document.querySelector('#dailyButton').addEventListener('click', () => {
    render();
    modal.showModal();
  });
  document.querySelectorAll('[data-close-daily]').forEach((button) => {
    button.addEventListener('click', () => modal.close());
  });
  modal.addEventListener('click', (event) => {
    if (event.target === modal) modal.close();
    const item = event.target.closest('[data-daily-game]');
    if (item) {
      modal.close();
      startDaily(item.dataset.dailyGame).catch((error) => {
        console.error('Unable to start daily challenge', error);
        showToast('今日挑战暂时无法开始，请重试');
      });
    }
  });
}

// 切换到游戏、套用每日固定规格、用每日种子开一局
export async function startDaily(gameId) {
  const game = games.find((item) => item.id === gameId);
  const config = DAILY_CONFIG[gameId];
  if (!game || !config || typeof selectGame !== 'function') return;
  const request = ++dailyRequest;
  const mounted = await selectGame(gameId);
  if (mounted === false || request !== dailyRequest) return;
  if (typeof game.configure === 'function') game.configure(config);
  setNextSeed(dailySeed(todayKey(), gameId, config.size, config.difficulty));
  game.newGame();
  showToast(`📅 今日挑战：${game.name}，所有玩家同题`);
}
