import type { Book, ParsedBookContent } from '../types/book';
import { fetchJsonWithFallback } from './proxy';
import { parsePlainTextToBook } from '../utils/textParser';
import { isCleanMetadata } from '../utils/contentFilter';

interface WikisourceSearchItem {
  pageid: number;
  title: string;
  snippet?: string;
}

interface WikisourceSearchResponse {
  query?: {
    search?: WikisourceSearchItem[];
  };
}

interface WikisourceCategoryMember {
  pageid: number;
  title: string;
}

interface WikisourceExtractResponse {
  query?: {
    pages?: Record<
      string,
      {
        title?: string;
        extract?: string;
      }
    >;
  };
}

function stripTags(html?: string): string | undefined {
  if (!html) return undefined;
  return html.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
}

export async function searchWikisource(params: {
  query?: string;
  categoryTitle?: string;
  category?: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<Book[]> {
  const limit = Math.min(50, params.limit ?? 24);

  try {
    if (params.query && params.query.trim().length >= 2) {
      const url = `https://en.wikisource.org/w/api.php?action=query&list=search&srnamespace=0&srlimit=${limit}&srsearch=${encodeURIComponent(
        params.query.trim()
      )}&format=json&origin=*`;
      const data = await fetchJsonWithFallback<WikisourceSearchResponse>(url, {
        preferDirect: true,
        timeoutMs: 10000,
        signal: params.signal,
      });

      return (data.query?.search || [])
        .filter(
          (item) =>
            !item.title.includes('/') &&
            isCleanMetadata({
              id: `ws-${item.pageid}`,
              title: item.title,
              description: stripTags(item.snippet),
            })
        )
        .map((item) => ({
          id: `wikisource-${item.pageid}`,
          title: item.title,
          authors: ['Wikisource Edition'],
          source: 'wikisource',
          sources: ['wikisource'],
          subjects: ['Public Domain', 'Wikisource'],
          description: stripTags(item.snippet),
          language: 'EN',
          wikisourceTitle: item.title,
          formats: {
            externalUrl: `https://en.wikisource.org/wiki/${encodeURIComponent(item.title)}`,
          },
          isReadableInApp: true,
          category: params.category || 'Fiction',
        }));
    }

    const cmTitle = params.categoryTitle || 'Category:Short_stories';
    const url = `https://en.wikisource.org/w/api.php?action=query&list=categorymembers&cmnamespace=0&cmtitle=${encodeURIComponent(
      cmTitle
    )}&cmlimit=${limit}&format=json&origin=*`;
    const data = await fetchJsonWithFallback<{ query?: { categorymembers?: WikisourceCategoryMember[] } }>(
      url,
      { preferDirect: true, timeoutMs: 10000, signal: params.signal }
    );

    return (data.query?.categorymembers || [])
      .filter(
        (m) =>
          !m.title.includes('/') &&
          !m.title.startsWith('Category:') &&
          isCleanMetadata({ id: `ws-${m.pageid}`, title: m.title })
      )
      .map((m) => ({
        id: `wikisource-${m.pageid}`,
        title: m.title,
        authors: ['Wikisource Library'],
        source: 'wikisource',
        sources: ['wikisource'],
        subjects: ['Public Domain', params.category || 'Classic Literature'],
        language: 'EN',
        wikisourceTitle: m.title,
        formats: {
          externalUrl: `https://en.wikisource.org/wiki/${encodeURIComponent(m.title)}`,
        },
        isReadableInApp: true,
        category: params.category || 'Fiction',
      }));
  } catch {
    return [];
  }
}

export async function fetchWikisourceBookContent(
  bookId: string,
  wikisourceTitle: string,
  signal?: AbortSignal
): Promise<ParsedBookContent> {
  const url = `https://en.wikisource.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&titles=${encodeURIComponent(
    wikisourceTitle
  )}&format=json&origin=*`;

  const data = await fetchJsonWithFallback<WikisourceExtractResponse>(url, {
    preferDirect: true,
    timeoutMs: 14000,
    signal,
  });

  const pages = Object.values(data.query?.pages || {});
  const text = pages[0]?.extract?.trim() || '';
  if (text.length < 180) {
    throw new Error('This Wikisource page is an index page; open the source link to select a chapter.');
  }

  return parsePlainTextToBook(bookId, text, wikisourceTitle, 'text');
}
