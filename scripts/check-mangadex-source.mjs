import assert from 'node:assert/strict';
import { fetchBook, fetchCatalog, fetchChapterPages } from '../src/sources.js';
import { orderChapters, parseRoute, validateState } from '../src/core.mjs';

const mangaId = '11111111-1111-1111-1111-111111111111';
const retryId = '33333333-3333-3333-3333-333333333333';
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
    if (String(url).startsWith('/api/mangadex/manga?')) return response({ data: [manga()] });
    if (String(url).includes(`/api/mangadex/manga/${mangaId}`)) return response({ data: manga() });
    if (String(url).startsWith('/api/mangadex/chapter?')) return response({
      data: [{ id: chapterId, attributes: { chapter: '1', title: 'Mở đầu' } }]
    });
    if (String(url).includes(`/api/mangadex/at-home/server/${chapterId}`)) return response({
      baseUrl: 'https://node.mangadex.network/',
      chapter: { hash: 'chapter-hash', data: ['page 1.jpg'] }
    });
    throw new Error(`Unexpected request: ${url}`);
  };

  const catalog = await fetchCatalog({ query: 'mẫu', genre: 'Action' });
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].id, `md-${mangaId}`);
  assert.match(catalog[0].cover, /^\/api\/mangadex-image\?url=/);
  assert.equal(calls.length, 1);

  const firstBook = await fetchBook(`md-${mangaId}`);
  const secondBook = await fetchBook(`md-${mangaId}`);
  assert.equal(firstBook, secondBook);
  assert.equal(firstBook.chapters[0].id, chapterId);
  assert.equal(calls.length, 3);
  assert.equal(await fetchBook('ot-removed-title'), null);

  let retryAttempts = 0;
  globalThis.fetch = async url => {
    calls.push(String(url));
    if (String(url).includes(`/api/mangadex/manga/${retryId}`)) {
      retryAttempts += 1;
      if (retryAttempts === 1) return response({}, 500);
      return response({ data: { ...manga(), id: retryId } });
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

  assert.deepEqual(parseRoute(`#/book/md-${mangaId}`), { page: 'detail', bookId: `md-${mangaId}` });
  assert.deepEqual(parseRoute('#/book/ot-removed-title'), { page: 'notFound' });
  assert.deepEqual(validateState({
    saved: [`md-${mangaId}`, 'ot-removed-title'],
    history: {
      [`md-${mangaId}`]: { chapter: 1, page: 0, at: 1 },
      'ot-removed-title': { chapter: 1, page: 0, at: 1 }
    }
  }), {
    saved: [`md-${mangaId}`],
    history: { [`md-${mangaId}`]: { chapter: 1, page: 0, bookTitle: '', chapterTitle: '', at: 1 } },
    theme: 'dark'
  });
} finally {
  globalThis.fetch = previousFetch;
}

console.log('MangaDex source check passed');
