import { playSchema } from '../../shared/validation.js';
import { emptyStats, summarizePlays } from '../../shared/stats.js';
const GUEST_KEY = 'gejian:stats';
const queueKey = uid => `gejian:stats:pending:${uid}`;
// Storage and transport are injected so account-switch/offline races can be tested deterministically.
export function createStatsStore({storage, getUser, api, uuid = () => crypto.randomUUID(), now = () => Date.now(), withImportLock = fn => fn()}) {
  const listeners = new Set(), fallback = new Map(), flights = new Map();
  let revision = 0;
  let state = {accountId: null, ...emptyStats(), loading: false, syncing: false, pending: 0, guestCount: 0, invalidGuestCount: 0, error: '', storageError: false};
  const emit = patch => { state = {...state,...patch}; listeners.forEach(fn => fn()); };
  function read(key) {
    if (fallback.has(key)) return fallback.get(key);
    try { const data = JSON.parse(storage.getItem(key) || '{"plays":[]}'); return data && typeof data === 'object' ? data : {plays: []}; } catch { return {plays: []}; }
  }
  function write(key, value) {
    try { storage.setItem(key,JSON.stringify(value)); fallback.delete(key); return true; }
    catch { fallback.set(key,value); emit({storageError: true}); return false; }
  }
  function normalize(play) {
    return {id: play.id || uuid(), game: play.game, size: play.size, difficulty: play.difficulty,
      elapsedSeconds: play.elapsedSeconds ?? 0, gameOver: Boolean(play.gameOver), ts: play.ts,
      averageMs: play.averageMs ?? null, hits: play.hits ?? null, shots: play.shots ?? null, points: play.points ?? null};
  }
  function guest() {
    const data = read(GUEST_KEY), original = Array.isArray(data.plays) ? data.plays : [];
    const plays = original.map(p => p && typeof p === 'object' ? {...normalize(p), ...(p.claimedBy ? {claimedBy: p.claimedBy} : {})} : p);
    if (plays.some((p,i) => p?.id !== original[i]?.id)) write(GUEST_KEY,{...data,plays});
    const valid = p => p && typeof p === 'object' && playSchema.safeParse(normalize(p)).success;
    return {raw: plays, plays: plays.filter(p => valid(p) && (!p.claimedBy || p.claimedBy === getUser()?.uid)).map(normalize), invalid: plays.filter(p => !valid(p))};
  }
  const pending = uid => { const value = read(queueKey(uid)).plays; return Array.isArray(value) ? value : []; };
  const current = uid => getUser()?.uid === uid && state.accountId === uid;
  function updateCounts() {
    const local = guest();
    emit({pending: state.accountId ? pending(state.accountId).length : 0, guestCount: local.plays.length, invalidGuestCount: local.invalid.length});
    if (!state.accountId) emit(summarizePlays(local.plays));
  }
  async function flush(uid) {
    if (flights.has(uid)) return flights.get(uid);
    const job = (async () => {
      if (current(uid)) emit({syncing: true});
      try {
        while (current(uid) && pending(uid).length) {
          const batch = pending(uid).slice(0,20);
          const result = await api.savePlays(uid,batch);
          if (result.accountId !== uid || !Array.isArray(result.savedIds) || !batch.every(p => result.savedIds.includes(p.id))) throw new Error('战绩同步未确认，请重试。');
          const ids = new Set(result.savedIds);
          // A response for A only acknowledges A's queue, even if the current UI is already B.
          write(queueKey(uid), {plays: pending(uid).filter(p => !ids.has(p.id))});
          if (current(uid)) updateCounts();
        }
      } finally { if (current(uid)) emit({syncing: false}); }
    })();
    flights.set(uid,job);
    try { await job; } finally { flights.delete(uid); }
  }
  async function refresh() {
    const uid = getUser()?.uid || null, token = ++revision;
    if (state.accountId !== uid) emit({accountId: uid,...emptyStats(),error: '',syncing: false});
    updateCounts();
    if (!uid) { emit({loading: false,error: ''}); return; }
    emit({loading: true,error: ''});
    try {
      await flush(uid);
      if (!current(uid) || token !== revision) return;
      const result = await api.loadStats();
      if (!current(uid) || token !== revision) return;
      if (result.accountId !== uid) throw new Error('登录账号已变化，请重新登录后查看战绩。');
      emit({summary: result.summary, best: result.best, recent: result.recent});
    } catch(error) { if (current(uid) && token === revision) emit({error: error.message || '战绩同步失败，请重试。'}); }
    finally { if (current(uid) && token === revision) emit({loading: false}); }
  }
  function recordPlay(score, gameOver) {
    if (!score?.game) return;
    const play = normalize({...score,id: uuid(),ts: now(),gameOver});
    if (!playSchema.safeParse(play).success) { emit({error: '本局战绩格式异常，未能保存。'}); return; }
    const uid = getUser()?.uid;
    if (uid) write(queueKey(uid),{plays: [...pending(uid),play]});
    else { const local = guest(); write(GUEST_KEY,{plays: [...local.raw.filter(p => p?.claimedBy), ...local.raw.filter(p => !p?.claimedBy).concat(play).slice(-300)]}); }
    void refresh();
  }
  async function importGuest() {
    await withImportLock(async () => {
      const uid = getUser()?.uid;
      if (!uid) return;
      const local = guest(), existing = pending(uid), ids = new Set(existing.map(p => p.id));
      const claimedIds = new Set(local.plays.map(p => p.id));
      // Persist the owner first: a full disk/reload between the two writes cannot offer A's imports to B.
      if (!write(GUEST_KEY,{plays: local.raw.map(p => claimedIds.has(p?.id) ? {...p,claimedBy:uid} : p)})) {
        fallback.delete(GUEST_KEY);
        emit({error: '浏览器无法保存导入归属，请释放存储空间后重试。'}); return;
      }
      if (!write(queueKey(uid),{plays: [...existing,...local.plays.filter(p => !ids.has(p.id))]})) {
        emit({error: '浏览器无法保存导入队列，记录仍归属此账号，请重试。'}); updateCounts(); return;
      }
      write(GUEST_KEY,{plays: local.raw.filter(p => !claimedIds.has(p?.id))});
      await refresh();
    });
  }

  return {getSnapshot: () => state, subscribe: fn => {listeners.add(fn);return () => listeners.delete(fn);}, recordPlay, refresh, importGuest};
}
