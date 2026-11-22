import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Lightweight local CORS proxy middleware for fetching public domain book texts,
 * HTML, EPUBs, OPDS feeds, MangaDex safe covers/chapters, Wikisource, and PoetryDB.
 */
function einkCorsProxyPlugin(): Plugin {
  const ALLOWED_HOSTS = new Set([
    'www.gutenberg.org',
    'gutenberg.org',
    'gutendex.com',
    'archive.org',
    'openlibrary.org',
    'covers.openlibrary.org',
    'standardebooks.org',
    'librivox.org',
    'api.mangadex.org',
    'uploads.mangadex.org',
    'en.wikisource.org',
    'poetrydb.org',
  ]);

  const isAllowedUrl = (rawUrl: string): boolean => {
    try {
      const u = new URL(rawUrl);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
      const host = u.hostname.toLowerCase();
      if (ALLOWED_HOSTS.has(host)) return true;
      if (
        host.endsWith('.archive.org') ||
        host.endsWith('.gutenberg.org') ||
        host.endsWith('.openlibrary.org') ||
        host.endsWith('.standardebooks.org') ||
        host.endsWith('.mangadex.org') ||
        host.endsWith('.mangadex.network')
      ) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const attachProxy = (middlewares: any) => {
    middlewares.use('/api/proxy', async (req: any, res: any) => {
      try {
        const reqUrl = new URL(req.url || '', 'http://localhost');
        const target = reqUrl.searchParams.get('url');
        if (!target || !isAllowedUrl(target)) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Invalid or disallowed target URL' }));
          return;
        }

        const upstream = await fetch(target, {
          headers: {
            'User-Agent': 'InkwellReader/2.0 (Public Domain & Open Catalog Reader)',
            Accept: '*/*',
          },
          redirect: 'follow',
        });

        if (!upstream.ok) {
          res.statusCode = upstream.status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: `Upstream returned ${upstream.status}` }));
          return;
        }

        const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
        res.statusCode = 200;
        res.setHeader('Content-Type', contentType);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'public, max-age=3600');

        const buf = Buffer.from(await upstream.arrayBuffer());
        res.end(buf);
      } catch (err: any) {
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err?.message || 'Proxy fetch failed' }));
      }
    });
  };

  return {
    name: 'eink-cors-proxy',
    configureServer(server) {
      attachProxy(server.middlewares);
    },
    configurePreviewServer(server) {
      attachProxy(server.middlewares);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), einkCorsProxyPlugin()],
  server: {
    port: 5173,
  },
});
