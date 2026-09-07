const API_PREFIX = '/api/otruyen';
const SAFE_HEADERS = ['content-type', 'content-length', 'cache-control', 'etag', 'last-modified'];

export function buildOTruyenApiUrl(requestUrl) {
  const path = requestUrl.pathname.slice(API_PREFIX.length);
  if (!path.startsWith('/') || path.startsWith('//')) return null;

  if (path === '/danh-sach/truyen-moi') return publicApiUrl(path, requestUrl.searchParams, 'page');
  if (path === '/tim-kiem') return publicApiUrl(path, requestUrl.searchParams, 'keyword');

  const detail = path.match(/^\/truyen-tranh\/([a-z0-9-]{1,200})$/);
  if (detail && !requestUrl.search) return new URL(`/v1/api/truyen-tranh/${detail[1]}`, 'https://otruyenapi.com');

  const chapter = path.match(/^\/chapter\/([a-f0-9]{24})$/i);
  if (chapter && !requestUrl.search) return new URL(`/v1/api/chapter/${chapter[1]}`, 'https://sv1.otruyencdn.com');

  return null;
}

function publicApiUrl(path, params, allowedParam) {
  const values = params.getAll(allowedParam);
  if (values.length > 1 || [...params.keys()].some(name => name !== allowedParam)) return null;

  const value = values[0];
  if (allowedParam === 'page' && value && !/^[1-9]\d{0,4}$/.test(value)) return null;
  if (allowedParam === 'keyword' && (!value || value.length > 200)) return null;

  const target = new URL(`/v1/api${path}`, 'https://otruyenapi.com');
  if (value) target.searchParams.set(allowedParam, value);
  return target;
}

function proxiedResponse(upstream) {
  const headers = new Headers();
  for (const name of SAFE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has('cache-control')) headers.set('cache-control', 'public, max-age=60, s-maxage=300');
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

  const target = buildOTruyenApiUrl(new URL(context.request.url));
  if (!target) return errorResponse(400, 'Invalid OTruyen API path');

  try {
    const upstream = await fetch(target, {
      method: context.request.method,
      credentials: 'omit',
      redirect: 'manual'
    });
    return proxiedResponse(upstream);
  } catch {
    return errorResponse(502, 'OTruyen is unavailable');
  }
}
