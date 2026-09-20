import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './App.jsx';
import { clampPageIndex, findChapterIndex, normalizePageRatio } from './core.mjs';
import { fetchChapterPages } from './sources.js';

const RESTORE_LINE_RATIO = 0.35;
const PROGRESS_FLUSH_MS = 180;

const getScrollY = () => window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
const getToolbarLine = () => {
  const toolbar = document.querySelector('.reader-toolbar');
  const height = toolbar?.getBoundingClientRect().height || 0;
  return Math.max(height + 24, height + (window.innerHeight - height) * RESTORE_LINE_RATIO);
};
const roundRatio = value => Math.round(normalizePageRatio(value) * 10000) / 10000;

export default function Reader({ book, chapterId, history, onProgress }) {
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(Boolean(typeof document !== 'undefined' && document.fullscreenElement));
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [page, setPage] = useState(0);
  const [resumeState, setResumeState] = useState('active');
  const [resumeTarget, setResumeTarget] = useState(null);

  const bookKey = book.slug || book.id;
  const chapters = book.chapters || [];
  const currentIndex = findChapterIndex(chapters, chapterId);
  const currentChapter = currentIndex >= 0 ? chapters[currentIndex] : chapters[0] || { id: chapterId, title: `Chương ${chapterId}` };
  const targetChapterId = currentChapter?.id || chapterId;
  const chapKey = c => c?.slug || (c?.chapterNum ? `chuong-${c.chapterNum}` : c?.id);

  const pages = useRef([]);
  const progressCallback = useRef(onProgress);
  const mounted = useRef(true);
  const generation = useRef(0);
  const lastAnchor = useRef(null);
  const visiblePages = useRef(new Map());
  const restartAtTop = useRef(false);
  const flushTimer = useRef(null);
  const sampleFrame = useRef(null);
  const restoreCleanup = useRef(null);
  progressCallback.current = onProgress;

  const savedChapterMatches = history && (
    String(history.chapter) === String(targetChapterId) ||
    String(history.chapter) === String(currentChapter?.slug) ||
    String(history.chapter) === String(currentChapter?.chapterNum)
  );
  const historySnapshot = useRef(savedChapterMatches ? {
    page: Number.isInteger(history?.page) && history.page >= 0 ? history.page : 0,
    pageRatio: normalizePageRatio(history?.pageRatio)
  } : null);

  const emitProgress = useCallback((nextPage, nextRatio, immediate = false) => {
    const safePage = Number.isInteger(nextPage) && nextPage >= 0 ? nextPage : 0;
    const ratio = roundRatio(nextRatio);
    const anchor = `${targetChapterId}:${safePage}:${ratio}`;
    if (lastAnchor.current === anchor) return;
    lastAnchor.current = anchor;
    const send = () => progressCallback.current(book.id, targetChapterId, safePage, ratio, book.title, currentChapter.title);
    if (immediate) {
      if (flushTimer.current) clearTimeout(flushTimer.current);
      flushTimer.current = null;
      send();
    } else if (!flushTimer.current) {
      flushTimer.current = setTimeout(() => {
        flushTimer.current = null;
        send();
      }, PROGRESS_FLUSH_MS);
    }
  }, [book.id, book.title, currentChapter.title, targetChapterId]);

  const clearRestoreWork = useCallback(() => {
    restoreCleanup.current?.();
    restoreCleanup.current = null;
  }, []);

  const scrollToTop = useCallback(() => {
    clearRestoreWork();
    window.scrollTo({ top: 0, behavior: 'auto' });
    document.documentElement.scrollTo?.({ top: 0, behavior: 'auto' });
    document.body.scrollTo?.({ top: 0, behavior: 'auto' });
  }, [clearRestoreWork]);

  const toggleFullscreen = useCallback(() => {
    if (typeof document === 'undefined') return;
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
      clearRestoreWork();
      if (flushTimer.current) clearTimeout(flushTimer.current);
      if (sampleFrame.current) cancelAnimationFrame(sampleFrame.current);
    };
  }, [clearRestoreWork]);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = getScrollY();
      setShowScrollTop(scrollY > 400 || page > 0);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [page]);

  const prevChap = currentIndex > 0 ? chapters[currentIndex - 1] : null;
  const nextChap = currentIndex >= 0 && currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null;

  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowLeft' || e.key === '[') {
        if (prevChap) { e.preventDefault(); location.hash = `#/read/${bookKey}/${chapKey(prevChap)}`; }
      } else if (e.key === 'ArrowRight' || e.key === ']') {
        if (nextChap) { e.preventDefault(); location.hash = `#/read/${bookKey}/${chapKey(nextChap)}`; }
      } else if (e.key === 'Escape') {
        if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
        else { e.preventDefault(); location.hash = `#/book/${bookKey}`; }
      } else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleFullscreen(); }
      else if (e.key === 't' || e.key === 'T') { e.preventDefault(); scrollToTop(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [bookKey, nextChap, prevChap, scrollToTop, toggleFullscreen]);

  useEffect(() => {
    const currentGeneration = ++generation.current;
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setContent(null);
    setResumeState('active');
    setResumeTarget(null);
    pages.current = [];
    visiblePages.current.clear();
    lastAnchor.current = null;
    clearRestoreWork();

    fetchChapterPages(book, targetChapterId, { signal: controller.signal })
      .then(res => {
        if (!active || !mounted.current || currentGeneration !== generation.current) return;
        setContent(res);
        setLoading(false);
      })
      .catch(err => {
        if (!active || !mounted.current || currentGeneration !== generation.current || err?.name === 'AbortError') return;
        setError(err.message || 'Không thể tải nội dung chương');
        setLoading(false);
      });

    return () => { active = false; controller.abort(); };
  }, [book, targetChapterId, clearRestoreWork]);

  useEffect(() => {
    if (loading || !content) return;
    const total = content.images?.length || 0;
    const saved = historySnapshot.current;
    const safeSavedPage = clampPageIndex(saved?.page || 0, total);
    const hasMeaningfulResume = Boolean(saved && (safeSavedPage > 0 || saved.pageRatio > 0));
    setPage(hasMeaningfulResume ? 0 : safeSavedPage);
    setResumeTarget(hasMeaningfulResume ? { page: safeSavedPage, pageRatio: saved.pageRatio } : null);
    setResumeState(hasMeaningfulResume ? 'pending' : 'active');
    if (!hasMeaningfulResume) emitProgress(safeSavedPage, 0, true);
  }, [content, loading, emitProgress]);

  useEffect(() => {
    if (resumeState !== 'pending') return;
    const button = document.querySelector('.reader-resume button.primary');
    button?.focus();
  }, [resumeState]);

  const restorePosition = useCallback((target, token) => {
    clearRestoreWork();
    let cancelled = false;
    let frame;
    let resizeObserver;
    let timeout;
    let resolveRestore;
    const completed = new Promise(resolve => { resolveRestore = resolve; });
    const targetPage = clampPageIndex(target.page, content?.images?.length || 0);
    const figure = () => pages.current[targetPage];
    const finish = restored => {
      if (cancelled || !mounted.current || token !== generation.current) return;
      resolveRestore(restored);
    };
    const align = () => {
      if (cancelled || !mounted.current || token !== generation.current) return;
      const node = figure();
      const rect = node?.getBoundingClientRect();
      if (!node || !rect?.height) return;
      const absolute = rect.top + getScrollY() + target.pageRatio * rect.height - getToolbarLine();
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      window.scrollTo({ top: Math.max(0, Math.min(absolute, max)), behavior: 'auto' });
      setPage(targetPage);
      emitProgress(targetPage, target.pageRatio, true);
      finish(true);
    };
    const wait = () => {
      if (cancelled || !mounted.current || token !== generation.current) return;
      const node = figure();
      const img = node?.querySelector('img');
      if (!node || !img || !node.getBoundingClientRect().height) {
        frame = requestAnimationFrame(wait);
        return;
      }
      const ready = img.complete
        ? (img.decode ? img.decode().catch(() => {}) : Promise.resolve())
        : new Promise(resolve => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          });
      ready.then(() => {
        if (cancelled) return;
        frame = requestAnimationFrame(() => {
          align();
          resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(align) : null;
          resizeObserver?.observe(document.querySelector('.reader-pages'));
          timeout = setTimeout(() => { resizeObserver?.disconnect(); }, 900);
        });
      });
    };
    wait();
    restoreCleanup.current = () => {
      cancelled = true;
      if (frame) cancelAnimationFrame(frame);
      if (timeout) clearTimeout(timeout);
      resizeObserver?.disconnect();
      resolveRestore(false);
    };
    return completed;
  }, [clearRestoreWork, content, emitProgress]);

  const continueResume = () => {
    if (!resumeTarget) return;
    const token = generation.current;
    setResumeState('restoring');
    restorePosition(resumeTarget, token).then(restored => {
      if (restored && mounted.current && token === generation.current) setResumeState('active');
    });
  };

  const restartResume = () => {
    clearRestoreWork();
    restartAtTop.current = true;
    setResumeTarget(null);
    setResumeState('active');
    setPage(0);
    emitProgress(0, 0, true);
    scrollToTop();
  };

  useEffect(() => {
    if (loading || !content || resumeState !== 'active') return;
    const sample = () => {
      sampleFrame.current = null;
      if (restartAtTop.current && getScrollY() < 8) return;
      restartAtTop.current = false;
      const line = getToolbarLine();
      let best = null;
      for (const [node, entry] of visiblePages.current) {
        const rect = node.getBoundingClientRect();
        if (!rect.height || !entry.isIntersecting) continue;
        const distance = Math.abs(rect.top + rect.height / 2 - line);
        const overlap = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, line - 100));
        const score = overlap / rect.height;
        if (!best || score > best.score || (score === best.score && distance < best.distance)) {
          best = { index: Number(node.dataset.page), ratio: (line - rect.top) / rect.height, score, distance };
        }
      }
      if (best) {
        setPage(best.index);
        emitProgress(best.index, best.ratio, false);
      }
    };
    const schedule = () => {
      if (!sampleFrame.current) sampleFrame.current = requestAnimationFrame(sample);
    };
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => visiblePages.current.set(entry.target, entry));
      schedule();
    }, { rootMargin: '-15% 0px -35% 0px', threshold: [0.15, 0.5, 0.85] });
    pages.current.forEach(el => el && observer.observe(el));
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    const flush = () => {
      sample();
      if (flushTimer.current) { clearTimeout(flushTimer.current); flushTimer.current = null; }
    };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      observer.disconnect();
      visiblePages.current.clear();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flush);
      if (sampleFrame.current) cancelAnimationFrame(sampleFrame.current);
    };
  }, [content, loading, resumeState, emitProgress]);

  const totalPages = content?.images?.length || 0;
  const displayedPage = totalPages ? clampPageIndex(page, totalPages) : page;
  const percent = totalPages > 0 ? Math.round(((displayedPage + 1) / totalPages) * 100) : 0;

  return (
    <section className="reader">
      <div className="reader-toolbar">
        <a href={`#/book/${bookKey}`} className="back-link">← <span>{book.title}</span></a>
        <div className="reader-chapter-nav" role="navigation" aria-label="Điều hướng chương">
          <a href={prevChap ? `#/read/${bookKey}/${chapKey(prevChap)}` : undefined} className={`icon-button reader-nav-btn ${!prevChap ? 'is-disabled' : ''}`} aria-disabled={!prevChap ? 'true' : undefined} tabIndex={!prevChap ? -1 : undefined} aria-label={prevChap ? `Chương trước: ${prevChap.title}` : 'Không có chương trước'} title={prevChap ? `Chương trước: ${prevChap.title}` : 'Không có chương trước'} onClick={e => { if (!prevChap) e.preventDefault(); }}><Icon name="chevronLeft" size={16} /></a>
          <label className="reader-chapter-select-wrap"><span className="sr-only">Chọn chương</span><select value={currentChapter?.id || targetChapterId} onChange={e => { const selected = chapters.find(c => String(c.id) === e.target.value); location.hash = `#/read/${bookKey}/${chapKey(selected) || e.target.value}`; }} aria-label="Danh sách chương">{chapters.map((c, i) => <option key={c.id || i} value={c.id}>{c.title}{c.lang === 'en' ? ' [EN]' : ''}</option>)}</select></label>
          <a href={nextChap ? `#/read/${bookKey}/${chapKey(nextChap)}` : undefined} className={`icon-button reader-nav-btn ${!nextChap ? 'is-disabled' : ''}`} aria-disabled={!nextChap ? 'true' : undefined} tabIndex={!nextChap ? -1 : undefined} aria-label={nextChap ? `Chương tiếp theo: ${nextChap.title}` : 'Không có chương tiếp theo'} title={nextChap ? `Chương tiếp theo: ${nextChap.title}` : 'Không có chương tiếp theo'} onClick={e => { if (!nextChap) e.preventDefault(); }}><Icon name="chevronRight" size={16} /></a>
        </div>
        <div className="reader-toolbar-right"><button type="button" className="icon-button reader-fs-btn" onClick={toggleFullscreen} aria-label={isFullscreen ? 'Thoát toàn màn hình (Phím F)' : 'Toàn màn hình (Phím F)'} title={isFullscreen ? 'Thoát toàn màn hình (Phím F)' : 'Toàn màn hình (Phím F)'}><Icon name={isFullscreen ? 'minimize' : 'maximize'} size={18} /></button><div className="reader-progress"><span className="reader-page">Trang {displayedPage + 1} / {totalPages || '—'}{totalPages > 0 && <small className="reader-percent"> · {percent}%</small>}</span>{totalPages > 0 && <progress value={displayedPage + 1} max={totalPages} aria-label={`Tiến độ đọc: trang ${displayedPage + 1} trên ${totalPages}`} />}</div></div>
      </div>

      <div className="reader-heading"><p className="eyebrow">{book.title.toUpperCase()} · {currentChapter.title.toUpperCase()}{currentChapter?.lang === 'en' ? ' · BẢN EN' : ''}</p><h1>{currentChapter.title}{currentChapter?.lang === 'en' && <span className="chapter-badge-en reader-badge-inline">Bản EN</span>}</h1><p>Cuộn dọc để đọc truyện</p><div className="reader-shortcuts-hint" aria-label="Gợi ý phím tắt"><span><kbd>←</kbd> / <kbd>→</kbd> Đổi chương</span><span><kbd>F</kbd> Toàn màn hình</span><span><kbd>T</kbd> Lên đầu</span><span><kbd>Esc</kbd> Về truyện</span></div></div>

      {resumeState === 'pending' && resumeTarget && <div className="reader-resume" role="region" aria-labelledby="reader-resume-title"><div><p className="eyebrow">ĐỌC TIẾP</p><h2 id="reader-resume-title">Tiếp tục từ trang {resumeTarget.page + 1}?</h2><p>FuuManga đã lưu vị trí đọc gần nhất trong chương này.</p></div><div className="reader-resume-actions"><button type="button" className="button primary" onClick={continueResume}>Tiếp tục</button><button type="button" className="button" onClick={restartResume}>Bắt đầu lại</button></div></div>}
      {resumeState === 'restoring' && <div className="reader-resume" role="status" aria-live="polite" aria-busy="true"><p>Đang khôi phục vị trí đọc…</p></div>}

      {loading && <div className="empty reader-loading" role="status" aria-live="polite"><div className="spinner" aria-hidden="true"/><h2>Đang tải trang truyện…</h2><p>Đang chuẩn bị hình ảnh chất lượng cao từ máy chủ.</p></div>}
      {error && <div className="empty reader-error" role="alert"><Icon name="book" size={36}/><h2>Không thể tải chương này</h2><p>{error}</p><div className="reader-actions"><a href={`#/book/${bookKey}`} className="button">Về chi tiết truyện</a><button className="button primary" onClick={() => location.reload()}>Thử lại</button></div></div>}

      {!loading && !error && content && <div className="reader-pages">{content.images?.map((url, i) => <figure key={i} data-page={i} ref={el => { pages.current[i] = el; }} className="manga-page image-page"><img src={url} alt={`Trang ${i + 1} — ${book.title}`} loading={i === 0 || (resumeTarget && i === resumeTarget.page) ? 'eager' : 'lazy'} decoding="async" className="manga-img" onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} /><div className="art-fallback manga-img-fallback" style={{ display: 'none' }}><Icon name="book" size={32}/><span>Ảnh trang {i + 1} chưa tải được. Vui lòng thử tải lại trang.</span></div></figure>)}</div>}

      {!loading && !error && content && <div className="reader-bottom"><p className="eyebrow">{nextChap ? 'CÂU CHUYỆN VẪN CÒN TIẾP' : 'BẠN ĐÃ ĐỌC ĐẾN CHƯƠNG CUỐI'}</p><h2>{nextChap ? 'Thêm một chương nữa nhé?' : 'Khép lại chương truyện này.'}</h2><div className="reader-navigation">{prevChap ? <a className="button reader-handoff" href={`#/read/${bookKey}/${chapKey(prevChap)}`} aria-label={`Chương trước: ${prevChap.title}`}><span>← {prevChap.title}</span></a> : <button className="button" disabled>← Chương trước</button>}{nextChap ? <a className="button primary reader-handoff" href={`#/read/${bookKey}/${chapKey(nextChap)}`} aria-label={`Chương tiếp: ${nextChap.title}`}><span>Tiếp: {nextChap.title}</span> <Icon name="arrow"/></a> : <a className="button primary reader-handoff" href={`#/book/${bookKey}`} aria-label={`Về trang truyện ${book.title}`}><span>Về {book.title}</span> <Icon name="book"/></a>}</div></div>}
      {showScrollTop && <button type="button" className="reader-scroll-top" onClick={scrollToTop} aria-label="Cuộn lên đầu trang (Phím T)" title="Cuộn lên đầu trang (Phím T)"><Icon name="arrowUp" size={16}/><span>Lên đầu (T)</span></button>}
    </section>
  );
}
