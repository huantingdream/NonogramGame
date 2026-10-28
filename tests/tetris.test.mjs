import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, SHAPES, cells, fits, move, rotate, softDrop, hardDrop, hold, ghost, advance, level, fallInterval } from '../src/games/tetris-logic.js';
import { scoreOrder, scoreHeading, scoreLabel, gameMetrics } from '../shared/score.js';
import { scoreSchema, playSchema } from '../shared/validation.js';
import { summarizePlays } from '../shared/stats.js';

function piece(state, type, x, y) { state.active = { type, matrix: SHAPES[type].map(row => [...row]), x, y }; }

test('seeded seven-bag stream is repeatable and contains each shape once per bag', () => {
  const a = createState(123), b = createState(123), stream = [];
  for (let i = 0; i < 70; i++) {
    assert.equal(a.active.type, b.active.type); stream.push(a.active.type);
    // Empty the board so this tests the random stream over many complete bags.
    a.board.forEach(row => row.fill(null)); b.board.forEach(row => row.fill(null));
    hardDrop(a); hardDrop(b);
  }
  for (let i = 0; i < stream.length; i += 7) assert.deepEqual(stream.slice(i, i + 7).sort(), Object.keys(SHAPES).sort());
});
test('walls, floor and occupied cells block movement; ghost predicts hard drop', () => {
  const s = createState(1); piece(s, 'O', 0, 0);
  assert.equal(move(s, -1), false);
  s.board[18][0] = 'J';
  assert.equal(ghost(s).y, 16);
  const landing = cells(ghost(s)); hardDrop(s);
  for (const [x,y] of landing) assert.equal(s.board[y][x], 'O');
  assert.equal(s.score, 32);
  piece(s, 'O', 8, 18);
  assert.equal(move(s, 1), false); assert.equal(softDrop(s), false);
});
test('four rotations restore orientation and wall/floor kicks keep pieces legal', () => {
  for (const type of Object.keys(SHAPES).filter(t => t !== 'O')) {
    const s = createState(4); piece(s, type, 3, 5);
    for (let i = 0; i < 4; i++) assert.equal(rotate(s), true);
    assert.deepEqual(s.active.matrix, SHAPES[type]);
    rotate(s); rotate(s, -1); assert.deepEqual(s.active.matrix, SHAPES[type]);
  }
  const s = createState(4); piece(s, 'I', 0, 4); rotate(s); move(s, -1); move(s, -1);
  assert.equal(s.active.x, -2); assert.equal(rotate(s), true); assert.ok(fits(s, s.active));
  piece(s, 'I', 3, 18); assert.equal(rotate(s), true); assert.ok(fits(s, s.active));
  const before = structuredClone(s.active);
  s.board = s.board.map(row => row.map(() => 'Z'));
  assert.equal(rotate(s), false); assert.deepEqual(s.active, before);
});
test('one through four simultaneous lines clear and score at the pre-clear level', () => {
  for (const count of [1,2,3,4]) {
    const s = createState(1);
    for (let y = 20 - count; y < 20; y++) s.board[y] = Array.from({ length: 10 }, (_,x) => x === 5 ? null : 'J');
    piece(s, 'I', 3, 0); rotate(s); s.active.y = 16;
    s.lines = 9;
    hardDrop(s);
    assert.equal(s.lines, 9 + count);
    assert.equal(s.score, [0,100,300,500,800][count]);
    assert.equal(s.board.length, 20);
    assert.equal(s.board.flat().filter(Boolean).length, 4 - count);
    assert.equal(level(s), 2); assert.ok(fallInterval(s) < 800);
  }
});
test('gravity, soft drop, lock delay and finite lock resets', () => {
  const s = createState(1); piece(s, 'O', 3, 0);
  advance(s, 799); assert.equal(s.active.y, 0);
  advance(s, 1); assert.equal(s.active.y, 1); assert.equal(s.score, 0);
  softDrop(s); assert.equal(s.active.y, 2); assert.equal(s.score, 1);
  s.active.y = 18;
  advance(s, 400); assert.equal(s.locks, 0);
  move(s, 1); advance(s, 400); assert.equal(s.locks, 0);
  s.lockResets = 15; move(s, -1); advance(s, 100);
  assert.equal(s.locks, 1);
});
test('hold can be used once per piece and swapped piece returns to spawn orientation', () => {
  const s = createState(8), first = s.active.type, next = s.next[0];
  assert.equal(hold(s), true); assert.equal(s.hold, first); assert.equal(s.active.type, next);
  assert.equal(hold(s), false); hardDrop(s); assert.equal(hold(s), true);
  assert.equal(s.active.type, first); assert.deepEqual(s.active.matrix, SHAPES[first]);
});
test('blocked spawn and locking above the board end the game without further changes', () => {
  const s = createState(1);
  piece(s, 'O', 0, 18); s.board[0].fill('J'); s.board[1].fill('J');
  // Keep both upper rows incomplete so they cannot clear before the spawn check.
  s.board[0][9] = null; s.board[1][9] = null;
  hardDrop(s); assert.equal(s.over, true);
  const score = s.score; hardDrop(s); softDrop(s); hold(s); advance(s, 1000);
  assert.equal(s.score, score);
  const t = createState(1); piece(t, 'O', 3, -1); t.board[1][3] = 'L';
  advance(t, 500); assert.equal(t.over, true);
  const h = createState(1); h.hold = 'O'; h.board[0][4] = 'L'; hold(h); assert.equal(h.over, true);
});
test('tetris scores validate and completed rounds rank by points in personal history', () => {
  const score = { game:'tetris', size:200, difficulty:'normal', points:800, elapsedSeconds:60, puzzleId:1, puzzleSeed:1 };
  assert.equal(scoreSchema.safeParse(score).success, true);
  for (const change of [{points:-1}, {points:1.5}, {points:undefined}, {size:20}, {difficulty:'hard'}]) assert.equal(scoreSchema.safeParse({...score,...change}).success, false);
  assert.deepEqual(gameMetrics(score), {points:800}); assert.equal(scoreHeading('tetris'), '高分榜'); assert.equal(scoreLabel(score), '800 分');
  assert.deepEqual(scoreOrder('tetris'), [['points','desc'],['elapsedSeconds','asc'],['createdAt','asc']]);
  const play = {id:'11223344-1234-4234-8234-123456789012', game:'tetris', size:200, difficulty:'normal', elapsedSeconds:60, gameOver:true, ts:Date.now(), points:800};
  assert.equal(playSchema.safeParse(play).success, true);
  const stats = summarizePlays([play,{...play,id:'second',points:300},{...play,id:'third',points:800,elapsedSeconds:30}]);
  assert.equal(stats.best[0].id, 'third'); assert.equal(stats.best[0].completions, 3); assert.equal(stats.summary.wins, 0);
});
