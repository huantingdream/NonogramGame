import { createStatsStore } from './stats-store.js';
import { getApi, getCurrentUser, onAuthChange } from './api.js';
export const statsStore = createStatsStore({
  storage: {getItem: key => localStorage.getItem(key), setItem: (key,value) => localStorage.setItem(key,value)},
  getUser: getCurrentUser, api: getApi(),
  withImportLock: fn => navigator.locks ? navigator.locks.request('gejian-stats-import', fn) : fn()
});
export const recordPlay = statsStore.recordPlay;
export function initStats() {
  const unsubscribe = onAuthChange(() => void statsStore.refresh());
  const retry = () => { if (!document.hidden) void statsStore.refresh(); };
  window.addEventListener('online', retry);
  window.addEventListener('storage', retry);
  document.addEventListener('visibilitychange', retry);
  const interval = setInterval(() => { if (statsStore.getSnapshot().pending) retry(); },30000);
  void statsStore.refresh();
  return () => { unsubscribe(); clearInterval(interval); window.removeEventListener('online',retry); window.removeEventListener('storage',retry); document.removeEventListener('visibilitychange',retry); };
}
