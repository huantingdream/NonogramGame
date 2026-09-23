import { pop, enterBoard, animate, cancelMotion } from '../core/motion.js';

const stats = values => Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
function readBest(key) {
  try { const value = Number(localStorage.getItem(key)); return Number.isFinite(value) && value > 0 ? value : null; } catch (_) { return null; }
}
function saveBest(key, value) { try { localStorage.setItem(key, String(value)); } catch (_) {} }
function watchInterruption(interrupt, signal) {
  const observer = new MutationObserver(() => { if (document.querySelector('dialog[open]')) interrupt(); });
  document.querySelectorAll('dialog').forEach(dialog => observer.observe(dialog, { attributes: true, attributeFilter: ['open'] }));
  document.addEventListener('visibilitychange', () => { if (document.hidden) interrupt(); }, { signal });
  window.addEventListener('blur', interrupt, { signal });
  signal.addEventListener('abort', () => observer.disconnect(), { once: true });
}
function press(element, action, signal) {
  element.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault(); element.focus({ preventScroll: true }); action();
  }, { signal });
  element.addEventListener('keydown', event => {
    if (![' ', 'Enter'].includes(event.key)) return;
    event.preventDefault(); if (!event.repeat) action();
  }, { signal });
  element.addEventListener('click', event => { if (event.detail === 0) action(); }, { signal });
}

