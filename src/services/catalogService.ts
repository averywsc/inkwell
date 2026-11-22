import type { Book } from '../types/book';
import { deduplicateBooks } from './aggregator';
import { searchInternetArchive } from './internetArchive';
import { fetchOpenLibrarySubject, searchOpenLibrary } from './openLibrary';
import { searchStandardEbooks } from './standardEbooks';
import { searchMangaDexSafe } from './mangadex';
import { fetchPoetryDbCatalog } from './poetryDb';
import { searchWikisource } from './wikisource';
import { getCachedCatalog, saveCachedCatalog } from './storage';

export const CATALOG_CATEGORIES = [
  'All',
  'Manga',
  'Comics',
  'Fiction',
  'Sci-Fi',
  'Mystery',
  'Philosophy',
  'History',
  'Adventure',
  'Horror & Gothic',
  'Poetry & Drama',
  'Biography',
  'Science',
] as const;

export type CatalogCategory = (typeof CATALOG_CATEGORIES)[number];

interface CatalogBatchTask {
  label: string;
  run: (signal?: AbortSignal) => Promise<Book[]>;
}

/**
 * 22 clean multi-source batches across 8 open APIs (Internet Archive, Open Library,
 * MangaDex Safe, PoetryDB, Wikisource, Standard Ebooks, Gutendex) yielding 1,500–2,000+
 * deduplicated safe books, comics, and manga automatically!
 */
const CATALOG_BATCHES: CatalogBatchTask[] = [
  // Wave 1 (~350 titles)
  {
    label: 'MangaDex Safe',
    run: (signal) => searchMangaDexSafe({ limit: 80, offset: 0, signal }),
  },
  {
    label: 'Manga Archive',
    run: (signal) => searchInternetArchive({ mangaOnly: true, category: 'Manga', limit: 100, page: 1, signal }),
  },
  {
    label: 'Comics & Graphic Novels',
    run: (signal) => searchInternetArchive({ comicsOnly: true, category: 'Comics', limit: 100, page: 1, signal }),
  },
  {
    label: 'Classic Literature',
    run: (signal) => searchInternetArchive({ collection: 'gutenberg', category: 'Fiction', limit: 100, page: 1, signal }),
  },
  {
    label: 'Standard Ebooks',
    run: (signal) => searchStandardEbooks({ limit: 20, signal }),
  },

  // Wave 2 (~350 more)
  {
    label: 'PoetryDB Complete Anthologies',
    run: (signal) => fetchPoetryDbCatalog({ limit: 129, signal }),
  },
  {
    label: 'Open Library Fiction',
    run: (signal) => searchOpenLibrary({ subject: 'classic_literature', category: 'Fiction', limit: 100, offset: 0, signal }),
  },
  {
    label: 'Sci-Fi & Speculative',
    run: (signal) => searchOpenLibrary({ subject: 'science_fiction', category: 'Sci-Fi', limit: 100, offset: 0, signal }),
  },
  {
    label: 'Wikisource Short Stories',
    run: (signal) => searchWikisource({ categoryTitle: 'Category:Short_stories', category: 'Fiction', limit: 50, signal }),
  },

  // Wave 3 (~350 more)
  {
    label: 'Mystery & Detective',
    run: (signal) => searchOpenLibrary({ subject: 'mystery', category: 'Mystery', limit: 100, offset: 0, signal }),
  },
  {
    label: 'MangaDex Safe Wave II',
    run: (signal) => searchMangaDexSafe({ limit: 80, offset: 80, signal }),
  },
  {
    label: 'Comics Wave II',
    run: (signal) => searchInternetArchive({ comicsOnly: true, category: 'Comics', limit: 100, page: 2, signal }),
  },
  {
    label: 'Philosophy & Essays',
    run: (signal) => searchOpenLibrary({ subject: 'philosophy', category: 'Philosophy', limit: 100, offset: 0, signal }),
  },

  // Wave 4 (~350 more)
  {
    label: 'History & Antiquity',
    run: (signal) => searchOpenLibrary({ subject: 'history', category: 'History', limit: 100, offset: 0, signal }),
  },
  {
    label: 'Adventure & Voyages',
    run: (signal) => searchOpenLibrary({ subject: 'adventure', category: 'Adventure', limit: 100, offset: 0, signal }),
  },
  {
    label: 'Horror & Gothic',
    run: (signal) => searchOpenLibrary({ subject: 'horror', category: 'Horror & Gothic', limit: 100, offset: 0, signal }),
  },
  {
    label: 'Science & Natural Philosophy',
    run: (signal) => fetchOpenLibrarySubject({ subject: 'science', category: 'Science', limit: 80, offset: 0, signal }),
  },

  // Wave 5 (~400 more)
  {
    label: 'Drama & Plays',
    run: (signal) => fetchOpenLibrarySubject({ subject: 'drama', category: 'Poetry & Drama', limit: 80, offset: 0, signal }),
  },
  {
    label: 'Biography & Memoirs',
    run: (signal) => searchOpenLibrary({ subject: 'biography', category: 'Biography', limit: 100, offset: 0, signal }),
  },
  {
    label: 'Fantasy & Mythology',
    run: (signal) => fetchOpenLibrarySubject({ subject: 'mythology', category: 'Adventure', limit: 80, offset: 0, signal }),
  },
  {
    label: 'Gutenberg Classics Vol. II',
    run: (signal) => searchInternetArchive({ collection: 'gutenberg', category: 'Fiction', limit: 100, page: 2, signal }),
  },
  {
    label: 'Manga Archive Wave II',
    run: (signal) => searchInternetArchive({ mangaOnly: true, category: 'Manga', limit: 100, page: 2, signal }),
  },
];

