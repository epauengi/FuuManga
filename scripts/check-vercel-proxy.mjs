import assert from 'node:assert/strict';
import proxy from '../api/proxy.js';

const previousFetch = globalThis.fetch;
const previousUserAgent = process.env.MANGADEX_USER_AGENT;
process.env.MANGADEX_USER_AGENT = 'FuuManga/1.0 (+https://app.example/contact)';

async function request(url, expectedUrl, expectedInit) {
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), expectedUrl);
    expectedInit(init);
    return new Response('{"data":[]}', { headers: { 'content-type': 'application/json' } });
  };
  const response = await proxy.fetch(new Request(url));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '{"data":[]}');
}

try {
  await request(
    'https://app.example/api/proxy?__fuumanga_route=mangadex/manga&path=mangadex/manga&limit=1',
    'https://api.mangadex.org/manga?limit=1',
    init => assert.equal(init.headers['User-Agent'], process.env.MANGADEX_USER_AGENT)
  );
  await request(
    'https://app.example/api/proxy?__fuumanga_route=mangadex-image&url=https%3A%2F%2Fuploads.mangadex.org%2Fcovers%2Fid%2Ffile.jpg',
    'https://uploads.mangadex.org/covers/id/file.jpg',
    init => assert.equal(init.headers, undefined)
  );
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response(); };
  for (const url of [
    'https://app.example/api/proxy',
    'https://app.example/api/proxy?__fuumanga_route=unknown',
    'https://app.example/api/proxy?__fuumanga_route=mangadex%2F..%2Fsecret',
    'https://app.example/api/proxy?__fuumanga_route=otruyen%2Fdanh-sach%2Ftruyen-moi',
    'https://app.example/api/proxy?__fuumanga_route=mangadex&__fuumanga_route=mangadex-image'
  ]) {
    const response = await proxy.fetch(new Request(url));
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  const invalidImage = await proxy.fetch(new Request(
    'https://app.example/api/proxy?__fuumanga_route=mangadex-image&url=https%3A%2F%2Fevil.example%2Fimage.jpg'
  ));
  assert.equal(invalidImage.status, 400);
  const blockedMethod = await proxy.fetch(new Request(
    'https://app.example/api/proxy?__fuumanga_route=mangadex%2Fmanga',
    { method: 'POST' }
  ));
  assert.equal(blockedMethod.status, 405);
  assert.equal(calls, 0);
} finally {
  globalThis.fetch = previousFetch;
  if (previousUserAgent === undefined) delete process.env.MANGADEX_USER_AGENT;
  else process.env.MANGADEX_USER_AGENT = previousUserAgent;
}

console.log('Vercel proxy dispatch check passed');
