/** Words that must never enter the library (OCR, import, defaults) */
const BLOCKED_WORDS = new Set(['@春日游', '春日游']);

export function isBlockedWord(word) {
  return BLOCKED_WORDS.has(word.trim());
}

export function filterWords(words) {
  return words.filter((w) => w && !isBlockedWord(w));
}

const PUNCT_RE = /[，。！？、；：""''（）【】《》…—\-,.!?;:'"()\[\]{}@#￥%&*+=<>/~`|\\·]/g;
const ENGLISH_RE = /[a-zA-Z]/g;

/** Remove English letters and punctuation from a segment; keep continuous CJK etc. */
function cleanOcrSegment(segment) {
  return segment
    .trim()
    .replace(ENGLISH_RE, '')
    .replace(PUNCT_RE, '')
    .replace(/[\s\u3000]+/g, '')
    .trim();
}

function isValidPoemBlock(segment) {
  if (!segment || isBlockedWord(segment)) return false;
  return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(segment);
}

function cjkLength(str) {
  return [...str].filter((ch) => /[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch)).length;
}

/** OCR 常在每个汉字之间插入空格，或拆成 2 字词组，需合并为一行诗块 */
function shouldMergeLineParts(parts) {
  if (parts.length <= 1) return true;

  const cleaned = parts.map((p) => cleanOcrSegment(p)).filter(Boolean);
  if (!cleaned.length) return false;

  const avgLen = cleaned.reduce((s, p) => s + cjkLength(p), 0) / cleaned.length;
  if (avgLen <= 4) return true;

  const shortCount = cleaned.filter((p) => cjkLength(p) <= 2).length;
  if (shortCount / cleaned.length >= 0.25) return true;

  const allLong = cleaned.every((p) => cjkLength(p) >= 4);
  if (allLong && avgLen >= 5) return false;

  return true;
}

/** 从一行 OCR 文本提取诗块（一行通常对应图片里的一行诗） */
function blocksFromLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return [];

  const parts = trimmed.split(/[\s\u3000]+/).filter(Boolean);
  if (!parts.length) return [];

  if (shouldMergeLineParts(parts)) {
    const merged = cleanOcrSegment(parts.join(''));
    return isValidPoemBlock(merged) ? [merged] : [];
  }

  const blocks = [];
  for (const part of parts) {
    const cleaned = cleanOcrSegment(part);
    if (isValidPoemBlock(cleaned)) blocks.push(cleaned);
  }
  return blocks;
}

function lineCjkText(line) {
  return cleanOcrSegment(String(line).replace(/[\s\u3000]+/g, ''));
}

/** 竖排 / 碎行 OCR：短行连续合并，空行分段 */
function groupFragmentedLines(lines) {
  const blocks = [];
  let buf = '';

  const flush = () => {
    if (buf.length >= 2 && isValidPoemBlock(buf)) blocks.push(buf);
    else if (buf.length === 1 && isValidPoemBlock(buf)) blocks.push(buf);
    buf = '';
  };

  for (const raw of lines) {
    const c = lineCjkText(raw);
    if (!c) {
      flush();
      continue;
    }
    const len = cjkLength(c);
    if (len <= 4) {
      buf += c;
      if (cjkLength(buf) >= 12) flush();
    } else {
      flush();
      blocks.push(c);
    }
  }
  flush();
  return blocks;
}

function avgLineCjkLen(lines) {
  if (!lines.length) return 0;
  return lines.reduce((s, l) => s + cjkLength(lineCjkText(l)), 0) / lines.length;
}

function looksFragmented(lines) {
  if (lines.length < 2) return false;
  const avg = avgLineCjkLen(lines);
  if (avg <= 4) return true;
  const shortCount = lines.filter((l) => cjkLength(lineCjkText(l)) <= 2).length;
  return shortCount / lines.length >= 0.45;
}

function mergeLineGroupTexts(lineGroup) {
  const parts = lineGroup.map((l) => lineCjkText(l.text ?? '')).filter(Boolean);
  if (!parts.length) return null;
  if (parts.length === 1) return parts[0];
  if (shouldMergeLineParts(parts)) return parts.join('');
  return parts.filter(isValidPoemBlock);
}

