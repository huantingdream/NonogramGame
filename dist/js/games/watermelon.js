// 合成大西瓜：Canvas 圆形刚体物理，丢下水果、同级相碰合成更大水果。
// 物理与水果表是纯逻辑（不依赖 DOM），渲染与输入集中在模块底部。

import { randomSeed, makeSeededRandom } from '../core/utils.js';
import { pop, enterBoard } from '../core/motion.js?v=20261026-4';

// ---------------------------------------------------------------------------
// 纯逻辑：水果表与圆形物理
// ---------------------------------------------------------------------------

const WIDTH = 400, HEIGHT = 580, WALL = 10, DANGER_Y = 132, SPAWN_Y = 70;
const GRAVITY = 1600, RESTITUTION = 0.08, AIR_DAMPING = 0.9999, STEP = 1 / 120;
const SLOP = 0.1;            // 允许的穿透余量（px），小于它不做位置修正；小余量让水果看起来刚好相贴而非相嵌
const POS_CORRECT = 0.8;     // 每次迭代只修正 80% 的穿透，避免过冲引起的抖动
const SOLVER_ITERATIONS = 6; // 每个子步的碰撞求解迭代次数，拥挤堆叠和深穿透也能一帧内解开
const REST_SPEED = 50;       // 低于该法向接近速度视为静置接触，不再反弹（防抖关键）
const STATIC_SPEED = 5;      // 低于该切向滑动速度才锁死；高于此值保持低摩擦自然滚动
const MAX_SPEED = 2400;      // 速度上限，防止单步位移过大穿透墙体或其他水果
const CLEAR_BONUS = 100; // 两颗西瓜相撞湮灭的奖励分

// 经典合成链：樱桃 → 草莓 → … → 大西瓜。value 为合成出该水果时的得分。
const FRUITS = [
  { name: '樱桃', emoji: '🍒', r: 18,  color: '#ff7d92', light: '#ffc2cd' },
  { name: '草莓', emoji: '🍓', r: 24,  color: '#f94f5c', light: '#ffadb3' },
  { name: '葡萄', emoji: '🍇', r: 32,  color: '#9b6dd7', light: '#cfb4f0' },
  { name: '橘子', emoji: '🍊', r: 41,  color: '#ffa53d', light: '#ffd9a3' },
  { name: '柿子', emoji: '🍅', r: 50,  color: '#ff7a45', light: '#ffc09e' },
  { name: '苹果', emoji: '🍎', r: 59,  color: '#e84c3d', light: '#ffa79d' },
  { name: '梨',   emoji: '🍐', r: 69,  color: '#a5c95a', light: '#ddecb2' },
  { name: '桃子', emoji: '🍑', r: 79,  color: '#ff9fb8', light: '#ffd3df' },
  { name: '菠萝', emoji: '🍍', r: 90,  color: '#f2c53d', light: '#ffe79e' },
  { name: '甜瓜', emoji: '🍈', r: 102, color: '#7fce72', light: '#c4eeba' },
  { name: '西瓜', emoji: '🍉', r: 115, color: '#3fae5a', light: '#a0e0af' }
].map((fruit, index) => ({ ...fruit, value: (index + 1) * (index + 2) / 2 }));

const SPAWNABLE = 5; // 只会随机出现前 5 级水果

function createState() {
  return { fruits: [], t: 0, score: 0, nextId: 1 };
}

function makeFruit(state, x, y, level, vx = 0, vy = 0) {
  return { id: state.nextId++, x, y, vx, vy, level, r: FRUITS[level].r, born: state.t };
}

function dropFruit(state, level, x) {
  const r = FRUITS[level].r;
  const clamped = Math.min(Math.max(x, WALL + r), WIDTH - WALL - r);
  const fruit = makeFruit(state, clamped, SPAWN_Y, level);
  state.fruits.push(fruit);
  return fruit;
}

