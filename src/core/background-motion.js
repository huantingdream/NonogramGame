// 背景动效偏好：用户选择持久化；尚未选择时，反应测试默认静止以减少干扰。

const STORAGE_KEY = 'gejian:background-motion';
let currentGameId = null;
let button = null;
let paused = false;

function readSaved() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'on' || value === 'off' ? value : null;
  } catch (_) {
    return null;
  }
}

function motionEnabled() {
  const saved = readSaved();
  if (saved) return saved === 'on';
  return currentGameId !== 'reaction';
}

function apply() {
  const enabled = !paused && motionEnabled();
  document.documentElement.dataset.backgroundMotion = enabled ? 'on' : 'off';
  if (!button) return;
  button.setAttribute('aria-pressed', String(enabled));
  button.disabled = paused;
  button.title = paused ? '测试进行中，背景动效暂时暂停' : enabled ? '关闭背景动效' : '开启背景动效';
  button.setAttribute('aria-label', button.title);
}

// Temporarily suspend rendering without overwriting the user's saved preference.
export function pauseBackgroundMotion(value) {
  paused = value;
  apply();
}

export function setBackgroundMotionContext(gameId) {
  currentGameId = gameId;
  apply();
}

export function initBackgroundMotion() {
  button = document.querySelector('#backgroundMotionButton');
  if (!button) return;
  button.addEventListener('click', () => {
    if (paused) return;
    const next = motionEnabled() ? 'off' : 'on';
    try { localStorage.setItem(STORAGE_KEY, next); } catch (_) {}
    apply();
  });
  apply();
}