export const reaction = (() => {
  let ctx, controller, surface, phase, samples, readyAt, timeout, frame, best;
  const key = 'gejian:reaction:best-average-ms';
  function cancelWait() { clearTimeout(timeout); cancelAnimationFrame(frame); }
  function display(next, title, description) {
    phase = next; surface.dataset.phase = next;
    surface.querySelector('strong').textContent = title;
    surface.querySelector('small').textContent = description;
    ctx.els.controlPanel.querySelector('#reactionRounds').textContent = `${samples.length} / 5`;
    ctx.els.controlPanel.querySelector('#reactionAverage').textContent = samples.length ? `${stats(samples)} ms` : '—';
    ctx.els.controlPanel.querySelector('#reactionBest').textContent = best ? `${best} ms` : '—';
    ctx.els.boardToolbar.querySelector('.reaction-history').innerHTML = samples.map((value, i) => `<span>第 ${i + 1} 次 <strong>${value} ms</strong></span>`).join('');
  }
  function interrupt() {
    if (!['waiting', 'ready'].includes(phase)) return;
    cancelWait(); ctx.timer.stop(); ctx.setStatus('idle', '已中断');
    display('interrupted', '这一轮已暂停', '窗口失焦或打开菜单不计成绩，点击重新等待');
  }
  function action() {
    if (document.hidden || document.querySelector('dialog[open]')) return;
    if (phase === 'complete') { newGame(); return; }
    if (phase === 'waiting') {
      cancelWait(); ctx.timer.stop(); ctx.setStatus('incorrect', '抢跑了');
      display('early', '太早了！', '等背景变绿、出现「现在点击」再动手。点击重试本轮');
      return;
    }
    if (phase === 'ready') {
      const elapsed = Math.max(1, Math.round(performance.now() - readyAt));
      samples.push(elapsed); ctx.timer.stop();
      if (samples.length === 5) {
        const average = stats(samples);
        if (!best || average < best) { best = average; saveBest(key, best); }
        display('complete', `${average} ms`, `5 次平均 · 最快 ${Math.min(...samples)} ms · 点击开始新一组`);
        ctx.setStatus('correct', '测试完成');
      } else {
        display('result', `${elapsed} ms`, `已完成 ${samples.length} / 5 次 · 点击继续下一轮`);
        ctx.setStatus('active', '本轮完成');
      }
      pop(surface.querySelector('strong')); return;
    }
    ctx.timer.start(); ctx.setStatus('active', '等待变色');
    display('waiting', '等待变绿…', '保持专注，先不要点击');
    timeout = setTimeout(() => {
      frame = requestAnimationFrame(() => {
        if (phase !== 'waiting' || document.hidden || document.querySelector('dialog[open]')) { interrupt(); return; }
        // The cue changes immediately, with no color tween that could shift the perceived start.
        display('ready', '现在点击！', '点击绿色区域，或按空格 / Enter');
        readyAt = performance.now();
      });
    }, 1500 + Math.random() * 3000);
  }
  function newGame() {
    cancelWait(); samples = []; ctx.timer.reset(); ctx.setTitle('5 轮反应测试'); ctx.setPuzzleNumber(1);
    ctx.setStatus('idle', '准备开始'); display('idle', '你的反应有多快？', '点击开始，等背景由红变绿后立刻点击');
  }
  return {
    id: 'reaction', name: '反应测试', icon: 'ϟ', subtitle: 'REACTION TIME', localOnly: true,
    sizes: [{ value: 5, label: '5 次平均' }], difficulties: [{ value: 'normal', label: '标准' }],
    howToTitle: '等变绿，再点击',
    howTo: '<p>点击大区域开始一轮。红色表示等待，变成绿色并出现<strong>「现在点击」</strong>后，立刻点击或按空格 / Enter。</p><p>提前点击算抢跑，需要重试本轮；完成 5 次后显示平均与最快反应时间。打开菜单、切换标签页或窗口失焦会中断当前轮，不计入结果。</p><p>最佳平均成绩保存在当前浏览器。结果受显示器和输入设备延迟影响，适合休闲练习。</p>',
    newGame,
    mount(context) {
      ctx = context; controller = new AbortController(); const { signal } = controller; best = readBest(key);
      ctx.els.controlPanel.innerHTML = '<div class="eyebrow"><span></span> QUICK REFLEX</div><h1>等一等，<br><em>就是现在。</em></h1><div class="training-stats"><div><span>完成轮数</span><strong id="reactionRounds"></strong></div><div><span>当前平均</span><strong id="reactionAverage"></strong></div><div><span>本机最佳平均</span><strong id="reactionBest"></strong></div></div><button class="primary-button" id="reactionReset">↻ 重新测试</button><div class="mini-guide"><span class="guide-icon">✦</span><p>等待随机变色，连续完成 5 次。<br>抢跑不计入成绩。</p></div>';
      ctx.els.gameRoot.innerHTML = '<button type="button" class="reaction-surface" aria-label="反应测试区域"><span aria-hidden="true" class="reaction-symbol">ϟ</span><strong></strong><small></small></button>';
      surface = ctx.els.gameRoot.querySelector('.reaction-surface');
      ctx.els.boardToolbar.innerHTML = '<div class="reaction-history" aria-live="polite" aria-label="每轮反应成绩"></div>';
      ctx.els.desktopTip.textContent = '点击 / 空格 / Enter · 红色等待，绿色点击 · 成绩仅保存在本机';
      press(surface, action, signal);
      ctx.els.controlPanel.querySelector('#reactionReset').addEventListener('click', newGame, { signal });
      watchInterruption(interrupt, signal); newGame(); enterBoard(surface);
    },
    unmount() { cancelWait(); controller.abort(); ctx.timer.stop(); ctx = null; }
  };
})();

