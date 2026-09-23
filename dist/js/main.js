// 外壳主控：游戏切换、计时与状态显示、共享弹窗接线。

import { createTimer } from "./core/timer.js";
import { formatElapsed, showToast } from "./core/utils.js";
import { initFirebase } from "./core/firebase.js";
import { initAccount } from "./core/account.js";
import { initVictory, showVictory, closeVictory } from "./core/victory.js";
import { initLeaderboard } from "./core/leaderboard.js";
import { animate, enterBoard, cancelMotion } from "./core/motion.js";
import { initGamePicker } from "./core/game-picker.js";

import nonogram from "./games/nonogram.js";
import sudoku from "./games/sudoku.js";
import minesweeper from "./games/minesweeper.js";

import twenty48 from "./games/twenty48.js";
import { slitherlink, hashi } from "./games/line-puzzles.js";

import { reaction, aim } from "./games/training.js";

const GAMES = [nonogram, sudoku, minesweeper, twenty48, slitherlink, hashi, reaction, aim];
const STORAGE_KEY = "gejian:lastGame";

const statusLabels = {
  idle: "未提交",
  generating: "生成中",
  active: "进行中",
  incorrect: "再检查",
  correct: "正确"
};

let currentGame = null;
let currentGameId = null;
let gamePicker;

// ---------------------------------------------------------------------------
// 计时与状态
// ---------------------------------------------------------------------------

const timerOutput = document.querySelector("#timer");
const timer = createTimer((seconds) => {
  timerOutput.textContent = formatElapsed(seconds);
});

const gameStatus = document.querySelector("#gameStatus");
function setStatus(tone, customLabel = null) {
  gameStatus.textContent = customLabel || statusLabels[tone] || tone;
  gameStatus.dataset.tone = tone;
  if (tone === 'incorrect') animate(document.querySelector('#gameRoot'), [
    { translate: '0 0' }, { translate: '-4px 0' }, { translate: '4px 0' }, { translate: '0 0' }
  ], { duration: 240 });
}

// ---------------------------------------------------------------------------
// 游戏切换
// ---------------------------------------------------------------------------

function buildGameContext(game) {
  return {
    els: {
      controlPanel: document.querySelector("#controlPanel"),
      gameRoot: document.querySelector("#gameRoot"),
      boardToolbar: document.querySelector("#boardToolbar"),
      desktopTip: document.querySelector("#desktopTip")
    },
    timer,
    timerText: () => formatElapsed(timer.elapsed()),
    setStatus,
    setTitle(text) {
      document.querySelector("#boardTitle").textContent = text;
    },
    setPuzzleNumber(id) {
      document.querySelector("#puzzleNumber").textContent = `PUZZLE #${String(id).padStart(4, "0")}`;
    },
    toast: showToast,
    closeVictory,
    reportWin({ summary, score }) {
      setStatus("correct");
      animate(document.querySelector('.board-card'), [
        { boxShadow: '0 0 0 0 rgba(23,70,209,0)' },
        { boxShadow: '0 0 0 5px rgba(23,70,209,.2)', offset: .4 },
        { boxShadow: '0 0 0 0 rgba(23,70,209,0)' }
      ], { duration: 500 });
      showVictory({ summary, score: { ...score, game: game.id } });
    }
  };
}

function mountGame(gameId) {
  const game = GAMES.find((item) => item.id === gameId) || GAMES[0];
  if (currentGameId === game.id) return;

  closeVictory();
  cancelMotion(document.querySelector(".game-layout"));
  if (currentGame) currentGame.unmount();
  timer.reset();
  setStatus("idle");

  currentGame = game;
  currentGameId = game.id;

  gamePicker.setActive(game);
  document.querySelector("#brandSubtitle").textContent = game.subtitle;
  document.title = `格间 · ${game.name}`;
  document.querySelector("#howToTitle").textContent = game.howToTitle;
  document.querySelector("#howToContent").innerHTML = game.howTo;

  try {
    localStorage.setItem(STORAGE_KEY, game.id);
    history.replaceState(null, "", `#${game.id}`);
  } catch (_) {}

  game.mount(buildGameContext(game));
  enterBoard(document.querySelector("#controlPanel"));
  enterBoard(document.querySelector("#boardToolbar"));
}

// ---------------------------------------------------------------------------
// 启动
// ---------------------------------------------------------------------------

function initHowToModal() {
  const modal = document.querySelector("#howToModal");
  document.querySelector("#howToButton").addEventListener("click", () => modal.showModal());
  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => modal.close());
  });
  modal.addEventListener("click", (event) => {
    if (event.target === modal) modal.close();
  });
}

gamePicker = initGamePicker({ games: GAMES, onSelect: mountGame });
initHowToModal();
initAccount();
initVictory({
  onNext: () => currentGame?.newGame()
});
initLeaderboard({
  games: GAMES,
  getActiveGame: () => currentGame
});

let initialGame = GAMES[0].id;
try {
  const fromHash = window.location.hash.replace("#", "");
  const saved = localStorage.getItem(STORAGE_KEY);
  if (GAMES.some((game) => game.id === fromHash)) initialGame = fromHash;
  else if (saved && GAMES.some((game) => game.id === saved)) initialGame = saved;
} catch (_) {}
mountGame(initialGame);

// Firebase 异步连接；失败时游戏照常可玩，仅登录与排行榜停用。
initFirebase().then((firebase) => {
  if (!firebase) showToast("登录与排行榜服务暂时不可用，游戏可正常进行");
});