// 位置修正 + 冲量 + 一点切向摩擦；返回重叠量，未穿透时返回负的表面间距。
function collidePair(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const rr = a.r + b.r;
  const d2 = dx * dx + dy * dy;
  const d = Math.sqrt(d2);
  if (d >= rr) return rr - d;
  if (d < 1e-6) { b.y += 0.01; return rr; }
  const nx = dx / d, ny = dy / d;
  const ma = a.r * a.r, mb = b.r * b.r, total = ma + mb;
  const overlap = rr - d;
  // Baumgarte 式位置修正：留一点 slop、每次只推一部分，堆叠时不会来回过冲抖动
  const push = Math.max(overlap - SLOP, 0) * POS_CORRECT;
  a.x -= nx * push * (mb / total); a.y -= ny * push * (mb / total);
  b.x += nx * push * (ma / total); b.y += ny * push * (ma / total);
  const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
  const vn = rvx * nx + rvy * ny;
  if (vn >= 0) return overlap;
  // 低速接触按完全非弹性处理，消除静置时的微弹跳（抖动的主要来源）
  const restitution = -vn < REST_SPEED ? 0 : RESTITUTION;
  const impulse = -(1 + restitution) * vn / (1 / ma + 1 / mb);
  a.vx -= impulse * nx / ma; a.vy -= impulse * ny / ma;
  b.vx += impulse * nx / mb; b.vy += impulse * ny / mb;
  // 切向摩擦：只有几乎不动的相对滑动才锁死（防止堆里无限微滑抖动），
  // 其余情况只施加 8% 摩擦，让水果能自然地从彼此身上滚落
  const vt = rvx * -ny + rvy * nx;
  const grip = Math.abs(vt) < STATIC_SPEED ? 1 : 0.08;
  const tangent = -vt * grip / (1 / ma + 1 / mb);
  a.vx += tangent * ny / ma; a.vy -= tangent * nx / ma;
  b.vx -= tangent * ny / mb; b.vy += tangent * nx / mb;
  return overlap;
}

function containFruit(fruit) {
  const left = WALL + fruit.r, right = WIDTH - WALL - fruit.r, floor = HEIGHT - WALL - fruit.r;
  if (fruit.x < left) {
    fruit.x = left;
    fruit.vx = fruit.vx < -REST_SPEED ? -fruit.vx * RESTITUTION : 0;
  } else if (fruit.x > right) {
    fruit.x = right;
    fruit.vx = fruit.vx > REST_SPEED ? -fruit.vx * RESTITUTION : 0;
  }
  if (fruit.y > floor) {
    fruit.y = floor;
    fruit.vy = fruit.vy > REST_SPEED ? -fruit.vy * RESTITUTION : 0;
    // 地面摩擦：轻微衰减让贴地水果自然停住，只有几乎不动时才锁死
    fruit.vx = Math.abs(fruit.vx) < STATIC_SPEED ? 0 : fruit.vx * 0.995;
  }
}

// 推进一帧。emit({ type: 'merge' | 'clear', level, x, y, gained }) 上报合成事件。
function step(state, dt, emit = () => {}) {
  let remaining = Math.min(dt, 0.05);
  while (remaining > 1e-9) {
    const h = Math.min(STEP, remaining);
    remaining -= h;
    state.t += h;
    for (const fruit of state.fruits) {
      fruit.vy += GRAVITY * h;
      fruit.vx *= AIR_DAMPING; fruit.vy *= AIR_DAMPING;
      // 限制最高速度，避免单步位移过大直接穿过墙体或其他水果
      const speed = Math.hypot(fruit.vx, fruit.vy);
      if (speed > MAX_SPEED) {
        fruit.vx *= MAX_SPEED / speed; fruit.vy *= MAX_SPEED / speed;
      }
      fruit.x += fruit.vx * h; fruit.y += fruit.vy * h;
      containFruit(fruit);
    }
    // 多次迭代求解碰撞：合成出的大水果与邻居的深穿透能在一帧内基本解开。
    // 每轮迭代先约束墙体再解开水果对，避免角落里的水果被墙 clamp 重新顶回邻居体内
    for (let iteration = 0; iteration < SOLVER_ITERATIONS; iteration++) {
      for (const fruit of state.fruits) containFruit(fruit);
      for (let i = 0; i < state.fruits.length; i++) {
        for (let j = i + 1; j < state.fruits.length; j++) {
          collidePair(state.fruits[i], state.fruits[j]);
        }
      }
    }
    const pairs = [];
    const paired = new Set();
    for (let i = 0; i < state.fruits.length; i++) {
      for (let j = i + 1; j < state.fruits.length; j++) {
        const a = state.fruits[i], b = state.fruits[j];
        const gap = Math.hypot(b.x - a.x, b.y - a.y) - (a.r + b.r);
        // 接触（容差 2px）即合成，保证静置相靠的同級水果也会合并
        if (gap < 2 && a.level === b.level && !paired.has(a.id) && !paired.has(b.id) &&
            state.t - a.born > 0.05 && state.t - b.born > 0.05) {
          paired.add(a.id); paired.add(b.id);
          pairs.push([a, b]);
        }
      }
    }
    // 碰撞修正可能把水果压回墙体，收尾再约束一次保证不越界
    for (const fruit of state.fruits) containFruit(fruit);
    if (!pairs.length) continue;
    const removed = new Set();
    const created = [];
    for (const [a, b] of pairs) {
      removed.add(a.id); removed.add(b.id);
      const level = a.level + 1;
      const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
      if (level < FRUITS.length) {
        const gained = FRUITS[level].value;
        state.score += gained;
        created.push(makeFruit(state, x, y, level, (a.vx + b.vx) / 2, (a.vy + b.vy) / 2 - 60));
        emit({ type: 'merge', level, x, y, gained });
      } else {
        state.score += CLEAR_BONUS;
        emit({ type: 'clear', level, x, y, gained: CLEAR_BONUS });
      }
    }
    state.fruits = state.fruits.filter(fruit => !removed.has(fruit.id)).concat(created);
  }
}

