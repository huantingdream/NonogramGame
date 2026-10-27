import { useGameRuntime } from './hooks/useGameRuntime.js';
import { GameBoard } from './components/GameBoard.jsx';
import { GameDialogs } from './components/GameDialogs.jsx';
import { GamePicker } from './components/GamePicker.jsx';
import { Account, AccountButton } from './components/Account.jsx';
import { Leaderboard } from './components/Leaderboard.jsx';
export default function App() {
  const { game, selectGame, getActiveGame } = useGameRuntime();
  return <>
    <main className="app-shell"><header className="topbar">
      <a className="brand" href="#nonogram" aria-label="格间小游戏首页"><span className="brand-mark" aria-hidden="true"><img src="/assets/icons/logo.svg" alt="" width="38" height="38"/></span><span><strong>格间</strong><small id="brandSubtitle">{game.subtitle}</small></span></a>
      <GamePicker game={game} selectGame={selectGame}/>
      <div className="topbar-actions">
        <button className="topbar-button" id="dailyButton"><span className="icon icon-daily" aria-hidden="true"/> 每日挑战</button>
        <button className="topbar-button" id="statsButton"><span className="icon icon-stats" aria-hidden="true"/> 战绩</button>
        <Leaderboard getActiveGame={getActiveGame}/><AccountButton/>
        <button className="topbar-button icon-only" id="backgroundMotionButton" aria-label="关闭背景动效" aria-pressed="true"><span className="motion-toggle-icon" aria-hidden="true"/></button>
        <button className="topbar-button icon-only" id="soundButton" aria-label="关闭音效" aria-pressed="true"><span className="icon icon-sound" aria-hidden="true"/></button>
        <button className="topbar-button icon-only" id="themeButton" aria-label="切换到深色模式" aria-pressed="false"><span className="icon icon-moon" aria-hidden="true"/></button>
        <button className="how-to-button" id="howToButton" aria-expanded="false"><span className="icon icon-help" aria-hidden="true"/> 怎么玩</button>
      </div>
    </header><GameBoard/></main>
    <GameDialogs/><Account/>
  </>;
}
