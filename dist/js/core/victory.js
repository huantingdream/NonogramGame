// Shared result dialog. Each asynchronous upload belongs to one immutable round.
import { showToast } from './utils.js';
import { getFirebase, getCurrentUser, onAuthChange, displayNameForUser } from './firebase.js';
import { openAuthModal } from './account.js';

let pendingScore = null;
let scoreSubmitted = false;
let scoreSubmitting = false;
let scoreError = '';
let successMessage = '';
let onNextGame = null;
let victoryTimeout = null;
let version = 0;

function els() {
  return {
    modal: document.querySelector('#victoryModal'),
    summary: document.querySelector('#victorySummary'),
    scoreMessage: document.querySelector('#victoryScoreMessage'),
    scoreActionButton: document.querySelector('#scoreActionButton'),
    nextPuzzleButton: document.querySelector('#nextPuzzleButton'),
    reviewButton: document.querySelector('#reviewScoreButton')
  };
}
function updateScoreUi() {
  const dom = els();
  dom.reviewButton.hidden = !pendingScore;
  dom.scoreActionButton.disabled = scoreSubmitted || scoreSubmitting;
  if (scoreSubmitted) {
    dom.scoreMessage.textContent = successMessage || '这次成绩已经进入排行榜。';
    dom.scoreActionButton.textContent = '已上传';
  } else if (scoreSubmitting) {
    dom.scoreMessage.textContent = '正在上传成绩…';
    dom.scoreActionButton.textContent = '上传中';
  } else {
    dom.scoreMessage.textContent = scoreError || (getCurrentUser()
      ? `以“${displayNameForUser(getCurrentUser())}”提交这次成绩。` : '登录后可以把成绩放进排行榜。');
    dom.scoreActionButton.textContent = getCurrentUser() ? (scoreError ? '重试上传' : '上传成绩') : '登录并上传成绩';
  }
}
async function submitScore() {
  if (!pendingScore || scoreSubmitted || scoreSubmitting) return;
  const currentVersion = version;
  const score = pendingScore;
  const firebase = getFirebase();
  scoreError = '';
  if (!firebase) {
    scoreError = '成绩服务暂时不可用，请检查网络后重试。本局成绩仍保留。';
    updateScoreUi(); return;
  }
  if (!getCurrentUser()) {
    els().modal.close();
    const opened = openAuthModal(() => {
      if (version !== currentVersion || pendingScore !== score) return;
      els().modal.showModal();
      submitScore();
    });
    if (!opened) { els().modal.showModal(); updateScoreUi(); }
    return;
  }
  scoreSubmitting = true; updateScoreUi();
  try {
    const result = await firebase.submitScore(score);
    if (version !== currentVersion) return;
    scoreSubmitted = true;
    successMessage = result.duplicate ? '本局成绩已经上传过，无需重复提交。' : '成绩已进入排行榜。';
    showToast(result.duplicate ? '本局成绩已上传' : '成绩上传成功');
  } catch (error) {
    if (version !== currentVersion) return;
    scoreError = error?.code === 'permission-denied'
      ? '上传被拒绝，请确认登录状态或联系站点管理员检查成绩权限。'
      : '上传失败，请检查网络后重试。本局成绩仍保留。';
  } finally {
    if (version === currentVersion) { scoreSubmitting = false; updateScoreUi(); }
  }
}
export function hasPendingScore() { return Boolean(pendingScore) && !scoreSubmitted; }
export function reopenVictoryIfPending() { if (hasPendingScore()) els().modal.showModal(); }
export function closeVictory() {
  window.clearTimeout(victoryTimeout); victoryTimeout = null;
  version++; pendingScore = null; scoreSubmitted = scoreSubmitting = false; scoreError = successMessage = '';
  if (els().modal.open) els().modal.close();
  els().reviewButton.hidden = true;
}
export function showVictory({ summary, score, gameOver = false }) {
  const dom = els();
  version++; pendingScore = { ...score }; scoreSubmitted = scoreSubmitting = false; scoreError = successMessage = '';
  const training = ['reaction', 'aim'].includes(score.game);
  document.querySelector('#victoryTitle').textContent = gameOver ? '本局结束' : (training ? '训练完成！' : '挑战成功！');
  document.querySelector('.victory-badge').textContent = gameOver ? '✦' : '✓';
  dom.nextPuzzleButton.textContent = gameOver ? '再来一局' : (training ? '再练一组' : '再来一题');
  dom.summary.textContent = summary;
  updateScoreUi();
  window.clearTimeout(victoryTimeout);
  victoryTimeout = window.setTimeout(() => dom.modal.showModal(), 260);
}
export function initVictory({ onNext }) {
  const dom = els(); onNextGame = onNext;
  dom.scoreActionButton.addEventListener('click', submitScore);
  dom.reviewButton.addEventListener('click', () => { if (pendingScore) dom.modal.showModal(); });
  dom.nextPuzzleButton.addEventListener('click', () => { closeVictory(); onNextGame?.(); });
  document.querySelector('[data-close-result]').addEventListener('click', () => dom.modal.close());
  dom.modal.addEventListener('click', event => { if (event.target === dom.modal) dom.modal.close(); });
  onAuthChange(() => { if (dom.modal.open) updateScoreUi(); });
}
