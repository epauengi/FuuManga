import React, { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { filterBooks, loadState, orderChapters, parseRoute, saveState } from './core.mjs';
import Reader from './Reader.jsx';
import { DEFAULT_GENRES, fetchBook, fetchCatalog } from './sources.js';

export function Icon({ name, size = 20 }) {
  const paths = {
    search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    arrow: 'M4 12h16m-6-6 6 6-6 6',
    bookmark: 'M6 3h12v18l-6-4-6 4V3Z',
    sun: 'M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    moon: 'M20 15A9 9 0 0 1 9 3a9 9 0 1 0 11 12Z',
    book: 'M12 5v16M3 3c4 0 6 0 9 2 3-2 5-2 9-2v16c-4 0-6 0-9 2-3-2-5-2-9-2V3Z',
    chevron: 'm9 5 7 7-7 7',
    close: 'm6 6 12 12M6 18 18 6',
    check: 'm5 12 4 4L19 6',
    sparkles: 'm12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z',
    globe: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 0c2.5 3 4 6.5 4 10s-1.5 7-4 10m0-20c-2.5 3-4 6.5-4 10s1.5 7 4 10M2 12h20',
    maximize: 'M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3',
    minimize: 'M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3',
    arrowUp: 'M12 19V5m-7 7 7-7 7 7',
    arrowDown: 'M12 5v14m7-7-7 7-7-7'
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name] || paths.book}/>
    </svg>
  );
}

