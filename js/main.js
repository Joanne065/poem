import { splitIntoWords, filterWords } from './utils.js';
import { Game } from './game.js';
import { Editor } from './editor.js';
import { DEFAULT_WORD_LIBRARY } from './default-words.js';
import { bindCanvasFit, fitCanvas } from './layout.js';
import {
  loadWordLibrary,
  saveWordLibrary,
  loadPoems,
  savePoem,
  deletePoem,
  formatPoemDate,
} from './storage.js';
import { renderPoemThumbnail } from './poem-render.js';

/** @type {string[]} */
const savedWords = loadWordLibrary();
let wordLibrary = savedWords !== null
  ? filterWords(savedWords)
  : filterWords([...DEFAULT_WORD_LIBRARY]);

let game = null;
let editor = null;
let unbindGameFit = null;
let unbindEditFit = null;
let viewingPoemId = null;
let saveWordsTimer = null;

const screens = {
  setup: document.getElementById('screen-setup'),
  game: document.getElementById('screen-game'),
  edit: document.getElementById('screen-edit'),
  collection: document.getElementById('screen-collection'),
};

const addBlockInput = document.getElementById('add-block-input');
const addBlockBtn = document.getElementById('add-block-btn');
const wordList = document.getElementById('word-list');
const wordCount = document.getElementById('word-count');
const startBtn = document.getElementById('start-btn');
const fileUpload = document.getElementById('file-upload');
const uploadStatus = document.getElementById('upload-status');
const clearWordsBtn = document.getElementById('clear-words-btn');
const restoreDefaultBtn = document.getElementById('restore-default-btn');
const gameCanvas = document.getElementById('game-canvas');
const editCanvas = document.getElementById('edit-canvas');
const nextPreview = document.getElementById('next-preview');
const nextText = document.getElementById('next-text');
const swapNextBtn = document.getElementById('swap-next-btn');
const gameOverlay = document.getElementById('game-overlay');
const gameStatus = document.getElementById('game-status');
const statLocked = document.getElementById('stat-locked');
const statRows = document.getElementById('stat-rows');
const statRemain = document.getElementById('stat-remain');
const pauseBtn = document.getElementById('pause-btn');
const lcdPlayWrap = document.getElementById('lcd-play-wrap');
const editPlayWrap = document.getElementById('edit-play-wrap');
const poemGrid = document.getElementById('poem-grid');
const collectionEmpty = document.getElementById('collection-empty');
const collectionSummary = document.getElementById('collection-summary');
const poemCountBadge = document.getElementById('poem-count-badge');
const saveToast = document.getElementById('save-toast');

function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.remove('active'));
  screens[name].classList.add('active');
}

function showToast(msg) {
  saveToast.textContent = msg;
  saveToast.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => saveToast.classList.remove('show'), 2200);
}

function persistWordLibrary() {
  clearTimeout(saveWordsTimer);
  saveWordsTimer = setTimeout(() => {
    const ok = saveWordLibrary(wordLibrary);
    if (!ok) showToast('句库保存失败，存储空间可能已满');
  }, 280);
}

function addBlocksFromText(text) {
  const incoming = filterWords(splitIntoWords(text));
  if (!incoming.length) return 0;
  let added = 0;
  for (const word of incoming) {
    if (!wordLibrary.includes(word)) {
      wordLibrary.push(word);
      added += 1;
    }
  }
  if (added) renderWordList();
  return added;
}

function addSingleBlock() {
  const text = addBlockInput.value;
  if (!text.trim()) return;
  const added = addBlocksFromText(text);
  if (added) {
    addBlockInput.value = '';
    uploadStatus.textContent = `已添加 ${added} 条`;
  } else {
    uploadStatus.textContent = '该诗块已在停诗间';
  }
}

