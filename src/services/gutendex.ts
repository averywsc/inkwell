import type { Book } from '../types/book';
import { fetchJsonWithFallback } from './proxy';

interface GutendexAuthor {
  name: string;
  birth_year?: number | null;
  death_year?: number | null;
}

interface GutendexBook {
  id: number;
  title: string;
  authors: GutendexAuthor[];
  subjects: string[];
  bookshelves: string[];
  languages: string[];
  download_count: number;
  formats: Record<string, string>;
  summaries?: string[];
}

interface GutendexResponse {
  count: number;
  next: string | null;
  results: GutendexBook[];
}

function formatGutenbergAuthor(raw: string): string {
  // Convert "Shelley, Mary Wollstonecraft" -> "Mary Wollstonecraft Shelley"
  const parts = raw.split(',').map((s) => s.trim());
  if (parts.length >= 2 && parts[1]) {
    return `${parts[1]} ${parts[0]}`;
  }
  return raw.trim();
}

function pickFormatUrl(formats: Record<string, string>, prefixes: string[]): string | undefined {
  for (const prefix of prefixes) {
    for (const [mime, url] of Object.entries(formats)) {
      if (mime.toLowerCase().startsWith(prefix) && !url.endsWith('.zip')) {
        return url.replace(/^http:\/\//i, 'https://');
      }
    }
  }
  return undefined;
}

function normalizeGutendexBook(item: GutendexBook): Book {
  const formats = item.formats || {};
  const textUrl = pickFormatUrl(formats, [
    'text/plain; charset=utf-8',
    'text/plain; charset=us-ascii',
    'text/plain',
  ]);
  const htmlUrl = pickFormatUrl(formats, [
    'text/html; charset=utf-8',
    'text/html',
  ]);
  const epubUrl = pickFormatUrl(formats, [
    'application/epub+zip',
  ]);
  const coverUrl = pickFormatUrl(formats, ['image/jpeg', 'image/png']);

  const authors =
    item.authors && item.authors.length > 0
      ? item.authors.map((a) => formatGutenbergAuthor(a.name))
      : ['Unknown Author'];

  const subjects = [
    ...(item.subjects || []),
    ...(item.bookshelves || []).map((s) => s.replace(/^Browsing:\s*/i, '')),
  ].slice(0, 10);

  const summary =
    item.summaries && item.summaries.length > 0
      ? item.summaries[0]
      : undefined;

  return {
    id: `gutenberg-${item.id}`,
    title: item.title.trim(),
    authors,
    source: 'gutenberg',
    sources: ['gutenberg'],
    coverUrl,
    subjects,
    description: summary,
    language: item.languages?.[0]?.toUpperCase() || 'EN',
    downloadCount: item.download_count,
    gutenbergId: item.id,
    formats: {
      textUrl,
      htmlUrl,
      epubUrl,
      externalUrl: `https://www.gutenberg.org/ebooks/${item.id}`,
    },
    isReadableInApp: Boolean(textUrl || htmlUrl || epubUrl),
  };
}

export async function searchGutendex(params: {
  query?: string;
  topic?: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<Book[]> {
  const url = new URL('https://gutendex.com/books/');
  if (params.query) {
    url.searchParams.set('search', params.query);
  }
  if (params.topic) {
    url.searchParams.set('topic', params.topic);
  }
  url.searchParams.set('languages', 'en');

  const data = await fetchJsonWithFallback<GutendexResponse>(url.toString(), {
    preferDirect: true,
    timeoutMs: 7500,
    signal: params.signal,
  });

  const limit = params.limit ?? 16;
  return (data.results || []).slice(0, limit).map(normalizeGutendexBook);
}
