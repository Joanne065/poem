const KEYS = {
  WORDS: 'fangkuai-shi-words',
  POEMS: 'fangkuai-shi-poems',
};

const MAX_POEMS = 48;

/** @returns {string[]|null} */
export function loadWordLibrary() {
  try {
    const raw = localStorage.getItem(KEYS.WORDS);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((w) => typeof w === 'string' && w.trim());
  } catch {
    return null;
  }
}

/** @param {string[]} words */
export function saveWordLibrary(words) {
  try {
    localStorage.setItem(KEYS.WORDS, JSON.stringify(words));
    return true;
  } catch (err) {
    console.warn('句库保存失败', err);
    return false;
  }
}

/** @returns {Array<{id, createdAt, blocks}>} */
export function loadPoems() {
  try {
    const raw = localStorage.getItem(KEYS.POEMS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** @param {object} poem */
export function savePoem(poem) {
  const poems = loadPoems();
  poems.unshift({
    id: poem.id || crypto.randomUUID(),
    createdAt: poem.createdAt || Date.now(),
    blocks: poem.blocks,
  });
  const trimmed = poems.slice(0, MAX_POEMS);
  try {
    localStorage.setItem(KEYS.POEMS, JSON.stringify(trimmed));
    return { ok: true, poems: trimmed };
  } catch (err) {
    console.warn('诗集保存失败', err);
    return { ok: false, error: err };
  }
}

/** @param {string} id */
export function deletePoem(id) {
  const poems = loadPoems().filter((p) => p.id !== id);
  localStorage.setItem(KEYS.POEMS, JSON.stringify(poems));
  return poems;
}

export function formatPoemDate(ts) {
  const d = new Date(ts);
  return d.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
