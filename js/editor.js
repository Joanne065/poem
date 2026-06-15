import {
  GRID,
  canvasSize,
  gridToPixel,
  drawGrid,
  drawCellText,
  charIndexInCell,
} from './utils.js';
import { applyCanvasTransform, pointerToLogical } from './layout.js';
import { exportFullPoemImage } from './export-poem.js';

export class Editor {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    const { width, height } = canvasSize();
    this.width = width;
    this.height = height;
    this.canvasFit = { layoutScale: 1, dpr: window.devicePixelRatio || 1, baseW: width, baseH: height };

    /** @type {Array<{id, x, y, size, text, phrase, pieceId, unitIndex, hiddenMask}>} */
    this.blocks = [];
    this.dragging = null;
    this.dragOffset = { x: 0, y: 0 };
    this.dragGroup = [];
    this.nextId = 1;

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onContextMenu = this._onContextMenu.bind(this);
    this._onDblClick = this._onDblClick.bind(this);
  }

  setCanvasFit(fit) {
    if (fit) {
      this.canvasFit = fit;
      this.render();
    }
  }

  loadFromBoard(lockedBlocks) {
    const { CELL } = GRID;
    this.blocks = lockedBlocks.map((b) => {
      const { x, y } = gridToPixel(b.col, b.row);
      const chars = [...b.text];
      return {
        id: this.nextId++,
        x,
        y,
        size: CELL,
        text: b.text,
        phrase: b.phrase,
        pieceId: b.pieceId,
        unitIndex: b.unitIndex,
        hiddenMask: b.hiddenMask ? [...b.hiddenMask] : chars.map(() => false),
      };
    });
    this.render();
  }

  attach() {
    this.canvas.addEventListener('pointerdown', this._onPointerDown);
    this.canvas.addEventListener('pointermove', this._onPointerMove);
    this.canvas.addEventListener('pointerup', this._onPointerUp);
    this.canvas.addEventListener('contextmenu', this._onContextMenu);
    this.canvas.addEventListener('dblclick', this._onDblClick);
  }

  detach() {
    this.canvas.removeEventListener('pointerdown', this._onPointerDown);
    this.canvas.removeEventListener('pointermove', this._onPointerMove);
    this.canvas.removeEventListener('pointerup', this._onPointerUp);
    this.canvas.removeEventListener('contextmenu', this._onContextMenu);
    this.canvas.removeEventListener('dblclick', this._onDblClick);
  }

  getCanvasPoint(e) {
    return pointerToLogical(e, this.canvas, this.canvasFit);
  }

  hitTest(px, py) {
    for (let i = this.blocks.length - 1; i >= 0; i--) {
      const b = this.blocks[i];
      if (px >= b.x && px <= b.x + b.size && py >= b.y && py <= b.y + b.size) {
        return { block: b, index: i };
      }
    }
    return null;
  }

  getPhraseGroup(pieceId) {
    return this.blocks.filter((b) => b.pieceId === pieceId);
  }

  _onPointerDown(e) {
    const { x, y } = this.getCanvasPoint(e);
    const hit = this.hitTest(x, y);
    if (!hit) return;

    this.dragging = hit.block;
    this.dragGroup = this.getPhraseGroup(hit.block.pieceId)
      .sort((a, b) => a.unitIndex - b.unitIndex);
    this.dragOffset = { x: x - hit.block.x, y: y - hit.block.y };
    this.canvas.setPointerCapture(e.pointerId);
  }

  _onPointerMove(e) {
    if (!this.dragging || !this.dragGroup.length) return;
    const { x, y } = this.getCanvasPoint(e);
    const dx = x - this.dragOffset.x - this.dragging.x;
    const dy = y - this.dragOffset.y - this.dragging.y;
    for (const block of this.dragGroup) {
      block.x += dx;
      block.y += dy;
    }
    this.render();
  }

  _onPointerUp(e) {
    if (this.dragging) {
      this.canvas.releasePointerCapture(e.pointerId);
      this.dragging = null;
      this.dragGroup = [];
    }
  }

  _onContextMenu(e) {
    e.preventDefault();
    const { x, y } = this.getCanvasPoint(e);
    const hit = this.hitTest(x, y);
    if (hit) {
      const pieceId = hit.block.pieceId;
      this.blocks = this.blocks.filter((b) => b.pieceId !== pieceId);
      this.render();
    }
  }

  _onDblClick(e) {
    const { x, y } = this.getCanvasPoint(e);
    const hit = this.hitTest(x, y);
    if (!hit) return;

    const block = hit.block;
    const chars = [...block.text];
    const localX = x - block.x;
    const charIdx = charIndexInCell(localX, block.size, chars.length);

    if (charIdx >= 0) {
      block.hiddenMask[charIdx] = !block.hiddenMask[charIdx];
    } else if (chars.length === 1) {
      block.hiddenMask[0] = !block.hiddenMask[0];
    }

    this.render();
  }

  render() {
    const ctx = this.ctx;
    applyCanvasTransform(ctx, this.canvasFit);
    drawGrid(ctx, this.width, this.height);

    for (const block of this.blocks) {
      drawCellText(ctx, block.x, block.y, block.size, block.text, {
        hiddenMask: block.hiddenMask,
      });
    }
  }

  renderLogicalCanvas() {
    const off = document.createElement('canvas');
    off.width = this.width;
    off.height = this.height;
    const ctx = off.getContext('2d');
    drawGrid(ctx, this.width, this.height);
    for (const block of this.blocks) {
      drawCellText(ctx, block.x, block.y, block.size, block.text, {
        hiddenMask: block.hiddenMask,
      });
    }
    return off;
  }

  exportImage() {
    exportFullPoemImage(this.getPoemData().blocks);
  }

  toDataURL() {
    return this.renderLogicalCanvas().toDataURL('image/png');
  }

  getPoemData() {
    return {
      blocks: this.blocks.map((b) => ({
        x: b.x,
        y: b.y,
        size: b.size,
        text: b.text,
        phrase: b.phrase,
        pieceId: b.pieceId,
        unitIndex: b.unitIndex,
        hiddenMask: [...b.hiddenMask],
      })),
    };
  }

  loadPoemData(data) {
    this.blocks = (data.blocks || []).map((b) => ({
      id: this.nextId++,
      x: b.x,
      y: b.y,
      size: b.size,
      text: b.text,
      phrase: b.phrase,
      pieceId: b.pieceId,
      unitIndex: b.unitIndex,
      hiddenMask: b.hiddenMask ? [...b.hiddenMask] : [...b.text].map(() => false),
    }));
    this.render();
  }
}
