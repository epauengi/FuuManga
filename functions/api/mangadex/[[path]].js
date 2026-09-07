const API_PREFIX = '/api/mangadex';
const SAFE_HEADERS = ['content-type', 'content-length', 'cache-control', 'etag', 'last-modified'];

export function buildMangaDexApiUrl(requestUrl) {
  const path = requestUrl.pathname.slice(API_PREFIX.length) || '/';
  if (!path.startsWith('/') || path.startsWith('//')) return null;

  const target = new URL('https://api.mangadex.org');
  target.pathname = path;
  target.search = requestUrl.search;
  return target;
}

export function mangaDexHeaders(env) {
  const userAgent = env.MANGADEX_USER_AGENT?.trim();
  return userAgent ? { 'User-Agent': userAgent } : null;
}

export function proxiedResponse(upstream, fallbackCacheControl) {
  const headers = new Headers();
  for (const name of SAFE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has('cache-control')) headers.set('cache-control', fallbackCacheControl);
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
}

function errorResponse(status, message) {
  return new Response(message, {
    status,
    headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' }
  });
}

export async function onRequest(context) {
  if (!['GET', 'HEAD'].includes(context.request.method)) {
    return errorResponse(405, 'Method Not Allowed');
  }

  const target = buildMangaDexApiUrl(new URL(context.request.url));
  if (!target) return errorResponse(400, 'Invalid MangaDex API path');

  const headers = mangaDexHeaders(context.env);
  if (!headers) return errorResponse(500, 'MangaDex proxy is not configured');

  try {
    const upstream = await fetch(target, {
      method: context.request.method,
      headers,
      redirect: 'manual'
    });
    return proxiedResponse(upstream, 'public, max-age=60, s-maxage=300');
  } catch {
    return errorResponse(502, 'MangaDex is unavailable');
  }
}
