import type { Book, ComicVolume } from '../types/book';
import { fetchJsonWithFallback } from './proxy';
import { getContentFilterConfig, isCleanMetadata } from '../utils/contentFilter';

interface MangaDexTag {
  id: string;
  attributes: {
    name: Record<string, string>;
    group?: string;
  };
}

interface MangaDexRel {
  id: string;
  type: string;
  attributes?: {
    fileName?: string;
    name?: string;
  };
}

interface MangaDexItem {
  id: string;
  attributes: {
    title: Record<string, string>;
    altTitles?: Record<string, string>[];
    description?: Record<string, string>;
    year?: number | null;
    contentRating?: string;
    tags?: MangaDexTag[];
  };
  relationships?: MangaDexRel[];
}

interface MangaDexListResponse {
  data?: MangaDexItem[];
}

interface MangaDexChapterItem {
  id: string;
  attributes: {
    volume?: string | null;
    chapter?: string | null;
    title?: string | null;
    pages: number;
    externalUrl?: string | null;
  };
}

interface MangaDexAtHomeResponse {
  baseUrl: string;
  chapter: {
    hash: string;
    data: string[];
    dataSaver: string[];
  };
}

function pickEnglishTitle(item: MangaDexItem): string {
  const t = item.attributes.title || {};
  if (t.en) return t.en;
  if (t['ja-ro']) return t['ja-ro'];
  const altEn = (item.attributes.altTitles || []).find((a) => a.en)?.en;
  if (altEn) return altEn;
  return Object.values(t)[0] || 'Untitled Manga';
}

function buildImageProxyUrl(rawUrl: string): string {
  const isLocalHost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  if (isLocalHost) {
    return `/api/proxy?url=${encodeURIComponent(rawUrl)}`;
  }
  return `https://corsproxy.io/?${encodeURIComponent(rawUrl)}`;
}

function normalizeMangaDexItem(item: MangaDexItem): Book | null {
  const { blockNsfw } = getContentFilterConfig();
  if (blockNsfw && item.attributes.contentRating !== 'safe') return null;

  const title = pickEnglishTitle(item).trim();
  const tags = (item.attributes.tags || [])
    .map((tg) => tg.attributes?.name?.en || '')
    .filter(Boolean);

  const description = item.attributes.description?.en?.replace(/\[[^\]]+\]\([^)]+\)/g, '').trim();

  const authors = (item.relationships || [])
    .filter((r) => r.type === 'author' || r.type === 'artist')
    .map((r) => r.attributes?.name || '')
    .filter(Boolean);

  if (!isCleanMetadata({ id: item.id, title, authors, subjects: tags, description })) {
    return null;
  }

  const coverFile = (item.relationships || []).find((r) => r.type === 'cover_art')?.attributes?.fileName;
  const coverUrl = coverFile
    ? buildImageProxyUrl(`https://uploads.mangadex.org/covers/${item.id}/${coverFile}.256.jpg`)
    : undefined;

  return {
    id: `mangadex-${item.id}`,
    title,
    authors: authors.length > 0 ? Array.from(new Set(authors)).slice(0, 2) : ['MangaDex Author'],
    source: 'mangadex',
    sources: ['mangadex'],
    coverUrl,
    subjects: ['Manga', ...tags].slice(0, 7),
    description: description?.slice(0, 680),
    publishYear: item.attributes.year || undefined,
    language: 'EN',
    mangadexId: item.id,
    formats: {
      externalUrl: `https://mangadex.org/title/${item.id}`,
    },
    isReadableInApp: true,
    isComic: true,
    isManga: true,
    category: 'Manga',
  };
}

