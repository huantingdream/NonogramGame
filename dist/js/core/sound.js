// 轻量音效：WebAudio 合成的短音，无外部资源；可全局开关，选择持久化。
// 音频上下文在首次用户手势时创建，遵守浏览器自动播放策略。

const SOUND_KEY = "gejian:sound";

let audioContext = null;
let enabled = true;
try {
  enabled = localStorage.getItem(SOUND_KEY) !== "off";
} catch (_) {}

export function soundEnabled() {
  return enabled;
}

function context() {
  if (!enabled) return null;
  try {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === "suspended") audioContext.resume();
    return audioContext;
  } catch (_) {
    return null;
  }
}

// 一个音符：频率、时长、波形与音量包络
function tone({ frequency, duration = 0.08, type = "sine", volume = 0.12, delay = 0 }) {
  const ctx = context();
  if (!ctx) return;
  const start = ctx.currentTime + delay;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

const recipes = {
  click: () => tone({ frequency: 660, duration: 0.05, type: "triangle", volume: 0.06 }),
  fill: () => tone({ frequency: 520, duration: 0.06, type: "triangle", volume: 0.08 }),
  mark: () => tone({ frequency: 330, duration: 0.05, type: "square", volume: 0.04 }),
  rotate: () => tone({ frequency: 440, duration: 0.05, type: "triangle", volume: 0.07 }),
  merge: () => { tone({ frequency: 392, duration: 0.07, type: "triangle" }); tone({ frequency: 587, duration: 0.09, type: "triangle", delay: 0.05 }); },
  error: () => tone({ frequency: 180, duration: 0.18, type: "sawtooth", volume: 0.07 }),
  win: () => [523, 659, 784, 1047].forEach((frequency, i) => tone({ frequency, duration: 0.16, type: "triangle", volume: 0.1, delay: i * 0.09 }))
};

export function playSound(name) {
  if (!enabled) return;
  const recipe = recipes[name];
  if (recipe) recipe();
}

export function initSound() {
  const button = document.querySelector("#soundButton");
  if (!button) return;

  function apply() {
    button.querySelector("span").textContent = enabled ? "🔊" : "🔇";
    button.setAttribute("aria-label", enabled ? "关闭音效" : "开启音效");
    button.setAttribute("aria-pressed", String(enabled));
  }

  button.addEventListener("click", () => {
    enabled = !enabled;
    try { localStorage.setItem(SOUND_KEY, enabled ? "on" : "off"); } catch (_) {}
    apply();
    if (enabled) playSound("click");
  });

  // 棋盘区域的普通点击给一声轻反馈（按钮、格子等可交互元素）
  document.querySelector("#gameRoot")?.addEventListener("pointerdown", (event) => {
    if (event.button === 0 && event.target.closest("button, [role='button'], canvas")) playSound("click");
  });

  apply();
}
