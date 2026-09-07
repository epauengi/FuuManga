import test from 'node:test';
import assert from 'node:assert/strict';
import { KEY, normalize, filterBooks, parseRoute, chapterTarget, loadState, saveState, validateState } from '../src/core.mjs';
import { CATALOG_SOURCES, fetchBook, fetchCatalog, fetchChapterPages, mangaDexAssetUrl } from '../src/sources.js';
import { buildMangaDexApiUrl, mangaDexHeaders, onRequest as mangaDexApiRequest } from '../functions/api/mangadex/[[path]].js';
import { isAllowedMangaDexImageUrl, onRequest as mangaDexImageRequest } from '../functions/api/mangadex-image.js';
import { buildOTruyenApiUrl, onRequest as oTruyenApiRequest } from '../functions/api/otruyen/[[path]].js';

const sampleBooks = [
  { id: 'md-b8e88f44-8fe3-41b8-a391-335576f7ddcc', rawId: 'b8e88f44-8fe3-41b8-a391-335576f7ddcc', title: 'Truyện hành động mẫu', genres: ['Kỳ ảo', 'Phiêu lưu'], chapters: [{ id: '1', title: 'Chương 1' }] }
];

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' }
});

async function withFetch(mock, run) {
  const previous = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    return await run();
  } finally {
    globalThis.fetch = previous;
  }
}

function requestUrl(input) {
  return new URL(input instanceof Request ? input.url : String(input), 'http://localhost');
}

test('Vietnamese search and combined filters', () => {
  assert.equal(normalize(' ĐỜI THƯỜNG '), 'doi thuong');
  assert.equal(filterBooks(sampleBooks, 'HÀNH ĐỘNG', 'Kỳ ảo').length, 1);
  assert.equal(filterBooks(sampleBooks, 'HÀNH ĐỘNG', 'Tình cảm').length, 0);
  assert.equal(filterBooks(sampleBooks, 'khongco', 'Tất cả').length, 0);
});

test('routes validate malformed encoding, identifiers, chapter bounds', () => {
  for (const hash of ['#/%E0%A4%A', '#/library/extra', '#/read/invalid_id!/1']) {
    assert.equal(parseRoute(hash, sampleBooks).page, 'notFound');
  }
  assert.equal(parseRoute('#/', sampleBooks).page, 'home');
  assert.equal(parseRoute('#/library', sampleBooks).page, 'library');
  assert.equal(parseRoute('#/book/md-b8e88f44-8fe3-41b8-a391-335576f7ddcc', sampleBooks).page, 'detail');
  assert.equal(parseRoute('#/book/ot-one-piece', sampleBooks).page, 'detail');
  assert.equal(parseRoute('#/read/md-b8e88f44-8fe3-41b8-a391-335576f7ddcc/1', sampleBooks).page, 'reader');
  assert.equal(parseRoute('#/read/ot-one-piece/chap-1', sampleBooks).page, 'reader');
});

test('chapter navigation respects both ends', () => {
  assert.equal(chapterTarget(1, -1, 3), null);
  assert.equal(chapterTarget(3, 1, 3), null);
  assert.equal(chapterTarget(1, 1, 3), 2);
});

test('saved state is validated and deduplicated', () => {
  assert.deepEqual(
    validateState({ saved: ['bad-id', 'md-b8e88f44-8fe3-41b8-a391-335576f7ddcc', 'md-b8e88f44-8fe3-41b8-a391-335576f7ddcc'], theme: 'bogus' }, sampleBooks),
    { saved: ['md-b8e88f44-8fe3-41b8-a391-335576f7ddcc'], history: {}, theme: 'dark' }
  );

  const remoteState = validateState({
    saved: ['md-123456', 'ot-one-piece'],
    history: {
      'md-123456': { chapter: 1, page: 2, bookTitle: 'Truyện hay', chapterTitle: 'Chương 1', at: 1000 }
    }
  }, sampleBooks);
  assert.deepEqual(remoteState.saved, ['md-123456', 'ot-one-piece']);
  assert.equal(remoteState.history['md-123456'].bookTitle, 'Truyện hay');
});

