import { randomSeed, makeSeededRandom } from '../core/utils.js';
import { move2048, canMove2048 } from './puzzle-logic.js';
let ctx, controller, board, score, over, seed, random, pointer;
function spawn() {
  const empty = board.map((v, i) => v ? -1 : i).filter(i => i >= 0);
  if (empty.length) board[empty[Math.floor(random() * empty.length)]] = random() < .9 ? 2 : 4;
}
function render() {
  ctx.els.gameRoot.querySelector('.tiles-grid').innerHTML = board.map(v => `<div class="tile tile-${v}" role="gridcell" aria-label="${v || '空格'}">${v || ''}</div>`).join('');
  ctx.els.controlPanel.querySelector('#tileScore').textContent = score;
}
function move(direction) {
  if (over || document.querySelector('dialog[open]')) return;
  const result = move2048(board, direction);
  if (!result.changed) return;
  ctx.timer.start(); ctx.setStatus('active');
  board = result.board; score += result.score; spawn(); render();
  if (board.includes(2048)) {
    over = true; ctx.timer.stop();
    ctx.reportWin({ summary: `你用 ${ctx.timerText()} 合成了 2048，获得 ${score} 分！`, score: { size: 16, difficulty: 'normal', elapsedSeconds: Math.max(1, ctx.timer.elapsed()), puzzleId: seed % 10000, puzzleSeed: seed } });
  } else if (!canMove2048(board)) {
    over = true; ctx.timer.stop(); ctx.setStatus('incorrect', '无路可走'); ctx.toast(`本局得分 ${score}，再来挑战一次吧！`);
  }
}
function newGame() {
  ctx.closeVictory(); seed = randomSeed(); random = makeSeededRandom(seed); board = Array(16).fill(0); score = 0; over = false; pointer = null;
  ctx.timer.reset(); ctx.setStatus('idle', '等待移动'); ctx.setTitle('4 × 4 · 合成 2048'); ctx.setPuzzleNumber(seed % 10000); spawn(); spawn(); render();
}
export default {
  id: '2048', name: '2048', icon: '▣', subtitle: '2048', howToTitle: '滑动数字，合成 2048',
  howTo: '<p>使用方向键、WASD、屏幕方向按钮，或在棋盘上滑动。所有方块会向同一个方向移动。</p><p>相邻的相同数字合并并累加分数，每个方块一回合只合并一次。有效移动后会出现一个 2 或 4。</p><p>合成 <strong>2048</strong> 即通关，排行榜比较合成用时。棋盘填满且无法合并时结束。</p>',
  sizes: [{ value: 16, label: '4 × 4' }], difficulties: [{ value: 'normal', label: '经典' }], getScoreFilter: () => ({ size: 16, difficulty: 'normal' }), newGame,
  mount(context) {
    ctx = context; controller = new AbortController(); const options = { signal: controller.signal };
    ctx.els.controlPanel.innerHTML = '<div class="eyebrow"><span></span> NUMBER PLAY</div><h1>不断合并，<br><em>合成 2048。</em></h1><div class="tile-score"><span>本局得分</span><strong id="tileScore" aria-live="polite">0</strong></div><button class="primary-button" id="tileNew">↻ 开始新一局</button><div class="mini-guide"><span class="guide-icon">✦</span><p><strong>相同数字，相遇相加。</strong><br>试着把大数字留在角落。</p></div>';
    ctx.els.gameRoot.innerHTML = '<div class="tiles-grid" role="grid" aria-label="2048 棋盘" tabindex="0"></div>';
    ctx.els.boardToolbar.innerHTML = '<div class="direction-pad" aria-label="移动方向">' + [['left','←'],['up','↑'],['down','↓'],['right','→']].map(([d, icon]) => `<button type="button" class="secondary-button" data-direction="${d}" aria-label="向${{left:'左',up:'上',down:'下',right:'右'}[d]}移动">${icon}</button>`).join('') + '</div>';
    ctx.els.desktopTip.textContent = '方向键 / WASD · 手机在棋盘上滑动 · 合成 2048 即通关';
    ctx.els.controlPanel.querySelector('#tileNew').addEventListener('click', newGame, options);
    ctx.els.boardToolbar.addEventListener('click', e => { const b = e.target.closest('[data-direction]'); if (b) move(b.dataset.direction); }, options);
    document.addEventListener('keydown', e => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest('input, select, textarea') || document.querySelector('dialog[open]')) return;
      const d = { ArrowLeft:'left', ArrowRight:'right', ArrowUp:'up', ArrowDown:'down', a:'left', d:'right', w:'up', s:'down' }[e.key];
      if (d) { e.preventDefault(); move(d); }
    }, options);
    const grid = ctx.els.gameRoot.querySelector('.tiles-grid');
    grid.addEventListener('pointerdown', e => { pointer = { x:e.clientX, y:e.clientY, id:e.pointerId }; grid.setPointerCapture(e.pointerId); }, options);
    grid.addEventListener('pointerup', e => { if (!pointer || pointer.id !== e.pointerId) return; const dx = e.clientX-pointer.x, dy = e.clientY-pointer.y; pointer = null; if (Math.max(Math.abs(dx),Math.abs(dy)) >= 25) move(Math.abs(dx)>Math.abs(dy) ? dx>0?'right':'left' : dy>0?'down':'up'); }, options);
    grid.addEventListener('pointercancel', () => { pointer = null; }, options); newGame();
  },
  unmount() { controller.abort(); ctx = null; }
};