// ---------------------------------------------------------------------------
// 渲染与输入
// ---------------------------------------------------------------------------

const DROP_COOLDOWN = 0.45; // 秒
const OVER_AFTER = 3;       // 越过警戒线后的宽限秒数；期间水果全部回到线下即重置

let ctx, controller, raf = 0;
let canvas, g, state, seed, random;
let currentLevel, nextLevel, aimX, lastDropAt, lastFrameAt;
let started, over, overTime, warning, watermelonToastShown;
let effects = [];

function clampAim(x) {
  const r = FRUITS[currentLevel].r;
  return Math.min(Math.max(x, WALL + r), WIDTH - WALL - r);
}

function syncHud() {
  ctx.els.controlPanel.querySelector('#wmScore').textContent = state.score;
  ctx.els.controlPanel.querySelector('#wmNext').textContent = FRUITS[nextLevel].emoji;
}

function onEmit(event) {
  effects.push({ ...event, at: state.t });
  pop(ctx.els.controlPanel.querySelector('#wmScore'));
  if (event.type === 'clear') ctx.toast('两颗西瓜相撞湮灭，+' + CLEAR_BONUS + ' 分！');
  else if (event.level === FRUITS.length - 1 && !watermelonToastShown) {
    watermelonToastShown = true;
    ctx.toast('🍉 合成大西瓜！');
  }
}

function drop() {
  if (over || state.t - lastDropAt < DROP_COOLDOWN) return;
  if (document.querySelector('dialog[open]')) return;
  lastDropAt = state.t;
  dropFruit(state, currentLevel, aimX);
  currentLevel = nextLevel;
  nextLevel = Math.floor(random() * SPAWNABLE);
  if (!started) {
    started = true;
    ctx.timer.start();
    ctx.setStatus('active');
  }
  syncHud();
}

function gameOver() {
  over = true;
  ctx.timer.stop();
  ctx.reportWin({
    gameOver: true,
    summary: `水果堆越过了警戒线。本局得分 ${state.score} 分，用时 ${ctx.timerText()}。`,
    score: {
      size: 450, difficulty: 'normal',
      elapsedSeconds: Math.max(1, ctx.timer.elapsed()),
      puzzleId: seed % 10000, puzzleSeed: seed, points: state.score
    }
  });
}

