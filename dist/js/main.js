// 外壳主控：游戏切换、计时与状态显示、共享弹窗接线。

import { createTimer } from "./core/timer.js";
import { formatElapsed, showToast } from "./core/utils.js";
import { initFirebase } from "./core/firebase.js";
import { initAccount } from "./core/account.js";
import { initVictory, showVictory, closeVictory } from "./core/victory.js";
import { initLeaderboard } from "./core/leaderboard.js";
import { animate, enterBoard, cancelMotion } from "./core/motion.js";
import { initGamePicker } from "./core/game-picker.js";
import { initTheme } from "./core/theme.js";
import { initSound, playSound } from "./core/sound.js";
import { initStats, recordPlay } from "./core/stats.js";
import { initDaily, recordIfDaily } from "./core/daily.js";

import nonogram from "./games/nonogram.js";
import sudoku from "./games/sudoku.js";
import minesweeper from "./games/minesweeper.js";

import twenty48 from "./games/twenty48.js";
import { slitherlink, hashi } from "./games/line-puzzles.js";
import netwalk from "./games/netwalk.js";
import akari from "./games/akari.js";
import nurikabe from "./games/nurikabe.js";
import kenken from "./games/kenken.js";

import { reaction, aim } from "./games/training.js";
import watermelon from "./games/watermelon.js";

const GAMES = [nonogram, sudoku, kenken, minesweeper, twenty48, slitherlink, hashi, nurikabe, akari, netwalk, watermelon, reaction, aim];
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
let mountSeq = 0;

// ---------------------------------------------------------------------------
// 计时与状态
// ---------------------------------------------------------------------------

const timerOutput = document.querySelector("#timer");
const timer = createTimer((seconds) => {
  const text = formatElapsed(seconds);
  if (timerOutput.textContent === text) return;
  timerOutput.textContent = text;
  // 数字变化时轻轻上浮浮现，跳秒不那么生硬
  animate(timerOutput, [{ translate: '0 3px', opacity: .3 }, { translate: '0 0', opacity: 1 }], { duration: 200 });
});

const gameStatus = document.querySelector("#gameStatus");
function setStatus(tone, customLabel = null) {
  const label = customLabel || statusLabels[tone] || tone;
  if (gameStatus.textContent !== label) {
    gameStatus.textContent = label;
    animate(gameStatus, [{ translate: '0 7px', opacity: 0 }, { translate: '0 0', opacity: 1 }], { duration: 220 });
  }
  gameStatus.dataset.tone = tone;
  if (tone === 'incorrect') { animate(document.querySelector('#gameRoot'), [
    { translate: '0 0' }, { translate: '-4px 0' }, { translate: '4px 0' }, { translate: '0 0' }
  ], { duration: 240 }); playSound('error'); }
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
    reportWin({ summary, score, gameOver = false }) {
      setStatus(gameOver ? "incorrect" : "correct", gameOver ? "本局结束" : null);
      if (!gameOver) animate(document.querySelector('.board-card'), [
        { boxShadow: '0 0 0 0 rgba(23,70,209,0)' },
        { boxShadow: '0 0 0 5px rgba(23,70,209,.2)', offset: .4 },
        { boxShadow: '0 0 0 0 rgba(23,70,209,0)' }
      ], { duration: 500 });
      const finalScore = { ...score, game: game.id };
      recordPlay(finalScore, gameOver);
      recordIfDaily(finalScore, gameOver);
      showVictory({ summary, score: finalScore, gameOver });
    }
  };
}

async function mountGame(gameId) {
  const game = GAMES.find((item) => item.id === gameId) || GAMES[0];
  if (currentGameId === game.id) return;
  const seq = ++mountSeq;

  // 旧棋盘先淡出下沉，再挂载新游戏；减少动态时 animate 返回 null，直接继续
  if (currentGame) {
    const leaving = animate(document.querySelector("#gameRoot"), [
      { opacity: 1, translate: '0 0' },
      { opacity: 0, translate: '0 14px' }
    ], { duration: 150, fill: 'forwards' });
    if (leaving) {
      // 兜底 400ms：动画若因后台节流等原因永远不完结，也不能让挂载卡死
      await Promise.race([
        leaving.finished,
        new Promise((resolve) => setTimeout(resolve, 400))
      ]).catch(() => {});
      leaving.cancel(); // 动画已结束或被兜底：主动取消，清掉 forwards 填充，否则新棋盘会停在透明状态
    }
    if (seq !== mountSeq) return; // 等待期间又切了别的游戏，放弃这次挂载
  }

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
  document.querySelector("#guideLink").href = `./guide/${game.id}.html`;

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
initTheme();
initSound();
initAccount();
initVictory({
  onNext: () => currentGame?.newGame(),
  games: GAMES
});
initStats({ games: GAMES });
initDaily({ games: GAMES, onSelect: mountGame });
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

// 首屏：顶栏与棋盘卡片依次浮入，第一印象更精致（用 scale 而非位移，避免瞬时撑出页面滚动条）
animate(document.querySelector(".topbar"), [
  { opacity: 0, scale: .985 },
  { opacity: 1, scale: 1 }
], { duration: 380, fill: 'backwards' });
animate(document.querySelector(".board-card"), [
  { opacity: 0, scale: .985 },
  { opacity: 1, scale: 1 }
], { duration: 420, delay: 110, fill: 'backwards' });

// Firebase 异步连接；失败时游戏照常可玩，仅登录与排行榜停用。
initFirebase().then((firebase) => {
  if (!firebase) showToast("登录与排行榜服务暂时不可用，游戏可正常进行");
});
