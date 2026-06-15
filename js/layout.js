import { canvasSize } from './utils.js';

/**
 * Fit canvas to container with sharp HiDPI rendering.
 * Internal pixel buffer = display size × devicePixelRatio.
 * Drawing still uses logical base coordinates from canvasSize().
 */
export function fitCanvas(canvas, container) {
  const { width: baseW, height: baseH } = canvasSize();

  if (!canvas || !container) {
    return {
      layoutScale: 1,
      dpr: window.devicePixelRatio || 1,
      baseW,
      baseH,
      displayW: baseW,
      displayH: baseH,
    };
  }

  const availW = container.clientWidth;
  const availH = container.clientHeight;
  const dpr = window.devicePixelRatio || 1;

  if (availW <= 0 || availH <= 0) {
    return {
      layoutScale: 1,
      dpr,
      baseW,
      baseH,
      displayW: baseW,
      displayH: baseH,
    };
  }

  const layoutScale = Math.min(availW / baseW, availH / baseH);
  const displayW = baseW * layoutScale;
  const displayH = baseH * layoutScale;
  const pixelW = Math.max(1, Math.round(displayW * dpr));
  const pixelH = Math.max(1, Math.round(displayH * dpr));

  canvas.style.width = `${Math.floor(displayW)}px`;
  canvas.style.height = `${Math.floor(displayH)}px`;

  if (canvas.width !== pixelW || canvas.height !== pixelH) {
    canvas.width = pixelW;
    canvas.height = pixelH;
  }

  return {
    layoutScale,
    dpr,
    baseW,
    baseH,
    displayW,
    displayH,
    pixelW,
    pixelH,
  };
}

/** Map pointer position to logical canvas coordinates */
export function pointerToLogical(e, canvas, fit) {
  const rect = canvas.getBoundingClientRect();
  const scale = fit?.layoutScale ?? 1;
  return {
    x: (e.clientX - rect.left) / scale,
    y: (e.clientY - rect.top) / scale,
  };
}

/** Apply transform so drawing uses logical base coordinates */
export function applyCanvasTransform(ctx, fit) {
  if (!fit) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return;
  }
  const s = fit.dpr * fit.layoutScale;
  ctx.setTransform(s, 0, 0, s, 0, 0);
}

export function bindCanvasFit(canvas, container, onFit) {
  const update = () => {
    const fit = fitCanvas(canvas, container);
    onFit?.(fit);
    return fit;
  };
  update();
  const ro = new ResizeObserver(update);
  ro.observe(container);
  window.addEventListener('resize', update);
  return () => {
    ro.disconnect();
    window.removeEventListener('resize', update);
  };
}
