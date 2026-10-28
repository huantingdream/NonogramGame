// Pure, seeded game engine. Durations are milliseconds; the UI owns pause/resume.
import { makeSeededRandom } from '../core/utils.js';

export const COLS = 10, ROWS = 20;
export const SHAPES = {
  I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
  O: [[1,1],[1,1]],
  T: [[0,1,0],[1,1,1],[0,0,0]],
  S: [[0,1,1],[1,1,0],[0,0,0]],
  Z: [[1,1,0],[0,1,1],[0,0,0]],
  J: [[1,0,0],[1,1,1],[0,0,0]],
  L: [[0,0,1],[1,1,1],[0,0,0]]
};
const LINE_POINTS = [0, 100, 300, 500, 800];
export const level = state => 1 + Math.floor(state.lines / 10);
export const fallInterval = state => Math.max(80, 800 * .8 ** (level(state) - 1));

export function cells(piece) {
  return piece.matrix.flatMap((row, y) => row.flatMap((value, x) => value ? [[piece.x + x, piece.y + y]] : []));
}
export function fits(state, piece) {
  return cells(piece).every(([x, y]) => x >= 0 && x < COLS && y < ROWS && y >= -4 && (y < 0 || !state.board[y][x]));
}
function fillQueue(state) {
  while (state.next.length < 4) {
    const bag = Object.keys(SHAPES);
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(state.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    state.next.push(...bag);
  }
}
function spawn(state, type) {
  if (!type) { fillQueue(state); type = state.next.shift(); fillQueue(state); }
  const matrix = SHAPES[type].map(row => [...row]);
  state.active = { type, matrix, x: Math.floor((COLS - matrix.length) / 2), y: type === 'I' ? -1 : 0 };
  state.fallTime = 0; state.lockTime = 0; state.lockResets = 0;
  if (!fits(state, state.active)) state.over = true;
}
export function createState(seed) {
  const state = { board: Array.from({ length: ROWS }, () => Array(COLS).fill(null)),
    random: makeSeededRandom(seed), next: [], hold: null, holdUsed: false,
    score: 0, lines: 0, over: false, cleared: [], locks: 0 };
  spawn(state);
  return state;
}
function grounded(state) { return !fits(state, { ...state.active, y: state.active.y + 1 }); }
function adjust(state, piece) {
  if (state.over || !fits(state, piece)) return false;
  if (grounded(state) && state.lockResets < 15) {
    state.lockTime = 0; state.lockResets++;
  }
  state.active = piece;
  return true;
}
export function move(state, dx) { return adjust(state, { ...state.active, x: state.active.x + dx }); }
export function rotate(state, direction = 1) {
  if (state.over || state.active.type === 'O') return false;
  const old = state.active.matrix, n = old.length;
  const matrix = old.map((row, y) => row.map((_, x) => direction === 1 ? old[n - 1 - x][y] : old[x][n - 1 - y]));
  // Small wall/floor kicks make rotation forgiving beside a wall or a stack.
  for (const [dx, dy] of [[0,0],[-1,0],[1,0],[-2,0],[2,0],[0,-1],[-1,-1],[1,-1],[0,-2]]) {
    if (adjust(state, { ...state.active, matrix, x: state.active.x + dx, y: state.active.y + dy })) return true;
  }
  return false;
}
export function softDrop(state) {
  if (state.over) return false;
  const piece = { ...state.active, y: state.active.y + 1 };
  if (!fits(state, piece)) return false;
  state.active = piece; state.score++; state.fallTime = 0;
  return true;
}
export function ghost(state) {
  const piece = { ...state.active };
  while (fits(state, { ...piece, y: piece.y + 1 })) piece.y++;
  return piece;
}
function lock(state) {
  const occupied = cells(state.active);
  if (occupied.some(([, y]) => y < 0)) { state.over = true; return; }
  occupied.forEach(([x, y]) => { state.board[y][x] = state.active.type; });
  state.cleared = state.board.flatMap((row, y) => row.every(Boolean) ? [y] : []);
  state.score += LINE_POINTS[state.cleared.length] * level(state);
  state.lines += state.cleared.length;
  state.board = state.board.filter(row => !row.every(Boolean));
  while (state.board.length < ROWS) state.board.unshift(Array(COLS).fill(null));
  state.locks++; state.holdUsed = false;
  spawn(state);
}
export function hardDrop(state) {
  if (state.over) return;
  const landing = ghost(state);
  state.score += (landing.y - state.active.y) * 2;
  state.active = landing;
  lock(state);
}
export function hold(state) {
  if (state.over || state.holdUsed) return false;
  const previous = state.hold, type = state.active.type;
  spawn(state, previous);
  state.hold = type; state.holdUsed = true;
  return true;
}
export function advance(state, dt) {
  if (state.over) return;
  state.fallTime += dt;
  const interval = fallInterval(state);
  while (state.fallTime >= interval) {
    state.fallTime -= interval;
    const next = { ...state.active, y: state.active.y + 1 };
    if (!fits(state, next)) break;
    state.active = next;
  }
  if (grounded(state)) {
    state.lockTime += dt;
    if (state.lockTime >= 500) lock(state);
  } else state.lockTime = 0;
}
