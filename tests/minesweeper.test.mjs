// 扫雷「免猜雷区」生成的验证测试：直接导入真实模块，不走 DOM。
// 运行：node tests/minesweeper.test.mjs

// motion.js 顶层用到 window.matchMedia，给个最小桩。
globalThis.window = {
  matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} })
};

const { __testing } = await import("../dist/js/games/minesweeper.js");
const { state, presets, generateField, countForcedGuesses, placeMines } = __testing;

let failures = 0;
const assert = (condition, message) => {
  if (!condition) {
    failures += 1;
    console.error(`  ✗ ${message}`);
  }
};

const TRIALS_PER_PRESET = 40;

for (const [presetName, preset] of Object.entries(presets)) {
  state.preset = presetName;
  const { rows, cols, mines } = preset;
  let maxMs = 0;
  let totalMs = 0;

  for (let i = 0; i < TRIALS_PER_PRESET; i += 1) {
    const safeRow = Math.floor(Math.random() * rows);
    const safeCol = Math.floor(Math.random() * cols);
    state.puzzleSeed = (Math.random() * 0xffffffff) >>> 0;

    const start = performance.now();
    placeMines(safeRow, safeCol);
    const elapsed = performance.now() - start;
    maxMs = Math.max(maxMs, elapsed);
    totalMs += elapsed;

    const { mineField, adjacent } = state;

    // 1) 雷数正确
    const mineCount = mineField.flat().filter(Boolean).length;
    assert(mineCount === mines, `${presetName} 雷数应为 ${mines}，实际 ${mineCount}`);

    // 2) 首击格及周围 8 格无雷
    for (let r = safeRow - 1; r <= safeRow + 1; r += 1) {
      for (let c = safeCol - 1; c <= safeCol + 1; c += 1) {
        if (r >= 0 && r < rows && c >= 0 && c < cols) {
          assert(!mineField[r][c], `${presetName} 首击安全区 (${r},${c}) 不应有雷`);
        }
      }
    }

    // 3) 数字与雷区一致
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        let expected = 0;
        for (let dr = -1; dr <= 1; dr += 1) {
          for (let dc = -1; dc <= 1; dc += 1) {
            const rr = r + dr;
            const cc = c + dc;
            if (rr >= 0 && rr < rows && cc >= 0 && cc < cols && mineField[rr][cc]) expected += 1;
          }
        }
        assert(adjacent[r][c] === expected, `${presetName} (${r},${c}) 数字应为 ${expected}，实际 ${adjacent[r][c]}`);
      }
    }

    // 4) 核心目标：从首击格出发，纯逻辑即可通关（0 次被迫猜测）
    const guesses = countForcedGuesses(mineField, adjacent, safeRow, safeCol);
    assert(guesses === 0, `${presetName} 第 ${i} 局需要猜 ${guesses} 次（应为 0）`);

    // 5) 确定性：同一题号 + 同一首击，雷区完全一致
    const again = (() => {
      const snapshot = JSON.stringify(state.mineField);
      placeMines(safeRow, safeCol);
      const same = JSON.stringify(state.mineField) === snapshot;
      return same;
    })();
    assert(again, `${presetName} 同一题号 + 同一首击应生成相同雷区`);
  }

  console.log(`${presetName.padEnd(6)} ${TRIALS_PER_PRESET} 局全部验证  平均生成 ${(totalMs / TRIALS_PER_PRESET).toFixed(1)}ms  最慢 ${maxMs.toFixed(1)}ms`);
}

// 附带：generateField 单独验证不同种子产生不同雷区
state.preset = "normal";
const fieldA = generateField(3, 3, 12345);
const fieldB = generateField(3, 3, 54321);
assert(JSON.stringify(fieldA.mineField) !== JSON.stringify(fieldB.mineField), "不同种子应产生不同雷区");

if (failures) {
  console.error(`\n${failures} 项断言失败`);
  process.exit(1);
}
console.log("\n全部通过 ✓");
