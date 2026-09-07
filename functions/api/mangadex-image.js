const SAFE_HEADERS = ['content-type', 'content-length', 'cache-control', 'etag', 'last-modified'];

export function isAllowedMangaDexImageUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== 'https:' || url.username || url.password) return false;

  const parts = url.pathname.split('/').filter(Boolean);
  const dataIndex = parts.findIndex(part => part === 'data' || part === 'data-saver');
  const isImagePath = dataIndex >= 0 && parts.length === dataIndex + 3;

  if (url.hostname === 'uploads.mangadex.org') {
    return (parts[0] === 'covers' && parts.length === 3) || (dataIndex === 0 && isImagePath);
  }

  return url.hostname.endsWith('.mangadex.network') && dataIndex >= 0 && parts.length === dataIndex + 3;
}

function proxiedResponse(upstream) {
  const headers = new Headers();
  for (const name of SAFE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has('cache-control')) headers.set('cache-control', 'public, max-age=300');
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

  const target = new URL(context.request.url).searchParams.get('url');
  if (!target || !isAllowedMangaDexImageUrl(target)) {
    return errorResponse(400, 'Invalid MangaDex image URL');
  }

  try {
    const upstream = await fetch(target, {
      method: context.request.method,
      redirect: 'manual'
    });
    return proxiedResponse(upstream);
  } catch {
    return errorResponse(502, 'MangaDex image is unavailable');
  }
}
