// Exercises the real UI and Firebase adapter against an in-memory SDK; never writes live scores.
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
    const app = 'export const initializeApp = () => ({});';
    const auth = `
      export const getAuth = () => window.__auth;
      export const onAuthStateChanged = (auth, callback) => {window.__listeners.push(callback);queueMicrotask(()=>callback(auth.currentUser));};
      export async function signInWithEmailAndPassword(auth) {auth.currentUser={uid:'tester',displayName:'Tester',email:'test@example.test'};window.__listeners.forEach(f=>f(auth.currentUser));return {user:auth.currentUser};}
      export async function signOut(auth) {auth.currentUser=null;window.__listeners.forEach(f=>f(null));}
    `;
    const firestore = `
      export const getFirestore = () => ({});
      export const doc = (db,collection,id) => ({collection,id});
      export const collection = (db,name) => ({name});
      export const serverTimestamp = () => Date.now();
      export const getDoc = async ref => ({exists:()=>Boolean(window.__docs[ref.id])});
      export async function setDoc(ref,data) {
        window.__writes++;
        if(window.__defer) await new Promise(resolve=>{window.__resolve=resolve;});
        if(window.__fail){window.__fail=false;throw Object.assign(new Error('offline'),{code:'unavailable'});}
        window.__docs[ref.id]=data;
      }
      export const where = (...args) => ({kind:'where',args});
      export const orderBy = (...args) => ({kind:'order',args});
      export const limit = value => ({kind:'limit',value});
      export const query = (collection,...constraints) => constraints;
      export async function getDocs(constraints) {
        window.__queries.push(constraints);
        let rows=Object.values(window.__docs);
        for(const c of constraints.filter(c=>c.kind==='where')) rows=rows.filter(row=>row[c.args[0]]===c.args[2]);
        rows.sort((a,b)=>{for(const c of constraints.filter(c=>c.kind==='order')){const [key,direction]=c.args;const diff=a[key]-b[key];if(diff)return direction==='desc'?-diff:diff;}return 0;});
        rows=rows.slice(0,constraints.find(c=>c.kind==='limit').value);
        return {docs:rows.map(row=>({data:()=>row}))};
      }
    `;
    await page.route('https://www.gstatic.com/firebasejs/**', route => {
      const url = route.request().url();
      return route.fulfill({ contentType: 'text/javascript', body: url.endsWith('firebase-app.js') ? app : url.endsWith('firebase-auth.js') ? auth : firestore });
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
    await page.evaluate(async score=>{const {showVictory}=await import('./js/core/victory.js');showVictory({summary:'重复成绩测试',score});},reactionScore);
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
    await page.evaluate(async score=>{window.__defer=true;const {showVictory}=await import('./js/core/victory.js');showVictory({summary:'旧局',score:{...score,puzzleSeed:123123}});},aimScore);
    await page.clock.runFor(300);await page.locator('#scoreActionButton').click();await page.waitForFunction(()=>Boolean(window.__resolve));
    await page.locator('[data-close-result]').click();await choose('reaction');
    await page.evaluate(async score=>{const {showVictory}=await import('./js/core/victory.js');showVictory({summary:'新局',score:{...score,puzzleSeed:456456}});window.__defer=false;window.__resolve();},reactionScore);
    await page.clock.runFor(300);
    assert.equal(await page.locator('#victorySummary').textContent(),'新局');assert.equal(await page.locator('#scoreActionButton').textContent(),'上传成绩');
    assert.deepEqual(errors,[]);
    console.log('PASS: real training completion, login-and-upload, actual adapter fields/queries, duplicate prevention, retry, re-open and stale upload isolation (mock SDK only).');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exit(1);});