export function Artwork({ src, alt, className = '', eager = false }) {
  const [failed, setFailed] = useState(false);
  return failed || !src ? (
    <div className={`art-fallback ${className}`} role="img" aria-label={alt}>
      <Icon name="book" size={42}/>
      <span>Chưa có ảnh bìa</span>
    </div>
  ) : (
    <img
      className={className}
      src={src}
      alt={alt}
      width="600"
      height="840"
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

function Card({ book, index }) {
  const number = String(index + 1).padStart(2, '0');

  return (
    <article className="book-card">
      <h3 className="book-card-title">
        <a className="catalog-entry" href={`#/book/${book.id}`} aria-label={`Xem ${book.title}`}>
          <span className="entry-media">
            <Artwork src={book.cover} alt={`Bìa ${book.title}`} />
          </span>
          <span className="entry-record">
            <span className="entry-topline">
              <span className="entry-index">{number}</span>
              <span className={`availability ${book.chaptersCount?.includes('Đọc ngay') ? 'ready' : ''}`}>
                {book.chaptersCount || 'Kho truyện'}
              </span>
            </span>
            <span className="card-genre">{(book.genres || []).join(' · ')}</span>
            <span className="entry-title">{book.title}</span>
            <span className="card-author">{book.author}</span>
          </span>
          <span className="entry-arrow"><Icon name="arrow" /></span>
        </a>
      </h3>
    </article>
  );
}

function CatalogSkeleton() {
  return (
    <div className="catalog-skeleton" aria-busy="true" aria-live="polite">
      <span className="sr-only">Đang tải danh mục truyện…</span>
      {[0, 1, 2, 3, 4].map(index => <div className="skeleton-entry" key={index} aria-hidden="true" />)}
    </div>
  );
}

function Empty({ library, clear }) {
  return (
    <div className="empty">
      <Icon name={library ? 'bookmark' : 'search'} size={36} />
      <h2>{library ? 'Kệ sách đang chờ bạn' : 'Chưa tìm thấy câu chuyện này'}</h2>
      <p>{library ? 'Lưu một truyện yêu thích từ kho truyện. Lần sau, gặp lại ngay ở đây.' : 'Thử đổi thể loại hoặc bỏ bớt từ khóa tìm kiếm nhé.'}</p>
      {library ? (
        <a className="button primary" href="#/">Khám phá truyện <Icon name="arrow" /></a>
      ) : (
        <button className="button" onClick={clear}>Xóa bộ lọc</button>
      )}
    </div>
  );
}

function LoadError({ title, message, retry, home }) {
  return (
    <div className="empty" role="alert">
      <Icon name="book" size={36} />
      <h2>{title}</h2>
      <p>{message}</p>
      <div className="reader-actions">
        {home && <a href="#/" className="button">Về trang chủ</a>}
        <button className="button primary" onClick={retry}>Thử lại</button>
      </div>
    </div>
  );
}

export default function App() {
  const [initial] = useState(() => {
    try { return loadState(window.localStorage, []); }
    catch { return loadState(null, []); }
  });

  const [state, setState] = useState(initial.state);
  const [storageError, setStorageError] = useState(initial.error);
  const [route, setRoute] = useState(() => parseRoute(location.hash, []));
  const [query, setQuery] = useState('');
  const [genre, setGenre] = useState('Tất cả');
  const [chapterOrder, setChapterOrder] = useState('oldest');
  const [notice, setNotice] = useState('');

  // Catalog state: snapshot chứa danh sách, phân trang và trạng thái
  const [catalogState, setCatalogState] = useState({
    items: [],
    total: 0,
    nextOffset: null,
    phase: 'loading', // 'idle' | 'loading' | 'loadingMore' | 'error' | 'errorMore'
    error: '',
    reachedLimit: false
  });
  const [catalogRetry, setCatalogRetry] = useState(0);

  // Generation ref quản lý token hủy request cũ tránh race condition
  const catalogSessionRef = useRef(0);
  const catalogLoadingMoreRef = useRef(false);

  // Detail & reader state
  const [activeBook, setActiveBook] = useState(null);
  const [loadingBook, setLoadingBook] = useState(false);
  const [bookError, setBookError] = useState('');
  const [bookRetry, setBookRetry] = useState(0);

  const main = useRef(null);

  // Routing hashchange
  useEffect(() => {
    function change() {
      const parsed = parseRoute(location.hash, []);
      setRoute(parsed);
      window.scrollTo(0, 0);
      requestAnimationFrame(() => main.current?.focus({ preventScroll: true }));
    }
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);

  // Fetch catalog on search or genre change
  useEffect(() => {
    const session = ++catalogSessionRef.current;
    catalogLoadingMoreRef.current = false;

    setCatalogState(prev => ({
      ...prev,
      items: [],
      nextOffset: null,
      phase: 'loading',
      error: '',
      reachedLimit: false
    }));

    const timeout = setTimeout(() => {
      fetchCatalog({ query, genre, offset: 0 })
        .then(res => {
          if (catalogSessionRef.current !== session) return;
          setCatalogState({
            items: res.items,
            total: res.total,
            nextOffset: res.nextOffset,
            phase: 'idle',
            error: '',
            reachedLimit: Boolean(res.reachedLimit)
          });
        })
        .catch(error => {
          if (catalogSessionRef.current !== session) return;
          setCatalogState({
            items: [],
            total: 0,
            nextOffset: null,
            phase: 'error',
            error: error.message || 'Không thể tải kho truyện. Vui lòng thử lại.',
            reachedLimit: false
          });
        });
    }, 250);

    return () => {
      clearTimeout(timeout);
    };
  }, [query, genre, catalogRetry]);

  const loadMore = useCallback(() => {
    if (
      catalogLoadingMoreRef.current ||
      catalogState.nextOffset == null ||
      catalogState.phase === 'loading' ||
      catalogState.phase === 'loadingMore'
    ) {
      return;
    }

    catalogLoadingMoreRef.current = true;
    const session = catalogSessionRef.current;
    const offsetToLoad = catalogState.nextOffset;

    setCatalogState(prev => ({
      ...prev,
      phase: 'loadingMore',
      error: ''
    }));

    fetchCatalog({ query, genre, offset: offsetToLoad })
      .then(res => {
        if (catalogSessionRef.current !== session) return;
        catalogLoadingMoreRef.current = false;

        setCatalogState(prev => {
          const existingIds = new Set(prev.items.map(b => b.id));
          const fresh = res.items.filter(b => !existingIds.has(b.id));
          return {
            items: [...prev.items, ...fresh],
            total: res.total,
            nextOffset: res.nextOffset,
            phase: 'idle',
            error: '',
            reachedLimit: Boolean(res.reachedLimit)
          };
        });
      })
      .catch(error => {
        if (catalogSessionRef.current !== session) return;
        catalogLoadingMoreRef.current = false;

        setCatalogState(prev => ({
          ...prev,
          phase: 'errorMore',
          error: error.message || 'Không thể tải thêm truyện. Vui lòng thử lại.'
        }));
      });
  }, [catalogState.nextOffset, catalogState.phase, query, genre]);

  // Load full book detail when visiting detail or reader route
  useEffect(() => {
    let active = true;
    const targetId = route.bookId || route.book?.id;

    if ((route.page === 'detail' || route.page === 'reader') && targetId) {
      setLoadingBook(true);
      setActiveBook(null);
      setBookError('');
      fetchBook(targetId)
        .then(book => {
          if (!active) return;
          setActiveBook(book);
          setLoadingBook(false);
        })
        .catch(error => {
          if (!active) return;
          setBookError(error.message || 'Không thể tải dữ liệu truyện. Vui lòng thử lại.');
          setLoadingBook(false);
        });
    } else {
      setActiveBook(null);
      setBookError('');
      setLoadingBook(false);
    }

    return () => { active = false; };
  }, [route.page, route.bookId, route.book, bookRetry]);

  // Theme & local storage
  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
    try {
      if (!saveState(window.localStorage, state)) setStorageError(true);
    } catch {
      setStorageError(true);
    }
  }, [state]);

  // Document title
  useEffect(() => {
    const bookTitle = activeBook?.title;
    document.title = `${bookTitle || (route.page === 'library' ? 'Thư viện của bạn' : 'Kho truyện tiếng Việt trực tuyến')} — FuuManga`;
  }, [route, activeBook]);

  const themeButtonRef = useRef(null);
  const isThemeTransitioning = useRef(false);

  // ponytail: View Transition Wave Ripple; fall back to instant theme toggle when API unavailable or reduced-motion set.
  const toggleTheme = useCallback(async () => {
    const nextTheme = state.theme === 'dark' ? 'light' : 'dark';

    if (
      !document.startViewTransition ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      document.documentElement.dataset.theme = nextTheme;
      setState(s => ({ ...s, theme: nextTheme }));
      return;
    }

    if (isThemeTransitioning.current) return;
    isThemeTransitioning.current = true;

    const btn = themeButtonRef.current;
    const rect = btn?.getBoundingClientRect();
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const y = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    const maxRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    try {
      const transition = document.startViewTransition(() => {
        flushSync(() => {
          document.documentElement.dataset.theme = nextTheme;
          setState(s => ({ ...s, theme: nextTheme }));
        });
      });
      transition.finished.catch(() => {});

      await transition.ready;

      const animation = document.documentElement.animate(
        {
          clipPath: [
            `circle(0% at ${x}px ${y}px)`,
            `circle(${maxRadius}px at ${x}px ${y}px)`
          ]
        },
        {
          duration: 950,
          easing: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
          pseudoElement: '::view-transition-new(root)'
        }
      );

      await animation.finished;
    } catch {
      // Transition interrupted or aborted
    } finally {
      isThemeTransitioning.current = false;
    }
  }, [state.theme]);

  // Notice auto hide
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(''), 2500);
    return () => clearTimeout(id);
  }, [notice]);

  function toggleSaved(book) {
    const has = state.saved.includes(book.id);
    setState(s => ({
      ...s,
      saved: has ? s.saved.filter(id => id !== book.id) : [...s.saved, book.id]
    }));
    setNotice(has ? 'Đã bỏ lưu truyện' : 'Đã thêm vào thư viện');
  }

  function progress(id, chapter, page, bookTitle, chapterTitle) {
    setState(s => ({
      ...s,
      history: {
        ...s.history,
        [id]: {
          chapter,
          page,
          bookTitle: bookTitle || s.history[id]?.bookTitle || '',
          chapterTitle: chapterTitle || s.history[id]?.chapterTitle || '',
          at: Date.now()
        }
      }
    }));
  }

  const recent = Object.entries(state.history).sort((a, b) => b[1].at - a[1].at)[0];
  const featured = catalogState.items[0];
  const activeHistory = activeBook ? state.history[activeBook.id] : null;
  const resumeChapter = activeBook?.chapters?.find(chapter => String(chapter.id) === String(activeHistory?.chapter));
  const resumePage = Number.isInteger(activeHistory?.page) && activeHistory.page >= 0 ? activeHistory.page + 1 : null;
  const displayChapters = orderChapters(activeBook?.chapters, chapterOrder);

  const clear = () => {
    setQuery('');
    setGenre('Tất cả');
  };

  const currentDisplayList = route.page === 'library'
    ? catalogState.items.filter(b => state.saved.includes(b.id))
    : catalogState.items;

  return (
    <>
      <a className="skip-link" href="#main" onClick={e => { e.preventDefault(); main.current?.focus(); }}>
        Đến nội dung chính
      </a>

      <header className="site-header">
        <a href="#/" className="brand" aria-label="FuuManga — Trang chủ">
          <span className="brand-mark"><Icon name="book" size={23} /></span>
          fuu<span>manga</span>
          <span className="brand-dot">.</span>
        </a>

        <nav aria-label="Điều hướng chính">
          <a href="#/" className={route.page === 'home' ? 'active' : ''} aria-current={route.page === 'home' ? 'page' : undefined}>
            Khám phá
          </a>
          <a href="#/library" className={route.page === 'library' ? 'active' : ''} aria-current={route.page === 'library' ? 'page' : undefined}>
            <Icon name="bookmark" size={17} />
            Thư viện
            {state.saved.length > 0 && <span className="count">{state.saved.length}</span>}
          </a>
        </nav>

        <div className="header-end">
          <span className="header-note">Tủ truyện Fuu</span>
          <button
            ref={themeButtonRef}
            className="icon-button theme-toggle"
            aria-label={state.theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
            onClick={toggleTheme}
          >
            <Icon name={state.theme === 'dark' ? 'sun' : 'moon'} />
          </button>
        </div>
      </header>

      {storageError && (
        <div className="storage-warning" role="status">
          Không thể lưu trên thiết bị. Thư viện và tiến độ chỉ được giữ trong phiên này.
        </div>
      )}

      <main id="main" className={`page page--${route.page}`} ref={main} tabIndex="-1">
        {route.page === 'home' && (
          <>
            <section className="hero">
              <div className="hero-copy">
                <p className="eyebrow"><span /> MỤC LỤC SỐ FUU</p>
                <h1>Lật một trang.<br />Mở <em>ngàn thế giới.</em></h1>
                <p className="hero-description">
                  Bản dịch tiếng Việt từ MangaDex. Đọc trên web, lưu tiến độ và giữ riêng thư viện của bạn trên thiết bị này.
                </p>
                <div className="hero-actions">
                  <a
                    className="button primary"
                    href="#catalog-heading"
                    onClick={event => {
                      event.preventDefault();
                      document.getElementById('catalog-heading')?.scrollIntoView({ block: 'start' });
                    }}
                  >
                    <Icon name="search" />Mở mục lục <Icon name="arrow" size={18} />
                  </a>
                </div>
                <p className="hero-foot">Một kho truyện. Một nơi để quay lại đúng trang đang đọc.</p>
              </div>

              <div className={`featured-record ${featured ? 'is-ready' : catalogState.phase === 'loading' ? 'is-loading' : ''}`}>
                {featured ? (
                  <a href={`#/book/${featured.id}`} className="featured-link">
                    <span className="featured-media"><Artwork src={featured.cover} alt={`Bìa ${featured.title}`} eager /></span>
                    <span className="featured-copy">
                      <span className="featured-index">Mục 01 <i>Truyện mới</i></span>
                      <strong>{featured.title}</strong>
                      <span className="featured-genre">{(featured.genres || []).slice(0, 2).join(' · ') || 'MangaDex'}</span>
                      <span className="featured-author">{featured.author || 'Đang cập nhật tác giả'}</span>
                      <span className="featured-open">Mở truyện <Icon name="arrow" /></span>
                    </span>
                  </a>
                ) : (
                  <div className="featured-placeholder" aria-hidden="true">
                    <span /><span /><span /><span />
                  </div>
                )}
              </div>
            </section>

            <div className="index-rail" aria-label="Thông tin FuuManga">
              <span>MANGADEX · BẢN DỊCH TIẾNG VIỆT</span>
              <span>TIẾN ĐỘ LƯU TRÊN THIẾT BỊ</span>
              <span>{catalogState.phase === 'loading' ? 'ĐANG LẬP MỤC…' : `${catalogState.items.length} TỰA TRUYỆN`}</span>
            </div>

            {recent && (
              <section className="continue-section">
                <div>
                  <p className="eyebrow">CÂU CHUYỆN CÒN DỞ</p>
                  <h2>Trở lại nơi bạn dừng</h2>
                </div>
                <a className="continue-card" href={`#/read/${recent[0]}/${recent[1].chapter}`}>
                  <span className="continue-badge"><Icon name="book" size={16} /></span>
                  <span>
                    <strong>{recent[1].bookTitle || 'Truyện đang đọc'}</strong>
                    <small>{recent[1].chapterTitle || `Chương ${recent[1].chapter}`} · Trang {recent[1].page + 1}</small>
                  </span>
                  <span className="text-link">Đọc tiếp <Icon name="arrow" /></span>
                </a>
              </section>
            )}
          </>
        )}

        {(route.page === 'home' || route.page === 'library') && (
          <section className={`catalog catalog--${route.page}`} id="catalog-heading" aria-labelledby="catalog-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{route.page === 'library' ? 'GÓC RIÊNG CỦA BẠN' : 'CHỌN MỘT CÂU CHUYỆN'}</p>
                <h2 id="catalog-title">
                  {route.page === 'library' ? 'Thư viện của bạn' : 'Hôm nay, đọc gì?'}
                  {route.page === 'library' && <span className="heading-dot">.</span>}
                </h2>
              </div>

              <label className="search-box">
                <Icon name="search" />
                <input
                  type="search"
                  name="search"
                  autoComplete="off"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Tìm truyện theo tên…"
                  aria-label="Tìm truyện theo tên"
                />
                {query && (
                  <button aria-label="Xóa tìm kiếm" onClick={() => setQuery('')}>
                    <Icon name="close" size={17} />
                  </button>
                )}
                <span className="search-hint" aria-hidden="true">⌕</span>
              </label>
            </div>

            <div className="filter-row">
              <div className="filters" role="group" aria-label="Lọc thể loại">
                {DEFAULT_GENRES.map(g => (
                  <button
                    key={g}
                    aria-pressed={genre === g}
                    className={genre === g ? 'selected' : ''}
                    onClick={() => {
                      if (genre !== g) setGenre(g);
                    }}
                  >
                    {g}
                  </button>
                ))}
              </div>
              <span className="result-count" role="status">
                {route.page === 'library' ? (
                  `${currentDisplayList.length} câu chuyện trong thư viện`
                ) : catalogState.phase === 'loading' ? (
                  'Đang tìm kiếm…'
                ) : catalogState.total > 0 && catalogState.total < catalogState.items.length ? (
                  `Đã tải ${catalogState.items.length} truyện · MangaDex hiện báo ${catalogState.total} kết quả`
                ) : catalogState.total > 0 ? (
                  `Đang hiển thị ${catalogState.items.length} / ${catalogState.total} truyện`
                ) : (
                  `${catalogState.items.length} câu chuyện`
                )}
              </span>
            </div>

            {route.page !== 'library' && catalogState.phase === 'loading' ? (
              <CatalogSkeleton />
            ) : route.page !== 'library' && catalogState.phase === 'error' ? (
              <LoadError
                title="Không thể tải kho truyện"
                message={catalogState.error}
                retry={() => setCatalogRetry(attempt => attempt + 1)}
              />
            ) : currentDisplayList.length ? (
              <>
                <div className="book-grid">
                  {currentDisplayList.map((book, index) => (
                    <Card key={book.id} book={book} index={index} />
                  ))}
                </div>

                {route.page === 'home' && (
                  <div className="catalog-load-more" role="region" aria-label="Tải thêm truyện">
                    {catalogState.phase === 'loadingMore' ? (
                      <button type="button" className="button load-more-btn" disabled>
                        <span className="spinner-inline" aria-hidden="true" />
                        <span>Đang tải thêm truyện…</span>
                      </button>
                    ) : catalogState.phase === 'errorMore' ? (
                      <div className="load-more-error">
                        <p>{catalogState.error}</p>
                        <button type="button" className="button" onClick={loadMore}>
                          Thử tải lại
                        </button>
                      </div>
                    ) : catalogState.nextOffset != null ? (
                      <button type="button" className="button load-more-btn" onClick={loadMore}>
                        <span>Tải thêm 18 truyện</span>
                        <Icon name="arrowDown" size={16} />
                      </button>
                    ) : catalogState.reachedLimit ? (
                      <p className="load-more-end">
                        Đã đạt giới hạn 10.000 kết quả từ nguồn MangaDex. Vui lòng nhập từ khóa cụ thể hơn.
                      </p>
                    ) : catalogState.items.length > 0 ? (
                      <p className="load-more-end">Đã hiển thị toàn bộ kết quả phù hợp.</p>
                    ) : null}
                  </div>
                )}
              </>
            ) : (
              <Empty library={route.page === 'library' && !state.saved.length} clear={clear} />
            )}

            <p className="demo-note">
              <span /> Kho truyện trực tuyến. Thư viện và tiến độ đọc được lưu trên trình duyệt của bạn.
            </p>
          </section>
        )}

        {route.page === 'detail' && (
          <section className="detail">
            <a className="back-link" href="#/">← Trở về khám phá</a>

            {loadingBook ? (
              <div className="empty">
                <div className="spinner" aria-hidden="true" />
                <p>Đang tải thông tin chi tiết truyện…</p>
              </div>
            ) : bookError ? (
              <LoadError
                title="Không thể tải truyện này"
                message={bookError}
                retry={() => setBookRetry(attempt => attempt + 1)}
                home
              />
            ) : activeBook ? (
              <div className="detail-grid">
                <div className="detail-cover">
                  <Artwork src={activeBook.cover} alt={`Bìa ${activeBook.title}`} eager />
                </div>

                <div className="detail-copy">
                  <p className="eyebrow">BẢN DỊCH TIẾNG VIỆT</p>
                  <h1>{activeBook.title}</h1>
                  <p className="detail-subtitle">{activeBook.subtitle}</p>
                  <p className="card-author">Tác giả · {activeBook.author}</p>

                  <div className="tags">
                    {(activeBook.genres || []).map(g => <span key={g}>{g}</span>)}
                  </div>

                  {activeBook.warning && (
                    <div className="warning-banner" role="alert">
                      <Icon name="sparkles" size={16} />
                      <span>{activeBook.warning}</span>
                    </div>
                  )}

                  <p className="synopsis">{activeBook.description}</p>

                  {resumeChapter && resumePage !== null && (
                    <p className="resume-record">
                      <span>Tiếp tục</span>
                      {resumeChapter.title} · Trang {resumePage}
                    </p>
                  )}

                  <div className="detail-actions">
                    {activeBook.chapters?.length > 0 && (
                      <a
                        className="button primary"
                        href={`#/read/${activeBook.id}/${resumeChapter?.id || activeBook.chapters[0].id}`}
                      >
                        <Icon name="book" />
                        {resumeChapter ? 'Đọc tiếp' : 'Bắt đầu đọc'}
                        <Icon name="arrow" />
                      </a>
                    )}
                    <button
                      className="button"
                      aria-pressed={state.saved.includes(activeBook.id)}
                      onClick={() => toggleSaved(activeBook)}
                    >
                      <Icon name={state.saved.includes(activeBook.id) ? 'check' : 'bookmark'} />
                      {state.saved.includes(activeBook.id) ? 'Đã lưu truyện' : 'Lưu vào thư viện'}
                    </button>
                  </div>

                  <div className="chapter-heading">
                    <div>
                      <h2>{activeBook.chapters?.length ? 'Danh sách chương' : 'Chưa có danh sách chương'}</h2>
                      <span>{activeBook.chapters?.length || 0} chương</span>
                    </div>
                    {activeBook.chapters?.length > 0 && (
                      <label className="chapter-tools">
                        <span>Thứ tự chương</span>
                        <select value={chapterOrder} onChange={event => setChapterOrder(event.target.value)}>
                          <option value="oldest">Cũ nhất trước</option>
                          <option value="newest">Mới nhất trước</option>
                        </select>
                      </label>
                    )}
                  </div>

                  {activeBook.chapters?.length ? (
                    <ol className="chapter-list">
                      {displayChapters.map((c, i) => {
                        const isResume = resumeChapter && String(c.id) === String(resumeChapter.id);
                        return (
                          <li key={c.id || i} className={isResume ? 'is-resume' : ''}>
                            <a href={`#/read/${activeBook.id}/${c.id}`}>
                              <span className="chapter-number">{String(c.chapterNum).padStart(2, '0')}</span>
                              <span className="chapter-copy">
                                <span>{c.title}</span>
                                {isResume && resumePage !== null && <small>Đang đọc · Trang {resumePage}</small>}
                              </span>
                              <Icon name="arrow" />
                            </a>
                          </li>
                        );
                      })}
                    </ol>
                  ) : (
                    <p className="coming-soon">Hiện chưa thể tải danh sách chương từ máy chủ này.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="empty">
                <h2>Không tìm thấy câu chuyện này</h2>
                <a href="#/" className="button primary">Quay lại danh sách</a>
              </div>
            )}
          </section>
        )}

        {route.page === 'reader' && (
          loadingBook ? (
            <div className="empty reader-loading">
              <div className="spinner" aria-hidden="true" />
              <p>Đang chuẩn bị dữ liệu truyện…</p>
            </div>
          ) : bookError ? (
            <LoadError
              title="Không thể tải dữ liệu chương truyện"
              message={bookError}
              retry={() => setBookRetry(attempt => attempt + 1)}
              home
            />
          ) : activeBook ? (
            <Reader
              key={`${activeBook.id}-${route.chapterId || route.chapter}`}
              book={activeBook}
              chapterId={route.chapterId || String(route.chapter)}
              history={state.history[activeBook.id]}
              onProgress={progress}
            />
          ) : (
            <div className="empty">
              <h2>Không tải được dữ liệu chương truyện</h2>
              <a href="#/" className="button primary">Về trang chủ</a>
            </div>
          )
        )}

        {route.page === 'notFound' && (
          <div className="empty">
            <p className="eyebrow">TRANG NÀY ĐÃ ĐI LẠC</p>
            <h1>Chưa có câu chuyện ở đây.</h1>
            <p>Đường dẫn hoặc chương truyện không hợp lệ.</p>
            <a href="#/" className="button primary">Trở về khám phá <Icon name="arrow" /></a>
          </div>
        )}
      </main>

      <footer>
        <a href="#/" className="brand">
          fuu<span>manga</span>
          <span className="brand-dot">.</span>
        </a>
        <p>Kho truyện đọc tiếng Việt trực tuyến tuyển chọn.</p>
        <span>FuuManga · Tự do khám phá thế giới truyện tranh</span>
      </footer>
      <div className={`toast ${notice ? 'visible' : ''}`} role="status">
        {notice && <><Icon name="check" />{notice}</>}
      </div>
    </>
  );
}
