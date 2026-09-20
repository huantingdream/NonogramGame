// 通用小工具：随机数、格式化、DOM 辅助。

export function makeSeededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

export function randomSeed() {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

export function waitForNextFrame() {
  // rAF 在后台标签页/无头环境可能不触发，用 setTimeout 兜底保证一定会返回。
  return new Promise((resolve) => {
    const fallback = window.setTimeout(resolve, 48);
    window.requestAnimationFrame(() => {
      window.clearTimeout(fallback);
      window.setTimeout(resolve, 0);
    });
  });
}

export function formatElapsed(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function escapeHtml(value) {
  const span = document.createElement("span");
  span.textContent = String(value);
  return span.innerHTML;
}

export function selectOption(group, activeButton, attribute = "aria-checked") {
  group.querySelectorAll("button").forEach((button) => {
    button.setAttribute(attribute, button === activeButton ? "true" : "false");
  });
}

export function shuffle(array, random = Math.random) {
  for (let index = array.length - 1; index > 0; index -= 1) {
    const pick = Math.floor(random() * (index + 1));
    [array[index], array[pick]] = [array[pick], array[index]];
  }
  return array;
}

let toastTimeout = null;
export function showToast(message) {
  const toast = document.querySelector("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => toast.classList.remove("show"), 1800);
}
