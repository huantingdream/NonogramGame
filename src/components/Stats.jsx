import { useEffect, useState, useSyncExternalStore } from 'react';
import { statsStore, initStats } from '../core/stats.js';
import { GAMES } from '../games/registry.js';
import { scoreLabel } from '../../shared/score.js';
import { formatElapsed } from '../../shared/format.js';
import { openAuthModal } from '../core/account.js';
import { Modal } from './Modal.jsx';
export function Stats() {
  const [open,setOpen] = useState(false);
  const state = useSyncExternalStore(statsStore.subscribe, statsStore.getSnapshot);
  useEffect(initStats, []);
  const label = play => {
    const game = GAMES.find(g => g.id === play.game);
    return [game?.sizes.find(s => Number(s.value) === play.size)?.label, game?.difficulties.find(d => d.value === play.difficulty)?.label].filter(Boolean).join(' · ');
  };
  const gameName = id => GAMES.find(g => g.id === id)?.name || id;
  const icon = id => <span className="stats-game-icon" aria-hidden="true"><img src={`/assets/icons/game-${id}.svg`} alt="" loading="lazy"/></span>;
  const status = !state.accountId ? '未登录：最近 300 条战绩暂存本机，登录后可导入账号。'
    : state.error ? `${state.error}${state.pending ? ` 还有 ${state.pending} 条待同步，会自动重试。` : ''}`
    : state.syncing ? `正在保存战绩，还有 ${state.pending} 条待同步…`
    : state.loading ? '正在读取账号战绩…'
    : '战绩已保存到账号，可跨设备查看；后续每局结算自动保存。';
  return <>
    <button className="topbar-button" id="statsButton" onClick={() => {setOpen(true);void statsStore.refresh();}}><span className="icon icon-stats" aria-hidden="true"/> 战绩</button>
    <Modal open={open} onClose={() => setOpen(false)} id="statsModal" className="stats-modal" aria-labelledby="statsTitle">
      <button className="modal-close" data-close-stats aria-label="关闭" onClick={() => setOpen(false)}>×</button>
      <span className="modal-kicker">MY RECORDS</span><h2 id="statsTitle">{state.accountId ? '我的账号战绩' : '我的本机战绩'}</h2>
      <p className="network-hint" id="statsSyncState" role="status" aria-live="polite">{status}</p>
      {state.storageError && <p className="form-message" role="alert">浏览器存储不可用，待同步记录目前仅保留在此页面，请保持页面打开并重试同步。</p>}
      {!!state.invalidGuestCount && <p className="network-hint">有 {state.invalidGuestCount} 条旧记录格式异常，仍保留在本机，未导入。</p>}
      <div className="share-row">
        {state.accountId ? <>
          <button className="secondary-button" id="statsRefreshButton" disabled={state.loading} onClick={() => void statsStore.refresh()}>刷新 / 重试同步</button>
          {state.guestCount > 0 && <button className="secondary-button" id="statsImportButton" disabled={state.loading} onClick={() => void statsStore.importGuest()}>将本机 {state.guestCount} 条战绩导入此账号</button>}
        </> : <button className="secondary-button" id="statsLoginButton" onClick={() => {setOpen(false);openAuthModal(() => setOpen(true));}}>登录并同步战绩</button>}
      </div>
      <div className="stats-overview" id="statsOverview"><div><span>总对局</span><strong>{state.summary.total}</strong></div><div><span>完成次数</span><strong>{state.summary.wins}</strong></div><div><span>累计游戏时间</span><strong>{formatElapsed(state.summary.totalSeconds)}</strong></div></div>
      <h3 className="stats-section-title">各游戏最佳</h3>
      <div className="stats-best-list" id="statsBestList">{state.best.length ? GAMES.filter(g => state.best.some(p => p.game === g.id)).map(g => {
        const play = state.best.find(p => p.game === g.id);
        return <div key={g.id}>{icon(g.id)} {g.name}<small>{label(play)} · {g.id === '2048' || g.id === 'watermelon' ? '记录' : '完成'} {play.completions} 局</small><strong>{scoreLabel(play)}</strong></div>;
      }) : <p className="stats-empty">还没有完成过任何一局，去玩一把吧。</p>}</div>
      <h3 className="stats-section-title">最近 20 条成绩</h3>
      <div className="stats-recent-list" id="statsRecentList">{state.recent.length ? state.recent.map(play => <div key={play.id}>{icon(play.game)} {gameName(play.game)}<small>{label(play)} · {new Date(play.ts).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}{play.gameOver ? ' · 未通关' : ''}</small><strong>{scoreLabel(play)}</strong></div>) : <p className="stats-empty">暂无记录。</p>}</div>
    </Modal>
  </>;
}
