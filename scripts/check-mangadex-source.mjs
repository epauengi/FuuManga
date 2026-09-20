import assert from 'node:assert/strict';
import { deduplicateAndSortChapters, fetchBook, fetchCatalog, fetchChapterPages, formatChapterDate, PAGE_SIZE } from '../src/sources.js';
import { chapterSlug, clampPageIndex, filterChapters, findChapterIndex, normalizePageRatio, orderChapters, parseRoute, slugify, validateState } from '../src/core.mjs';

const mangaId = '11111111-1111-1111-1111-111111111111';
const retryId = '33333333-3333-3333-3333-333333333333';
const coldId = '44444444-4444-4444-4444-444444444444';
const chapterId = '22222222-2222-2222-2222-222222222222';
const coverFile = 'cover.jpg';
const previousFetch = globalThis.fetch;
let calls = [];

function manga(attributes = {}) {
  return {
    id: mangaId,
    attributes: {
      title: { vi: 'Truyện mẫu' },
      description: { vi: 'Mô tả mẫu' },
      tags: [{ attributes: { name: { en: 'Action' } } }],
      ...attributes
    },
    relationships: [{ type: 'cover_art', attributes: { fileName: coverFile } }]
  };
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

try {
  globalThis.fetch = async url => {
    calls.push(String(url));
    if (String(url).startsWith('/api/mangadex/manga?')) return response({
      data: [manga()],
      total: 50,
      limit: PAGE_SIZE,
      offset: 0
    });
    if (String(url).includes(`/api/mangadex/manga/${mangaId}`)) return response({ data: manga() });
    if (String(url).startsWith('/api/mangadex/chapter?')) return response({
      data: [{ id: chapterId, attributes: { chapter: '1', title: 'Mở đầu', publishAt: '2023-05-15T12:00:00.000Z' } }]
    });
    if (String(url).includes(`/api/mangadex/at-home/server/${chapterId}`)) return response({
      baseUrl: 'https://node.mangadex.network/',
      chapter: { hash: 'chapter-hash', data: ['page 1.jpg'] }
    });
    throw new Error(`Unexpected request: ${url}`);
  };

  const catalog = await fetchCatalog({ query: 'mẫu', genre: 'Action', offset: 0 });
  assert.equal(catalog.items.length, 1);
  assert.equal(catalog.total, 50);
  assert.equal(catalog.offset, 0);
  assert.equal(catalog.limit, PAGE_SIZE);
  assert.equal(catalog.nextOffset, 1);
  assert.equal(catalog.reachedLimit, false);
  assert.equal(catalog.items[0].id, `md-${mangaId}`);
  assert.match(catalog.items[0].cover, /^\/api\/mangadex-image\?url=/);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /includedTags%5B%5D=391b0423-d847-456f-aff0-8b0cfc03066b/);
  assert.match(calls[0], /offset=0/);
  assert.match(calls[0], new RegExp(`limit=${PAGE_SIZE}`));

  // Pagination edge cases
  const pageLimitExceeded = await fetchCatalog({ offset: 10000 });
  assert.equal(pageLimitExceeded.nextOffset, null);
  assert.equal(pageLimitExceeded.reachedLimit, true);
  assert.equal(pageLimitExceeded.items.length, 0);

  const firstBook = await fetchBook(`md-${mangaId}`);
  const secondBook = await fetchBook(`md-${mangaId}`);
  assert.equal(firstBook, secondBook);
  assert.equal(firstBook.chapters[0].id, chapterId);
  assert.equal(firstBook.chapters[0].slug, 'chuong-1');
  assert.equal(firstBook.chapters[0].rawDate, '2023-05-15T12:00:00.000Z');
  assert.match(firstBook.chapters[0].date, /^\d{2}\/\d{2}\/\d{4}$/);
  assert.equal(firstBook.chapters[0].lang, 'vi');
  assert.equal(firstBook.subtitle, 'Bản dịch Tiếng Việt đầy đủ');
  assert.equal(formatChapterDate(''), '');
  assert.equal(formatChapterDate(null), '');
  assert.equal(formatChapterDate('invalid-date'), '');
  assert.equal(calls.length, 3);
  assert.ok(calls.some(c => c.includes('translatedLanguage[]=vi') && c.includes('translatedLanguage[]=en')));
  assert.equal(await fetchBook('ot-removed-title'), null);

  // Unit tests for deduplicateAndSortChapters
  const mockChapters = [
    // Chapter 1: EN arrives first
    { id: 'c1-en', attributes: { chapter: '1', translatedLanguage: 'en', publishAt: '2023-01-01T00:00:00.000Z' } },
    // Chapter 1: VI arrives later -> must override EN
    { id: 'c1-vi', attributes: { chapter: '1', translatedLanguage: 'vi', publishAt: '2023-02-01T00:00:00.000Z' } },
    // Chapter 2: Only EN exists -> must be kept as EN fallback
    { id: 'c2-en', attributes: { chapter: '2', translatedLanguage: 'en', publishAt: '2023-03-01T00:00:00.000Z' } },
    // Chapter 3: VI arrives first
    { id: 'c3-vi-old', attributes: { chapter: '3', translatedLanguage: 'vi', publishAt: '2023-01-01T00:00:00.000Z' } },
    // Chapter 3: EN arrives later -> must NOT override existing VI
    { id: 'c3-en', attributes: { chapter: '3', translatedLanguage: 'en', publishAt: '2023-05-01T00:00:00.000Z' } },
    // Chapter 3: Newer VI arrives -> must override older VI
    { id: 'c3-vi-new', attributes: { chapter: '3', translatedLanguage: 'vi', publishAt: '2023-06-01T00:00:00.000Z' } },
    // Chapter 4: External link (MangaPlus/Bilibili) -> must be filtered out
    { id: 'c4-external', attributes: { chapter: '4', translatedLanguage: 'en', externalUrl: 'https://mangaplus.shueisha.co.jp/viewer/1000' } },
    // Chapter 0.5: Decimal chapter -> must sort before 1
    { id: 'c05-vi', attributes: { chapter: '0.5', translatedLanguage: 'vi', publishAt: '2023-01-01T00:00:00.000Z' } },
    // Special chapter without chapter number -> placed at the end
    { id: 'c-special', attributes: { title: 'Oneshot', translatedLanguage: 'vi', publishAt: '2023-01-01T00:00:00.000Z' } }
  ];

  const deduped = deduplicateAndSortChapters(mockChapters);
  assert.equal(deduped.length, 5); // 0.5, 1, 2, 3, special (external filtered out)
  assert.equal(deduped[0].id, 'c05-vi');
  assert.equal(deduped[1].id, 'c1-vi'); // VI overrode EN
  assert.equal(deduped[2].id, 'c2-en'); // EN kept as fallback
  assert.equal(deduped[3].id, 'c3-vi-new'); // Newer VI kept
  assert.equal(deduped[4].id, 'c-special'); // Special chapter at end

  // Empty/null safety
  assert.deepEqual(deduplicateAndSortChapters([]), []);
  assert.deepEqual(deduplicateAndSortChapters(null), []);
  assert.deepEqual(deduplicateAndSortChapters(undefined), []);

  let retryAttempts = 0;
  globalThis.fetch = async url => {
    calls.push(String(url));
    if (String(url).includes(`/api/mangadex/manga/${retryId}`)) {
      retryAttempts += 1;
      if (retryAttempts === 1) return response({}, 500);
      return response({ data: { ...manga({ title: { vi: 'Truyện thử lại' } }), id: retryId } });
    }
    if (String(url).startsWith('/api/mangadex/manga?') && String(url).includes('title=kiem+si')) {
      return response({
        data: [{ ...manga({ title: { vi: 'Kiếm Sĩ' } }), id: coldId }],
        total: 1
      });
    }
    if (String(url).includes(`/api/mangadex/manga/${coldId}`)) {
      return response({ data: { ...manga({ title: { vi: 'Kiếm Sĩ' } }), id: coldId } });
    }
    if (String(url).startsWith('/api/mangadex/chapter?')) return response({ data: [] });
    if (String(url).includes(`/api/mangadex/at-home/server/${chapterId}`)) return response({
      baseUrl: 'https://node.mangadex.network/',
      chapter: { hash: 'chapter-hash', data: ['page 1.jpg'] }
    });
    throw new Error(`Unexpected request: ${url}`);
  };
  await assert.rejects(fetchBook(`md-${retryId}`), /MangaDex: Máy chủ phản hồi lỗi 500/);
  assert.equal((await fetchBook(`md-${retryId}`)).id, `md-${retryId}`);
  assert.equal(retryAttempts, 2);

  const pages = await fetchChapterPages(firstBook, chapterId);
  assert.deepEqual(pages, {
    type: 'image',
    images: [
      '/api/mangadex-image?url=https%3A%2F%2Fnode.mangadex.network%2Fdata%2Fchapter-hash%2Fpage%25201.jpg'
    ]
  });

  const chapters = [{ id: 'one' }, { id: 'two' }];
  assert.equal(orderChapters(chapters, 'oldest'), chapters);
  assert.deepEqual(orderChapters(chapters, 'newest'), [{ id: 'two' }, { id: 'one' }]);
  assert.deepEqual(chapters, [{ id: 'one' }, { id: 'two' }]);

  const searchable = Object.freeze([
    { id: chapterId, chapterNum: '1', title: 'Chương 1: Mở đầu' },
    { id: 'alternate', chapterNum: '01.0', title: 'Chương 1: Bản dịch khác' },
    { id: 'decimal', chapterNum: '1.50', title: 'Chương 1.5: Ngoại truyện' },
    { id: 'ten', chapterNum: '10', title: 'Chương 10: Mở đầu chuyến đi' },
    { id: 'hundred', chapterNum: '100', title: 'Chương 100' }
  ].map(Object.freeze));
  for (const query of ['', '  ', null]) assert.equal(filterChapters(searchable, query), searchable);
  for (const query of ['1', '01', '1.0', ' ChƯơNG 1 ']) {
    assert.deepEqual(filterChapters(searchable, query), searchable.slice(0, 2));
  }
  assert.deepEqual(filterChapters(searchable, '1.5'), [searchable[2]]);
  assert.deepEqual(filterChapters(searchable, '  MO DAU  '), [searchable[0], searchable[3]]);
  assert.deepEqual(filterChapters(searchable, 'CHUYẾN ĐI'), [searchable[3]]);
  assert.deepEqual(filterChapters(searchable, chapterId), []);
  assert.deepEqual(filterChapters(searchable, 'không tồn tại'), []);
  assert.deepEqual(filterChapters(undefined, '1'), []);
  assert.deepEqual(filterChapters({}, ''), []);
  for (const query of ['1', '0', 'undefined', 'null', 'Infinity']) {
    assert.deepEqual(filterChapters([null, {}, { chapterNum: '' }, { chapterNum: 'Infinity' }], query), []);
  }
  assert.deepEqual(filterChapters([{ chapterNum: '1e0', title: 'Chương 1' }], '1'), []);
  assert.deepEqual(filterChapters([{ chapterNum: '9'.repeat(400) }], '9'.repeat(400)), []);
  const matches = filterChapters(searchable, 'mo dau');
  assert.equal(orderChapters(matches, 'oldest'), matches);
  assert.deepEqual(orderChapters(matches, 'newest'), [searchable[3], searchable[0]]);
  assert.deepEqual(matches, [searchable[0], searchable[3]]);
  assert.equal(searchable[0].id, chapterId);

  assert.equal(slugify('Vào Ma Giới Rồi Đấy! Iruma-kun'), 'vao-ma-gioi-roi-day-iruma-kun');
  assert.equal(slugify('Đại Chiến Titan'), 'dai-chien-titan');
  assert.equal(slugify('---hello---world---'), 'hello-world');
  assert.equal(slugify('!@#$%^&*()'), '');
  assert.equal(slugify(null), '');
  assert.equal(slugify(undefined), '');

  assert.deepEqual(parseRoute(`#/book/md-${mangaId}`), { page: 'detail', bookId: `md-${mangaId}` });
  assert.deepEqual(parseRoute('#/book/vao-ma-gioi-roi-day-iruma-kun'), { page: 'detail', bookId: 'vao-ma-gioi-roi-day-iruma-kun' });
  assert.deepEqual(parseRoute('#/read/vao-ma-gioi-roi-day-iruma-kun/chap-1'), { page: 'reader', bookId: 'vao-ma-gioi-roi-day-iruma-kun', chapterId: 'chap-1', chapter: 1 });
  assert.deepEqual(parseRoute('#/book/ot-removed-title'), { page: 'notFound' });
  assert.deepEqual(parseRoute('#/read/ot-removed-title/1'), { page: 'notFound' });

  const sampleBook = {
    id: `md-${mangaId}`,
    slug: 'truyen-mau',
    chapters: [
      { id: chapterId, chapterNum: '1', slug: 'chuong-1' },
      { id: 'c-2', chapterNum: '1.5', slug: 'chuong-1.5' }
    ]
  };
  assert.deepEqual(parseRoute('#/book/truyen-mau', [sampleBook]), { page: 'detail', book: sampleBook, bookId: `md-${mangaId}` });
  assert.deepEqual(parseRoute('#/read/truyen-mau/1', [sampleBook]), { page: 'reader', book: sampleBook, chapter: 1, bookId: `md-${mangaId}`, chapterId: '1' });
  assert.deepEqual(parseRoute(`#/read/truyen-mau/${chapterId}`, [sampleBook]), { page: 'reader', book: sampleBook, bookId: `md-${mangaId}`, chapterId, chapter: 1 });
  assert.deepEqual(parseRoute('#/read/truyen-mau/chuong-1', [sampleBook]), { page: 'reader', book: sampleBook, bookId: `md-${mangaId}`, chapterId: 'chuong-1', chapter: 1 });
  assert.deepEqual(parseRoute('#/read/truyen-mau/chuong-1.5', [sampleBook]), { page: 'reader', book: sampleBook, bookId: `md-${mangaId}`, chapterId: 'chuong-1.5', chapter: 1.5 });

  assert.equal(chapterSlug('1', 0), 'chuong-1');
  assert.equal(chapterSlug('1.5', 1), 'chuong-1.5');
  assert.equal(chapterSlug('21', 20), 'chuong-21');
  assert.equal(chapterSlug(null, 2), 'chuong-3');
  assert.equal(chapterSlug('', 0), 'chuong-1');

  assert.equal(findChapterIndex(sampleBook.chapters, chapterId), 0);
  assert.equal(findChapterIndex(sampleBook.chapters, 'chuong-1'), 0);
  assert.equal(findChapterIndex(sampleBook.chapters, '1'), 0);
  assert.equal(findChapterIndex(sampleBook.chapters, 'chuong-01'), 0);
  assert.equal(findChapterIndex(sampleBook.chapters, 'chuong-1.5'), 1);
  assert.equal(findChapterIndex(sampleBook.chapters, '1.5'), 1);
  assert.equal(findChapterIndex(sampleBook.chapters, 'c-2'), 1);
  assert.equal(findChapterIndex(sampleBook.chapters, 'khong-ton-tai'), -1);

  assert.equal(firstBook.slug, 'truyen-mau');
  assert.equal(await fetchBook('truyen-mau'), firstBook);
  assert.equal((await fetchBook('truyen-thu-lai')).id, `md-${retryId}`);

  // Test cold slug lookup via search API
  const coldBook = await fetchBook('kiem-si');
  assert.equal(coldBook.id, `md-${coldId}`);
  assert.equal(coldBook.slug, 'kiem-si');
  assert.equal(await fetchBook('kiem-si'), coldBook);
  assert.equal(normalizePageRatio(0), 0);
  assert.equal(normalizePageRatio(1), 1);
  assert.equal(normalizePageRatio(-1), 0);
  assert.equal(normalizePageRatio(Infinity), 0);
  assert.equal(normalizePageRatio('0.5'), 0);
  assert.equal(clampPageIndex(12, 3), 2);
  assert.equal(clampPageIndex(12, 0), 12);
  assert.equal(clampPageIndex(-1, 3), 0);

  assert.deepEqual(validateState({
    saved: [`md-${mangaId}`, 'ot-removed-title'],
    history: {
      [`md-${mangaId}`]: { chapter: 1, page: 0, at: 1 },
      'ot-removed-title': { chapter: 1, page: 0, at: 1 }
    }
  }), {
    saved: [`md-${mangaId}`],
    history: { [`md-${mangaId}`]: { chapter: 1, page: 0, pageRatio: 0, bookTitle: '', chapterTitle: '', at: 1 } },
    theme: 'dark'
  });
  assert.equal(validateState({ history: { [`md-${mangaId}`]: { chapter: 1, page: 4, pageRatio: 0.4, at: 1 } } }).history[`md-${mangaId}`].page, 4);
  assert.equal(validateState({ history: { [`md-${mangaId}`]: { chapter: 1, page: 0, pageRatio: 2, at: 1 } } }).history[`md-${mangaId}`].pageRatio, 0);
  assert.equal(validateState({ history: { [`md-${mangaId}`]: { chapter: 1, page: 0, pageRatio: 0.75, at: 1 } } }).history[`md-${mangaId}`].pageRatio, 0.75);
  assert.deepEqual(validateState({ history: { [`md-${mangaId}`]: { chapter: 1, page: 0, at: 1 } } }).history[`md-${mangaId}`], { chapter: 1, page: 0, pageRatio: 0, bookTitle: '', chapterTitle: '', at: 1 });
} finally {
  globalThis.fetch = previousFetch;
}

console.log('MangaDex source check passed');
