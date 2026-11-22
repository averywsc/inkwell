import type { Book, BookSource, SourceFilter } from '../types/book';
import { searchGutendex } from './gutendex';
import { searchOpenLibrary } from './openLibrary';
import { searchInternetArchive } from './internetArchive';
import { searchStandardEbooks } from './standardEbooks';
import { searchLibriVox } from './librivox';
import { searchMangaDexSafe } from './mangadex';
import { searchWikisource } from './wikisource';
import { fetchPoetryDbCatalog } from './poetryDb';
import { isCleanBook } from '../utils/contentFilter';

export interface CuratedShelfConfig {
  id: string;
  title: string;
  subtitle: string;
  gutendexTopic: string;
  openLibrarySubject: string;
  archiveSubject: string;
  standardEbooksTopic: string;
  comicsOnly?: boolean;
  mangaOnly?: boolean;
  poetryOnly?: boolean;
}

export const CURATED_SHELVES: CuratedShelfConfig[] = [
  {
    id: 'manga',
    title: 'Manga',
    subtitle: 'Safe-rated MangaDex & classic Japanese manga with RTL reading',
    gutendexTopic: '',
    openLibrarySubject: '',
    archiveSubject: 'manga',
    standardEbooksTopic: '',
    mangaOnly: true,
  },
  {
    id: 'comics',
    title: 'Comics & Graphic Novels',
    subtitle: 'Full-color superhero runs, compendiums & classic strips',
    gutendexTopic: '',
    openLibrarySubject: '',
    archiveSubject: 'comics',
    standardEbooksTopic: '',
    comicsOnly: true,
  },
  {
    id: 'scifi',
    title: 'Sci-Fi & Speculative',
    subtitle: 'Time travel, cosmic voyages & dystopian classics',
    gutendexTopic: 'science fiction',
    openLibrarySubject: 'science_fiction',
    archiveSubject: 'science fiction',
    standardEbooksTopic: 'science fiction',
  },
  {
    id: 'mystery',
    title: 'Mystery & Detective',
    subtitle: 'Investigations, noir suspense & locked-room puzzles',
    gutendexTopic: 'detective',
    openLibrarySubject: 'mystery',
    archiveSubject: 'detective and mystery stories',
    standardEbooksTopic: 'mystery',
  },
  {
    id: 'adventure',
    title: 'Fantasy & Adventure',
    subtitle: 'Epic quests, mythical worlds & high-seas expeditions',
    gutendexTopic: 'adventure',
    openLibrarySubject: 'fantasy',
    archiveSubject: 'adventure stories',
    standardEbooksTopic: 'adventure',
  },
  {
    id: 'horror',
    title: 'Gothic & Horror',
    subtitle: 'Supernatural fiction, Victorian chills & cosmic dread',
    gutendexTopic: 'horror',
    openLibrarySubject: 'horror',
    archiveSubject: 'ghost stories',
    standardEbooksTopic: 'horror',
  },
  {
    id: 'nineteenth-century',
    title: 'Timeless Fiction',
    subtitle: 'Essential novels & world literature classics',
    gutendexTopic: '19th century',
    openLibrarySubject: 'classic_literature',
    archiveSubject: '19th century fiction',
    standardEbooksTopic: '19th century',
  },
  {
    id: 'poetry',
    title: 'Collected Poetry',
    subtitle: 'Complete classic verse anthologies from PoetryDB & Wikisource',
    gutendexTopic: '',
    openLibrarySubject: '',
    archiveSubject: '',
    standardEbooksTopic: '',
    poetryOnly: true,
  },
  {
    id: 'philosophy',
    title: 'Philosophy & History',
    subtitle: 'Stoicism, essays, ancient dialogues & world history',
    gutendexTopic: 'philosophy',
    openLibrarySubject: 'philosophy',
    archiveSubject: 'philosophy',
    standardEbooksTopic: 'philosophy',
  },
];

export const SOURCE_LABELS: Record<BookSource, string> = {
  gutenberg: 'Gutenberg',
  openlibrary: 'Open Library',
  archive: 'Internet Archive',
  standardebooks: 'Standard Ebooks',
  librivox: 'LibriVox',
  mangadex: 'MangaDex',
  wikisource: 'Wikisource',
  poetrydb: 'PoetryDB',
  local: 'Local File',
};