/** 按 OCR 行距分组：同一视觉行内的碎字/碎词合并，行距大则新开诗块 */
function blocksFromTesseractLines(lines) {
  if (!lines.length) return [];

  const sorted = [...lines].sort((a, b) => {
    const ay = a.bbox?.y0 ?? 0;
    const by = b.bbox?.y0 ?? 0;
    if (Math.abs(ay - by) > 4) return ay - by;
    return (a.bbox?.x0 ?? 0) - (b.bbox?.x0 ?? 0);
  });

  const groups = [];
  let group = [sorted[0]];

  for (let i = 1; i < sorted.length; i += 1) {
    const prev = group[group.length - 1];
    const cur = sorted[i];
    const prevBox = prev.bbox;
    const curBox = cur.bbox;

    let sameRow = true;
    if (prevBox && curBox) {
      const prevH = Math.max(prevBox.y1 - prevBox.y0, 1);
      const curH = Math.max(curBox.y1 - curBox.y0, 1);
      const avgH = (prevH + curH) / 2;
      const gapY = curBox.y0 - prevBox.y1;
      const overlapY = Math.min(prevBox.y1, curBox.y1) - Math.max(prevBox.y0, curBox.y0);
      sameRow = overlapY >= avgH * 0.35 || gapY <= avgH * 0.45;
    }

    if (sameRow) group.push(cur);
    else {
      groups.push(group);
      group = [cur];
    }
  }
  groups.push(group);

  const blocks = [];
  for (const g of groups) {
    const merged = mergeLineGroupTexts(g);
    if (!merged) continue;
    if (Array.isArray(merged)) blocks.push(...merged);
    else if (isValidPoemBlock(merged)) blocks.push(merged);
  }
  return blocks;
}

/**
 * 从 Tesseract 结果提取诗块：优先用行布局，再回退纯文本
 */
export function extractBlocksFromTesseract(data) {
  if (!data) return [];

  try {
    const tessLines = (data.lines || []).filter((line) => line.text?.trim());
    if (tessLines.length >= 1) {
      const layoutBlocks = blocksFromTesseractLines(tessLines);
      if (layoutBlocks.length) return filterWords([...new Set(layoutBlocks)]);
    }
  } catch (err) {
    console.warn('OCR 行布局解析失败', err);
  }

  const lineTexts = (data.lines || [])
    .map((line) => line.text?.trim())
    .filter(Boolean);

  if (lineTexts.length >= 2) {
    if (looksFragmented(lineTexts)) {
      return filterWords([...new Set(groupFragmentedLines(lineTexts))]);
    }
    return splitOcrTextIntoBlocks(lineTexts.join('\n'));
  }

  const paraTexts = (data.paragraphs || [])
    .map((para) => para.text?.trim())
    .filter(Boolean);

  if (paraTexts.length >= 1) {
    const blocks = [];
    for (const para of paraTexts) {
      blocks.push(...splitOcrTextIntoBlocks(para));
    }
    if (blocks.length) return filterWords([...new Set(blocks)]);
  }

  return splitOcrTextIntoBlocks(data.text || '');
}

/**
 * OCR / 图片识别：
 * - 先按换行分行（图片里一行诗 = 一条诗块）
 * - 同行内的字间空格、2 字碎片合并为一句
 * - 英文与标点默认剔除
 */
export function splitOcrTextIntoBlocks(text) {
  if (!text || !text.trim()) return [];

  const normalized = text.replace(/\r\n/g, '\n').trim();
  const paragraphs = normalized.split(/\n\s*\n/);
  const blocks = [];

  for (const para of paragraphs) {
    const lines = para.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;

    if (lines.length >= 2 && looksFragmented(lines)) {
      blocks.push(...groupFragmentedLines(lines));
      continue;
    }

    for (const line of lines) {
      blocks.push(...blocksFromLine(line));
    }
  }

  if (!blocks.length && normalized.includes(' ')) {
    blocks.push(...blocksFromLine(normalized.replace(/\n/g, ' ')));
  }

  return filterWords([...new Set(blocks)]);
}

/** Split text into words/phrases by whitespace, punctuation, and line breaks */
export function splitIntoWords(text) {
  if (!text || !text.trim()) return [];

  const normalized = text.replace(/\r\n/g, '\n');
  const parts = normalized.split(/[\s，。！？、；：""''（）【】《》…—\-,.!?;:'"()\[\]{}]+|\n+/);
  return filterWords([...new Set(parts.map((s) => s.trim()).filter(Boolean))]);
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
