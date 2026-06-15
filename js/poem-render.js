import { GRID, canvasSize, drawGrid, drawCellText } from './utils.js';

/** Render a saved poem to any canvas (thumbnail or full view) */
export function renderPoemToCanvas(canvas, blocks) {
  if (!canvas || !blocks?.length) return;

  const { width, height } = canvasSize();
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  drawGrid(ctx, width, height);

  for (const block of blocks) {
    drawCellText(ctx, block.x, block.y, block.size, block.text, {
      hiddenMask: block.hiddenMask,
    });
  }
}

/** Render thumbnail into a target canvas, scaled to fit */
export function renderPoemThumbnail(canvas, blocks) {
  if (!canvas || !blocks?.length) {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const { width, height } = canvasSize();
  const off = document.createElement('canvas');
  off.width = width;
  off.height = height;
  renderPoemToCanvas(off, blocks);

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const scale = Math.min(canvas.width / width, canvas.height / height);
  const dw = width * scale;
  const dh = height * scale;
  const dx = (canvas.width - dw) / 2;
  const dy = (canvas.height - dh) / 2;
  ctx.drawImage(off, dx, dy, dw, dh);
}
