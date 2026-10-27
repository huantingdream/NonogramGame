// Runs against the real page through either a CUA tab or the optional Playwright CLI below.
// No live score writes, hidden game state or synthetic DOM events are used.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

function helpers(tab, baseURL) {
  assert.ok(['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(baseURL).hostname), 'Use a local test server');
  const page = tab.playwright;
  const open = async (game, board) => {
    await tab.goto(`${baseURL}?ui-test=${game}#${game}`);
    await page.locator(board).first().waitFor({ state: 'visible' });
  };
  const daily = async (game, board) => {
    await page.locator('#dailyButton').click();
    await page.locator(`[data-daily-game="${game}"]`).click();
    await page.locator(board).first().waitFor({ state: 'visible' });
  };
  return { page, open, daily };
}

export async function newPuzzles(tab, baseURL) {
  const { page, open, daily } = helpers(tab, baseURL);
  await open('netwalk', '.netwalk-grid');
  const pipe = page.locator('.netwalk-cell[data-cell="0"]');
  const original = await pipe.evaluate(el => el.innerHTML);
  for (let i = 0; i < 4; i++) await pipe.locator('svg').click();
  assert.equal(await page.locator('#netwalkMoves').textContent(), '4');
  assert.equal(await pipe.evaluate(el => el.innerHTML), original, 'four rotations restore the pipe');
  for (let i = 0; i < 12; i++) await pipe.click();
  assert.equal(await page.locator('#netwalkMoves').textContent(), '16');
  await pipe.press('Enter');
  assert.equal(await page.locator('#netwalkMoves').textContent(), '17');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.cell), '0');
  await page.locator('#boardToolbar [data-action="new"]').click();
  assert.equal(await page.locator('#netwalkMoves').textContent(), '0');
  await page.locator('#controlPanel [data-size="5"]').click();
  assert.equal(await page.locator('.netwalk-cell').count(), 25);

  await open('akari', '.akari-grid');
  const light = page.locator('.akari-cell[data-cell]').first();
  await light.click();
  assert.equal(await page.locator('.akari-cell.light').count(), 1);
  assert.ok(await page.locator('.akari-cell.lit').count() > 0);
  await light.locator('svg').click();
  assert.equal(await page.locator('.akari-cell.light').count(), 0);
  await light.click({ button: 'right' });
  assert.equal(await page.locator('.akari-cell.marked').count(), 1);
  await page.locator('[data-mode="mark"]').click();
  await page.locator('#boardToolbar [data-action="new"]').click();
  assert.equal(await page.locator('[data-mode="light"]').getAttribute('aria-pressed'), 'true');
  await page.locator('.akari-cell[data-cell]').first().click();
  assert.equal(await page.locator('.akari-cell.light').count(), 1);

  await open('nurikabe', '.nurikabe-grid');
  const sea = page.locator('.nurikabe-cell:not(.clue)').first();
  await sea.click();
  assert.equal(await page.locator('.nurikabe-cell.sea').count(), 1);
  await sea.click();
  assert.equal(await page.locator('.nurikabe-cell.island:not(.clue)').count(), 1);
  await sea.click();
  assert.equal(await page.locator('.nurikabe-cell.sea, .nurikabe-cell.island:not(.clue)').count(), 0);

  await open('kenken', '.kenken-grid');
  await page.locator('.kenken-cell[data-cell="0"]').click();
  await page.locator('#boardToolbar [data-value="1"]').click();
  await page.locator('.kenken-cell[data-cell="1"]').click();
  await page.locator('#boardToolbar [data-value="1"]').click();
  assert.equal(await page.locator('.kenken-cell.dup').count(), 2);
  await page.locator('#boardToolbar [data-value="0"]').click();
  assert.equal(await page.locator('.kenken-cell.dup').count(), 0);
  await page.locator('#controlPanel [data-size="4"]').click();
  assert.equal(await page.locator('.kenken-cell').count(), 16);
  await daily('kenken', '.kenken-grid');
  await page.locator('.kenken-cell[data-cell="35"]').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.kenken-cell').count(), 36);
  assert.equal((await page.locator('.kenken-pad button').allTextContents()).join(','), '1,2,3,4,5,6,⌫');
  await page.locator('.kenken-cell[data-cell="0"]').click();
  await page.locator('#boardToolbar [data-value="6"]').click();
  assert.equal(await page.locator('.kenken-cell[data-cell="0"] .kenken-value').textContent(), '6');

  // Cross-game daily entry used to call newGame before the previous game faded out.
  for (const [game, board, count] of [['netwalk', '.netwalk-cell', 49], ['akari', '.akari-cell', 100], ['nurikabe', '.nurikabe-cell', 100], ['kenken', '.kenken-cell', 36]]) {
    await daily(game, board);
    assert.equal(await page.locator(board).count(), count, `${game} daily size`);
    await page.locator(`${board}[data-cell]`).first().click();
  }
  return 'PASS: four puzzle inputs, SVG clicks, repeated/keyboard rotations, resets, modes, duplicate checks and cross-game daily entry';
}

