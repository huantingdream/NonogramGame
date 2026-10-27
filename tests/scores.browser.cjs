// Exercises React account/leaderboard and game result lifecycles with a mocked same-origin API. Never writes live scores.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      Math.random = () => .4;
      window.__docs = {}; window.__queries = []; window.__writes = 0;
      window.__auth = { currentUser: null }; window.__listeners = [];
    });
    await page.route('**/api/**', async route => {
      const request = route.request(), url = new URL(request.url());
      const body = request.method() === 'POST' ? request.postDataJSON() : null;
      if (url.pathname === '/api/scores' && await page.evaluate(() => window.__defer)) {
        await page.evaluate(() => new Promise(resolve => { window.__resolve = resolve; }));
      }
      const result = await page.evaluate(({pathname,query,body}) => {
        const user={uid:'tester',displayName:'Tester',email:'test@example.test'};
        if(pathname==='/api/auth/me') return {body:{user:window.__auth.currentUser}};
        if(pathname==='/api/auth/login'||pathname==='/api/auth/register') {window.__auth.currentUser=user;return {body:{user}};}
        if(pathname==='/api/auth/logout') {window.__auth.currentUser=null;return {body:{ok:true}};}
        if(pathname==='/api/me/plays') return {body:{accountId:body.accountId,savedIds:body.plays.map(p=>p.id)}};
        if(pathname==='/api/me/stats') return {body:{accountId:user.uid,summary:{total:0,wins:0,totalSeconds:0},best:[],recent:[]}};
        if(pathname==='/api/scores') {
          const id=[body.game,body.size,body.difficulty,body.puzzleSeed].join('_');
          if(window.__docs[id])return {body:{duplicate:true}};
          window.__writes++;
          if(window.__fail){window.__fail=false;return {status:503,body:{code:'unavailable',message:'上传失败'}};}
          window.__docs[id]={...body,nickname:'Tester',uid:'tester',createdAt:Date.now()};return {body:{duplicate:false}};
        }
        if(pathname==='/api/leaderboard') {
          const order=query.game==='reaction'?[['averageMs','asc'],['createdAt','asc']]:query.game==='aim'?[['hits','desc'],['shots','asc'],['createdAt','asc']]:['2048','watermelon'].includes(query.game)?[['points','desc'],['elapsedSeconds','asc'],['createdAt','asc']]:[['elapsedSeconds','asc'],['createdAt','asc']];
          window.__queries.push(order.map(args=>({kind:'order',args})));
          let rows=Object.values(window.__docs).filter(s=>s.game===query.game&&s.size===Number(query.size)&&s.difficulty===query.difficulty);
          rows.sort((a,b)=>{for(const [key,direction] of order){const diff=a[key]-b[key];if(diff)return direction==='desc'?-diff:diff;}return 0;});
          return {body:{scores:rows.slice(0,20)}};
        }
        return {body:{status:'ok'}};
      },{pathname:url.pathname,query:Object.fromEntries(url.searchParams),body});
      await route.fulfill({status:result.status||200,contentType:'application/json',body:JSON.stringify(result.body)});
    });
    await page.clock.install();
    await page.goto(`${process.env.GAME_BASE_URL || 'http://127.0.0.1:7100/'}#reaction`);
    await page.locator('.reaction-surface').waitFor();
    for (let i=0;i<5;i++) {
      await page.locator('.reaction-surface').focus(); await page.keyboard.press('Space');
      await page.clock.runFor(2930); await page.keyboard.press('Enter');
    }
    await page.clock.runFor(300);
    assert.equal(await page.locator('#victoryModal').isVisible(),true);
    assert.match(await page.locator('#victorySummary').textContent(), /平均反应 .* ms/);
    await page.locator('#scoreActionButton').click();
    await page.locator('#emailInput').fill('test@example.test');await page.locator('#passwordInput').fill('testing123');
    await page.locator('#authSubmitButton').click();await page.clock.runFor(200);
    await page.waitForFunction(()=>document.querySelector('#scoreActionButton').textContent==='已上传');
    const reactionScore=await page.evaluate(()=>Object.values(window.__docs)[0]);
    assert.equal(reactionScore.game,'reaction');assert.equal(reactionScore.size,305);assert.ok(reactionScore.averageMs>0);
    await page.locator('[data-close-result]').click();await page.locator('#reviewScoreButton').click();
    assert.equal(await page.locator('#scoreActionButton').isDisabled(),true);
    await page.locator('[data-close-result]').click();await page.locator('#leaderboardButton').click();
    await page.waitForFunction(()=>document.querySelector('#leaderboardList li'));
    assert.match(await page.locator('#leaderboardList').textContent(), /ms/);
    assert.deepEqual(await page.evaluate(()=>window.__queries.at(-1).filter(c=>c.kind==='order').map(c=>c.args)),[['averageMs','asc'],['createdAt','asc']]);
    await page.keyboard.press('Escape');
    // A duplicate result checks the existing document instead of writing again.
    await page.evaluate(async score=>{const {showVictory}=await import('./src/core/victory.js');showVictory({summary:'重复成绩测试',score});},reactionScore);
    await page.clock.runFor(300);await page.locator('#scoreActionButton').click();
    await page.waitForFunction(()=>document.querySelector('#scoreActionButton').textContent==='已上传');
    assert.equal(await page.evaluate(()=>window.__writes),1);
    await page.locator('[data-close-result]').click();
    const choose = async id => {await page.locator('#gamePickerButton').click();await page.locator(`.game-card[data-game="${id}"]`).click();};
    await choose('aim');await page.locator('#aimStart').click();await page.clock.runFor(400);
    const ball=await page.locator('.aim-target').boundingBox();await page.mouse.click(ball.x+ball.width/2,ball.y+ball.height/2);
    await page.clock.runFor(31000);await page.evaluate(()=>{window.__fail=true;});
    await page.locator('#scoreActionButton').click();
    await page.waitForFunction(()=>document.querySelector('#scoreActionButton').textContent==='重试上传');
    assert.match(await page.locator('#victoryScoreMessage').textContent(),/上传失败/);
    await page.locator('#scoreActionButton').click();await page.waitForFunction(()=>document.querySelector('#scoreActionButton').textContent==='已上传');
    const aimScore=await page.evaluate(()=>Object.values(window.__docs).find(s=>s.game==='aim'));
    assert.deepEqual([aimScore.size,aimScore.elapsedSeconds,aimScore.hits,aimScore.shots],[330,30,1,1]);
    assert.ok(aimScore.averageMs>0);
    await page.locator('[data-close-result]').click();
    // The same hit count is ordered by accuracy (fewer shots), not elapsed time.
    await page.evaluate(()=>{window.__docs.a={game:'aim',nickname:'准确',size:330,difficulty:'normal',hits:36,shots:40,createdAt:1};window.__docs.b={game:'aim',nickname:'次之',size:330,difficulty:'normal',hits:36,shots:50,createdAt:2};});
    await page.locator('#leaderboardButton').click();await page.waitForFunction(()=>document.querySelector('#leaderboardList li')?.textContent.includes('准确'));
    assert.match(await page.locator('#leaderboardList li').first().textContent(),/准确率 90%/);
    assert.deepEqual(await page.evaluate(()=>window.__queries.at(-1).filter(c=>c.kind==='order').map(c=>c.args)),[['hits','desc'],['shots','asc'],['createdAt','asc']]);
    await page.keyboard.press('Escape');
    // A completed old request must not overwrite a newer round's upload state.
    await page.evaluate(async score=>{window.__defer=true;const {showVictory}=await import('./src/core/victory.js');showVictory({summary:'旧局',score:{...score,puzzleSeed:123123}});},aimScore);
    await page.clock.runFor(300);await page.locator('#scoreActionButton').click();await page.waitForFunction(()=>Boolean(window.__resolve));
    await page.locator('[data-close-result]').click();await choose('reaction');
    await page.evaluate(async score=>{const {showVictory}=await import('./src/core/victory.js');showVictory({summary:'新局',score:{...score,puzzleSeed:456456}});window.__defer=false;window.__resolve();},reactionScore);
    await page.clock.runFor(300);
    assert.equal(await page.locator('#victorySummary').textContent(),'新局');assert.equal(await page.locator('#scoreActionButton').textContent(),'上传成绩');
    assert.deepEqual(errors,[]);
    console.log('PASS: real training completion, login-and-upload, HTTP API payloads and ranking, duplicate prevention, retry, re-open and stale upload isolation (mock API only).');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exit(1);});