function normalizeKeyPart(str: string): string {
  return str
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/^the\s+|^a\s+|^an\s+/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getDedupeKey(book: Book): string {
  const normTitle = normalizeKeyPart(book.title.split(':')[0].split(';')[0]);
  const primaryAuthor = book.authors[0] || '';
  const authorTokens = normalizeKeyPart(primaryAuthor).split(' ').filter(Boolean);
  const lastName = authorTokens[authorTokens.length - 1] || '';
  return `${normTitle}::${lastName}`;
}

export function diversifyShelfSeries(books: Book[], maxPerSeries = 1): Book[] {
  const counts = new Map<string, number>();
  const out: Book[] = [];

  for (const b of books) {
    const tokens = normalizeKeyPart(b.title)
      .replace(
        /\b(vol|volume|book|part|chapter|issue|comic|manga|series|collection|complete|deluxe|editions|full|color|upscaled|scans)\b/g,
        ''
      )
      .replace(/\b\d+\b/g, '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const seriesKey = tokens.slice(0, 2).join(' ') || b.id;
    const seen = counts.get(seriesKey) || 0;
    if (seen < maxPerSeries) {
      counts.set(seriesKey, seen + 1);
      out.push(b);
    }
  }
  return out;
}

function sourcePriority(source: BookSource): number {
  switch (source) {
    case 'gutenberg':
      return 6;
    case 'standardebooks':
      return 5;
    case 'mangadex':
      return 5;
    case 'archive':
      return 4;
    case 'poetrydb':
      return 4;
    case 'wikisource':
      return 3;
    case 'openlibrary':
      return 2;
    case 'librivox':
      return 1;
    default:
      return 0;
  }
}

/**
 * Deduplicates books across all 8 APIs AND enforces the global NSFW/porn/hentai firewall.
 */
export function deduplicateBooks(books: Book[]): Book[] {
  const map = new Map<string, Book>();

  for (const book of books) {
    if (!isCleanBook(book)) continue;

    const key = getDedupeKey(book);
    const existing = map.get(key);

    if (!existing) {
      map.set(key, {
        ...book,
        sources: Array.from(new Set(book.sources)),
      });
      continue;
    }

    const preferNewAsBase =
      (book.isReadableInApp && !existing.isReadableInApp) ||
      (book.isReadableInApp === existing.isReadableInApp &&
        sourcePriority(book.source) > sourcePriority(existing.source));

    const primary = preferNewAsBase ? book : existing;
    const secondary = preferNewAsBase ? existing : book;

    const bestCover =
      (secondary.source === 'openlibrary' && secondary.coverUrl) ||
      primary.coverUrl ||
      secondary.coverUrl;

    const mergedFormats = {
      textUrl: primary.formats.textUrl || secondary.formats.textUrl,
      htmlUrl: primary.formats.htmlUrl || secondary.formats.htmlUrl,
      epubUrl: primary.formats.epubUrl || secondary.formats.epubUrl,
      externalUrl: primary.formats.externalUrl || secondary.formats.externalUrl,
      audioUrl: primary.formats.audioUrl || secondary.formats.audioUrl,
    };

    const mergedSources = Array.from(new Set([...primary.sources, ...secondary.sources]));
    const mergedSubjects = Array.from(new Set([...primary.subjects, ...secondary.subjects])).slice(0, 10);

    const bestDescription =
      (primary.description && primary.description.length > (secondary.description?.length || 0)
        ? primary.description
        : secondary.description) || primary.description;

    map.set(key, {
      ...primary,
      sources: mergedSources,
      coverUrl: bestCover,
      subjects: mergedSubjects,
      description: bestDescription,
      publishYear: primary.publishYear || secondary.publishYear,
      gutenbergId: primary.gutenbergId || secondary.gutenbergId,
      openLibraryKey: primary.openLibraryKey || secondary.openLibraryKey,
      iaIdentifier: primary.iaIdentifier || secondary.iaIdentifier,
      mangadexId: primary.mangadexId || secondary.mangadexId,
      wikisourceTitle: primary.wikisourceTitle || secondary.wikisourceTitle,
      poetryAuthor: primary.poetryAuthor || secondary.poetryAuthor,
      isComic: Boolean(primary.isComic || secondary.isComic),
      isManga: Boolean(primary.isManga || secondary.isManga),
      category: primary.category || secondary.category,
      formats: mergedFormats,
      isReadableInApp: Boolean(
        mergedFormats.textUrl ||
          mergedFormats.htmlUrl ||
          mergedFormats.epubUrl ||
          primary.iaIdentifier ||
          secondary.iaIdentifier ||
          primary.mangadexId ||
          secondary.mangadexId ||
          primary.poetryAuthor ||
          secondary.poetryAuthor ||
          primary.wikisourceTitle ||
          secondary.wikisourceTitle
      ),
    });
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.isReadableInApp !== b.isReadableInApp) return a.isReadableInApp ? -1 : 1;
    if (a.sources.length !== b.sources.length) return b.sources.length - a.sources.length;
    return (b.downloadCount || 0) - (a.downloadCount || 0);
  });
}

export interface AggregatedSearchResult {
  books: Book[];
  sourceCounts: Record<BookSource, number>;
  errors: Partial<Record<BookSource, string>>;
}

