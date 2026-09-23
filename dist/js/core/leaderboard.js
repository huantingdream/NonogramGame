import { scoreHeading, scoreLabel, scoreDetail } from './score.js';
// 排行榜弹窗（所有游戏共享，按 游戏 + 规格 + 难度 筛选）。

import { escapeHtml, showToast } from "./utils.js";
import { getFirebase, getCurrentUser, onAuthChange } from "./firebase.js";
import { openAuthModal } from "./account.js";

let games = [];
let getActiveGame = null;
let requestVersion = 0;

function els() {
  return {
    modal: document.querySelector("#leaderboardModal"),
    gameSelect: document.querySelector("#leaderboardGame"),
    sizeSelect: document.querySelector("#leaderboardSize"),
    difficultySelect: document.querySelector("#leaderboardDifficulty"),
    list: document.querySelector("#leaderboardList"),
    state: document.querySelector("#leaderboardState"),
    loginButton: document.querySelector("#leaderboardLoginButton")
  };
}

function findGame(id) {
  return games.find((game) => game.id === id) || games[0];
}

function fillFilterOptions(gameId, preferred = {}) {
  const dom = els();
  const game = findGame(gameId);

  dom.sizeSelect.innerHTML = game.sizes
    .map((option) => `<option value="${option.value}">${option.label}</option>`)
    .join("");
  dom.difficultySelect.innerHTML = game.difficulties
    .map((option) => `<option value="${option.value}">${option.label}</option>`)
    .join("");

  const sizeValues = game.sizes.map((option) => String(option.value));
  const difficultyValues = game.difficulties.map((option) => option.value);
  dom.sizeSelect.value = sizeValues.includes(String(preferred.size)) ? String(preferred.size) : sizeValues[0];
  dom.difficultySelect.value = difficultyValues.includes(preferred.difficulty) ? preferred.difficulty : difficultyValues[0];
}

async function loadLeaderboard() {
  const dom = els();
  const firebase = getFirebase();
  const version = ++requestVersion;
  document.querySelector("#leaderboardTitle").textContent = scoreHeading(dom.gameSelect.value);
  dom.list.innerHTML = "";
  dom.loginButton.hidden = Boolean(getCurrentUser());

  if (!firebase) {
    dom.state.textContent = "排行榜服务暂时不可用，游戏仍可正常进行。";
    return;
  }
  if (!getCurrentUser()) {
    dom.state.textContent = "登录后查看排行榜。";
    return;
  }

  dom.state.textContent = "正在加载…";
  try {
    const scores = await firebase.loadLeaderboard({
      game: dom.gameSelect.value,
      size: Number(dom.sizeSelect.value),
      difficulty: dom.difficultySelect.value
    });
    if (version !== requestVersion) return;
    if (!scores.length) {
      dom.state.textContent = "这个榜单还没有成绩，来拿第一名吧。";
      return;
    }
    dom.state.textContent = `前 ${scores.length} 名`;
    dom.list.innerHTML = scores.map((score, index) => `
      <li>
        <span class="rank">${index + 1}</span>
        <strong>${escapeHtml(score.nickname)}</strong>
        <small>${escapeHtml(scoreDetail(score))}</small>
        <strong class="rank-value">${escapeHtml(scoreLabel(score))}</strong>
      </li>
    `).join("");
  } catch (error) {
    if (version !== requestVersion) return;
    dom.state.textContent = error?.code === "permission-denied"
      ? "登录状态已过期，请重新登录。"
      : error?.code === "failed-precondition"
        ? "排行榜索引正在准备，请稍后再试。"
        : "排行榜暂时加载失败，请稍后重试。";
  }
}

export function openLeaderboard() {
  const dom = els();
  const active = typeof getActiveGame === "function" ? getActiveGame() : null;
  const gameId = active ? active.id : games[0].id;
  dom.gameSelect.value = gameId;
  fillFilterOptions(gameId, active && typeof active.getScoreFilter === "function" ? active.getScoreFilter() : {});
  dom.modal.showModal();
  loadLeaderboard();
}

export function initLeaderboard({ games: registeredGames, getActiveGame: activeGetter }) {
  games = registeredGames;
  getActiveGame = activeGetter;
  const dom = els();

  dom.gameSelect.innerHTML = games
    .map((game) => `<option value="${game.id}">${game.name}</option>`)
    .join("");

  document.querySelector("#leaderboardButton").addEventListener("click", openLeaderboard);
  dom.gameSelect.addEventListener("change", () => {
    fillFilterOptions(dom.gameSelect.value);
    loadLeaderboard();
  });
  dom.sizeSelect.addEventListener("change", loadLeaderboard);
  dom.difficultySelect.addEventListener("change", loadLeaderboard);
  dom.loginButton.addEventListener("click", () => {
    dom.modal.close();
    if (!openAuthModal(() => dom.modal.showModal())) {
      showToast("登录服务正在连接，请稍后再试");
    }
  });
  document.querySelectorAll("[data-close-leaderboard]").forEach((button) => {
    button.addEventListener("click", () => dom.modal.close());
  });
  dom.modal.addEventListener("click", (event) => {
    if (event.target === dom.modal) dom.modal.close();
  });

  onAuthChange(() => {
    if (dom.modal.open) loadLeaderboard();
  });

  fillFilterOptions(dom.gameSelect.value || games[0].id);
}
