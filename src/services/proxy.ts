/**
 * CORS-resilient fetch helpers for public domain book APIs and direct text/HTML/EPUB streams.
 * Strategy:
 *  1. For APIs known to support CORS directly (Gutendex, Open Library, Archive search), try direct fetch first.
 *  2. For raw book streams (Gutenberg .txt/.htm, Archive files, Standard Ebooks, LibriVox) or on CORS failure,
 *     use the local Vite middleware `/api/proxy?url=...` first.
 *  3. If `/api/proxy` is active and reports a real upstream error (e.g. 503 maintenance), fail fast
 *     without spamming fallback public proxies or causing CORS console noise.
 *  4. If `/api/proxy` is unavailable (e.g. static deployment), fall back cleanly to public CORS proxies.
 */

const PUBLIC_PROXIES = [
  (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  (u: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
];

async function fetchWithTimeout(url: string, timeoutMs = 10000, signal?: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  const onParentAbort = () => controller.abort();
  signal?.addEventListener('abort', onParentAbort);

  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener('abort', onParentAbort);
  }
}

export async function fetchViaProxy(
  targetUrl: string,
  options?: { preferDirect?: boolean; timeoutMs?: number; signal?: AbortSignal }
): Promise<Response> {
  const timeoutMs = options?.timeoutMs ?? 12000;
  const preferDirect = options?.preferDirect ?? false;

  // 1. Optional direct attempt for CORS-enabled APIs
  if (preferDirect) {
    try {
      const directRes = await fetchWithTimeout(targetUrl, timeoutMs, options?.signal);
      if (directRes.ok) return directRes;
      if (directRes.status >= 400 && directRes.status < 600) {
        // Real upstream HTTP failure, no need to hammer proxies
        throw new Error(`Upstream returned HTTP ${directRes.status}`);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' && options?.signal?.aborted) throw err;
      if (String(err?.message || '').startsWith('Upstream returned HTTP')) {
        throw err;
      }
      // Network/CORS failure -> fall through to local proxy
    }
  }

  // 2. Local Vite / preview server proxy (CORS-free)
  const localProxyUrl = `/api/proxy?url=${encodeURIComponent(targetUrl)}`;
  try {
    const proxyRes = await fetchWithTimeout(localProxyUrl, timeoutMs, options?.signal);
    const ct = proxyRes.headers.get('content-type') || '';

    if (proxyRes.ok) {
      // Guard against SPA index.html fallback when deployed statically without /api/proxy
      if (ct.includes('text/html')) {
        const cloned = proxyRes.clone();
        const head = (await cloned.text()).slice(0, 260);
        if (head.includes('<!DOCTYPE html>') && head.includes('INKWELL')) {
          // Static host without /api/proxy -> fall through to public proxies
        } else {
          return proxyRes;
        }
      } else {
        return proxyRes;
      }
    } else if (ct.includes('application/json')) {
      // Our local proxy middleware IS running and explicitly reported an upstream error (e.g., 503/404)
      throw new Error(`Upstream returned HTTP ${proxyRes.status}`);
    }
  } catch (err: any) {
    if (err?.name === 'AbortError' && options?.signal?.aborted) throw err;
    if (String(err?.message || '').startsWith('Upstream returned HTTP')) {
      throw err;
    }
  }

  // 3. Public CORS proxy fallbacks (only used when /api/proxy middleware is not running, e.g. static hosting)
  let lastError: unknown = null;
  for (const buildProxy of PUBLIC_PROXIES) {
    if (options?.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    try {
      const res = await fetchWithTimeout(buildProxy(targetUrl), timeoutMs, options?.signal);
      if (res.ok) return res;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Unable to fetch ${targetUrl}`);
}

export async function fetchTextWithFallback(
  targetUrl: string,
  options?: { preferDirect?: boolean; timeoutMs?: number; signal?: AbortSignal }
): Promise<string> {
  const res = await fetchViaProxy(targetUrl, options);
  return res.text();
}

export async function fetchArrayBufferWithFallback(
  targetUrl: string,
  options?: { preferDirect?: boolean; timeoutMs?: number; signal?: AbortSignal }
): Promise<ArrayBuffer> {
  const res = await fetchViaProxy(targetUrl, options);
  return res.arrayBuffer();
}

export async function fetchJsonWithFallback<T>(
  targetUrl: string,
  options?: { preferDirect?: boolean; timeoutMs?: number; signal?: AbortSignal }
): Promise<T> {
  const res = await fetchViaProxy(targetUrl, { preferDirect: true, ...options });
  return res.json() as Promise<T>;
}
