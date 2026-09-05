import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './App.jsx';
import { chapterTarget } from './core.mjs';
import { fetchChapterPages } from './sources.js';

function PanelArt({ scene, chapter, index }) {
  const ink = '#163637', paper = '#e5eadb', mint = '#9dccb8';
  return (
    <svg viewBox="0 0 800 510" width="800" height="510" role="img" aria-label={scene === 'city' ? 'Thành phố trên những tầng mây' : scene === 'star' ? 'Chiếc đèn tỏa sáng' : 'Chuyến tàu đêm băng qua sương mù'}>
      <defs>
        <pattern id={`lines-${index}`} width="9" height="9" patternUnits="userSpaceOnUse">
          <path d="M0 9 9 0" stroke={paper} opacity=".1"/>
        </pattern>
      </defs>
      <path fill={ink} d="M0 0h800v510H0z"/>
      <circle cx={scene === 'star' ? 410 : 615} cy="155" r="105" fill={paper}/>
      {Array.from({ length: 30 }, (_, i) => <circle key={i} cx={(i*127+19)%800} cy={(i*43+11)%350} r={1+i%2} fill={paper}/>)}
      {scene === 'city' ? (
        <>
          <path d="M0 400Q150 290 290 380T800 350V510H0" fill={mint}/>
          {Array.from({ length: 14 }, (_, i) => (
            <g key={i}>
              <path d={`M${i*65-20} 500V${200+i*29%170}h52V500Z`} fill={i%2 ? '#244d49' : '#102b2e'} stroke={paper} strokeWidth="1"/>
              {[0,1,2].map(j => <path key={j} d={`M${i*65-8} ${250+i*29%150+j*28}h8v13h-8Z`} fill={mint}/>)}
            </g>
          ))}
          <path d="M0 465 800 345M0 478 800 358" stroke={paper} strokeWidth="3"/>
          <path d="M265 410v-65l15-22 20 22v63m-17-71v-23" stroke={paper} strokeWidth="10"/>
        </>
      ) : scene === 'train' ? (
        <>
          <path d="M0 392Q130 316 256 391T530 368T800 392V510H0" fill={mint}/>
          <path d="M-30 426 850 270M-30 443 850 287" stroke={paper} strokeWidth="5"/>
          <g transform="rotate(-10 400 300)">
            <path d="M125 258h500q52 0 70 44v60H125Z" fill={paper} stroke={ink} strokeWidth="7"/>
            {[0,1,2,3,4,5].map(i => <path key={i} d={`M${147+i*80} 275h56v43h-56Z`} fill={ink}/>)}
            <path d="M130 338h546" stroke={ink} strokeWidth="8"/>
            {[180,280,510,610].map(i => <circle key={i} cx={i} cy="365" r="17" fill={ink} stroke={paper} strokeWidth="4"/>)}
          </g>
        </>
      ) : (
        <>
          <path d="M224 510 252 357Q301 293 354 349L417 510Z" fill={mint} stroke={ink} strokeWidth="8"/>
          <path d="M264 273Q300 237 343 280L330 327Q302 355 276 320Z" fill={paper}/>
          <path d="M391 240h72v89h-72Z" fill={ink} stroke={paper} strokeWidth="4"/>
          <path d="m427 249 8 21 22 1-18 14 6 21-18-12-18 12 6-21-18-14 22-1Z" fill={paper}/>
        </>
      )}
      <path d="M0 0h800v510H0z" fill={`url(#lines-${index})`}/>
      <text x="28" y="44" fill={paper} fontSize="13" fontFamily="sans-serif" letterSpacing="4">FUU MANGA / CHƯƠNG {chapter}</text>
    </svg>
  );
}

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

    fetchChapterPages(book.id, chapterId)
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
      progressCallback.current(book.id, chapterId, page);
    });

    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const next = Number(entry.target.dataset.page);
          setPage(next);
          progressCallback.current(book.id, chapterId, next);
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

  const totalPages = content?.type === 'svg'
    ? (content.panels?.length || 0)
    : (content?.images?.length || 0);

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
        <p>Nguồn: <strong>{book.sourceLabel || 'Fuu Originals'}</strong> · Cuộn để đọc</p>
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
          {content.type === 'svg' && content.panels?.map((panel, i) => (
            <figure
              key={i}
              data-page={i}
              ref={el => { pages.current[i] = el; }}
              className="manga-page"
            >
              <div className="panel-caption"><span>0{i+1}</span>{panel.text}</div>
              <PanelArt scene={panel.scene} chapter={chapterId} index={i}/>
              <figcaption>{panel.line}</figcaption>
            </figure>
          ))}

          {content.type === 'image' && content.images?.map((url, i) => (
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
                <span>Ảnh trang {i + 1} chưa tải được. Vui lòng tải lại trang.</span>
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
