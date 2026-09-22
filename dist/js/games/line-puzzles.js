import { randomSeed, makeSeededRandom } from '../core/utils.js';
import { generateLoop, checkLoop, generateBridges, checkBridges, bridgeCounts, crosses } from './puzzle-logic.js';

// Both puzzles use actual buttons over a scalable SVG board, supporting touch and keyboard.
function createLineGame(kind) {
  const loop = kind === 'slitherlink', name = loop ? '数回' : '数桥';
  const presets = loop ? [5, 7] : [7, 9];
  const sizeCode = n => (loop ? 100 : 200) + n;
  let ctx, controller, n = presets[0], puzzle, values, history, seed, won, markMode = false;
  const xy = (x, y) => `${(x + .5) * 100 / (loop ? n + 1 : n)}%, ${(y + .5) * 100 / (loop ? n + 1 : n)}%`;
  function position(x, y) { const [left, top] = xy(x, y).split(', '); return `left:${left};top:${top}`; }
  function render() {
    const board = ctx.els.gameRoot.querySelector('.line-board'), span = loop ? n + 1 : n;
    let drawing = '', buttons = '';
    if (loop) {
      puzzle.clues.forEach((v, i) => {
        const count = puzzle.edges.reduce((sum, e, k) => sum + (e.cells.includes(i) && values[k] === 1 ? 1 : 0), 0);
        buttons += `<span class="loop-clue ${count === v ? 'satisfied' : count > v ? 'overfull' : ''}" style="${position(i % n + .5, Math.floor(i / n) + .5)}">${v}</span>`;
      });
      for (let y = 0; y <= n; y++) for (let x = 0; x <= n; x++) drawing += `<circle cx="${x + .5}" cy="${y + .5}" r=".045" class="loop-dot"/>`;
      puzzle.edges.forEach((e, i) => {
        const ax = e.a % (n + 1) + .5, ay = Math.floor(e.a / (n + 1)) + .5, bx = e.b % (n + 1) + .5, by = Math.floor(e.b / (n + 1)) + .5;
        drawing += `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" class="${values[i] === 1 ? 'drawn-line' : 'guide-line'}"/>`;
        buttons += `<button type="button" class="edge-hit ${e.horizontal ? 'horizontal' : 'vertical'}" data-edge="${i}" style="${position(e.x, e.y)}" aria-label="${e.horizontal ? '横' : '竖'}边，第 ${Math.floor(e.y) + 1} 行第 ${Math.floor(e.x) + 1} 列，${values[i] === 1 ? '已画线' : values[i] === -1 ? '已排除' : '未标记'}" aria-pressed="${values[i] === 1}">${values[i] === -1 ? '×' : ''}</button>`;
      });
    } else {
      const counts = bridgeCounts(puzzle, values);
      puzzle.edges.forEach((e, i) => {
        const a = puzzle.islands[e.a], b = puzzle.islands[e.b], horizontal = a.y === b.y;
        const offsets = values[i] === 2 ? [-.06, .06] : [0];
        offsets.forEach(offset => { drawing += `<line x1="${a.x+.5+(horizontal?0:offset)}" y1="${a.y+.5+(horizontal?offset:0)}" x2="${b.x+.5+(horizontal?0:offset)}" y2="${b.y+.5+(horizontal?offset:0)}" class="${values[i] ? 'drawn-line' : 'guide-line'}"/>`; });
        const length = (Math.abs(a.x-b.x)+Math.abs(a.y-b.y)-.65)*100/span;
        buttons += `<button type="button" class="edge-hit ${horizontal?'horizontal':'vertical'}" data-edge="${i}" style="${position((a.x+b.x)/2,(a.y+b.y)/2)};${horizontal?'width':'height'}:${length}%" aria-label="岛 ${e.a+1} 到岛 ${e.b+1}，${values[i]} 座桥" aria-pressed="${values[i]>0}"></button>`;
      });
      puzzle.islands.forEach((island, i) => { buttons += `<span class="bridge-island ${counts[i]===island.clue?'satisfied':counts[i]>island.clue?'overfull':''}" style="${position(island.x,island.y)}" aria-label="岛 ${i+1}，需要 ${island.clue} 座桥，已有 ${counts[i]} 座">${island.clue}</span>`; });
    }
    const focused = board.contains(document.activeElement) ? document.activeElement.dataset.edge : null;
    board.style.setProperty('--span', span);
    board.innerHTML = `<svg viewBox="0 0 ${span} ${span}" aria-hidden="true">${drawing}</svg>${buttons}`;
    if (focused != null) board.querySelector(`[data-edge="${focused}"]`)?.focus({ preventScroll:true });
    ctx.els.boardToolbar.querySelector('[data-action="undo"]').disabled = !history.length || won;
  }
  function edit(i, exclude = false) {
    if (won) return;
    const next = values.slice();
    next[i] = loop ? exclude ? values[i] === -1 ? 0 : -1 : values[i] === 1 ? 0 : 1 : (values[i] + 1) % 3;
    if (!loop && next[i] > 0 && puzzle.edges.some((e, j) => j !== i && next[j] > 0 && crosses(puzzle.edges[i], e, puzzle.islands))) { ctx.toast('桥不能交叉，请先移除交叉的桥'); return; }
    history.push(values); values = next; ctx.timer.start(); ctx.setStatus('active'); render();
  }
  function check() {
    if (won) return;
    const correct = loop ? checkLoop(puzzle, values) : checkBridges(puzzle, values);
    if (!correct) { ctx.setStatus('incorrect'); ctx.toast(loop ? '请检查数字是否满足，所有线段需形成唯一闭环。' : '请检查每座岛的桥数，所有岛必须连成一体。'); return; }
    won = true; ctx.timer.stop(); render();
    ctx.reportWin({ summary:`你用 ${ctx.timerText()} 完成了 ${n} × ${n} 的${name}挑战。`, score:{ size:sizeCode(n), difficulty:n===presets[0]?'easy':'normal', elapsedSeconds:Math.max(1,ctx.timer.elapsed()), puzzleId:seed%10000, puzzleSeed:seed } });
  }
  function newGame() {
    ctx.closeVictory(); seed = randomSeed(); const random = makeSeededRandom(seed);
    puzzle = loop ? generateLoop(n,random) : generateBridges(n,random);
    values = puzzle.edges.map(()=>0); history = []; won = false;
    ctx.timer.reset(); ctx.setStatus('idle'); ctx.setTitle(`${n} × ${n} · ${name}`); ctx.setPuzzleNumber(seed%10000); render();
  }
  return {
    id:kind, name, subtitle:loop?'SLITHERLINK':'HASHIWOKAKERO', icon:loop?'▱':'☷',
    howToTitle:loop?'沿着数字，围成一个环':'连接岛屿，让数字恰好满足',
    howTo:loop?'<p>点击相邻圆点之间的边来画线，再点取消；切换「排除」或使用右键标记 ×。</p><p>每个数字表示其四条边中有几条属于环线。所有线段必须组成<strong>一个连续闭环</strong>，不能分叉、相交，也不能有多个小环。</p><p>绿色数字表示周围线数已满足。完成后点击「检查答案」。题目自动生成，任何满足规则的解都会被接受。</p>':'<p>点击同一行或同一列的两个相邻岛屿之间的虚线，依次切换<strong>单桥 → 双桥 → 无桥</strong>。</p><p>岛上的数字是与它相连的桥数，双桥计为 2。桥不能交叉或穿过其他岛，所有岛必须连成一个整体。</p><p>绿色岛屿表示桥数已满足。完成后点击「检查答案」。题目自动生成，任何满足规则的解都会被接受。</p>',
    sizes:presets.map(v=>({value:sizeCode(v),label:`${v} × ${v}`})), difficulties:[{value:'easy',label:'入门'},{value:'normal',label:'进阶'}],
    getScoreFilter:()=>({size:sizeCode(n),difficulty:n===presets[0]?'easy':'normal'}), newGame,
    mount(context) {
      ctx = context; controller = new AbortController(); const options = {signal:controller.signal}; markMode = false;
      ctx.els.controlPanel.innerHTML = `<div class="eyebrow"><span></span> LOGIC PUZZLE</div><h1>${loop?'循着线索，<br><em>画出一个环。':'一桥一线，<br><em>连接每座岛。'}</em></h1><div class="field-group"><div class="field-label"><span>棋盘规格</span></div><div class="segmented" role="radiogroup" aria-label="棋盘规格">${presets.map(v=>`<button type="button" role="radio" aria-checked="${n===v}" data-size="${v}">${v} × ${v}</button>`).join('')}</div></div><button type="button" class="primary-button" data-action="new">↻ 生成新题目</button><div class="mini-guide"><span class="guide-icon">✦</span><p><strong>${loop?'数字决定四周的线条。':'数字决定岛屿的桥数。'}</strong><br>${loop?'不分叉、不交叉，只画一个闭环。':'每对岛屿最多两座桥，所有岛相连。'}</p></div>`;
      ctx.els.gameRoot.innerHTML = `<div class="line-board ${loop?'loop-board':'bridge-board'}" role="group" aria-label="${name}棋盘"></div>`;
      ctx.els.boardToolbar.innerHTML = `${loop?'<div class="tool-switch" aria-label="画线方式"><button type="button" data-mode="line" aria-pressed="true">画线</button><button type="button" data-mode="exclude" aria-pressed="false">× 排除</button></div>':''}<div class="board-actions"><button type="button" class="text-button" data-action="undo">↶ 撤销</button><button type="button" class="text-button" data-action="clear">清空</button><button type="button" class="secondary-button" data-action="check">检查答案</button></div>`;
      ctx.els.desktopTip.textContent = loop?'点击边画线 · 右键 / 排除模式标记 × · Tab 和空格也可操作':'点击岛屿之间的虚线：单桥 → 双桥 → 无桥 · Tab 和空格也可操作';
      ctx.els.controlPanel.addEventListener('click', e=> {
        const size = e.target.closest('[data-size]');
        if (size) { n = Number(size.dataset.size); ctx.els.controlPanel.querySelectorAll('[data-size]').forEach(b=>b.setAttribute('aria-checked',b===size)); newGame(); }
        if (e.target.closest('[data-action="new"]')) newGame();
      },options);
      ctx.els.boardToolbar.addEventListener('click', e=> {
        const mode = e.target.closest('[data-mode]');
        if (mode) { markMode = mode.dataset.mode === 'exclude'; ctx.els.boardToolbar.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',b===mode)); }
        const action = e.target.closest('[data-action]')?.dataset.action;
        if (action==='check') check();
        if (!won && action==='undo' && history.length) { values = history.pop(); ctx.setStatus('active'); render(); }
        if (!won && action==='clear' && values.some(Boolean)) { history.push(values); values = values.map(()=>0); ctx.setStatus('active'); render(); }
      }, options);
      ctx.els.gameRoot.addEventListener('click',e=>{ const edge=e.target.closest('[data-edge]'); if(edge) edit(Number(edge.dataset.edge),markMode); },options);
      ctx.els.gameRoot.addEventListener('contextmenu',e=>{ if(!loop)return; const edge=e.target.closest('[data-edge]'); if(edge){e.preventDefault();edit(Number(edge.dataset.edge),true);} },options);
      newGame();
    },
    unmount() { controller.abort(); ctx = null; }
  };
}
export const slitherlink = createLineGame('slitherlink');
export const hashi = createLineGame('hashi');