export async function searchMangaDexSafe(params: {
  query?: string;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}): Promise<Book[]> {
  const limit = Math.min(100, params.limit ?? 30);
  const offset = params.offset ?? 0;

  const { blockNsfw } = getContentFilterConfig();
  const url = new URL('https://api.mangadex.org/manga');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('offset', String(offset));
  url.searchParams.append('contentRating[]', 'safe');
  if (!blockNsfw) {
    url.searchParams.append('contentRating[]', 'suggestive');
    url.searchParams.append('contentRating[]', 'erotica');
  }
  url.searchParams.append('availableTranslatedLanguage[]', 'en');
  url.searchParams.append('includes[]', 'cover_art');
  url.searchParams.append('includes[]', 'author');
  url.searchParams.set('hasAvailableChapters', 'true');
  url.searchParams.set('order[followedCount]', 'desc');

  if (params.query && params.query.trim().length >= 2) {
    url.searchParams.set('title', params.query.trim());
  }

  try {
    const data = await fetchJsonWithFallback<MangaDexListResponse>(url.toString(), {
      preferDirect: false,
      timeoutMs: 12000,
      signal: params.signal,
    });
    return (data.data || [])
      .map(normalizeMangaDexItem)
      .filter((b): b is Book => Boolean(b));
  } catch {
    return [];
  }
}

/**
 * Fetches directly hosted English Safe chapters for a MangaDex title.
 */
export async function fetchMangaDexVolumes(
  mangadexId: string,
  signal?: AbortSignal
): Promise<ComicVolume[]> {
  const { blockNsfw } = getContentFilterConfig();
  const url = new URL(`https://api.mangadex.org/manga/${encodeURIComponent(mangadexId)}/feed`);
  url.searchParams.append('translatedLanguage[]', 'en');
  url.searchParams.append('contentRating[]', 'safe');
  if (!blockNsfw) {
    url.searchParams.append('contentRating[]', 'suggestive');
    url.searchParams.append('contentRating[]', 'erotica');
  }
  url.searchParams.set('order[chapter]', 'asc');
  url.searchParams.set('includeExternalUrl', '0');
  url.searchParams.set('limit', '96');

  const data = await fetchJsonWithFallback<{ data?: MangaDexChapterItem[] }>(url.toString(), {
    preferDirect: false,
    timeoutMs: 12000,
    signal,
  });

  // Deduplicate by chapter number (keep highest page count scan)
  const byChapter = new Map<string, MangaDexChapterItem>();
  for (const ch of data.data || []) {
    if (!ch.attributes || ch.attributes.pages <= 0 || ch.attributes.externalUrl) continue;
    const key = ch.attributes.chapter || ch.id;
    const prev = byChapter.get(key);
    if (!prev || ch.attributes.pages > prev.attributes.pages) {
      byChapter.set(key, ch);
    }
  }

  return Array.from(byChapter.values()).map((ch, idx) => {
    const chNum = ch.attributes.chapter ? `Ch. ${ch.attributes.chapter}` : `Chapter ${idx + 1}`;
    const chTitle = ch.attributes.title ? `: ${ch.attributes.title}` : '';
    return {
      id: `md-ch-${ch.id}`,
      title: `${chNum}${chTitle}`,
      pageCount: ch.attributes.pages,
      mangadexChapterId: ch.id,
    };
  });
}

/**
 * Hydrates actual full-color page URLs for a MangaDex chapter via At-Home server.
 */
export async function hydrateMangaDexChapterPages(vol: ComicVolume): Promise<ComicVolume> {
  if (!vol.mangadexChapterId) return vol;
  if (vol.directUrls && vol.directUrls.length > 0) return vol;

  const atHome = await fetchJsonWithFallback<MangaDexAtHomeResponse>(
    `https://api.mangadex.org/at-home/server/${encodeURIComponent(vol.mangadexChapterId)}`,
    { preferDirect: false, timeoutMs: 12000 }
  );

  const base = atHome.baseUrl;
  const hash = atHome.chapter?.hash;
  const files =
    atHome.chapter?.data?.length > 0 ? atHome.chapter.data : atHome.chapter?.dataSaver || [];
  const qualityPath = atHome.chapter?.data?.length > 0 ? 'data' : 'data-saver';

  const directUrls = files.map((f) => buildImageProxyUrl(`${base}/${qualityPath}/${hash}/${f}`));

  return {
    ...vol,
    pageCount: directUrls.length || vol.pageCount,
    directUrls,
    thumbUrls: directUrls,
  };
}
