/** Split text into words/phrases by whitespace, punctuation, and line breaks */
export function splitIntoWords(text) {
  if (!text || !text.trim()) return [];

  const normalized = text.replace(/\r\n/g, '\n');
  const parts = normalized.split(/[\s，。！？、；：""''（）【】《》…—\-,.!?;:'"()\[\]{}]+|\n+/);
  return [...new Set(parts.map((s) => s.trim()).filter(Boolean))];
}

/** Pick random item from array */
export function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Fisher–Yates shuffle (returns new array) */
export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Build bigram weights from the word library for segmentation.
 * - weight 3: exact 2-char library entry
 * - weight 2: bigram appears in 2+ library phrases
 * - weight 1: bigram appears once in library corpus
 */
export function buildBigramWeights(wordLibrary) {
  const counts = new Map();
  const exactTwo = new Set();

  for (const w of wordLibrary) {
    const chars = [...w];
    if (chars.length === 2) exactTwo.add(w);
    for (let i = 0; i < chars.length - 1; i++) {
      const bg = chars[i] + chars[i + 1];
      counts.set(bg, (counts.get(bg) || 0) + 1);
    }
  }

  const weights = new Map();
  for (const [bg, count] of counts) {
    if (exactTwo.has(bg)) weights.set(bg, 3);
    else if (count >= 2) weights.set(bg, 2);
    else weights.set(bg, 1);
  }
  return weights;
}

/**
 * Split phrase into cell units for the game board.
 * - 1–2 char phrases → one cell
 * - Longer phrases → prefer 2-char words from library (e.g. 所有/春天/清晨), else single char
 */
export function phraseToUnits(phrase, wordLibrary = []) {
  const chars = [...phrase];
  if (chars.length <= 2) return [phrase];
  if (!wordLibrary.length) {
    return segmentGreedyPairs(chars);
  }

  const weights = buildBigramWeights(wordLibrary);
  const n = chars.length;
  /** @type {Array<{score: number, quality: number, units: string[]}|null>} */
  const dp = Array(n + 1).fill(null);
  dp[0] = { score: 0, quality: 0, units: [] };

  const isBetter = (a, b) => {
    if (!b) return true;
    if (!a) return false;
    if (a.score !== b.score) return a.score > b.score;
    if (a.quality !== b.quality) return a.quality > b.quality;
    return a.units.length < b.units.length;
  };

  for (let i = 0; i < n; i++) {
    const cur = dp[i];
    if (!cur) continue;

    const single = {
      score: cur.score,
      quality: cur.quality,
      units: [...cur.units, chars[i]],
    };
    if (isBetter(single, dp[i + 1])) dp[i + 1] = single;

    if (i + 2 <= n) {
      const bg = chars[i] + chars[i + 1];
      const w = weights.get(bg);
      if (w !== undefined) {
        const pair = {
          score: cur.score + w,
          quality: cur.quality + (w >= 2 ? 1 : 0),
          units: [...cur.units, bg],
        };
        if (isBetter(pair, dp[i + 2])) dp[i + 2] = pair;
      }
    }
  }

  if (dp[n]) return dp[n].units;
  return segmentGreedyPairs(chars);
}

/** Fallback: consecutive 2-char pairing */
function segmentGreedyPairs(chars) {
  const units = [];
  let i = 0;
  while (i < chars.length) {
    const rem = chars.length - i;
    if (rem >= 2) {
      units.push(chars[i] + chars[i + 1]);
      i += 2;
    } else {
      units.push(chars[i]);
      i += 1;
    }
  }
  return units;
}

/** Rotate point around origin (0,0) by 90° clockwise */
export function rotatePoint(x, y, times) {
  let rx = x;
  let ry = y;
  for (let i = 0; i < (times % 4); i++) {
    const nx = ry;
    const ny = -rx;
    rx = nx;
    ry = ny;
  }
  return [rx, ry];
}

/** Normalize shape so min x,y = 0 */
export function normalizeShape(cells) {
  if (!cells.length) return [];
  const minX = Math.min(...cells.map((c) => c[0]));
  const minY = Math.min(...cells.map((c) => c[1]));
  return cells.map(([x, y]) => [x - minX, y - minY]);
}

/** Sort cells in reading order: top → bottom, left → right */
export function sortCellsReadingOrder(cells) {
  return cells
    .map(([dx, dy]) => ({ dx, dy }))
    .sort((a, b) => a.dy - b.dy || a.dx - b.dx);
}

const SHAPES_1 = [[[0, 0]]];

const SHAPES_2 = [
  [[0, 0], [1, 0]],
  [[0, 0], [0, 1]],
];

const SHAPES_3 = [
  [[0, 0], [1, 0], [2, 0]],
  [[0, 0], [0, 1], [0, 2]],
  [[0, 0], [1, 0], [1, 1]],
  [[0, 0], [1, 0], [0, 1]],
  [[1, 0], [0, 1], [1, 1]],
];

const SHAPES_4 = [
  [[0, 0], [1, 0], [2, 0], [3, 0]],
  [[0, 0], [1, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [2, 0], [1, 1]],
  [[1, 0], [2, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [1, 1], [2, 1]],
  [[0, 0], [0, 1], [0, 2], [1, 2]],
  [[1, 0], [1, 1], [1, 2], [0, 2]],
];

export function buildWrappedShape(unitCount, maxCols) {
  const width = Math.min(unitCount, maxCols);
  const cells = [];
  for (let i = 0; i < unitCount; i++) {
    cells.push([i % width, Math.floor(i / width)]);
  }
  return normalizeShape(cells);
}

export function pickShapeForLength(unitCount, maxCols) {
  if (unitCount <= 0) return [[0, 0]];
  if (unitCount === 1) return pickRandom(SHAPES_1);
  if (unitCount === 2) return pickRandom(SHAPES_2);
  if (unitCount === 3) return pickRandom(SHAPES_3);
  if (unitCount === 4) return pickRandom(SHAPES_4);
  return buildWrappedShape(unitCount, maxCols);
}

export function getRotatedShape(baseShape, rotation) {
  const rotated = baseShape.map(([x, y]) => rotatePoint(x, y, rotation));
  return normalizeShape(rotated);
}

/**
 * Map units onto rotated shape cells, preserving reading order:
 * unit[0] always at topmost/leftmost cell, then row-major.
 */
export function mapUnitsToShape(baseShape, rotation, units) {
  const rotated = getRotatedShape(baseShape, rotation);
  const sorted = sortCellsReadingOrder(rotated);
  return sorted.map((pos, i) => ({
    dx: pos.dx,
    dy: pos.dy,
    text: units[i] ?? '',
    unitIndex: i,
  }));
}

export const GRID = {
  COLS: 6,
  ROWS: 14,
  CELL: 34,
  PADDING: 8,
  GRID_LINE: 0.5,
};

export function canvasSize() {
  const { COLS, ROWS, CELL, PADDING } = GRID;
  return {
    width: COLS * CELL + PADDING * 2,
    height: ROWS * CELL + PADDING * 2,
  };
}

export function gridToPixel(col, row) {
  const { CELL, PADDING } = GRID;
  return {
    x: PADDING + col * CELL,
    y: PADDING + row * CELL,
  };
}

export function pixelToGrid(px, py) {
  const { CELL, PADDING } = GRID;
  return {
    col: Math.floor((px - PADDING) / CELL),
    row: Math.floor((py - PADDING) / CELL),
  };
}

export function drawGrid(ctx, width, height) {
  const { COLS, ROWS, CELL, PADDING, GRID_LINE } = GRID;

  ctx.fillStyle = '#e4e4e4';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = GRID_LINE;

  for (let c = 0; c <= COLS; c++) {
    const x = PADDING + c * CELL;
    ctx.beginPath();
    ctx.moveTo(x, PADDING);
    ctx.lineTo(x, PADDING + ROWS * CELL);
    ctx.stroke();
  }

  for (let r = 0; r <= ROWS; r++) {
    const y = PADDING + r * CELL;
    ctx.beginPath();
    ctx.moveTo(PADDING, y);
    ctx.lineTo(PADDING + COLS * CELL, y);
    ctx.stroke();
  }

  ctx.strokeStyle = '#111';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(PADDING - 1, PADDING - 1, COLS * CELL + 2, ROWS * CELL + 2);
}

/** Simple single-border cell */
function drawRetroFrame(ctx, x, y, size, ghost = false) {
  ctx.fillStyle = ghost ? '#f0f0f0' : '#ebebeb';
  ctx.fillRect(x, y, size, size);

  ctx.strokeStyle = ghost ? '#999' : '#111';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
}

/** Draw one character inside a slot, scaling to fit (horizontal squish allowed) */
function drawCharInSlot(ctx, x, y, w, h, char, ghost) {
  if (!char) return;

  ctx.save();
  ctx.fillStyle = ghost ? 'rgba(0,0,0,0.35)' : '#111';

  const fontSize = h * 0.82;
  ctx.font = `600 ${fontSize}px "Noto Serif SC", serif`;
  const metrics = ctx.measureText(char);

  const maxW = w - 2;
  const maxH = h - 2;
  const scaleY = Math.min(1, maxH / fontSize);
  const scaleX = Math.min(scaleY, maxW / Math.max(metrics.width, 1));

  ctx.translate(x + w / 2, y + h / 2);
  ctx.scale(scaleX, scaleY);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(char, 0, 0);
  ctx.restore();
}

/**
 * Draw cell text (1–2 chars). Chars stay inside the box; multi-char cells compress horizontally.
 */
export function drawCellText(ctx, x, y, size, text, options = {}) {
  const { ghost = false, hiddenMask = null } = options;
  const chars = [...(text || '')];

  ctx.save();

  drawRetroFrame(ctx, x, y, size, ghost);

  if (!chars.length) {
    ctx.restore();
    return;
  }

  const padding = Math.max(4, Math.floor(size * 0.12));
  const inner = size - padding * 2;
  const mask = hiddenMask || chars.map(() => false);

  if (chars.every((_, i) => mask[i])) {
    ctx.fillStyle = '#111';
    ctx.fillRect(x + 2, y + 2, size - 4, size - 4);
    ctx.restore();
    return;
  }

  const slotCount = chars.length;
  const slotW = inner / slotCount;

  chars.forEach((ch, i) => {
    const sx = x + padding + i * slotW;
    const sy = y + padding;

    if (mask[i]) {
      ctx.fillStyle = '#111';
      ctx.fillRect(sx, sy, slotW, inner);
      return;
    }

    drawCharInSlot(ctx, sx, sy, slotW, inner, ch, ghost);
  });

  ctx.restore();
}

/** Compact cell for next-piece preview panel */
function drawPreviewCell(ctx, x, y, size, text) {
  ctx.fillStyle = '#ebebeb';
  ctx.fillRect(x, y, size, size);

  ctx.strokeStyle = '#111';
  ctx.lineWidth = Math.max(1, size * 0.07);
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);

  const chars = [...(text || '')];
  if (!chars.length) return;

  const pad = Math.max(1, Math.floor(size * 0.08));
  const inner = size - pad * 2;
  if (inner <= 0) return;

  const slotW = inner / chars.length;
  chars.forEach((ch, i) => {
    drawCharInSlot(ctx, x + pad + i * slotW, y + pad, slotW, inner, ch, false);
  });
}

/** Draw next-piece preview in side panel */
export function drawPiecePreview(ctx, width, height, piece) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = '#e4e4e4';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#111';
  ctx.lineWidth = Math.max(1, width * 0.02);
  ctx.strokeRect(0.75, 0.75, width - 1.5, height - 1.5);

  if (!piece || !piece.units?.length) return;

  const cells = mapUnitsToShape(piece.baseShape, 0, piece.units);
  const minX = Math.min(...cells.map((c) => c.dx));
  const maxX = Math.max(...cells.map((c) => c.dx));
  const minY = Math.min(...cells.map((c) => c.dy));
  const maxY = Math.max(...cells.map((c) => c.dy));
  const shapeW = maxX - minX + 1;
  const shapeH = maxY - minY + 1;

  const margin = 6;
  const cellSize = Math.max(
    7,
    Math.min(
      Math.floor((width - margin * 2) / shapeW),
      Math.floor((height - margin * 2) / shapeH),
      26,
    ),
  );

  const totalW = shapeW * cellSize;
  const totalH = shapeH * cellSize;
  const ox = (width - totalW) / 2;
  const oy = (height - totalH) / 2;

  for (const cell of cells) {
    const x = ox + (cell.dx - minX) * cellSize;
    const y = oy + (cell.dy - minY) * cellSize;
    drawPreviewCell(ctx, x, y, cellSize, cell.text);
  }
}

/** Which character index was clicked inside a cell (for 2-char cells) */
export function charIndexInCell(localX, cellSize, charCount) {
  if (charCount <= 1) return 0;
  const padding = 5;
  const inner = cellSize - padding * 2;
  const slotW = inner / charCount;
  const relX = localX - padding;
  const idx = Math.floor(relX / slotW);
  if (idx >= 0 && idx < charCount) return idx;
  return -1;
}
