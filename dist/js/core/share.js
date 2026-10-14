// 成绩分享：Canvas 绘制分享卡片（保存 PNG）+ 一键复制分享文案。
import { scoreLabel, scoreDetail } from './score.js';
import { showToast } from './utils.js';

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

export function drawShareCard({ gameName, gameIcon, score, summary }) {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext('2d');

  // 背景：品牌蓝渐变 + 网格
  const gradient = ctx.createLinearGradient(0, 0, 1200, 630);
  gradient.addColorStop(0, '#1a31a6');
  gradient.addColorStop(0.55, '#2547e4');
  gradient.addColorStop(1, '#101d5c');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1200, 630);
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= 1200; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 630); ctx.stroke(); }
  for (let y = 0; y <= 630; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1200, y); ctx.stroke(); }

  // 荧光色点缀
  ctx.fillStyle = '#e2ff54';
  roundRect(ctx, 80, 78, 58, 58, 14);
  ctx.fill();
  ctx.fillStyle = '#101a3d';
  ctx.font = '700 30px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('格', 109, 109);

  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '600 30px system-ui, "PingFang SC", sans-serif';
  ctx.fillText('格间 · 小游戏合集', 160, 110);

  // 游戏与成绩
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '500 34px system-ui, "PingFang SC", sans-serif';
  ctx.fillText(`${gameIcon || ''} ${gameName} 挑战完成`, 80, 236);

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 110px system-ui, sans-serif';
  ctx.fillText(scoreLabel(score), 76, 352);

  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '400 30px system-ui, "PingFang SC", sans-serif';
  ctx.fillText(scoreDetail(score), 80, 440);

  // 底部：日期 + 邀请语
  const today = new Date();
  const dateText = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '400 26px system-ui, "PingFang SC", sans-serif';
  ctx.fillText(dateText, 80, 566);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#e2ff54';
  ctx.font = '600 28px system-ui, "PingFang SC", sans-serif';
  ctx.fillText('你能比我更快吗？', 1120, 566);

  return canvas;
}

export function shareText({ gameName, score }) {
  const url = `${location.origin}${location.pathname}`;
  return `我在「格间」完成了 ${gameName}：${scoreLabel(score)}（${scoreDetail(score)}）！来挑战我 → ${url}`;
}

export function wireShareButtons({ getPending }) {
  const imageButton = document.querySelector('#shareImageButton');
  const textButton = document.querySelector('#shareTextButton');
  if (!imageButton || !textButton) return;

  imageButton.addEventListener('click', () => {
    const pending = getPending();
    if (!pending) return;
    try {
      const canvas = drawShareCard(pending);
      canvas.toBlob((blob) => {
        if (!blob) { showToast('生成分享图失败，请重试'); return; }
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `gejian-${pending.score.game}-${Date.now()}.png`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(link.href), 4000);
        showToast('分享图已保存');
      }, 'image/png');
    } catch (_) {
      showToast('生成分享图失败，请重试');
    }
  });

  textButton.addEventListener('click', async () => {
    const pending = getPending();
    if (!pending) return;
    const text = shareText(pending);
    try {
      await navigator.clipboard.writeText(text);
      showToast('战绩文案已复制');
    } catch (_) {
      // 剪贴板不可用时降级为弹窗选中文本
      window.prompt('复制下面的文案分享你的战绩：', text);
    }
  });
}