export async function classicPuzzles(tab, baseURL) {
  const { page, open } = helpers(tab, baseURL);
  await open('nonogram', '.puzzle-grid .cell');
  const startingHints = await page.locator('.puzzle-grid .cell.filled').count();
  await page.locator('.puzzle-grid .cell:not(.filled)').first().click();
  assert.equal(await page.locator('.puzzle-grid .cell.filled').count(), startingHints + 1);
  await page.locator('#nonogramUndoButton').click();
  assert.equal(await page.locator('.puzzle-grid .cell.filled').count(), startingHints);
  await open('sudoku', '.sudoku-cell:not(.given)');
  await page.locator('.sudoku-cell:not(.given)').first().click();
  await page.locator('[data-number="1"]').click();
  assert.equal(await page.locator('.sudoku-cell.selected').textContent(), '1');
  await page.locator('#sudokuUndoButton').click();
  assert.equal(await page.locator('.sudoku-cell.selected').textContent(), '');
  await open('minesweeper', '.mine-cell');
  await page.locator('.mine-cell').first().click();
  assert.ok(await page.locator('.mine-cell.revealed').count() > 0);
  await open('2048', '.tiles-grid');
  await page.locator('[data-direction="left"]').click();
  await page.locator('[data-direction="down"]').click();
  await page.locator('#tileNew').click();
  assert.equal(await page.locator('.tile:not(.tile-0)').count(), 2);
  for (const game of ['slitherlink', 'hashi']) {
    await open(game, '.edge-hit');
    await page.locator('.edge-hit').first().click();
    assert.equal(await page.locator('.edge-hit').first().getAttribute('aria-pressed'), 'true');
    await page.locator('[data-action="undo"]').click();
    assert.equal(await page.locator('.edge-hit').first().getAttribute('aria-pressed'), 'false');
  }
  return 'PASS: nonogram, sudoku, minesweeper, 2048, slitherlink and hashi input/reset/undo smoke checks';
}

export async function actionGames(tab, baseURL) {
  const { page, open } = helpers(tab, baseURL);
  await open('reaction', '.reaction-surface');
  await page.locator('.reaction-surface').click();
  assert.equal(await page.locator('.reaction-surface').getAttribute('data-phase'), 'waiting');
  await page.locator('.reaction-surface').click();
  assert.equal(await page.locator('.reaction-surface').getAttribute('data-phase'), 'early');
  await page.locator('#reactionReset').click();
  assert.equal(await page.locator('#reactionRounds').textContent(), '0 / 5');
  await open('aim', '#aimStart');
  await page.locator('#aimStart').click();
  await page.locator('.aim-target').click();
  assert.equal(await page.locator('#aimHits').textContent(), '1');
  await page.locator('#aimReset').click();
  assert.equal(await page.locator('#aimRemaining').textContent(), '30.0');
  await open('watermelon', '#wmCanvas');
  await page.locator('#wmCanvas').click();
  assert.equal(await page.locator('#gameStatus').getAttribute('data-tone'), 'active');
  await page.locator('#wmNew').click();
  assert.equal(await page.locator('#wmScore').textContent(), '0');
  return 'PASS: reaction false-start/reset, aim hit/reset and watermelon drop/reset';
}

if (typeof process !== 'undefined' && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const tab = { playwright: page, goto: url => page.goto(url) };
    for (const run of [newPuzzles, classicPuzzles, actionGames]) console.log(await run(tab, process.env.GAME_BASE_URL || 'http://127.0.0.1:7100/'));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}
