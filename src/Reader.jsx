import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './App.jsx';
import { fetchChapterPages } from './sources.js';

export default function Reader({ book, chapterId, history, onProgress }) {
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const chapters = book.chapters || [];
  const currentIndex = chapters.findIndex(c => String(c.id) === String(chapterId));
  const currentChapter = currentIndex >= 0 ? chapters[currentIndex] : chapters[0] || { id: chapterId, title: `Chương ${chapterId}` };

  const [page, setPage] = useState(history?.chapter === chapterId ? (history.page || 0) : 0);
  const pages = useRef([]);
  const progressCallback = useRef(onProgress);
  progressCallback.current = onProgress;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    fetchChapterPages(book, chapterId)
      .then(res => {
        if (!active) return;
        setContent(res);
        setLoading(false);
      })
      .catch(err => {
        if (!active) return;
        setError(err.message || 'Không thể tải nội dung chương');
        setLoading(false);
      });

    return () => { active = false; };
  }, [book.id, chapterId]);

  useEffect(() => {
    if (loading || !content) return;

    const frame = requestAnimationFrame(() => {
      if (page > 0 && pages.current[page]) {
        pages.current[page]?.scrollIntoView({ block: 'start', behavior: 'instant' });
      }
      progressCallback.current(book.id, chapterId, page, book.title, currentChapter.title);
    });

    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const next = Number(entry.target.dataset.page);
          setPage(next);
          progressCallback.current(book.id, chapterId, next, book.title, currentChapter.title);
        }
      }
    }, { rootMargin: '-15% 0px -35% 0px', threshold: 0.15 });

    pages.current.forEach(el => el && observer.observe(el));
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [loading, content, book.id, chapterId]);

  const prevChap = currentIndex > 0 ? chapters[currentIndex - 1] : null;
  const nextChap = currentIndex >= 0 && currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null;

  const totalPages = content?.images?.length || 0;

  return (
    <section className="reader">
      <div className="reader-toolbar">
        <a href={`#/book/${book.id}`} className="back-link">
          ← <span>{book.title}</span>
        </a>
        <label>
          <span className="sr-only">Chọn chương</span>
          <select
            value={chapterId}
            onChange={e => { location.hash = `/read/${book.id}/${e.target.value}`; }}
          >
            {chapters.map((c, i) => (
              <option key={c.id || i} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
        <span className="reader-page">
          Trang {page + 1} / {totalPages || '—'}
        </span>
      </div>

      <div className="reader-heading">
        <p className="eyebrow">{book.title.toUpperCase()} · {currentChapter.title.toUpperCase()}</p>
        <h1>{currentChapter.title}</h1>
        <p>Cuộn dọc để đọc truyện</p>
      </div>

      {loading && (
        <div className="empty reader-loading">
          <div className="spinner" aria-hidden="true"/>
          <h2>Đang tải trang truyện…</h2>
          <p>Đang chuẩn bị hình ảnh chất lượng cao từ máy chủ.</p>
        </div>
      )}

      {error && (
        <div className="empty reader-error">
          <Icon name="book" size={36}/>
          <h2>Không thể tải chương này</h2>
          <p>{error}</p>
          <div className="reader-actions">
            <a href={`#/book/${book.id}`} className="button">Về chi tiết truyện</a>
            <button className="button primary" onClick={() => location.reload()}>Thử lại</button>
          </div>
        </div>
      )}

      {!loading && !error && content && (
        <div className="reader-pages">
          {content.images?.map((url, i) => (
            <figure
              key={i}
              data-page={i}
              ref={el => { pages.current[i] = el; }}
              className="manga-page image-page"
            >
              <div className="panel-caption"><span>{String(i + 1).padStart(2, '0')}</span>Trang {i + 1}</div>
              <img
                src={url}
                alt={`Trang ${i + 1} — ${book.title}`}
                loading={i === 0 ? 'eager' : 'lazy'}
                decoding="async"
                className="manga-img"
                onError={e => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'flex';
                }}
              />
              <div className="art-fallback manga-img-fallback" style={{ display: 'none' }}>
                <Icon name="book" size={32}/>
                <span>Ảnh trang {i + 1} chưa tải được. Vui lòng thử tải lại trang.</span>
              </div>
            </figure>
          ))}
        </div>
      )}

      {!loading && (
        <div className="reader-bottom">
          <p className="eyebrow">{nextChap ? 'CÂU CHUYỆN VẪN CÒN TIẾP' : 'BẠN ĐÃ ĐỌC ĐẾN CHƯƠNG CUỐI'}</p>
          <h2>{nextChap ? 'Thêm một chương nữa nhé?' : 'Khép lại chương truyện này.'}</h2>
          <div className="reader-navigation">
            {prevChap ? (
              <a className="button" href={`#/read/${book.id}/${prevChap.id}`}>← Chương trước</a>
            ) : (
              <button className="button" disabled>← Chương trước</button>
            )}
            {nextChap ? (
              <a className="button primary" href={`#/read/${book.id}/${nextChap.id}`}>
                Chương tiếp <Icon name="arrow"/>
              </a>
            ) : (
              <a className="button primary" href={`#/book/${book.id}`}>
                Về trang truyện <Icon name="book"/>
              </a>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