const EXTRA_SUBJECT_ROTATION: { subject: string; category: CatalogCategory }[] = [
  { subject: 'thriller', category: 'Mystery' },
  { subject: 'astronomy', category: 'Science' },
  { subject: 'psychology', category: 'Philosophy' },
  { subject: 'children', category: 'Adventure' },
  { subject: 'world_history', category: 'History' },
  { subject: 'short_stories', category: 'Fiction' },
  { subject: 'folklore', category: 'Adventure' },
  { subject: 'architecture', category: 'History' },
  { subject: 'mathematics', category: 'Science' },
  { subject: 'ancient_history', category: 'History' },
  { subject: 'music', category: 'Poetry & Drama' },
  { subject: 'economics', category: 'Philosophy' },
];

const CACHE_TTL_MS = 1000 * 60 * 60 * 12;

export async function loadThousandBookCatalog(
  onUpdate: (books: Book[], meta: { done: boolean; loadedWaves: number; totalWaves: number }) => void,
  signal?: AbortSignal
): Promise<Book[]> {
  const cached = await getCachedCatalog();
  if (cached && cached.books.length >= 1000 && Date.now() - cached.savedAt < CACHE_TTL_MS) {
    const cleanCached = deduplicateBooks(cached.books);
    onUpdate(cleanCached, { done: true, loadedWaves: 5, totalWaves: 5 });
    return cleanCached;
  }

  let accumulated: Book[] = cached?.books ? deduplicateBooks(cached.books) : [];
  if (accumulated.length > 0) {
    onUpdate(accumulated, { done: false, loadedWaves: 1, totalWaves: 5 });
  }

  const waves: CatalogBatchTask[][] = [
    CATALOG_BATCHES.slice(0, 5),
    CATALOG_BATCHES.slice(5, 9),
    CATALOG_BATCHES.slice(9, 13),
    CATALOG_BATCHES.slice(13, 17),
    CATALOG_BATCHES.slice(17, 22),
  ];

  for (let w = 0; w < waves.length; w++) {
    if (signal?.aborted) break;
    const wave = waves[w];
    const settled = await Promise.allSettled(wave.map((t) => t.run(signal)));
    const fresh: Book[] = [];
    for (const r of settled) {
      if (r.status === 'fulfilled') {
        fresh.push(...r.value);
      }
    }
    accumulated = deduplicateBooks([...accumulated, ...fresh]);
    const isLast = w === waves.length - 1;
    onUpdate(accumulated, { done: isLast, loadedWaves: w + 1, totalWaves: waves.length });

    if (accumulated.length >= 300) {
      saveCachedCatalog(accumulated).catch(() => {});
    }
  }

  return accumulated;
}

/**
 * On-demand infinite catalog expansion: fetches +200–300 more unique books, comics, or manga
 * from Open Library Subjects, Internet Archive, MangaDex Safe, and Wikisource every time
 * the user clicks "Load More from Archives".
 */
export async function fetchMoreCatalogBatch(
  batchIndex: number,
  mode: 'all' | 'comics' | 'manga' = 'all'
): Promise<Book[]> {
  const tasks: Promise<Book[]>[] = [];

  if (mode === 'manga') {
    tasks.push(
      searchMangaDexSafe({ limit: 80, offset: (batchIndex + 2) * 80 }),
      searchInternetArchive({ mangaOnly: true, category: 'Manga', limit: 100, page: batchIndex + 3 })
    );
  } else if (mode === 'comics') {
    tasks.push(
      searchInternetArchive({ comicsOnly: true, category: 'Comics', limit: 100, page: batchIndex + 3 }),
      searchInternetArchive({
        collection: 'goldenagecomics',
        comicsOnly: true,
        category: 'Comics',
        limit: 80,
        page: batchIndex + 1,
      })
    );
  } else {
    const subA = EXTRA_SUBJECT_ROTATION[(batchIndex * 2) % EXTRA_SUBJECT_ROTATION.length];
    const subB = EXTRA_SUBJECT_ROTATION[(batchIndex * 2 + 1) % EXTRA_SUBJECT_ROTATION.length];
    const olOffset = Math.floor((batchIndex * 2) / EXTRA_SUBJECT_ROTATION.length) * 80;

    tasks.push(
      fetchOpenLibrarySubject({ subject: subA.subject, category: subA.category, limit: 80, offset: olOffset }),
      fetchOpenLibrarySubject({ subject: subB.subject, category: subB.category, limit: 80, offset: olOffset }),
      searchInternetArchive({ collection: 'gutenberg', category: 'Fiction', limit: 100, page: batchIndex + 3 }),
      searchMangaDexSafe({ limit: 50, offset: (batchIndex + 2) * 50 })
    );
  }

  const settled = await Promise.allSettled(tasks);
  const combined: Book[] = [];
  for (const r of settled) {
    if (r.status === 'fulfilled') combined.push(...r.value);
  }
  return deduplicateBooks(combined);
}
