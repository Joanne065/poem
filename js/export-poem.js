import { canvasSize, drawGrid, drawCellText } from './utils.js';

const PIXEL_RATIO = 2;

const L = {
  sideW: 136,
  headerH: 36,
  consolePad: 7,
  headerGap: 5,
  bezelPad: 4,
  shellPad: 10,
  watermarkGap: 14,
  watermarkH: 26,
  consoleRadius: 14,
};

function renderPoemLayer(blocks) {
  const { width, height } = canvasSize();
  const off = document.createElement('canvas');
  off.width = width;
  off.height = height;
  const ctx = off.getContext('2d');
  drawGrid(ctx, width, height);
  for (const block of blocks) {
    drawCellText(ctx, block.x, block.y, block.size, block.text, {
      hiddenMask: block.hiddenMask,
    });
  }
  return off;
}

function fillRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

function strokeRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.stroke();
}

function drawHeader(ctx, x, y, w, h) {
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x + w, y + h);
  ctx.stroke();

  const backR = 11;
  const backX = x + 2;
  const backY = y + (h - backR * 2) / 2;
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(backX + backR, backY + backR, backR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#111';
  ctx.font = '600 13px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('←', backX + backR, backY + backR + 1);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#111';
  ctx.font = '600 13px "Noto Serif SC", serif';
  ctx.fillText('处理诗块', x + w / 2, y + h / 2 - 5);
  ctx.font = '400 8px "JetBrains Mono", monospace';
  ctx.fillStyle = '#666';
  ctx.fillText('BLOCKS', x + w / 2, y + h / 2 + 9);

  const btnH = 18;
  const btnY = y + (h - btnH) / 2;
  const exportW = 34;
  const saveW = 30;
  const exportX = x + w - exportW - 2;
  const saveX = exportX - saveW - 4;

  ctx.fillStyle = '#111';
  ctx.fillRect(saveX, btnY, saveW, btnH);
  ctx.fillRect(exportX, btnY, exportW, btnH);
  ctx.fillStyle = '#e8e8e8';
  ctx.font = '400 9px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('收诗', saveX + saveW / 2, btnY + btnH / 2);
  ctx.fillText('导出', exportX + exportW / 2, btnY + btnH / 2);
}

function drawSidePanel(ctx, x, y, w, h) {
  ctx.fillStyle = '#111';
  ctx.fillRect(x, y, w, h);

  const innerPad = 5;
  const ix = x + innerPad;
  const iy = y + innerPad;
  const iw = w - innerPad * 2;
  const ih = h - innerPad * 2;

  ctx.fillStyle = '#d6d6d6';
  ctx.fillRect(ix, iy, iw, ih);
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 1;
  ctx.strokeRect(ix + 0.5, iy + 0.5, iw - 1, ih - 1);

  ctx.fillStyle = '#333';
  ctx.font = '400 9px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const hints = ['拖动整句', '双击涂黑', '右键删除'];
  hints.forEach((line, i) => {
    ctx.fillText(line, ix + 8, iy + 10 + i * 14);
  });

  const btnH = 22;
  const btnGap = 5;
  const btnY = iy + ih - btnH * 2 - btnGap - 8;
  const btnW = iw - 10;
  const btnX = ix + 5;

  ctx.fillStyle = '#111';
  ctx.fillRect(btnX, btnY, btnW, btnH);
  ctx.fillRect(btnX, btnY + btnH + btnGap, btnW, btnH);
  ctx.fillStyle = '#e8e8e8';
  ctx.font = '400 9px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('收诗', btnX + btnW / 2, btnY + btnH / 2);
  ctx.fillText('重玩', btnX + btnW / 2, btnY + btnH + btnGap + btnH / 2);
}

function drawWatermark(ctx, totalW, y, text) {
  if (!text) return;
  ctx.fillStyle = '#111';
  ctx.font = '600 12px "Noto Serif SC", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, totalW / 2, y + L.watermarkH / 2);
}

function promptAuthorName() {
  const name = prompt('请输入你的名字（将用于导出水印）');
  if (name === null) return null;
  const trimmed = name.trim();
  if (!trimmed) {
    alert('名字不能为空');
    return promptAuthorName();
  }
  return trimmed;
}

/** Render full edit-screen layout for PNG export */
export function renderFullPoemExport(blocks, authorName = '') {
  const { width: gridW, height: gridH } = canvasSize();
  const lcdW = gridW + L.bezelPad * 2;
  const lcdH = gridH + L.bezelPad * 2;
  const bodyW = lcdW + L.sideW;
  const bodyH = lcdH;

  const innerW = bodyW + L.consolePad * 2;
  const innerH = L.headerH + L.headerGap + bodyH + L.consolePad;
  const totalW = innerW + L.shellPad * 2;
  const totalH = innerH + L.shellPad * 2 + L.watermarkGap + L.watermarkH;

  const canvas = document.createElement('canvas');
  canvas.width = totalW * PIXEL_RATIO;
  canvas.height = totalH * PIXEL_RATIO;
  const ctx = canvas.getContext('2d');
  ctx.scale(PIXEL_RATIO, PIXEL_RATIO);

  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(0, 0, totalW, totalH);

  const cx = L.shellPad;
  const cy = L.shellPad;

  ctx.fillStyle = '#ececec';
  fillRoundRect(ctx, cx, cy, innerW, innerH, L.consoleRadius);
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 3;
  strokeRoundRect(ctx, cx + 1.5, cy + 1.5, innerW - 3, innerH - 3, L.consoleRadius - 1);

  const contentX = cx + L.consolePad;
  const contentW = innerW - L.consolePad * 2;

  drawHeader(ctx, contentX, cy + L.consolePad, contentW, L.headerH);

  const bodyX = contentX;
  const bodyY = cy + L.consolePad + L.headerH + L.headerGap;

  ctx.fillStyle = '#111';
  ctx.fillRect(bodyX, bodyY, lcdW, bodyH);
  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(bodyX + L.bezelPad, bodyY + L.bezelPad, gridW, gridH);
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 2;
  ctx.strokeRect(bodyX + L.bezelPad + 0.5, bodyY + L.bezelPad + 0.5, gridW - 1, gridH - 1);

  const poemLayer = renderPoemLayer(blocks || []);
  ctx.drawImage(poemLayer, bodyX + L.bezelPad, bodyY + L.bezelPad, gridW, gridH);

  drawSidePanel(ctx, bodyX + lcdW, bodyY, L.sideW, bodyH);

  drawWatermark(ctx, totalW, cy + innerH + L.watermarkGap, authorName ? `@${authorName}的诗块` : '');

  return canvas;
}

export function exportFullPoemImage(blocks, filename) {
  const author = promptAuthorName();
  if (!author) return;

  const canvas = renderFullPoemExport(blocks, author);
  const link = document.createElement('a');
  link.download = filename || `俄罗诗方块-${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
