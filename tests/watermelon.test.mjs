// 合成大西瓜物理与水果表的验证测试：直接导入真实模块，不走 DOM。
import test from 'node:test';
import assert from 'node:assert/strict';

// motion.js 顶层用到 window.matchMedia，给个最小桩。
globalThis.window = {
  matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} })
};

const { __testing } = await import('../dist/js/games/watermelon.js');
const { FRUITS, WIDTH, HEIGHT, WALL, DANGER_Y, SPAWNABLE, CLEAR_BONUS, createState, dropFruit, step } = __testing;
const { makeSeededRandom } = await import('../dist/js/core/utils.js');

function simulate(state, seconds, emit) {
  for (let t = 0; t < seconds; t += 1 / 60) step(state, 1 / 60, emit);
}

test('fruit chain: 11 levels with strictly increasing radii and triangular values', () => {
  assert.equal(FRUITS.length, 11);
  for (let i = 0; i < FRUITS.length; i++) {
    assert.equal(FRUITS[i].value, (i + 1) * (i + 2) / 2);
    if (i) assert.ok(FRUITS[i].r > FRUITS[i - 1].r, `radius ${i}`);
    assert.ok(FRUITS[i].emoji && FRUITS[i].name, `identity ${i}`);
  }
  assert.ok(FRUITS[10].r * 2 < WIDTH - WALL * 2, 'watermelon fits the container');
});

test('two touching cherries merge into one strawberry worth 3 points', () => {
  const state = createState();
  const events = [];
  const a = dropFruit(state, 0, 190);
  const b = dropFruit(state, 0, 208);
  a.y = b.y = 500; // 跳过下落，直接相碰
  simulate(state, 0.5, event => events.push(event));
  assert.equal(state.fruits.length, 1);
  assert.equal(state.fruits[0].level, 1);
  assert.equal(state.score, FRUITS[1].value);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'merge');
});

test('resting contact also merges after the same fruit keeps touching', () => {
  const state = createState();
  // 两颗葡萄并排落在地上，等出生冷却结束后接触合成
  const a = dropFruit(state, 2, 150);
  const b = dropFruit(state, 2, 150 + FRUITS[2].r * 2 + 1);
  a.y = b.y = HEIGHT - WALL - FRUITS[2].r;
  simulate(state, 0.5);
  assert.equal(state.fruits.length, 1);
  assert.equal(state.fruits[0].level, 3);
});

test('two watermelons annihilate for the clear bonus', () => {
  const state = createState();
  const events = [];
  const top = FRUITS.length - 1;
  const a = dropFruit(state, top, 130);
  const b = dropFruit(state, top, 135);
  a.y = b.y = 400;
  simulate(state, 0.5, event => events.push(event));
  assert.equal(state.fruits.length, 0);
  assert.equal(state.score, CLEAR_BONUS);
  assert.equal(events[0].type, 'clear');
});

test('dropped fruits stay inside the container and never go NaN over a long run', () => {
  const random = makeSeededRandom(42);
  const state = createState();
  let dropped = 0;
  for (let tick = 0; tick < 60 * 12; tick++) {
    if (tick % 36 === 0 && dropped < 25) {
      dropFruit(state, Math.floor(random() * SPAWNABLE), WALL + random() * (WIDTH - WALL * 2));
      dropped++;
    }
    step(state, 1 / 60);
  }
  assert.ok(state.fruits.length > 0);
  for (const fruit of state.fruits) {
    assert.ok(Number.isFinite(fruit.x) && Number.isFinite(fruit.y), 'finite position');
    assert.ok(Number.isFinite(fruit.vx) && Number.isFinite(fruit.vy), 'finite velocity');
    assert.ok(fruit.x - fruit.r >= WALL - 0.5, `left wall: ${fruit.x}`);
    assert.ok(fruit.x + fruit.r <= WIDTH - WALL + 0.5, `right wall: ${fruit.x}`);
    assert.ok(fruit.y + fruit.r <= HEIGHT - WALL + 0.5, `floor: ${fruit.y}`);
  }
});

test('physics is deterministic for the same drop sequence', () => {
  const run = () => {
    const random = makeSeededRandom(7);
    const state = createState();
    for (let tick = 0; tick < 60 * 6; tick++) {
      if (tick % 30 === 0) dropFruit(state, Math.floor(random() * SPAWNABLE), random() * WIDTH);
      step(state, 1 / 60);
    }
    return [state.score, state.fruits.map(f => [f.level, Math.round(f.x * 1000), Math.round(f.y * 1000)])];
  };
  assert.deepEqual(run(), run());
});
