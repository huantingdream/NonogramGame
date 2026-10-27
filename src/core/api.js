// Same-origin HTTP API. Session cookies are HttpOnly; credentials never enter localStorage.
let currentUser = null;
const listeners = new Set();
function notify(user) { currentUser = user; listeners.forEach(fn => fn(user)); }
export async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      credentials: 'same-origin', ...options,
      headers: { 'Content-Type': 'application/json', 'X-Gejian-Request': '1', ...options.headers }
    });
  } catch { throw Object.assign(new Error('网络连接失败，请稍后重试'), { code: 'auth/network-request-failed' }); }
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401) notify(null);
    throw Object.assign(new Error(data.message || '请求失败'), { code: data.code, status: response.status });
  }
  return data;
}
const api = {
  async register(values) { const data = await request('/auth/register', { method: 'POST', body: JSON.stringify(values) }); notify(data.user); return data.user; },
  async login(values) { const data = await request('/auth/login', { method: 'POST', body: JSON.stringify(values) }); notify(data.user); return data.user; },
  async logout() { await request('/auth/logout', { method: 'POST', body: '{}' }); notify(null); },
  savePlays: (accountId, plays) => request('/me/plays', { method: 'POST', body: JSON.stringify({accountId, plays}) }),
  loadStats: () => request('/me/stats'),
  submitScore: score => request('/scores', { method: 'POST', body: JSON.stringify(score) }),
  loadLeaderboard: filter => request(`/leaderboard?${new URLSearchParams(filter)}`).then(data => data.scores)
};
export async function initApi() { const { user } = await request('/auth/me'); notify(user); return api; }
export function getApi() { return api; }
export function getCurrentUser() { return currentUser; }
export function onAuthChange(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export function displayNameForUser(user) { return user?.displayName || (user ? `玩家${user.uid.slice(0, 6)}` : ''); }
