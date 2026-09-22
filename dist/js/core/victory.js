// 胜利弹窗与成绩上传（所有游戏共享）。

import { showToast } from "./utils.js";
import { getFirebase, getCurrentUser, onAuthChange, displayNameForUser } from "./firebase.js";
import { openAuthModal } from "./account.js";

let pendingScore = null; // { game, size, difficulty, elapsedSeconds, puzzleId, puzzleSeed }
let scoreSubmitted = false;
let scoreSubmitting = false;
let onNextGame = null;
let victoryTimeout = null;

function els() {
  return {
    modal: document.querySelector("#victoryModal"),
    summary: document.querySelector("#victorySummary"),
    scoreMessage: document.querySelector("#victoryScoreMessage"),
    scoreActionButton: document.querySelector("#scoreActionButton"),
    nextPuzzleButton: document.querySelector("#nextPuzzleButton")
  };
}

function updateScoreUi() {
  const dom = els();
  if (scoreSubmitted) {
    dom.scoreMessage.textContent = "这次成绩已经进入排行榜。";
    dom.scoreActionButton.textContent = "已上传";
    dom.scoreActionButton.disabled = true;
    return;
  }
  dom.scoreActionButton.disabled = scoreSubmitting;
  if (scoreSubmitting) {
    dom.scoreMessage.textContent = "正在上传成绩…";
    dom.scoreActionButton.textContent = "上传中";
  } else if (getCurrentUser()) {
    dom.scoreMessage.textContent = `以“${displayNameForUser(getCurrentUser())}”提交这次成绩。`;
    dom.scoreActionButton.textContent = "上传成绩";
  } else {
    dom.scoreMessage.textContent = "登录后可以把成绩放进排行榜。";
    dom.scoreActionButton.textContent = "登录并上传成绩";
  }
}

async function submitScore() {
  if (!pendingScore || scoreSubmitted || scoreSubmitting) return;
  if (!getCurrentUser()) {
    els().modal.close();
    openAuthModal(() => {
      if (pendingScore && !scoreSubmitted) els().modal.showModal();
    });
    return;
  }
  scoreSubmitting = true;
  updateScoreUi();
  try {
    const result = await getFirebase().submitScore(pendingScore);
    scoreSubmitted = true;
    els().scoreMessage.textContent = result.duplicate ? "这道题的成绩已经提交过了。" : "成绩已进入排行榜。";
    showToast(result.duplicate ? "这道题已经提交过成绩" : "成绩上传成功");
  } catch (error) {
    els().scoreMessage.textContent = error?.code === "permission-denied"
      ? "暂时无法提交，请重新登录后再试。"
      : "上传失败，请检查网络后重试。";
  } finally {
    scoreSubmitting = false;
    updateScoreUi();
  }
}

export function hasPendingScore() {
  return Boolean(pendingScore) && !scoreSubmitted;
}

export function reopenVictoryIfPending() {
  if (hasPendingScore()) els().modal.showModal();
}

// Cancel delayed presentation when restarting or switching games.
export function closeVictory() {
  window.clearTimeout(victoryTimeout);
  victoryTimeout = null;
  pendingScore = null;
  if (els().modal.open) els().modal.close();
}

// score: { game, size, difficulty, elapsedSeconds, puzzleId, puzzleSeed }
export function showVictory({ summary, score }) {
  const dom = els();
  pendingScore = score;
  scoreSubmitted = false;
  scoreSubmitting = false;
  dom.summary.textContent = summary;
  updateScoreUi();
  window.clearTimeout(victoryTimeout);
  victoryTimeout = window.setTimeout(() => dom.modal.showModal(), 260);
}

export function initVictory({ onNext }) {
  const dom = els();
  onNextGame = onNext;
  dom.scoreActionButton.addEventListener("click", submitScore);
  dom.nextPuzzleButton.addEventListener("click", () => {
    dom.modal.close();
    pendingScore = null;
    if (typeof onNextGame === "function") onNextGame();
  });
  dom.modal.addEventListener("click", (event) => {
    if (event.target === dom.modal) dom.modal.close();
  });
  onAuthChange(() => {
    if (dom.modal.open) updateScoreUi();
  });
}