export const aim = (() => {
  const presets = { easy: { label: '大球', size: 60 }, normal: { label: '中球', size: 44 }, hard: { label: '小球', size: 32 } };
  let ctx, controller, arena, target, phase, difficulty = 'normal', deadline, frame, hits, shots, latencies, spawnedAt, best, position;
  const key = () => `gejian:aim:${difficulty}:best-hits`;
  function updateStats() {
    ctx.els.controlPanel.querySelector('#aimHits').textContent = hits;
    ctx.els.controlPanel.querySelector('#aimAccuracy').textContent = shots ? `${Math.round(hits / shots * 100)}%` : '—';
    ctx.els.controlPanel.querySelector('#aimBest').textContent = best || '—';
  }
  function placeTarget() {
    const rect = arena.getBoundingClientRect(), radius = presets[difficulty].size / 2 + 8;
    let x, y;
    for (let attempt = 0; attempt < 20; attempt++) {
      x = radius + Math.random() * (rect.width - radius * 2);
      y = radius + 42 + Math.random() * (rect.height - radius * 2 - 42);
      if (!position || Math.hypot(x / rect.width - position.x, y / rect.height - position.y) > .23) break;
    }
    position = { x: x / rect.width, y: y / rect.height };
    target.style.left = `${position.x * 100}%`; target.style.top = `${position.y * 100}%`;
    target.hidden = false; spawnedAt = performance.now();
  }
  function finish(interrupted = false) {
    if (phase !== 'playing') return;
    phase = interrupted ? 'interrupted' : 'complete'; cancelAnimationFrame(frame); target.hidden = true; ctx.timer.stop();
    if (!interrupted && hits > (best || 0)) { best = hits; saveBest(key(), best); }
    updateStats();
    ctx.setStatus(interrupted ? 'idle' : 'correct', interrupted ? '已中断' : '训练完成');
    const overlay = arena.querySelector('.aim-overlay'); overlay.hidden = false;
    overlay.querySelector('h3').textContent = interrupted ? '本局已中断' : `命中 ${hits} 个目标`;
    overlay.querySelector('p').textContent = interrupted ? '窗口失焦或打开菜单，本局不记录最佳成绩。' : `准确率 ${shots ? Math.round(hits / shots * 100) : 0}% · 平均命中耗时 ${latencies.length ? stats(latencies) + ' ms' : '—'}`;
    overlay.querySelector('button').textContent = '再练一次';
    if (!interrupted) arena.querySelector('#aimRemaining').textContent = '0.0';
  }
  function tick() {
    if (phase !== 'playing') return;
    const remaining = Math.max(0, deadline - performance.now());
    arena.querySelector('#aimRemaining').textContent = (remaining / 1000).toFixed(1);
    if (remaining === 0) finish(); else frame = requestAnimationFrame(tick);
  }
  function start() {
    if (phase === 'playing' || document.hidden || document.querySelector('dialog[open]')) return;
    hits = shots = 0; latencies = []; position = null; phase = 'playing';
    arena.querySelector('.aim-overlay').hidden = true;
    ctx.timer.reset(); ctx.timer.start(); ctx.setStatus('active', '瞄准中');
    deadline = performance.now() + 30000; updateStats(); placeTarget(); tick();
  }
  function shoot(event) {
    if (phase !== 'playing' || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    const now = performance.now();
    if (now >= deadline) { finish(); return; }
    const rect = target.getBoundingClientRect();
    const hit = Math.hypot(event.clientX - rect.left - rect.width / 2, event.clientY - rect.top - rect.height / 2) <= rect.width / 2;
    shots++;
    const burst = document.createElement('i'), area = arena.getBoundingClientRect();
    burst.className = `aim-burst ${hit ? 'hit' : 'miss'}`; burst.setAttribute('aria-hidden', 'true');
    burst.style.left = `${event.clientX - area.left}px`; burst.style.top = `${event.clientY - area.top}px`; arena.appendChild(burst);
    const effect = animate(burst, [{ scale: '.3', opacity: 1 }, { scale: '1.7', opacity: 0 }], { duration: 250 });
    if (effect) effect.finished.then(() => burst.remove(), () => burst.remove()); else burst.remove();
    if (hit) { hits++; latencies.push(now - spawnedAt); placeTarget(); }
    updateStats();
  }
  function newGame() {
    cancelAnimationFrame(frame); phase = 'idle'; hits = shots = 0; latencies = []; position = null; best = readBest(key());
    cancelMotion(arena); arena.querySelectorAll('.aim-burst').forEach(b => b.remove()); target.hidden = true;
    ctx.timer.reset(); ctx.setTitle(`30 秒 · ${presets[difficulty].label}`); ctx.setPuzzleNumber(1); ctx.setStatus('idle', '准备开始');
    target.style.width = target.style.height = `${presets[difficulty].size}px`;
    const overlay = arena.querySelector('.aim-overlay'); overlay.hidden = false;
    overlay.querySelector('h3').textContent = '瞄准，点击，命中';
    overlay.querySelector('p').textContent = '30 秒内点击尽可能多的小球，点空也会计入准确率。';
    overlay.querySelector('button').textContent = '开始 30 秒挑战';
    arena.querySelector('#aimRemaining').textContent = '30.0'; updateStats();
  }
  return {
    id: 'aim', name: '瞄准训练', icon: '⊕', subtitle: 'AIM TRAINER', localOnly: true,
    sizes: [{ value: 30, label: '30 秒' }], difficulties: Object.entries(presets).map(([value, p]) => ({ value, label: p.label })),
    howToTitle: '把准星移到小球上',
    howTo: '<p>点击开始后，在 30 秒内用鼠标或触屏点击圆形小球。命中后，小球立即出现在新位置；点空会降低准确率。</p><p>可选择大、中、小三种目标大小。结束后显示命中数、准确率与平均命中耗时。不同大小的最佳命中数分别保存在当前浏览器。</p><p>打开菜单、切换标签页或窗口失焦会结束本局且不记录最佳成绩。使用鼠标瞄准点击，手机直接点小球。</p>',
    newGame,
    mount(context) {
      ctx = context; controller = new AbortController(); const { signal } = controller;
      ctx.els.controlPanel.innerHTML = `<div class="eyebrow"><span></span> AIM TRAINER</div><h1>眼到手到，<br><em>命中每一球。</em></h1><div class="field-group"><div class="field-label"><span>目标大小</span></div><div class="segmented" role="radiogroup" aria-label="目标大小">${Object.entries(presets).map(([value,p])=>`<button type="button" role="radio" aria-checked="${value===difficulty}" data-aim-size="${value}">${p.label}</button>`).join('')}</div></div><div class="training-stats"><div><span>命中数</span><strong id="aimHits">0</strong></div><div><span>准确率</span><strong id="aimAccuracy">—</strong></div><div><span>本机最佳命中</span><strong id="aimBest">—</strong></div></div><button class="primary-button" id="aimReset">↻ 重新准备</button>`;
      ctx.els.gameRoot.innerHTML = '<div class="aim-arena" aria-label="瞄准训练场"><div class="aim-hud">剩余 <strong id="aimRemaining">30.0</strong> 秒</div><div class="aim-target" hidden aria-label="目标小球"></div><div class="aim-overlay"><span class="aim-reticle" aria-hidden="true">⊕</span><h3></h3><p></p><button class="primary-button" id="aimStart"></button></div></div>';
      arena = ctx.els.gameRoot.querySelector('.aim-arena'); target = arena.querySelector('.aim-target');
      ctx.els.boardToolbar.innerHTML = '<span class="training-note">瞄准小球 · 点击圆心附近</span><span class="training-note">30 秒挑战 · 最佳成绩保存在本机</span>';
      ctx.els.desktopTip.textContent = '鼠标瞄准 / 触屏点击 · 点击圆球才算命中 · 点空降低准确率';
      arena.addEventListener('pointerdown', shoot, { signal });
      arena.querySelector('#aimStart').addEventListener('click', start, { signal });
      arena.addEventListener('contextmenu', e => e.preventDefault(), { signal });
      ctx.els.controlPanel.querySelector('#aimReset').addEventListener('click', newGame, { signal });
      ctx.els.controlPanel.addEventListener('click', e => {
        const button = e.target.closest('[data-aim-size]'); if (!button) return;
        difficulty = button.dataset.aimSize;
        ctx.els.controlPanel.querySelectorAll('[data-aim-size]').forEach(b=>b.setAttribute('aria-checked',b===button)); newGame();
      }, { signal });
      const resize = new ResizeObserver(() => {
        if (phase !== 'playing' || !position) return;
        const rect = arena.getBoundingClientRect(), margin = presets[difficulty].size / 2 + 8;
        position.x = Math.max(margin / rect.width, Math.min(1 - margin / rect.width, position.x));
        position.y = Math.max((margin + 42) / rect.height, Math.min(1 - margin / rect.height, position.y));
        target.style.left = `${position.x * 100}%`; target.style.top = `${position.y * 100}%`;
      });
      resize.observe(arena);
      signal.addEventListener('abort', () => resize.disconnect(), { once: true });
      watchInterruption(() => finish(true), signal); newGame(); enterBoard(arena);
    },
    unmount() { cancelAnimationFrame(frame); controller.abort(); cancelMotion(arena); ctx.timer.stop(); phase = 'idle'; ctx = null; }
  };
})();
