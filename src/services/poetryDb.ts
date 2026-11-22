import type { Book, ParsedBookContent } from '../types/book';
import { fetchJsonWithFallback } from './proxy';
import { buildParsedBookContent } from '../utils/textParser';
import { isCleanMetadata } from '../utils/contentFilter';

interface PoetryAuthorResponse {
  authors?: string[];
}

interface PoetryPoem {
  title: string;
  author: string;
  lines: string[];
  linecount?: string;
}

/**
 * PoetryDB API (https://poetrydb.org/): 129 complete classic public-domain poet anthologies
 * (Shakespeare, Dickinson, Poe, Keats, Whitman, Blake, Shelley, Frost, Byron, Yeats, etc.)
 * readable directly inside Inkwell's paginated reader!
 */
export async function fetchPoetryDbCatalog(params?: {
  query?: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<Book[]> {
  try {
    const data = await fetchJsonWithFallback<PoetryAuthorResponse>(
      'https://poetrydb.org/author',
      { preferDirect: true, timeoutMs: 10000, signal: params?.signal }
    );

    const q = (params?.query || '').trim().toLowerCase();
    const authors = (data.authors || []).filter((author) => {
      if (!author) return false;
      if (q && !author.toLowerCase().includes(q) && !'poetry poems verse'.includes(q)) {
        return false;
      }
      return isCleanMetadata({ title: `Collected Poems of ${author}`, authors: [author] });
    });

    const limit = params?.limit ?? 129;
    return authors.slice(0, limit).map((author) => ({
      id: `poetrydb-${author.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      title: `Collected Poems of ${author}`,
      authors: [author],
      source: 'poetrydb',
      sources: ['poetrydb'],
      subjects: ['Poetry', 'Classic Verse', 'Public Domain'],
      description: `A complete public-domain anthology of classic poems written by ${author}, formatted cleanly for paginated reading.`,
      language: 'EN',
      poetryAuthor: author,
      formats: {
        externalUrl: `https://poetrydb.org/author/${encodeURIComponent(author)}`,
      },
      isReadableInApp: true,
      category: 'Poetry & Drama',
    }));
  } catch {
    return [];
  }
}

/**
 * Fetches all poems by a PoetryDB author and formats them into chapters (one poem per chapter)
 * for Inkwell's paginated reader and Table of Contents.
 */
export async function fetchPoetryDbBookContent(
  bookId: string,
  author: string,
  signal?: AbortSignal
): Promise<ParsedBookContent> {
  const poems = await fetchJsonWithFallback<PoetryPoem[]>(
    `https://poetrydb.org/author/${encodeURIComponent(author)}`,
    { preferDirect: true, timeoutMs: 14000, signal }
  );

  if (!Array.isArray(poems) || poems.length === 0) {
    throw new Error(`No poems found for ${author}.`);
  }

  const chapters = poems.slice(0, 120).map((poem, idx) => {
    const stanzas: string[] = [];
    let currentStanza: string[] = [];

    for (const line of poem.lines || []) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (currentStanza.length > 0) {
          stanzas.push(currentStanza.join(' / '));
          currentStanza = [];
        }
      } else {
        currentStanza.push(trimmed);
      }
    }
    if (currentStanza.length > 0) {
      stanzas.push(currentStanza.join(' / '));
    }

    return {
      title: poem.title?.trim() || `Poem ${idx + 1}`,
      paragraphs: stanzas.length > 0 ? stanzas : ['(Untitled verse)'],
    };
  });

  return buildParsedBookContent(bookId, chapters, 'text');
}