export async function searchAllSources(
  query: string,
  filter: SourceFilter = 'all',
  signal?: AbortSignal
): Promise<AggregatedSearchResult> {
  const emptyCounts: Record<BookSource, number> = {
    gutenberg: 0,
    openlibrary: 0,
    archive: 0,
    standardebooks: 0,
    librivox: 0,
    mangadex: 0,
    wikisource: 0,
    poetrydb: 0,
    local: 0,
  };

  if (filter === 'manga') {
    const [md, ia] = await Promise.allSettled([
      searchMangaDexSafe({ query, limit: 25, signal }),
      searchInternetArchive({ query, mangaOnly: true, limit: 25, signal }),
    ]);
    const combined = [
      ...(md.status === 'fulfilled' ? md.value : []),
      ...(ia.status === 'fulfilled' ? ia.value : []),
    ];
    return {
      books: deduplicateBooks(combined),
      sourceCounts: {
        ...emptyCounts,
        mangadex: md.status === 'fulfilled' ? md.value.length : 0,
        archive: ia.status === 'fulfilled' ? ia.value.length : 0,
      },
      errors: {},
    };
  }

  if (filter === 'comics') {
    const books = await searchInternetArchive({ query, comicsOnly: true, limit: 40, signal });
    return {
      books: deduplicateBooks(books),
      sourceCounts: { ...emptyCounts, archive: books.length },
      errors: {},
    };
  }

  const activeSources: BookSource[] =
    filter === 'all'
      ? [
          'gutenberg',
          'openlibrary',
          'archive',
          'standardebooks',
          'librivox',
          'mangadex',
          'wikisource',
          'poetrydb',
        ]
      : [filter];

  const tasks: { source: BookSource; promise: Promise<Book[]> }[] = [];

  if (activeSources.includes('gutenberg')) {
    tasks.push({ source: 'gutenberg', promise: searchGutendex({ query, limit: 16, signal }) });
  }
  if (activeSources.includes('openlibrary')) {
    tasks.push({ source: 'openlibrary', promise: searchOpenLibrary({ query, limit: 18, signal }) });
  }
  if (activeSources.includes('archive')) {
    tasks.push({ source: 'archive', promise: searchInternetArchive({ query, limit: 18, signal }) });
  }
  if (activeSources.includes('standardebooks')) {
    tasks.push({ source: 'standardebooks', promise: searchStandardEbooks({ query, limit: 8, signal }) });
  }
  if (activeSources.includes('librivox')) {
    tasks.push({ source: 'librivox', promise: searchLibriVox({ query, limit: 8, signal }) });
  }
  if (activeSources.includes('mangadex')) {
    tasks.push({ source: 'mangadex', promise: searchMangaDexSafe({ query, limit: 14, signal }) });
  }
  if (activeSources.includes('wikisource')) {
    tasks.push({ source: 'wikisource', promise: searchWikisource({ query, limit: 12, signal }) });
  }
  if (activeSources.includes('poetrydb')) {
    tasks.push({ source: 'poetrydb', promise: fetchPoetryDbCatalog({ query, limit: 10, signal }) });
  }

  const settled = await Promise.allSettled(tasks.map((t) => t.promise));
  const rawBooks: Book[] = [];
  const errors: Partial<Record<BookSource, string>> = {};
  const sourceCounts: Record<BookSource, number> = { ...emptyCounts };

  settled.forEach((result, idx) => {
    const src = tasks[idx].source;
    if (result.status === 'fulfilled') {
      sourceCounts[src] = result.value.length;
      rawBooks.push(...result.value);
    } else {
      errors[src] = result.reason?.message || 'Source unavailable';
    }
  });

  return {
    books: deduplicateBooks(rawBooks),
    sourceCounts,
    errors,
  };
}

export async function fetchCuratedShelfBooks(
  config: CuratedShelfConfig,
  signal?: AbortSignal
): Promise<Book[]> {
  if (config.mangaOnly) {
    const [iaRes, mdRes] = await Promise.allSettled([
      searchInternetArchive({ mangaOnly: true, limit: 35, page: 1, signal }),
      searchMangaDexSafe({ limit: 18, signal }),
    ]);
    const combined = [
      ...(iaRes.status === 'fulfilled' ? iaRes.value : []),
      ...(mdRes.status === 'fulfilled' ? mdRes.value : []),
    ];
    return diversifyShelfSeries(deduplicateBooks(combined), 1).slice(0, 12);
  }

  if (config.comicsOnly) {
    const comics = await searchInternetArchive({ comicsOnly: true, limit: 45, page: 1, signal });
    return diversifyShelfSeries(deduplicateBooks(comics), 1).slice(0, 12);
  }

  if (config.poetryOnly) {
    const [poetryRes, wsRes] = await Promise.allSettled([
      fetchPoetryDbCatalog({ limit: 14, signal }),
      searchWikisource({ categoryTitle: 'Category:Poetry', category: 'Poetry & Drama', limit: 10, signal }),
    ]);
    const combined = [
      ...(poetryRes.status === 'fulfilled' ? poetryRes.value : []),
      ...(wsRes.status === 'fulfilled' ? wsRes.value : []),
    ];
    return deduplicateBooks(combined).slice(0, 12);
  }

  const results = await Promise.allSettled([
    searchGutendex({ topic: config.gutendexTopic, limit: 8, signal }),
    searchOpenLibrary({ subject: config.openLibrarySubject, limit: 10, signal }),
    searchInternetArchive({ subject: config.archiveSubject, limit: 6, signal }),
    searchStandardEbooks({ topic: config.standardEbooksTopic, limit: 4, signal }),
  ]);

  const combined: Book[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') {
      combined.push(...r.value);
    }
  }

  return diversifyShelfSeries(deduplicateBooks(combined), 1).slice(0, 12);
}