function renderWordList() {
  wordList.innerHTML = '';
  wordLibrary.forEach((word, idx) => {
    const chip = document.createElement('span');
    chip.className = 'word-chip';
    chip.innerHTML = `${escapeHtml(word)}<button class="remove" data-idx="${idx}" aria-label="删除">×</button>`;
    wordList.appendChild(chip);
  });
  wordCount.textContent = `${wordLibrary.length} 条`;
  startBtn.disabled = wordLibrary.length === 0;
  persistWordLibrary();
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function clearWordLibrary() {
  wordLibrary = [];
  addBlockInput.value = '';
  uploadStatus.textContent = '';
  renderWordList();
}

function restoreDefaultLibrary() {
  wordLibrary = filterWords([...DEFAULT_WORD_LIBRARY]);
  uploadStatus.textContent = `已恢复默认句库（${wordLibrary.length} 条）`;
  renderWordList();
}

function updatePoemBadge() {
  const count = loadPoems().length;
  poemCountBadge.textContent = String(count);
}

function renderCollection() {
  const poems = loadPoems();
  updatePoemBadge();
  collectionSummary.textContent = `已保存 ${poems.length} 首`;
  poemGrid.innerHTML = '';

  if (poems.length === 0) {
    collectionEmpty.classList.remove('hidden');
    return;
  }

  collectionEmpty.classList.add('hidden');

  poems.forEach((poem) => {
    const card = document.createElement('article');
    card.className = 'poem-card';
    card.dataset.id = poem.id;

    const thumb = document.createElement('canvas');
    thumb.className = 'poem-card-thumb';
    thumb.width = 130;
    thumb.height = 290;
    renderPoemThumbnail(thumb, poem.blocks);

    const meta = document.createElement('div');
    meta.className = 'poem-card-meta';
    meta.innerHTML = `
      <span class="poem-card-date">${formatPoemDate(poem.createdAt)}</span>
      <button class="poem-card-delete" type="button" aria-label="删除">×</button>
    `;

    card.appendChild(thumb);
    card.appendChild(meta);
    poemGrid.appendChild(card);
  });
}

function openCollection() {
  renderCollection();
  showScreen('collection');
}

function viewPoem(poemId) {
  const poem = loadPoems().find((p) => p.id === poemId);
  if (!poem) return;

  viewingPoemId = poemId;
  showScreen('edit');

  if (editor) editor.detach();
  editor = new Editor(editCanvas);
  editor.loadPoemData(poem);
  editor.attach();

  if (unbindEditFit) unbindEditFit();
  unbindEditFit = bindCanvasFit(editCanvas, editPlayWrap, (fit) => editor?.setCanvasFit(fit));
}

function saveCurrentPoem() {
  if (!editor) return;

  const result = savePoem(editor.getPoemData());
  if (result.ok) {
    showToast('已收诗');
    updatePoemBadge();
  } else {
    showToast('保存失败，请删除部分旧诗后重试');
  }
}

async function handleFileUpload(file) {
  if (!file) return;

  uploadStatus.textContent = '识别中…';

  try {
    if (file.type.startsWith('text/') || file.name.endsWith('.txt') || file.name.endsWith('.md')) {
      const text = await file.text();
      const words = filterWords(splitIntoWords(text));
      const before = wordLibrary.length;
      wordLibrary = [...new Set([...wordLibrary, ...words])];
      const added = wordLibrary.length - before;
      uploadStatus.textContent = added
        ? `已从文本识别 ${added} 条`
        : '未识别到新诗块';
    } else if (file.type.startsWith('image/')) {
      if (typeof Tesseract === 'undefined') {
        uploadStatus.textContent = 'OCR 加载失败';
        return;
      }
      const result = await Tesseract.recognize(file, 'chi_sim+eng', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            uploadStatus.textContent = `识别中 ${Math.round(m.progress * 100)}%`;
          }
        },
      });
      const words = filterWords(splitIntoWords(result.data.text));
      const before = wordLibrary.length;
      wordLibrary = [...new Set([...wordLibrary, ...words])];
      const added = wordLibrary.length - before;
      uploadStatus.textContent = added
        ? `已从图片识别 ${added} 条`
        : '未识别到新诗块';
    } else {
      uploadStatus.textContent = '不支持的文件格式';
    }
    renderWordList();
  } catch (err) {
    console.error(err);
    uploadStatus.textContent = '识别失败，请重试';
  }
}

function fitNextPreviewText(phrase) {
  if (!nextText || !nextPreview) return;

  if (!phrase) {
    nextText.textContent = '—';
    nextText.style.fontSize = '';
    return;
  }

  nextText.textContent = phrase;
  nextText.style.fontSize = '14px';

  const maxW = nextPreview.clientWidth - 8;
  const maxH = nextPreview.clientHeight - 8;
  let size = 14;

  while (
    size > 9
    && (nextText.scrollWidth > maxW || nextText.scrollHeight > maxH)
  ) {
    size -= 1;
    nextText.style.fontSize = `${size}px`;
  }
}

function updateNextPreview() {
  if (!game) {
    fitNextPreviewText('');
    if (swapNextBtn) swapNextBtn.disabled = true;
    return;
  }

  const phrase = game.nextPiece?.phrase ?? '';
  fitNextPreviewText(phrase);

  if (swapNextBtn) {
    swapNextBtn.disabled = (
      game.gameOver
      || game.paused
      || !phrase
      || game.remainingPhrases.length === 0
    );
  }
}

function updateGameUI({ stats }) {
  if (stats) {
    statLocked.textContent = String(stats.locked);
    statRows.textContent = String(stats.stackRows);
    statRemain.textContent = String(stats.remaining);
    if (stats.paused) {
      gameStatus.textContent = '已暂停';
      pauseBtn.textContent = '继续';
      pauseBtn.classList.add('paused');
    } else if (stats.gameOver) {
      gameStatus.textContent = '回合结束';
      pauseBtn.textContent = '暂停';
      pauseBtn.classList.remove('paused');
    } else {
      gameStatus.textContent = '诗块掉落中';
      pauseBtn.textContent = '暂停';
      pauseBtn.classList.remove('paused');
    }
  }
  updateNextPreview();
}

