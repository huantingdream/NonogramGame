import { memo } from 'react';
// Games own only these stable container contents. React owns their lifetime and the application shell.
export const GameBoard = memo(function GameBoard() {
  return <section className="game-layout" aria-label="游戏区">
    <aside className="control-panel" id="controlPanel"/>
    <section className="board-card"><div className="board-header"><div><span className="puzzle-number" id="puzzleNumber">PUZZLE #0000</span><h2 id="boardTitle">准备中…</h2></div><div className="status-cluster" aria-label="游戏状态"><div><span>用时</span><strong id="timer">00:00</strong></div><div><span>状态</span><strong className="game-status" id="gameStatus" data-tone="idle">未提交</strong></div></div></div>
      <div className="board-stage"><div className="board-scroll"><div id="gameRoot"/></div></div>
      <div className="board-toolbar" id="boardToolbar"/><p className="desktop-tip" id="desktopTip"/>
      <button type="button" className="secondary-button result-button" id="reviewScoreButton" hidden>查看 / 上传本局成绩</button>
    </section>
  </section>;
});
