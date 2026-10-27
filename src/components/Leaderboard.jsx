import { useEffect, useState } from 'react';
import { GAMES } from '../games/registry.js';
import { getApi } from '../core/api.js';
import { scoreHeading, scoreLabel, scoreDetail } from '../../shared/score.js';
import { openAuthModal } from '../core/account.js';
import { useUser } from './Account.jsx';
import { Modal } from './Modal.jsx';
export function Leaderboard({ getActiveGame }) {
  const user = useUser();
  const [open, setOpen] = useState(false), [filter, setFilter] = useState({game: GAMES[0].id, size: 5, difficulty: 'easy'});
  const [scores, setScores] = useState([]), [message, setMessage] = useState(''), [revision, setRevision] = useState(0);
  const game = GAMES.find(g => g.id === filter.game);
  function select(game, preferred = {}) {
    setFilter({game: game.id, size: game.sizes.some(s => Number(s.value) === Number(preferred.size)) ? Number(preferred.size) : Number(game.sizes[0].value), difficulty: game.difficulties.some(d => d.value === preferred.difficulty) ? preferred.difficulty : game.difficulties[0].value});
  }
  useEffect(() => {
    if (!open) return;
    let active = true; setScores([]);
    if (!user) { setMessage('登录后查看排行榜。'); return; }
    setMessage('正在加载…');
    getApi().loadLeaderboard(filter).then(rows => { if (active) { setScores(rows); setMessage(rows.length ? `前 ${rows.length} 名` : '这个榜单还没有成绩，来拿第一名吧。'); } }).catch(error => { if(active) setMessage(error.message || '排行榜加载失败，请重试。'); });
    return () => { active = false; };
  }, [open, filter, user, revision]);
  return <>
    <button className="topbar-button" id="leaderboardButton" onClick={() => { const g = getActiveGame() || GAMES[0]; select(g, g.getScoreFilter?.()); setOpen(true); }}><span className="icon icon-leaderboard" aria-hidden="true"/> 排行榜</button>
    <Modal open={open} onClose={() => setOpen(false)} id="leaderboardModal" className="leaderboard-modal">
      <button className="modal-close" data-close-leaderboard aria-label="关闭" onClick={() => setOpen(false)}>×</button><span className="modal-kicker">LEADERBOARD</span><h2 id="leaderboardTitle">{scoreHeading(filter.game)}</h2>
      <div className="leaderboard-filters">
        <label><span>游戏</span><select id="leaderboardGame" value={game.id} onChange={e => select(GAMES.find(g => g.id === e.target.value))}>{GAMES.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
        <label><span>规格</span><select id="leaderboardSize" value={filter.size} onChange={e => setFilter({...filter, size: Number(e.target.value)})}>{game.sizes.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
        <label><span>难度</span><select id="leaderboardDifficulty" value={filter.difficulty} onChange={e => setFilter({...filter, difficulty: e.target.value})}>{game.difficulties.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}</select></label>
      </div>
      <div className="leaderboard-state" id="leaderboardState" role="status" aria-live="polite">{message}</div>
      <ol className="leaderboard-list" id="leaderboardList">{scores.map((score, index) => <li key={score.id || index} className={score.uid === user?.uid ? 'is-me' : ''}><span className="rank">{index+1}</span><strong>{score.nickname}</strong><small>{scoreDetail(score)}</small><strong className="rank-value">{scoreLabel(score)}</strong></li>)}</ol>
      {!user ? <button className="secondary-button" id="leaderboardLoginButton" onClick={() => { setOpen(false); openAuthModal(() => setOpen(true)); }}>登录后查看</button> : <button className="secondary-button" onClick={() => setRevision(v => v+1)}>刷新榜单</button>}
    </Modal>
  </>;
}
