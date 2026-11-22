import type { Book } from '../types/book';
import { fetchJsonWithFallback } from './proxy';

interface LibriVoxAuthor {
  first_name?: string;
  last_name?: string;
}

interface LibriVoxBook {
  id: string;
  title: string;
  description?: string;
  url_text_source?: string;
  url_librivox?: string;
  language?: string;
  copyright_year?: string;
  authors?: LibriVoxAuthor[];
}

interface LibriVoxResponse {
  books?: LibriVoxBook[];
}

function stripHtml(raw?: string): string | undefined {
  if (!raw) return undefined;
  return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractGutenbergIdFromUrl(url?: string): number | undefined {
  if (!url) return undefined;
  const m = url.match(/gutenberg\.org\/(?:ebooks|etext)\/(\d+)/i);
  return m ? Number(m[1]) : undefined;
}

function normalizeLibriVoxBook(item: LibriVoxBook): Book {
  const authors =
    item.authors && item.authors.length > 0
      ? item.authors
          .map((a) => `${a.first_name || ''} ${a.last_name || ''}`.trim())
          .filter(Boolean)
      : ['Unknown Author'];

  const gutenbergId = extractGutenbergIdFromUrl(item.url_text_source);
  const textUrl = gutenbergId
    ? `https://www.gutenberg.org/cache/epub/${gutenbergId}/pg${gutenbergId}.txt`
    : undefined;
  const coverUrl = gutenbergId
    ? `https://www.gutenberg.org/cache/epub/${gutenbergId}/pg${gutenbergId}.cover.medium.jpg`
    : undefined;

  return {
    id: `librivox-${item.id}`,
    title: item.title.trim(),
    authors: authors.length > 0 ? authors : ['Unknown Author'],
    source: 'librivox',
    sources: ['librivox'],
    coverUrl,
    subjects: ['Public Domain', 'LibriVox Edition'],
    description: stripHtml(item.description)?.slice(0, 650),
    publishYear: item.copyright_year && item.copyright_year !== '0' ? item.copyright_year : undefined,
    language: item.language ? item.language.toUpperCase().slice(0, 3) : 'EN',
    gutenbergId,
    formats: {
      textUrl,
      externalUrl: item.url_librivox || item.url_text_source,
      audioUrl: item.url_librivox,
    },
    isReadableInApp: Boolean(textUrl),
  };
}

export async function searchLibriVox(params: {
  query?: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<Book[]> {
  if (!params.query || params.query.trim().length < 2) return [];
  const limit = params.limit ?? 8;

  // LibriVox title prefix search with ^ wildcard
  const url = `https://librivox.org/api/feed/audiobooks/?title=^${encodeURIComponent(params.query.trim())}&format=json&limit=${limit}`;

  try {
    const data = await fetchJsonWithFallback<LibriVoxResponse>(url, {
      preferDirect: false,
      timeoutMs: 9000,
      signal: params.signal,
    });
    return (data.books || []).map(normalizeLibriVoxBook);
  } catch {
    return [];
  }
}
