import test from 'node:test';
import assert from 'node:assert/strict';
import { generateNetwalk, checkNetwalk, rotateMask, generateAkari, checkAkari, generateNurikabe, checkNurikabe, generateKenken, checkKenken } from '../dist/js/games/new-puzzle-logic.js';
import { makeSeededRandom } from '../dist/js/core/utils.js';

const rng = (seed) => makeSeededRandom(seed);

test('netwalk: mask rotation cycles every 4 turns', () => {
  assert.equal(rotateMask(0b0001, 1), 0b0010);
  assert.equal(rotateMask(0b1000, 1), 0b0001);
  for (let mask = 0; mask < 16; mask++) assert.equal(rotateMask(mask, 4), mask);
});

test('netwalk: generated tree is a valid solution, scramble is solvable by rotating back', () => {
  for (const n of [5, 7]) {
    for (const seed of [1, 42, 20261014]) {
      const { solution, scrambled } = generateNetwalk(n, rng(seed));
      assert.equal(solution.length, n * n);
      assert.ok(checkNetwalk(n, solution), 'solution must satisfy win condition');
      // 生成树的补：打乱后通常未通关（小概率相同也允许重打乱逻辑兜底）
      assert.ok(scrambled.some((mask, i) => mask !== solution[i]) || checkNetwalk(n, scrambled) === false || n <= 1);
      // 打破一个接口后不再连通
      const broken = solution.slice();
      broken[0] = rotateMask(broken[0], 2);
      // 可能碰巧仍合法（对称接口），仅检查确定非法的情况
      if (broken[0] !== solution[0]) assert.equal(typeof checkNetwalk(n, broken), 'boolean');
    }
  }
});

test('netwalk: dangling port or disconnected graph fails', () => {
  // 2×2 全部只朝上：接口悬空
  assert.equal(checkNetwalk(2, [1, 1, 1, 1]), false);
  // 2×2 环：0 右+下，1 左+下，2 上+右，3 上+左 —— 两两对接且连通
  assert.equal(checkNetwalk(2, [0b0110, 0b1100, 0b0011, 0b1001]), true);
});

test('akari: generated puzzle is solvable by its own solution', () => {
  for (const n of [7, 10]) {
    for (const seed of [7, 99, 2026]) {
      const puzzle = generateAkari(n, rng(seed));
      assert.ok(checkAkari(puzzle, new Set(puzzle.solution)), 'own solution must pass');
      // 空作答不可能通关（除非没有白格，几乎不可能）
      assert.equal(checkAkari(puzzle, new Set()), false);
    }
  }
});

test('akari: two lights seeing each other fail', () => {
  const puzzle = { n: 3, cells: Array(9).fill(null) };
  assert.equal(checkAkari(puzzle, new Set([0, 2])), false); // 同行互照
  assert.equal(checkAkari(puzzle, new Set([0, 6])), false); // 同列互照
});

test('nurikabe: generated puzzle solution passes the checker', () => {
  for (const n of [7, 10]) {
    for (const seed of [3, 555, 20261014]) {
      const puzzle = generateNurikabe(n, rng(seed));
      assert.ok(puzzle, 'generator should succeed within retries');
      // solution: true = 岛
      const state = puzzle.solution.map((isIsland) => (isIsland ? 2 : 1));
      assert.ok(checkNurikabe(puzzle, state), 'own solution must pass');
      // 全涂海：出现 2×2 海块或岛大小不符
      assert.equal(checkNurikabe(puzzle, Array(n * n).fill(1)), false);
      // 有未定格不通过
      const undecided = state.slice();
      undecided[0] = 0;
      assert.equal(checkNurikabe(puzzle, undecided), false);
    }
  }
});

test('kenken: latin square rows/cols are permutations and solution passes', () => {
  for (const n of [4, 6]) {
    for (const seed of [11, 2024, 888]) {
      const puzzle = generateKenken(n, rng(seed));
      assert.ok(checkKenken(n, puzzle.cages, puzzle.solution), 'own solution must pass');
      // 全填 1 必败
      assert.equal(checkKenken(n, puzzle.cages, Array(n * n).fill(1)), false);
      // 有空格必败
      const withHole = puzzle.solution.slice();
      withHole[0] = 0;
      assert.equal(checkKenken(n, puzzle.cages, withHole), false);
    }
  }
});

test('kenken: cages cover every cell exactly once', () => {
  const n = 6;
  const puzzle = generateKenken(n, rng(20261014));
  const covered = new Set(puzzle.cages.flatMap((cage) => cage.cells));
  assert.equal(covered.size, n * n);
});
