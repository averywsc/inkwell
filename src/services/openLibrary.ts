import type { Book } from '../types/book';
import { fetchJsonWithFallback } from './proxy';
import { isCleanMetadata } from '../utils/contentFilter';

interface OpenLibraryDoc {
  key: string;
  title: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  subject?: string[];
  language?: string[];
  ia?: string[];
  has_fulltext?: boolean;
  public_scan_b?: boolean;
  ebook_access?: string;
  first_sentence?: string[] | string;
}

interface OpenLibrarySearchResponse {
  numFound: number;
  docs: OpenLibraryDoc[];
}

interface OpenLibrarySubjectWork {
  key: string;
  title: string;
  authors?: { name: string }[];
  first_publish_year?: number;
  cover_id?: number;
  subject?: string[];
  ia?: string;
  has_fulltext?: boolean;
  public_scan?: boolean;
}

interface OpenLibrarySubjectResponse {
  works?: OpenLibrarySubjectWork[];
}

interface OpenLibraryWorkDetail {
  description?: string | { value: string };
  subjects?: string[];
}

function normalizeOpenLibraryDoc(doc: OpenLibraryDoc, category?: string): Book | null {
  const subjects = (doc.subject || []).slice(0, 8);
  const authors =
    doc.author_name && doc.author_name.length > 0 ? doc.author_name.slice(0, 3) : ['Unknown Author'];
  const firstSentence = Array.isArray(doc.first_sentence)
    ? doc.first_sentence[0]
    : doc.first_sentence;

  if (
    !isCleanMetadata({
      id: doc.key,
      title: doc.title,
      authors,
      subjects,
      description: firstSentence,
    })
  ) {
    return null;
  }

  const coverUrl = doc.cover_i
    ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
    : undefined;

  const isPublicScan = doc.public_scan_b === true || doc.ebook_access === 'public';
  const iaId = isPublicScan && doc.ia && doc.ia.length > 0 ? doc.ia[0] : undefined;
  const cleanKey = doc.key.replace(/^\/works\//, '');
  const isComic = /\b(comic|comics|graphic novel)\b/i.test(`${doc.title} ${subjects.join(' ')}`);

  return {
    id: `openlibrary-${cleanKey}`,
    title: doc.title.trim(),
    authors,
    source: 'openlibrary',
    sources: ['openlibrary'],
    coverUrl,
    subjects,
    description: firstSentence ? `“${firstSentence}”` : undefined,
    publishYear: doc.first_publish_year,
    language: doc.language?.[0]?.toUpperCase().slice(0, 3) || 'EN',
    openLibraryKey: doc.key,
    iaIdentifier: iaId,
    formats: {
      externalUrl: `https://openlibrary.org${doc.key}`,
    },
    isReadableInApp: Boolean(iaId),
    isComic,
    category: isComic ? 'Comics' : category,
  };
}

export async function searchOpenLibrary(params: {
  query?: string;
  subject?: string;
  category?: string;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}): Promise<Book[]> {
  const url = new URL('https://openlibrary.org/search.json');
  const limit = params.limit ?? 14;

  if (params.query) {
    url.searchParams.set('q', params.query);
  } else if (params.subject) {
    url.searchParams.set('subject', params.subject);
    url.searchParams.set('sort', 'editions');
  } else {
    url.searchParams.set('q', 'classic literature');
  }

  url.searchParams.set('has_fulltext', 'true');
  url.searchParams.set('limit', String(limit));
  if (params.offset && params.offset > 0) {
    url.searchParams.set('offset', String(params.offset));
  }
  url.searchParams.set(
    'fields',
    'key,title,author_name,first_publish_year,cover_i,subject,language,ia,has_fulltext,public_scan_b,ebook_access,first_sentence'
  );

  const data = await fetchJsonWithFallback<OpenLibrarySearchResponse>(url.toString(), {
    preferDirect: true,
    timeoutMs: 14000,
    signal: params.signal,
  });

  return (data.docs || [])
    .filter((d) => Boolean(d.title))
    .map((d) => normalizeOpenLibraryDoc(d, params.category))
    .filter((b): b is Book => Boolean(b));
}

/**
 * Fast Open Library Subjects endpoint (https://openlibrary.org/subjects/{subject}.json)
 * for rapid infinite catalog expansion across 20+ curated genres.
 */
export async function fetchOpenLibrarySubject(params: {
  subject: string;
  category?: string;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}): Promise<Book[]> {
  const limit = params.limit ?? 80;
  const offset = params.offset ?? 0;
  const url = `https://openlibrary.org/subjects/${encodeURIComponent(
    params.subject
  )}.json?limit=${limit}&offset=${offset}`;

  try {
    const data = await fetchJsonWithFallback<OpenLibrarySubjectResponse>(url, {
      preferDirect: true,
      timeoutMs: 12000,
      signal: params.signal,
    });

    const out: Book[] = [];
    for (const w of data.works || []) {
      const authors = (w.authors || []).map((a) => a.name).filter(Boolean);
      const subjects = (w.subject || []).slice(0, 7);
      if (!isCleanMetadata({ id: w.key, title: w.title, authors, subjects })) continue;

      const cleanKey = w.key.replace(/^\/works\//, '');
      const iaId = w.public_scan && w.ia ? w.ia : undefined;
      out.push({
        id: `openlibrary-${cleanKey}`,
        title: w.title.trim(),
        authors: authors.length > 0 ? authors.slice(0, 2) : ['Unknown Author'],
        source: 'openlibrary',
        sources: ['openlibrary'],
        coverUrl: w.cover_id ? `https://covers.openlibrary.org/b/id/${w.cover_id}-L.jpg` : undefined,
        subjects,
        publishYear: w.first_publish_year,
        language: 'EN',
        openLibraryKey: w.key,
        iaIdentifier: iaId,
        formats: {
          externalUrl: `https://openlibrary.org${w.key}`,
        },
        isReadableInApp: Boolean(iaId),
        category: params.category,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export async function fetchOpenLibrarySynopsis(workKey: string): Promise<string | undefined> {
  try {
    const cleanKey = workKey.startsWith('/') ? workKey : `/works/${workKey}`;
    const data = await fetchJsonWithFallback<OpenLibraryWorkDetail>(
      `https://openlibrary.org${cleanKey}.json`,
      { preferDirect: true, timeoutMs: 8000 }
    );
    if (!data.description) return undefined;
    if (typeof data.description === 'string') return data.description.trim();
    if (typeof data.description.value === 'string') return data.description.value.trim();
    return undefined;
  } catch {
    return undefined;
  }
}