test('corrupt/blocked storage falls back; valid state round trips', () => {
  const blocked = { getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } };
  assert.equal(loadState(blocked, sampleBooks).error, true);
  assert.equal(saveState(blocked, {}), false);
  assert.equal(loadState({ getItem: () => '{broken' }, sampleBooks).error, true);
  const memory = new Map();
  const storage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
  const state = validateState({ saved: ['md-b8e88f44-8fe3-41b8-a391-335576f7ddcc'], theme: 'light' }, sampleBooks);
  assert.equal(saveState(storage, state), true);
  assert.deepEqual(loadState(storage, sampleBooks).state, state);
  assert.equal(memory.size, 1);
  assert.ok(memory.has(KEY));
});

test('catalog keeps a healthy source and distinguishes a valid empty result', { concurrency: false }, async () => {
  await withFetch(async input => {
    const url = requestUrl(input);
    if (url.pathname.startsWith('/api/otruyen')) {
      return json({
        data: {
          items: [{
            slug: 'demo',
            name: 'Truyện OTruyen',
            author: ['Tác giả'],
            category: [{ name: 'Action' }],
            thumb_url: 'demo-thumb.jpg',
            chaptersLatest: [{ chapter_name: '10' }]
          }]
        }
      });
    }
    return json({ errors: [] }, 503);
  }, async () => {
    const result = await fetchCatalog();
    assert.deepEqual(result.failedSources, ['MangaDex']);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].id, 'ot-demo');
  });

  await withFetch(async () => json({ errors: [] }, 503), async () => {
    assert.deepEqual(await fetchCatalog(), { items: [], failedSources: CATALOG_SOURCES });
  });

  await withFetch(async input => {
    const url = requestUrl(input);
    return url.pathname.startsWith('/api/otruyen')
      ? json({ data: { items: [] } })
      : json({ data: [] });
  }, async () => {
    assert.deepEqual(await fetchCatalog(), { items: [], failedSources: [] });
  });
});

test('book failures retain not-found semantics and OTruyen pages resolve', { concurrency: false }, async () => {
  await withFetch(async input => {
    const url = requestUrl(input);
    if (url.pathname.includes('not-found')) return json({}, 404);
    return json({}, 500);
  }, async () => {
    assert.equal(await fetchBook('md-not-found'), null);
    await assert.rejects(() => fetchBook('md-server-error'), /MangaDex: Máy chủ phản hồi lỗi 500/);
  });

  const book = {
    id: 'ot-demo',
    chapters: [{ id: '1', apiData: '/api/otruyen/chapter/6a2a4657e0d753f32e5b76aa' }]
  };
  await withFetch(async input => {
    assert.equal(String(input), '/api/otruyen/chapter/6a2a4657e0d753f32e5b76aa');
    return json({
      data: {
        domain_cdn: 'https://img.otruyenapi.com',
        item: {
          chapter_path: 'demo-chapter',
          chapter_image: [{ image_file: '01.jpg' }, { image_file: '02.jpg' }]
        }
      }
    });
  }, async () => {
    assert.deepEqual(await fetchChapterPages(book, '1'), {
      type: 'image',
      images: [
        'https://img.otruyenapi.com/demo-chapter/01.jpg',
        'https://img.otruyenapi.com/demo-chapter/02.jpg'
      ]
    });
  });

  await withFetch(async () => json({ data: { domain_cdn: 'https://img.otruyenapi.com', item: { chapter_path: 'bad', chapter_image: [] } } }), async () => {
    await assert.rejects(() => fetchChapterPages(book, '1'), /OTruyen: Dữ liệu chương không hợp lệ/);
  });
  assert.equal(mangaDexAssetUrl('https://uploads.mangadex.org/covers/id/file.jpg'), '/api/mangadex-image?url=https%3A%2F%2Fuploads.mangadex.org%2Fcovers%2Fid%2Ffile.jpg');
});