function drawFruit(fruit, alpha = 1) {
  const def = FRUITS[fruit.level];
  const scale = Math.min(1, (state.t - fruit.born) / 0.14) * 0.45 + 0.55;
  const r = fruit.r * scale;
  g.globalAlpha = alpha;
  const grad = g.createRadialGradient(
    fruit.x - r * 0.35, fruit.y - r * 0.35, r * 0.15,
    fruit.x, fruit.y, r
  );
  grad.addColorStop(0, def.light);
  grad.addColorStop(1, def.color);
  g.fillStyle = grad;
  g.beginPath();
  g.arc(fruit.x, fruit.y, r, 0, Math.PI * 2);
  g.fill();
  g.font = `${r * 1.05}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(def.emoji, fruit.x, fruit.y + r * 0.05);
  g.globalAlpha = 1;
}

function render() {
  const dark = document.documentElement.dataset.theme === 'dark';
  g.clearRect(0, 0, WIDTH, HEIGHT);

  // 墙体与地面
  g.fillStyle = dark ? '#2c3554' : '#e0d0a6';
  g.fillRect(0, 0, WALL, HEIGHT);
  g.fillRect(WIDTH - WALL, 0, WALL, HEIGHT);
  g.fillRect(0, HEIGHT - WALL, WIDTH, WALL);

  // 警戒线（警告时闪烁，并显示剩余宽限时间）
  const flashing = !over && warning;
  g.save();
  g.strokeStyle = flashing ? '#e5484d' : (dark ? 'rgba(229,72,77,.45)' : 'rgba(229,72,77,.5)');
  g.globalAlpha = flashing ? 0.55 + 0.45 * Math.sin(state.t * 12) : 1;
  g.lineWidth = 2;
  g.setLineDash([8, 7]);
  g.beginPath();
  g.moveTo(WALL, DANGER_Y);
  g.lineTo(WIDTH - WALL, DANGER_Y);
  g.stroke();
  g.restore();

  // 待丢水果与瞄准线
  if (!over) {
    const def = FRUITS[currentLevel];
    g.save();
    g.strokeStyle = dark ? 'rgba(255,255,255,.25)' : 'rgba(42,50,84,.2)';
    g.lineWidth = 2;
    g.setLineDash([4, 6]);
    g.beginPath();
    g.moveTo(aimX, SPAWN_Y + def.r);
    g.lineTo(aimX, HEIGHT - WALL);
    g.stroke();
    g.restore();
    drawFruit({ x: aimX, y: SPAWN_Y, r: def.r, level: currentLevel, born: state.t - 1 }, 0.65);
  }

  for (const fruit of state.fruits) drawFruit(fruit);

  // 警告倒计时画在水果之上，堆得再高也看得见剩余时间
  if (flashing) {
    const remain = Math.max(0, OVER_AFTER - overTime);
    g.save();
    g.globalAlpha = 0.7 + 0.3 * Math.sin(state.t * 12);
    g.fillStyle = '#e5484d';
    g.font = '800 20px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'bottom';
    g.fillText(`⚠ ${remain.toFixed(1)}s`, WIDTH / 2, DANGER_Y - 8);
    g.restore();
  }

  // 合成特效：扩散圆环 + 上浮加分
  effects = effects.filter(effect => state.t - effect.at < 0.7);
  for (const effect of effects) {
    const age = (state.t - effect.at) / 0.7;
    g.globalAlpha = 1 - age;
    g.strokeStyle = '#ffffff';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(effect.x, effect.y, FRUITS[Math.min(effect.level, FRUITS.length - 1)].r * (0.6 + age * 0.9), 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = dark ? '#e8ecff' : '#2a3254';
    g.font = '700 20px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText(`+${effect.gained}`, effect.x, effect.y - 24 - age * 26);
    g.globalAlpha = 1;
  }

  if (over) {
    g.fillStyle = dark ? 'rgba(10,14,30,.55)' : 'rgba(255,252,240,.6)';
    g.fillRect(WALL, WALL, WIDTH - WALL * 2, HEIGHT - WALL * 2);
    g.fillStyle = dark ? '#e8ecff' : '#2a3254';
    g.font = '800 30px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText('本局结束', WIDTH / 2, HEIGHT / 2 - 10);
    g.font = '600 16px system-ui, sans-serif';
    g.fillText(`得分 ${state.score}`, WIDTH / 2, HEIGHT / 2 + 22);
  }
}

function frame(now) {
  raf = requestAnimationFrame(frame);
  const dt = Math.min((now - lastFrameAt) / 1000, 0.05);
  lastFrameAt = now;
  if (dt <= 0) return;
  step(state, dt, onEmit);
  if (!over) {
    const offender = state.fruits.some(fruit =>
      state.t - fruit.born > 2 && fruit.y - fruit.r < DANGER_Y);
    warning = offender;
    overTime = offender ? overTime + dt : 0;
    if (overTime > OVER_AFTER) gameOver();
  }
  if (effectsDirtyHud()) syncHud();
  render();
}

let lastHudScore = -1;
function effectsDirtyHud() {
  if (state.score !== lastHudScore) { lastHudScore = state.score; return true; }
  return false;
}

function fitCanvas() {
  if (!canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssWidth = canvas.clientWidth || 320;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssWidth * (HEIGHT / WIDTH) * dpr);
  g.setTransform(canvas.width / WIDTH, 0, 0, canvas.width / WIDTH, 0, 0);
}

function toLogicalX(event) {
  const rect = canvas.getBoundingClientRect();
  return (event.clientX - rect.left) * WIDTH / rect.width;
}

function newGame() {
  ctx.closeVictory();
  seed = randomSeed();
  random = makeSeededRandom(seed);
  state = createState();
  currentLevel = Math.floor(random() * SPAWNABLE);
  nextLevel = Math.floor(random() * SPAWNABLE);
  aimX = WIDTH / 2;
  lastDropAt = -DROP_COOLDOWN;
  lastHudScore = -1;
  effects = [];
  started = false;
  over = false;
  warning = false;
  overTime = 0;
  watermelonToastShown = false;
  ctx.timer.reset();
  ctx.setStatus('idle', '等待丢水果');
  ctx.setTitle('丢水果 · 合成大西瓜');
  ctx.setPuzzleNumber(seed % 10000);
  syncHud();
  enterBoard(ctx.els.gameRoot);
}

export default {
  id: 'watermelon',
  name: '合成大西瓜',
  icon: '🍉',
  subtitle: 'WATERMELON',
  howToTitle: '丢下水果，合成大西瓜',
  howTo: '<p>移动鼠标或手指选择落点，点击、轻点或按空格丢下水果。</p><p><strong>相同的两个水果相碰就会合成更大的水果</strong>：樱桃 → 草莓 → 葡萄 → 橘子 → 柿子 → 苹果 → 梨 → 桃子 → 菠萝 → 甜瓜 → 大西瓜，越大的水果得分越高。两颗西瓜相撞会湮灭并获得额外奖励。</p><p>水果堆越过顶部虚线会触发 3 秒警告倒计时，期间继续丢水果、让堆叠回落到线下即可解除警报；倒计时归零本局结束。结束后可以把得分上传排行榜。</p>',
  sizes: [{ value: 450, label: '标准' }],
  difficulties: [{ value: 'normal', label: '经典' }],
  getScoreFilter: () => ({ size: 450, difficulty: 'normal' }),
  newGame,
  mount(context) {
    ctx = context;
    controller = new AbortController();
    const options = { signal: controller.signal };

    ctx.els.controlPanel.innerHTML = `
      <div class="eyebrow"><span></span> PHYSICS MERGE</div>
      <h1>丢下水果，<br><em>合成大西瓜。</em></h1>
      <div class="tile-score"><span>本局得分</span><strong id="wmScore" aria-live="polite">0</strong></div>
      <div class="wm-next"><span>下一个</span><strong id="wmNext" aria-live="polite">🍒</strong></div>
      <button class="primary-button" id="wmNew">↻ 开始新一局</button>
      <div class="mini-guide"><span class="guide-icon">✦</span><p><strong>同级水果，相碰合成。</strong><br>别让水果堆越过虚线。</p></div>`;
    ctx.els.gameRoot.innerHTML = `
      <div class="watermelon-stage"><canvas id="wmCanvas" aria-label="合成大西瓜棋盘"></canvas></div>`;
    ctx.els.boardToolbar.innerHTML = '';
    ctx.els.desktopTip.textContent = '移动瞄准 · 点击 / 空格丢下 · 越过虚线 3 秒内未回落即结束';

    canvas = ctx.els.gameRoot.querySelector('#wmCanvas');
    g = canvas.getContext('2d');

    ctx.els.controlPanel.querySelector('#wmNew').addEventListener('click', newGame, options);
    canvas.addEventListener('pointermove', event => { aimX = clampAim(toLogicalX(event)); }, options);
    canvas.addEventListener('pointerdown', event => {
      event.preventDefault();
      aimX = clampAim(toLogicalX(event));
      drop();
    }, options);
    canvas.addEventListener('contextmenu', event => event.preventDefault(), options);
    document.addEventListener('keydown', event => {
      if (event.ctrlKey || event.metaKey || event.altKey ||
          event.target.closest('input, select, textarea') ||
          document.querySelector('dialog[open]')) return;
      if (event.key === 'ArrowLeft' || event.key === 'a') { event.preventDefault(); aimX = clampAim(aimX - 16); }
      else if (event.key === 'ArrowRight' || event.key === 'd') { event.preventDefault(); aimX = clampAim(aimX + 16); }
      else if (event.key === ' ' || event.key === 'Enter' || event.key === 'ArrowDown' || event.key === 's') {
        event.preventDefault();
        drop();
      }
    }, options);
    window.addEventListener('resize', fitCanvas, options);

    newGame();
    fitCanvas();
    requestAnimationFrame(() => fitCanvas()); // 布局稳定后再校准一次
    lastFrameAt = performance.now();
    raf = requestAnimationFrame(frame);
  },
  unmount() {
    cancelAnimationFrame(raf);
    controller.abort();
    canvas = null;
    ctx = null;
  }
};

// 供单元测试使用的纯逻辑出口。
export const __testing = { FRUITS, WIDTH, HEIGHT, WALL, DANGER_Y, SPAWNABLE, CLEAR_BONUS, createState, dropFruit, step };
