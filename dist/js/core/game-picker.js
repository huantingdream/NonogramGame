// Searchable game library. The header stays compact as the catalog grows.
import { escapeHtml } from './utils.js';

const RECENT_KEY = 'gejian:recentGames';
const catalog = {
  nonogram: { category: '图形逻辑', description: '沿着数字线索，还原隐藏图案', keywords: 'shuzhi nonogram' },
  sudoku: { category: '数字益智', description: '在九宫格里填出唯一的秩序', keywords: 'shudu sudoku' },
  minesweeper: { category: '经典挑战', description: '小心推理，找出每一块安全地带', keywords: 'saolei minesweeper' },
  '2048': { category: '数字益智', description: '滑动与合并，向更大的数字进发', keywords: '2048 合并' },
  slitherlink: { category: '图形逻辑', description: '顺着线索，连成一条完整的环', keywords: 'shuhui slitherlink 数环' },
  reaction: { category: '反应训练', description: '等待变色，测测你的反应有多快', keywords: 'fanying reaction 反应速度' },
  aim: { category: '反应训练', description: '瞄准小球，挑战速度与准确率', keywords: 'miaozhun aim fps 点小球' },
  hashi: { category: '图形逻辑', description: '搭起单桥与双桥，连接所有岛屿', keywords: 'shuqiao hashi hashiwokakero' }
};

export function initGamePicker({ games, onSelect }) {
  const trigger = document.querySelector('#gamePickerButton');
  const modal = document.querySelector('#gamePickerModal');
  const search = document.querySelector('#gameSearch');
  const filters = document.querySelector('#gameCategories');
  const list = document.querySelector('#gameLibrary');
  const count = document.querySelector('#gameResultCount');
  const recentRoot = document.querySelector('#recentGames');
  let activeId = null;
  let category = '全部';
  let recent = [];
  try {
    const saved = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    if (Array.isArray(saved)) recent = [...new Set(saved)].filter(id => games.some(game => game.id === id)).slice(0, 3);
  } catch (_) {}

  const metadata = game => catalog[game.id] || { category: '更多游戏', description: game.subtitle, keywords: '' };
  const categories = ['全部', ...new Set(games.map(game => metadata(game).category))];
  filters.innerHTML = categories.map(label => `<button type="button" data-category="${escapeHtml(label)}" aria-pressed="${label === category}">${escapeHtml(label)}</button>`).join('');

  function render() {
    const query = search.value.trim().toLocaleLowerCase();
    const matches = games.filter(game => {
      const info = metadata(game);
      return (category === '全部' || info.category === category) &&
        `${game.name} ${game.subtitle} ${info.keywords}`.toLocaleLowerCase().includes(query);
    });
    count.textContent = query ? `找到 ${matches.length} 款游戏` : `${category} · ${matches.length} 款游戏`;
    list.innerHTML = matches.map(game => {
      const info = metadata(game);
      const active = game.id === activeId;
      return `<button type="button" class="game-card" data-game="${escapeHtml(game.id)}" ${active ? 'aria-current="true"' : ''}>
        <span class="game-card-icon" aria-hidden="true">${escapeHtml(game.icon || '▦')}</span>
        <span class="game-card-copy"><strong>${escapeHtml(game.name)}</strong><small>${escapeHtml(info.description)}</small></span>
        <span class="game-card-tag">${active ? '当前' : escapeHtml(info.category)}</span>
      </button>`;
    }).join('');
    document.querySelector('#gameSearchEmpty').hidden = matches.length > 0;
    recentRoot.hidden = Boolean(query) || category !== '全部' || !recent.length;
    recentRoot.querySelector('.recent-game-list').innerHTML = recent.map(id => {
      const game = games.find(item => item.id === id);
      return `<button type="button" data-game="${escapeHtml(id)}" ${id === activeId ? 'aria-current="true"' : ''}>${escapeHtml(game.name)}</button>`;
    }).join('');
  }

  trigger.addEventListener('click', () => {
    search.value = '';
    category = '全部';
    filters.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', button.dataset.category === category));
    render();
    modal.showModal();
    trigger.setAttribute('aria-expanded', 'true');
    search.focus();
    list.scrollTop = 0;
  });
  modal.addEventListener('close', () => trigger.setAttribute('aria-expanded', 'false'));
  modal.querySelector('[data-close-picker]').addEventListener('click', () => modal.close());
  modal.addEventListener('click', event => {
    if (event.target === modal) {
      const rect = modal.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) modal.close();
    }
    const button = event.target.closest('[data-game]');
    if (button) {
      modal.close();
      onSelect(button.dataset.game);
    }
  });
  filters.addEventListener('click', event => {
    const button = event.target.closest('[data-category]');
    if (!button) return;
    category = button.dataset.category;
    filters.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', item === button));
    render();
  });
  search.addEventListener('input', render);
  search.addEventListener('keydown', event => {
    if (event.isComposing) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      list.querySelector('button')?.focus();
    } else if (event.key === 'Enter' && list.childElementCount === 1) {
      event.preventDefault();
      list.querySelector('button').click();
    }
  });

  return {
    setActive(game) {
      activeId = game.id;
      trigger.querySelector('.current-game-name').textContent = game.name;
      trigger.querySelector('.game-icon').textContent = game.icon || '▦';
      trigger.setAttribute('aria-label', `当前游戏：${game.name}，切换游戏`);
      recent = [game.id, ...recent.filter(id => id !== game.id)].slice(0, 3);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch (_) {}
    }
  };
}