test('Cloudflare proxy allowlists MangaDex traffic and forwards a configured identity', { concurrency: false }, async () => {
  const apiUrl = buildMangaDexApiUrl(new URL('https://app.example/api/mangadex/manga?limit=1'));
  assert.equal(String(apiUrl), 'https://api.mangadex.org/manga?limit=1');
  assert.equal(buildMangaDexApiUrl(new URL('https://app.example/api/mangadex//evil')), null);
  assert.deepEqual(mangaDexHeaders({ MANGADEX_USER_AGENT: 'FuuManga/1.0 (+https://app.example/contact)' }), {
    'User-Agent': 'FuuManga/1.0 (+https://app.example/contact)'
  });
  assert.equal(mangaDexHeaders({}), null);

  let calls = 0;
  await withFetch(async (input, init) => {
    calls += 1;
    assert.equal(String(input), 'https://api.mangadex.org/manga?limit=1');
    assert.equal(init.headers['User-Agent'], 'FuuManga/1.0 (+https://app.example/contact)');
    return new Response('{"data":[]}', {
      headers: { 'content-type': 'application/json', 'x-private-header': 'drop-me' }
    });
  }, async () => {
    const response = await mangaDexApiRequest({
      request: new Request('https://app.example/api/mangadex/manga?limit=1'),
      env: { MANGADEX_USER_AGENT: 'FuuManga/1.0 (+https://app.example/contact)' }
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/json');
    assert.equal(response.headers.get('x-private-header'), null);

    const blocked = await mangaDexApiRequest({
      request: new Request('https://app.example/api/mangadex/manga', { method: 'POST' }),
      env: { MANGADEX_USER_AGENT: 'FuuManga/1.0 (+https://app.example/contact)' }
    });
    assert.equal(blocked.status, 405);
    assert.equal(calls, 1);
  });

  assert.equal(isAllowedMangaDexImageUrl('https://uploads.mangadex.org/covers/id/file.256.jpg'), true);
  assert.equal(isAllowedMangaDexImageUrl('https://node.mangadex.network/token/data/hash/page.jpg'), true);
  assert.equal(isAllowedMangaDexImageUrl('https://evil.example/data/hash/page.jpg'), false);
  assert.equal(isAllowedMangaDexImageUrl('http://uploads.mangadex.org/covers/id/file.jpg'), false);

  await withFetch(async (input, init) => {
    assert.equal(String(input), 'https://uploads.mangadex.org/covers/id/file.256.jpg');
    assert.equal(init.headers, undefined);
    return new Response('image', { headers: { 'content-type': 'image/jpeg' } });
  }, async () => {
    const response = await mangaDexImageRequest({
      request: new Request('https://app.example/api/mangadex-image?url=https%3A%2F%2Fuploads.mangadex.org%2Fcovers%2Fid%2Ffile.256.jpg')
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/jpeg');
  });
});

test('OTruyen proxy only permits known API endpoints', { concurrency: false }, async () => {
  assert.equal(
    String(buildOTruyenApiUrl(new URL('https://app.example/api/otruyen/danh-sach/truyen-moi?page=1'))),
    'https://otruyenapi.com/v1/api/danh-sach/truyen-moi?page=1'
  );
  assert.equal(
    String(buildOTruyenApiUrl(new URL('https://app.example/api/otruyen/truyen-tranh/one-piece'))),
    'https://otruyenapi.com/v1/api/truyen-tranh/one-piece'
  );
  assert.equal(
    String(buildOTruyenApiUrl(new URL('https://app.example/api/otruyen/chapter/6a2a4657e0d753f32e5b76aa'))),
    'https://sv1.otruyencdn.com/v1/api/chapter/6a2a4657e0d753f32e5b76aa'
  );
  assert.equal(buildOTruyenApiUrl(new URL('https://app.example/api/otruyen/chapter/not-an-id')), null);
  assert.equal(buildOTruyenApiUrl(new URL('https://app.example/api/otruyen/danh-sach/truyen-moi?page=1&url=https://evil.example')), null);

  let calls = 0;
  await withFetch(async (input, init) => {
    calls += 1;
    assert.equal(String(input), 'https://otruyenapi.com/v1/api/truyen-tranh/one-piece');
    assert.equal(init.credentials, 'omit');
    return new Response('{"data":{}}', {
      headers: { 'content-type': 'application/json', 'x-private-header': 'drop-me' }
    });
  }, async () => {
    const response = await oTruyenApiRequest({
      request: new Request('https://app.example/api/otruyen/truyen-tranh/one-piece')
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/json');
    assert.equal(response.headers.get('x-private-header'), null);

    const invalid = await oTruyenApiRequest({
      request: new Request('https://app.example/api/otruyen/anything')
    });
    assert.equal(invalid.status, 400);

    const blocked = await oTruyenApiRequest({
      request: new Request('https://app.example/api/otruyen/truyen-tranh/one-piece', { method: 'POST' })
    });
    assert.equal(blocked.status, 405);
    assert.equal(calls, 1);
  });
});
