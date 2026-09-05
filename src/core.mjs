export const KEY = 'fuumanga.v1';
export const normalize = value => String(value).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();

export function filterBooks(books, query, genre) {
  return books.filter(b => normalize(b.title).includes(normalize(query)) && (genre === 'Tất cả' || (b.genres && b.genres.includes(genre))));
}

export function parseRoute(hash, books = []) {
  try {
    const parts = decodeURIComponent(hash.replace(/^#\/?/, '')).split('/');
    if (!parts[0]) return { page: 'home' };
    if (parts[0] === 'library' && parts.length === 1) return { page: 'library' };

    const id = parts[1];
    if (parts[0] === 'book' && id && parts.length === 2) {
      const book = books.find(b => b.id === id || `fuu-${b.id}` === id || b.rawId === id);
      if (book) return { page: 'detail', book, bookId: book.id };
      if (/^(md-[a-f0-9-]+|ot-[a-z0-9-]+|fuu-[a-z0-9-]+)$/.test(id)) {
        return { page: 'detail', bookId: id };
      }
    }

    const chapterParam = parts[2];
    if (parts[0] === 'read' && id && chapterParam && parts.length === 3) {
      const book = books.find(b => b.id === id || `fuu-${b.id}` === id || b.rawId === id);
      if (book) {
        const chapterNum = Number(chapterParam);
        if (/^\d+$/.test(chapterParam) && chapterNum >= 1 && chapterNum <= (book.chapters?.length || 0)) {
          return { page: 'reader', book, chapter: chapterNum, bookId: book.id, chapterId: String(chapterNum) };
        }
        return { page: 'notFound' };
      }
      if (/^(md-[a-f0-9-]+|ot-[a-z0-9-]+|fuu-[a-z0-9-]+)$/.test(id)) {
        return { page: 'reader', bookId: id, chapterId: chapterParam, chapter: Number(chapterParam) || 1 };
      }
    }
  } catch {}
  return { page: 'notFound' };
}

export const chapterTarget = (current, delta, total) => current + delta >= 1 && current + delta <= total ? current + delta : null;

export function validateState(value, books = []) {
  const clean = { saved: [], history: {}, theme: 'dark' };
  if (!value || typeof value !== 'object') return clean;
  clean.theme = value.theme === 'light' ? 'light' : 'dark';

  const isIdValid = id => books.some(b => b.id === id || `fuu-${b.id}` === id || b.rawId === id) ||
    /^(md-[a-f0-9-]+|ot-[a-z0-9-]+|fuu-[a-z0-9-]+)$/.test(id);

  if (Array.isArray(value.saved)) {
    clean.saved = [...new Set(value.saved.filter(isIdValid))];
  }

  if (value.history && typeof value.history === 'object') {
    for (const [id, h] of Object.entries(value.history)) {
      if (!isIdValid(id)) continue;
      const book = books.find(b => b.id === id || `fuu-${b.id}` === id || b.rawId === id);
      if (book) {
        const panels = book.chapters?.[h.chapter - 1]?.panels;
        if (h && Number.isInteger(h.chapter) && h.chapter >= 1 && h.chapter <= (book.chapters?.length || 0) &&
            Number.isInteger(h.page) && h.page >= 0 && (!panels || h.page < panels.length) && Number.isFinite(h.at)) {
          clean.history[id] = { chapter: h.chapter, page: h.page, at: h.at };
        }
      } else if (h && Number.isFinite(h.at)) {
        clean.history[id] = { chapter: h.chapter, page: h.page || 0, at: h.at };
      }
    }
  }
  return clean;
}

export function loadState(storage, books = []) {
  try { return { state: validateState(JSON.parse(storage.getItem(KEY)), books), error: false }; }
  catch { return { state: validateState(null, books), error: true }; }
}

export function saveState(storage, state) {
  try { storage.setItem(KEY, JSON.stringify(state)); return true; }
  catch { return false; }
}
