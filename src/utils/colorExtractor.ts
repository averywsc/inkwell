/**
 * Lightweight dominant-color extractor for the subtle ambient page glow on cover hover.
 * Samples an offscreen 16x16 canvas to find the most vibrant accent color of the cover image,
 * caching results per URL and falling back gracefully to matching clothbound hues if a host
 * does not permit cross-origin pixel reads.
 */

const FALLBACK_GLOW_RGBS = [
  '62, 104, 146',  // Slate blue
  '164, 72, 56',   // Terracotta crimson
  '56, 118, 86',   // Forest green
  '114, 78, 148',  // Plum violet
  '168, 114, 58',  // Warm amber
  '48, 122, 134',  // Deep teal
  '138, 84, 74',   // Warm rust
];

const colorCache = new Map<string, string>();
let sharedCanvas: HTMLCanvasElement | null = null;
let sharedCtx: CanvasRenderingContext2D | null = null;

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function getFallbackGlowRgb(title: string): string {
  return FALLBACK_GLOW_RGBS[hashString(title) % FALLBACK_GLOW_RGBS.length];
}

export function extractCoverGlowRgb(
  imgEl: HTMLImageElement | null,
  cacheKey: string,
  fallbackTitle: string
): string {
  const cached = colorCache.get(cacheKey);
  if (cached) return cached;

  if (!imgEl || !imgEl.complete || imgEl.naturalWidth < 8) {
    return getFallbackGlowRgb(fallbackTitle);
  }

  try {
    if (!sharedCanvas) {
      sharedCanvas = document.createElement('canvas');
      sharedCanvas.width = 16;
      sharedCanvas.height = 16;
      sharedCtx = sharedCanvas.getContext('2d', { willReadFrequently: true });
    }
    if (!sharedCtx) return getFallbackGlowRgb(fallbackTitle);

    sharedCtx.clearRect(0, 0, 16, 16);
    sharedCtx.drawImage(imgEl, 0, 0, 16, 16);
    const data = sharedCtx.getImageData(0, 0, 16, 16).data;

    let bestR = 0;
    let bestG = 0;
    let bestB = 0;
    let weightSum = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a < 180) continue;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;

      // Skip near-white and near-black pixels so the glow feels rich & colored
      if (lum < 0.08 || lum > 0.92) continue;

      const weight = 0.25 + sat * sat * 3.5;
      bestR += r * weight;
      bestG += g * weight;
      bestB += b * weight;
      weightSum += weight;
    }

    if (weightSum > 0.5) {
      const rgb = `${Math.round(bestR / weightSum)}, ${Math.round(bestG / weightSum)}, ${Math.round(bestB / weightSum)}`;
      colorCache.set(cacheKey, rgb);
      return rgb;
    }
  } catch {
    // Cross-origin tainted canvas, fall back seamlessly to deterministic rich hue
  }

  const fallback = getFallbackGlowRgb(fallbackTitle);
  colorCache.set(cacheKey, fallback);
  return fallback;
}

export function setPageAmbientGlow(rgb: string): void {
  document.documentElement.style.setProperty('--glow-rgb', rgb);
  document.documentElement.style.setProperty('--glow-opacity', '1');
}

export function clearPageAmbientGlow(): void {
  document.documentElement.style.setProperty('--glow-opacity', '0');
}
