import { useEffect, useRef, useState } from 'react';
import { GAMES } from '../games/registry.js';
import { catalog } from '../games/catalog.js';
import { Modal } from './Modal.jsx';
const KEY = 'gejian:recentGames';
function readRecent() { try { return JSON.parse(localStorage.getItem(KEY) || '[]').filter(id => GAMES.some(g => g.id === id)).slice(0,3); } catch { return []; } }
export function GamePicker({ game, selectGame }) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [category, setCategory] = useState('全部');
  const [recent, setRecent] = useState(readRecent);
  const search = useRef(null);
  useEffect(() => {
    setRecent(old => { const next = [game.id, ...old.filter(id => id !== game.id)].slice(0,3); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {} return next; });
  }, [game.id]);
  useEffect(() => { if (open && matchMedia('(pointer: fine)').matches) search.current?.focus(); }, [open]);
  const categories = ['全部', ...new Set(GAMES.map(g => catalog[g.id].category))];
  const matches = GAMES.filter(g => (category === '全部' || catalog[g.id].category === category) && `${g.name} ${g.subtitle} ${catalog[g.id].keywords}`.toLowerCase().includes(query.trim().toLowerCase()));
  const choose = id => { setOpen(false); selectGame(id); };
  return <>
    <button className="game-picker-button" id="gamePickerButton" type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls="gamePickerModal" onClick={() => { setQuery(''); setCategory('全部'); setOpen(true); }}>
      <span className="game-icon-tile" aria-hidden="true"><img className="game-icon" src={`/assets/icons/game-${game.id}.svg`} alt="" width="38" height="38"/></span>
      <span className="game-picker-text"><strong className="current-game-name">{game.name}</strong><span className="game-picker-label">切换游戏</span></span><span className="game-picker-chevron" aria-hidden="true">⌄</span>
    </button>
    <Modal open={open} onClose={() => setOpen(false)} id="gamePickerModal" className="game-picker-modal" aria-labelledby="gamePickerTitle">
      <button className="modal-close" data-close-picker aria-label="关闭游戏选择" onClick={() => setOpen(false)}>×</button>
      <span className="modal-kicker">GAME LIBRARY</span><h2 id="gamePickerTitle">今天，玩点什么？</h2>
      <label className="game-search" htmlFor="gameSearch"><span aria-hidden="true">⌕</span><input ref={search} id="gameSearch" type="search" placeholder="搜索游戏名称，如数桥、2048" aria-label="搜索游戏" autoComplete="off" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Enter' && matches.length === 1) { e.preventDefault(); choose(matches[0].id); }
        if (e.key === 'ArrowDown') { e.preventDefault(); document.querySelector('#gameLibrary button')?.focus(); }
      }}/></label>
      <div className="game-categories" id="gameCategories" role="group" aria-label="游戏分类">{categories.map(c => <button key={c} data-category={c} aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</button>)}</div>
      <div className="recent-games" id="recentGames" hidden={!!query || category !== '全部' || !recent.length}><span>最近玩过</span><div className="recent-game-list">{recent.map(id => <button key={id} data-game={id} aria-current={game.id === id ? 'true' : undefined} onClick={() => choose(id)}>{GAMES.find(g => g.id === id).name}</button>)}</div></div>
      <p className="game-result-count" id="gameResultCount" role="status" aria-live="polite">{query ? '找到' : category} · {matches.length} 款游戏</p>
      <div className="game-library" id="gameLibrary" aria-label="游戏列表">{matches.map(g => <button key={g.id} className="game-card" data-game={g.id} aria-current={game.id === g.id ? 'true' : undefined} onClick={() => choose(g.id)}><span className="game-card-icon" aria-hidden="true"><img src={`/assets/icons/game-${g.id}.svg`} alt="" loading="lazy"/></span><span className="game-card-copy"><strong>{g.name}</strong><small>{catalog[g.id].description}</small></span><span className="game-card-tag">{g.id === game.id ? '当前' : catalog[g.id].category}</span></button>)}</div>
      <p className="game-search-empty" id="gameSearchEmpty" hidden={matches.length > 0}>没有找到这款游戏，换个名称或分类试试。</p>
    </Modal>
  </>;
}
