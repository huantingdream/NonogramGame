// 主题切换：手动选择优先，未手动选择时跟随系统；选择持久化在 localStorage。
// 首屏主题由 index.html 内联脚本先行设置，这里负责切换按钮与后续变更。

const THEME_KEY = "gejian:theme";
const THEME_COLORS = { light: "#2547e4", dark: "#0e1326" };

function readSaved() {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === "dark" || value === "light" ? value : null;
  } catch (_) {
    return null;
  }
}

export function currentTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function initTheme() {
  const button = document.querySelector("#themeButton");
  const system = window.matchMedia("(prefers-color-scheme: dark)");
  if (!button) return;

  function apply(theme) {
    document.documentElement.dataset.theme = theme;
    // 手动主题也要覆盖浏览器工具栏颜色：换成单一的 theme-color
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.remove());
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.content = THEME_COLORS[theme];
    document.head.appendChild(meta);
    const dark = theme === "dark";
    const icon = button.querySelector(".icon");
    if (icon) {
      icon.classList.toggle("icon-sun", dark);
      icon.classList.toggle("icon-moon", !dark);
    }
    button.setAttribute("aria-label", dark ? "切换到浅色模式" : "切换到深色模式");
    button.setAttribute("aria-pressed", String(dark));
  }

  apply(readSaved() || (system.matches ? "dark" : "light"));

  system.addEventListener("change", (event) => {
    if (!readSaved()) apply(event.matches ? "dark" : "light");
  });

  button.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    try { localStorage.setItem(THEME_KEY, next); } catch (_) {}
    apply(next);
  });
}
