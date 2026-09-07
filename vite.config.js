import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api/mangadex': {
        target: 'https://api.mangadex.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/mangadex/, '')
      },
      '/api/otruyen/chapter': {
        target: 'https://sv1.otruyencdn.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/otruyen/, '/v1/api')
      },
      '/api/otruyen': {
        target: 'https://otruyenapi.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/otruyen/, '/v1/api')
      }
    }
  }
});