function bindConsoleControls() {
  const gameScreen = document.getElementById('screen-game');

  swapNextBtn?.addEventListener('click', () => {
    game?.swapNextPiece();
  });

  gameScreen.querySelectorAll('[data-action]').forEach((btn) => {
    const action = btn.dataset.action;

    if (action === 'down') {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        game?.handleAction('down');
      });
      btn.addEventListener('pointerup', () => game?.stopSoftDrop());
      btn.addEventListener('pointerleave', () => game?.stopSoftDrop());
      return;
    }

    btn.addEventListener('click', () => {
      game?.handleAction(action);
    });
  });
}

function startGame() {
  if (wordLibrary.length === 0) return;

  viewingPoemId = null;
  showScreen('game');
  gameOverlay.classList.add('hidden');

  if (game) game.stop();
  if (unbindGameFit) unbindGameFit();

  game = new Game(gameCanvas, wordLibrary);
  game.onUpdate = updateGameUI;
  game.onGameOver = () => {
    updateGameUI({ stats: game.getStats() });
    gameOverlay.classList.remove('hidden');
  };
  game.start();

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (unbindGameFit) unbindGameFit();
      const fit = fitCanvas(gameCanvas, lcdPlayWrap);
      game.setCanvasFit(fit);
      unbindGameFit = bindCanvasFit(gameCanvas, lcdPlayWrap, (f) => game?.setCanvasFit(f));
      updateNextPreview();
    });
  });
}

function enterEditMode() {
  if (!game) return;
  game.stop();
  if (unbindGameFit) {
    unbindGameFit();
    unbindGameFit = null;
  }

  viewingPoemId = null;
  showScreen('edit');
  editor = new Editor(editCanvas);
  editor.loadFromBoard(game.getLockedBlocks());
  editor.attach();

  if (unbindEditFit) unbindEditFit();
  unbindEditFit = bindCanvasFit(editCanvas, editPlayWrap, (fit) => editor?.setCanvasFit(fit));
}

function exportPoem() {
  if (editor) editor.exportImage();
}

function leaveEditScreen() {
  if (editor) editor.detach();
  if (unbindEditFit) {
    unbindEditFit();
    unbindEditFit = null;
  }
  if (viewingPoemId) {
    viewingPoemId = null;
    openCollection();
  } else {
    showScreen('setup');
  }
}

wordList.addEventListener('click', (e) => {
  const btn = e.target.closest('.remove');
  if (!btn) return;
  const idx = parseInt(btn.dataset.idx, 10);
  wordLibrary.splice(idx, 1);
  renderWordList();
});

addBlockBtn.addEventListener('click', addSingleBlock);
addBlockInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addSingleBlock();
});

clearWordsBtn.addEventListener('click', () => {
  if (wordLibrary.length && !confirm('清空停诗间所有诗块？')) return;
  clearWordLibrary();
});
restoreDefaultBtn.addEventListener('click', restoreDefaultLibrary);

fileUpload.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  handleFileUpload(file);
  fileUpload.value = '';
});

startBtn.addEventListener('click', startGame);
document.getElementById('collection-btn').addEventListener('click', openCollection);
document.getElementById('collection-back-btn').addEventListener('click', () => showScreen('setup'));

poemGrid.addEventListener('click', (e) => {
  const deleteBtn = e.target.closest('.poem-card-delete');
  if (deleteBtn) {
    e.stopPropagation();
    const card = deleteBtn.closest('.poem-card');
    if (card && confirm('从诗集中删除这首？')) {
      deletePoem(card.dataset.id);
      renderCollection();
      showToast('已删除');
    }
    return;
  }
  const card = e.target.closest('.poem-card');
  if (card) viewPoem(card.dataset.id);
});

document.getElementById('back-btn').addEventListener('click', () => {
  if (game) game.stop();
  if (unbindGameFit) {
    unbindGameFit();
    unbindGameFit = null;
  }
  showScreen('setup');
});

document.getElementById('enter-edit-btn').addEventListener('click', enterEditMode);
document.getElementById('edit-back-btn').addEventListener('click', leaveEditScreen);
document.getElementById('export-btn').addEventListener('click', exportPoem);
document.getElementById('save-poem-btn').addEventListener('click', saveCurrentPoem);
document.getElementById('save-poem-hint-btn').addEventListener('click', saveCurrentPoem);

document.getElementById('restart-btn').addEventListener('click', () => {
  if (editor) editor.detach();
  if (unbindEditFit) {
    unbindEditFit();
    unbindEditFit = null;
  }
  viewingPoemId = null;
  startGame();
});

renderWordList();
updatePoemBadge();
bindConsoleControls();

if (nextPreview) {
  new ResizeObserver(() => {
    if (game?.nextPiece?.phrase) fitNextPreviewText(game.nextPiece.phrase);
  }).observe(nextPreview);
}

if (savedWords !== null && savedWords.length > 0) {
  uploadStatus.textContent = '已恢复上次停诗间';
}
