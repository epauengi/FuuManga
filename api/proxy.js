import { onRequest as mangaDex } from '../functions/api/mangadex/[[path]].js';
import { onRequest as mangaDexImage } from '../functions/api/mangadex-image.js';
import { onRequest as oTruyen } from '../functions/api/otruyen/[[path]].js';

const ROUTE_PARAM = '__fuumanga_route';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const route = url.searchParams.getAll(ROUTE_PARAM);
    if (route.length !== 1 || !isSafeRoute(route[0])) return notFound();

    url.searchParams.delete(ROUTE_PARAM);
    url.pathname = `/api/${route[0]}`;
    const publicRequest = new Request(url, { method: request.method });
    const context = { request: publicRequest, env: process.env };

    if (route[0] === 'mangadex-image') return mangaDexImage(context);
    if (isRoute(route[0], 'mangadex')) return mangaDex(context);
    if (isRoute(route[0], 'otruyen')) return oTruyen(context);
    return notFound();
  }
};

function isSafeRoute(route) {
  return typeof route === 'string' &&
    /^[a-z0-9/-]+$/i.test(route) &&
    route.split('/').every(segment => segment && segment !== '.' && segment !== '..');
}

function isRoute(route, prefix) {
  return route === prefix || route.startsWith(`${prefix}/`);
}

function notFound() {
  return new Response('Not Found', {
    status: 404,
    headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' }
  });
}
