import React, { useEffect, useRef, useState } from 'react';
import { filterBooks, loadState, parseRoute, saveState } from './core.mjs';
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
    globe: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 0c2.5 3 4 6.5 4 10s-1.5 7-4 10m0-20c-2.5 3-4 6.5-4 10s1.5 7 4 10M2 12h20'
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

function Card({ book }) {
  return (
    <article className="book-card">
      <a className="cover-link" href={`#/book/${book.id}`} aria-label={`Xem ${book.title}`}>
        <Artwork src={book.cover} alt={`Bìa ${book.title}`} />
        <span className="cover-shade" />
        <span className="cover-title" style={{ color: book.color }}>{book.title}</span>
        <span className={`availability ${book.chaptersCount?.includes('Đọc ngay') ? 'ready' : ''}`}>
          {book.chaptersCount || 'Kho truyện'}
        </span>
        <span className="cover-open"><Icon name="arrow" /></span>
      </a>
      <p className="card-genre">{(book.genres || []).join(' · ')}</p>
      <h3><a href={`#/book/${book.id}`}>{book.title}</a></h3>
      <p className="card-author">{book.author}</p>
    </article>
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
  const [notice, setNotice] = useState('');

  // Catalog state
  const [catalogItems, setCatalogItems] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  // Detail & reader state
  const [activeBook, setActiveBook] = useState(null);
  const [loadingBook, setLoadingBook] = useState(false);

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
    let active = true;
    setLoadingCatalog(true);

    const timeout = setTimeout(() => {
      fetchCatalog({ query, genre })
        .then(items => {
          if (!active) return;
          setCatalogItems(items);
          setLoadingCatalog(false);
        })
        .catch(() => {
          if (!active) return;
          setLoadingCatalog(false);
        });
    }, 250);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [query, genre]);

  // Load full book detail when visiting detail or reader route
  useEffect(() => {
    let active = true;
    const targetId = route.bookId || route.book?.id;

    if ((route.page === 'detail' || route.page === 'reader') && targetId) {
      setLoadingBook(true);
      fetchBook(targetId)
        .then(b => {
          if (!active) return;
          setActiveBook(b);
          setLoadingBook(false);
        })
        .catch(() => {
          if (!active) return;
          setLoadingBook(false);
        });
    } else {
      setActiveBook(null);
    }

    return () => { active = false; };
  }, [route.page, route.bookId, route.book]);

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
  const featured = catalogItems[0];

  const clear = () => {
    setQuery('');
    setGenre('Tất cả');
  };

  const currentDisplayList = route.page === 'library'
    ? catalogItems.filter(b => state.saved.includes(b.id))
    : catalogItems;

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
            className="icon-button"
            aria-label={state.theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
            onClick={() => setState(s => ({ ...s, theme: s.theme === 'dark' ? 'light' : 'dark' }))}
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

      <main id="main" ref={main} tabIndex="-1">
        {route.page === 'home' && (
          <>
            <section className="hero">
              <div className="hero-copy">
                <p className="eyebrow"><span /> KHO TRUYỆN TRANH TUYỂN CHỌN</p>
                <h1>Lật một trang.<br />Mở <em>ngàn thế giới.</em></h1>
                <p className="hero-description">
                  Hàng ngàn chương truyện tranh hấp dẫn với bản dịch tiếng Việt mượt mà.<br className="desktop-break" />
                  Đọc ngay trên web, cập nhật liên tục, lưu tiến độ và thư viện hoàn toàn riêng tư.
                </p>
                <div className="hero-actions">
                  {featured ? (
                    <a className="button primary" href={`#/book/${featured.id}`}>
                      <Icon name="book" />Đọc truyện mới nhất
                      <span className="arrow-circle"><Icon name="arrow" size={18} /></span>
                    </a>
                  ) : (
                    <a className="button primary" href="#catalog-heading">
                      <Icon name="search" />Khám phá ngay
                      <span className="arrow-circle"><Icon name="arrow" size={18} /></span>
                    </a>
                  )}
                </div>
                <div className="hero-foot">
                  <span className="small-star">✦</span>
                  <span>Đọc mượt mà · Tải nhanh chóng · Tự do khám phá.</span>
                </div>
              </div>

              {featured && (
                <div className="hero-art" aria-label={`Truyện nổi bật ${featured.title}`}>
                  <div className="orbit-word" aria-hidden="true">CẬP NHẬT MỚI LIÊN TỤC</div>
                  <a href={`#/book/${featured.id}`} className="hero-cover">
                    <Artwork src={featured.cover} alt={featured.title} eager />
                    <span className="hero-cover-text">
                      <small>NỔI BẬT</small>
                      <strong>{featured.title}</strong>
                      <span>{(featured.genres || []).slice(0, 2).join(' · ').toUpperCase()}</span>
                    </span>
                  </a>
                  <span className="hero-sticker">Đọc ngay<br /><b>Mỗi ngày</b></span>
                  <div className="featured-caption">
                    <span className="caption-line" />
                    <span>NỔI BẬT HÔM NAY</span>
                    <b>Tuyển chọn</b>
                  </div>
                </div>
              )}
            </section>

            <div className="editorial-strip">
              <span>TRUYỆN TRANH TRỰC TUYẾN</span>
              <span>Bản dịch mượt mà <i>✦</i> Cập nhật liên tục</span>
              <span>TỦ SÁCH RIÊNG TƯ</span>
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
          <section className="catalog" id="catalog-heading" aria-labelledby="catalog-title">
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
                  placeholder="Tìm truyện theo tên, tác giả…"
                  aria-label="Tìm truyện"
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
                    onClick={() => setGenre(g)}
                  >
                    {g}
                  </button>
                ))}
              </div>
              <span className="result-count" role="status">
                {loadingCatalog ? 'Đang tìm kiếm…' : `${currentDisplayList.length} câu chuyện`}
              </span>
            </div>

            {loadingCatalog ? (
              <div className="empty catalog-loading">
                <div className="spinner" aria-hidden="true" />
                <p>Đang tải danh mục truyện…</p>
              </div>
            ) : currentDisplayList.length ? (
              <div className="book-grid">
                {currentDisplayList.map(book => (
                  <Card key={book.id} book={book} />
                ))}
              </div>
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

            {loadingBook && !activeBook ? (
              <div className="empty">
                <div className="spinner" aria-hidden="true" />
                <p>Đang tải thông tin chi tiết truyện…</p>
              </div>
            ) : activeBook ? (
              <div className="detail-grid">
                <div className="detail-cover">
                  <Artwork src={activeBook.cover} alt={`Bìa ${activeBook.title}`} eager />
                  <span style={{ color: activeBook.color }}>{activeBook.title}</span>
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

                  <div className="detail-actions">
                    {activeBook.chapters?.length > 0 && (
                      <a
                        className="button primary"
                        href={`#/read/${activeBook.id}/${state.history[activeBook.id]?.chapter || activeBook.chapters[0].id}`}
                      >
                        <Icon name="book" />
                        {state.history[activeBook.id] ? 'Đọc tiếp' : 'Bắt đầu đọc'}
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
                    <h2>{activeBook.chapters?.length ? 'Danh sách chương' : 'Chưa có danh sách chương'}</h2>
                    <span>{activeBook.chapters?.length || 0} chương</span>
                  </div>

                  {activeBook.chapters?.length ? (
                    <ol className="chapter-list">
                      {activeBook.chapters.map((c, i) => (
                        <li key={c.id || i}>
                          <a href={`#/read/${activeBook.id}/${c.id}`}>
                            <span className="chapter-number">{String(i + 1).padStart(2, '0')}</span>
                            <span>{c.title}</span>
                            <Icon name="arrow" />
                          </a>
                        </li>
                      ))}
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
          loadingBook && !activeBook ? (
            <div className="empty reader-loading">
              <div className="spinner" aria-hidden="true" />
              <p>Đang chuẩn bị dữ liệu truyện…</p>
            </div>
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
