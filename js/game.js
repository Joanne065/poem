import {
  GRID,
  canvasSize,
  gridToPixel,
  drawGrid,
  drawCellText,
  mapUnitsToShape,
  pickShapeForLength,
  phraseToUnits,
  shuffle,
} from './utils.js';
import { applyCanvasTransform } from './layout.js';

const DROP_INTERVAL = 650;
const SOFT_DROP_INTERVAL = 50;

let nextPieceId = 1;

export class Game {
  constructor(canvas, wordLibrary) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.wordLibrary = wordLibrary.filter((p) => p && [...p].length > 0);

    const { width, height } = canvasSize();
    this.width = width;
    this.height = height;
    this.canvasFit = { layoutScale: 1, dpr: window.devicePixelRatio || 1, baseW: width, baseH: height };

    this.board = [];
    this.activePiece = null;
    this.nextPiece = null;
    this.remainingPhrases = [];
    this.phrasesLocked = 0;
    this.lastDrop = 0;
    this.dropInterval = DROP_INTERVAL;
    this.running = false;
    this.paused = false;
    this.gameOver = false;
    this.onGameOver = null;
    this.onUpdate = null;

    this.keys = {};
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
  }

  setCanvasFit(fit) {
    if (fit) this.canvasFit = fit;
  }

  createPieceData(phrase) {
    const units = phraseToUnits(phrase, this.wordLibrary);
    const baseShape = pickShapeForLength(units.length, GRID.COLS);
    const shapeW = Math.max(...baseShape.map((c) => c[0])) + 1;
    return {
      phrase,
      units,
      baseShape,
      rotation: 0,
      col: Math.floor((GRID.COLS - shapeW) / 2),
      row: 0,
    };
  }

  getStats() {
    const stackRows = this.board.length
      ? Math.max(...this.board.map((b) => b.row)) + 1
      : 0;
    return {
      locked: this.phrasesLocked,
      total: this.wordLibrary.length,
      remaining: this.remainingPhrases.length + (this.nextPiece ? 1 : 0) + (this.activePiece ? 1 : 0),
      stackRows,
      paused: this.paused,
      gameOver: this.gameOver,
    };
  }

  emitUpdate() {
    if (this.onUpdate) {
      this.onUpdate({
        stats: this.getStats(),
        nextPiece: this.nextPiece,
      });
    }
  }

  start() {
    this.board = [];
    this.activePiece = null;
    this.nextPiece = null;
    this.remainingPhrases = shuffle(this.wordLibrary);
    this.phrasesLocked = 0;
    this.running = true;
    this.paused = false;
    this.gameOver = false;
    this.lastDrop = performance.now();
    this.dropInterval = DROP_INTERVAL;

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);

    this.refillNextPiece();
    if (!this.spawnFromQueue()) {
      this.endGame();
    } else {
      this.emitUpdate();
      requestAnimationFrame((t) => this.loop(t));
    }
  }

  stop() {
    this.running = false;
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
  }

  stopSoftDrop() {
    this.dropInterval = DROP_INTERVAL;
  }

  togglePause() {
    if (this.gameOver) return;
    this.paused = !this.paused;
    this.emitUpdate();
  }

  getLockedBlocks() {
    return this.board.map((b) => ({
      ...b,
      hiddenMask: b.hiddenMask ? [...b.hiddenMask] : null,
    }));
  }

  getPieceCells(piece) {
    return mapUnitsToShape(piece.baseShape, piece.rotation, piece.units);
  }

  getShapeCells(piece, rotation = piece.rotation) {
    return mapUnitsToShape(piece.baseShape, rotation, piece.units);
  }

  _onKeyDown(e) {
    if (!this.running || this.gameOver || this.paused) return;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) {
      e.preventDefault();
    }
    this.keys[e.key] = true;
    this.handleInput(e.key);
  }

  _onKeyUp(e) {
    this.keys[e.key] = false;
    if (e.key === 'ArrowDown') {
      this.dropInterval = DROP_INTERVAL;
    }
  }

  handleInput(key) {
    if (!this.activePiece || this.paused || this.gameOver) return;

    switch (key) {
      case 'ArrowLeft':
        this.tryMove(-1, 0);
        break;
      case 'ArrowRight':
        this.tryMove(1, 0);
        break;
      case 'ArrowDown':
        this.dropInterval = SOFT_DROP_INTERVAL;
        break;
      case 'ArrowUp':
        this.tryRotate();
        break;
      case ' ':
        this.hardDrop();
        break;
    }
  }

  handleAction(action) {
    switch (action) {
      case 'left':
        this.handleInput('ArrowLeft');
        break;
      case 'right':
        this.handleInput('ArrowRight');
        break;
      case 'down':
        this.handleInput('ArrowDown');
        break;
      case 'rotate':
        this.handleInput('ArrowUp');
        break;
      case 'drop':
        if (!this.paused && !this.gameOver) this.hardDrop();
        break;
      case 'pause':
        this.togglePause();
        break;
    }
  }

  refillNextPiece() {
    if (this.remainingPhrases.length === 0) {
      this.nextPiece = null;
      return;
    }
    const phrase = this.remainingPhrases.shift();
    this.nextPiece = this.createPieceData(phrase);
  }

  /** Swap queued next piece with a random phrase still in the pool */
  swapNextPiece() {
    if (this.gameOver || this.paused || !this.nextPiece || this.remainingPhrases.length === 0) {
      return false;
    }

    const currentPhrase = this.nextPiece.phrase;
    const pickIdx = Math.floor(Math.random() * this.remainingPhrases.length);
    const newPhrase = this.remainingPhrases.splice(pickIdx, 1)[0];
    this.remainingPhrases.push(currentPhrase);
    this.nextPiece = this.createPieceData(newPhrase);
    this.emitUpdate();
    return true;
  }

  spawnFromQueue() {
    if (!this.nextPiece) {
      this.refillNextPiece();
    }
    if (!this.nextPiece) return false;

    this.activePiece = {
      ...this.nextPiece,
      pieceId: nextPieceId++,
    };
    this.refillNextPiece();

    if (this.collides(this.activePiece)) {
      return false;
    }
    this.emitUpdate();
    return true;
  }

  collides(piece, offsetCol = 0, offsetRow = 0, rotation = null) {
    const rot = rotation !== null ? rotation : piece.rotation;
    const cells = this.getShapeCells(piece, rot);

    for (const cell of cells) {
      const col = piece.col + cell.dx + offsetCol;
      const row = piece.row + cell.dy + offsetRow;

      if (col < 0 || col >= GRID.COLS || row >= GRID.ROWS) return true;
      if (row < 0) continue;

      if (this.board.some((b) => b.col === col && b.row === row)) return true;
    }
    return false;
  }

  tryMove(dc, dr) {
    if (!this.collides(this.activePiece, dc, dr)) {
      this.activePiece.col += dc;
      this.activePiece.row += dr;
      return true;
    }
    return false;
  }

  tryRotate() {
    const newRot = (this.activePiece.rotation + 1) % 4;
    if (!this.collides(this.activePiece, 0, 0, newRot)) {
      this.activePiece.rotation = newRot;
    }
  }

  hardDrop() {
    while (this.tryMove(0, 1)) {}
    this.lockPiece();
  }

  lockPiece() {
    const cells = this.getPieceCells(this.activePiece);

    for (const cell of cells) {
      const col = this.activePiece.col + cell.dx;
      const row = this.activePiece.row + cell.dy;

      if (row >= 0) {
        const chars = [...cell.text];
        this.board.push({
          col,
          row,
          text: cell.text,
          phrase: this.activePiece.phrase,
          pieceId: this.activePiece.pieceId,
          unitIndex: cell.unitIndex,
          hiddenMask: chars.map(() => false),
        });
      }
    }

    this.phrasesLocked += 1;

    if (this.board.some((b) => b.row <= 0)) {
      this.endGame();
      return;
    }

    if (!this.spawnFromQueue()) {
      this.endGame();
    }
  }

  endGame() {
    this.gameOver = true;
    this.activePiece = null;
    this.emitUpdate();
    if (this.onGameOver) this.onGameOver();
  }

  loop(timestamp) {
    if (!this.running) return;

    if (!this.paused && !this.gameOver) {
      if (!this.keys['ArrowDown']) {
        this.dropInterval = DROP_INTERVAL;
      }

      if (timestamp - this.lastDrop > this.dropInterval) {
        if (this.activePiece) {
          if (!this.tryMove(0, 1)) {
            this.lockPiece();
          }
        }
        this.lastDrop = timestamp;
      }
    }

    this.render();
    requestAnimationFrame((t) => this.loop(t));
  }

  render() {
    const ctx = this.ctx;
    const { CELL } = GRID;

    applyCanvasTransform(ctx, this.canvasFit);
    drawGrid(ctx, this.width, this.height);

    for (const block of this.board) {
      const { x, y } = gridToPixel(block.col, block.row);
      drawCellText(ctx, x, y, CELL, block.text, { hiddenMask: block.hiddenMask });
    }

    if (this.activePiece && !this.gameOver) {
      for (const cell of this.getPieceCells(this.activePiece)) {
        const col = this.activePiece.col + cell.dx;
        const row = this.activePiece.row + cell.dy;
        if (row < 0) continue;
        const { x, y } = gridToPixel(col, row);
        drawCellText(ctx, x, y, CELL, cell.text);
      }
    }

    if (this.paused && !this.gameOver) {
      ctx.fillStyle = 'rgba(232, 232, 232, 0.75)';
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.fillStyle = '#111';
      ctx.font = '600 14px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('暂停', this.width / 2, this.height / 2);
    }
  }
}
