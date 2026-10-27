import { memo } from 'react';
export const GameDialogs = memo(function GameDialogs() { return <>
    <dialog className="modal" id="howToModal">
      <button className="modal-close" type="button" data-close-modal aria-label="关闭">×</button>
      <span className="modal-kicker">HOW TO PLAY</span>
      <h2 id="howToTitle">怎么玩</h2>
      <div id="howToContent"></div>
      <p className="guide-link-line"><a id="guideLink" href="./guide/" target="_blank" rel="noopener">查看图文攻略与解题技巧 →</a></p>
      <button className="primary-button" type="button" data-close-modal>开始游戏</button>
    </dialog>
    <dialog className="modal victory-modal" id="victoryModal">
      <button className="modal-close" type="button" data-close-result aria-label="关闭成绩">×</button>
      <div className="victory-badge" aria-hidden="true">✓</div>
      <span className="modal-kicker">PUZZLE COMPLETE</span>
      <h2 id="victoryTitle">挑战成功！</h2>
      <p id="victorySummary">你用 00:00 完成了这道题。</p>
      <div className="victory-score-card">
        <p id="victoryScoreMessage">登录后可以把成绩放进排行榜。</p>
        <button className="secondary-button" id="scoreActionButton" type="button">登录并上传成绩</button>
        <p className="network-hint">成绩保存在本站，可随时登录查看排行榜。</p>
      </div>
      <div className="share-row">
        <button className="secondary-button" id="shareImageButton" type="button">🖼 保存分享图</button>
        <button className="secondary-button" id="shareTextButton" type="button">📋 复制战绩文案</button>
      </div>
      <button className="primary-button" id="nextPuzzleButton" type="button">再来一题</button>
    </dialog>
    <dialog className="modal daily-modal" id="dailyModal" aria-labelledby="dailyTitle">
      <button className="modal-close" type="button" data-close-daily aria-label="关闭">×</button>
      <span className="modal-kicker">DAILY CHALLENGE</span>
      <h2 id="dailyTitle">每日挑战</h2>
      <p className="daily-date" id="dailyDate"></p>
      <div className="daily-streak-card">
        <div><span>连续打卡</span><strong id="dailyStreak">0 天</strong></div>
        <div><span>今日完成</span><strong id="dailyProgress">0 / 0</strong></div>
      </div>
      <p className="daily-tip">所有玩家今天的题目完全相同，比比谁更快。每天完成任意一款即可延续打卡。</p>
      <div className="daily-list" id="dailyList"></div>
    </dialog>
<div className="toast" id="toast" role="status" aria-live="polite"></div>
</>; });
