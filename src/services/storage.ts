import type {
  Book,
  BookAnnotation,
  ParsedBookContent,
  ReaderSettings,
  ReadingProgress,
  SavedBookEntry,
} from '../types/book';
import { DEFAULT_BLOCKED_TAGS, isCleanBook } from '../utils/contentFilter';

const SETTINGS_KEY = 'inkwell-reader-settings-v3';
const CATALOG_CACHE_KEY = 'main-clean-v3';
const DB_NAME = 'inkwell-eink-db';
const DB_VERSION = 2;

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  theme: 'paper',
  einkCovers: false,
  einkFlash: false,
  hoverGlow: true,
  blockNsfw: true,
  blockedTags: [...DEFAULT_BLOCKED_TAGS],
  fontSize: 'M',
  fontSizePx: 19,
  fontFamily: 'serif',
  serifChoice: 'source-serif',
  lineSpacing: 'normal',
  marginWidth: 'medium',
  yearlyGoal: 12,
};

export function loadReaderSettings(): ReaderSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_READER_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_READER_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_READER_SETTINGS };
  }
}

export function saveReaderSettings(settings: ReaderSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage quota errors
  }
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('library')) {
        db.createObjectStore('library', { keyPath: 'book.id' });
      }
      if (!db.objectStoreNames.contains('contents')) {
        db.createObjectStore('contents', { keyPath: 'bookId' });
      }
      if (!db.objectStoreNames.contains('annotations')) {
        const annStore = db.createObjectStore('annotations', { keyPath: 'id' });
        annStore.createIndex('bookId', 'bookId', { unique: false });
      }
      if (!db.objectStoreNames.contains('comicFiles')) {
        db.createObjectStore('comicFiles', { keyPath: 'bookId' });
      }
      if (!db.objectStoreNames.contains('catalogCache')) {
        db.createObjectStore('catalogCache', { keyPath: 'key' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return dbPromise;
}

function idbReq<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllSavedBooks(): Promise<SavedBookEntry[]> {
  try {
    const db = await openDb();
    const tx = db.transaction('library', 'readonly');
    const items = await idbReq<SavedBookEntry[]>(tx.objectStore('library').getAll());
    return items
      .filter((e) => e?.book && isCleanBook(e.book))
      .sort((a, b) => {
        const timeA = a.progress?.lastReadAt || a.lastOpenedAt || a.addedAt;
        const timeB = b.progress?.lastReadAt || b.lastOpenedAt || b.addedAt;
        return timeB - timeA;
      });
  } catch {
    return [];
  }
}

export async function getSavedBook(bookId: string): Promise<SavedBookEntry | undefined> {
  try {
    const db = await openDb();
    const tx = db.transaction('library', 'readonly');
    return await idbReq<SavedBookEntry | undefined>(tx.objectStore('library').get(bookId));
  } catch {
    return undefined;
  }
}

export async function upsertSavedBook(
  book: Book,
  patch?: Partial<
    Pick<
      SavedBookEntry,
      | 'inShelf'
      | 'shelfStatus'
      | 'isFavorite'
      | 'rating'
      | 'hiddenFromContinue'
      | 'lastOpenedAt'
      | 'isCachedOffline'
      | 'progress'
    >
  >
): Promise<SavedBookEntry> {
  const existing = await getSavedBook(book.id);
  const entry: SavedBookEntry = {
    book: { ...existing?.book, ...book },
    addedAt: existing?.addedAt || Date.now(),
    inShelf: patch?.inShelf ?? existing?.inShelf ?? false,
    shelfStatus: patch && 'shelfStatus' in patch ? patch.shelfStatus : existing?.shelfStatus,
    isFavorite: patch?.isFavorite ?? existing?.isFavorite ?? false,
    rating: patch && 'rating' in patch ? patch.rating : existing?.rating,
    hiddenFromContinue: patch?.hiddenFromContinue ?? existing?.hiddenFromContinue ?? false,
    lastOpenedAt: patch?.lastOpenedAt ?? existing?.lastOpenedAt,
    isCachedOffline: patch?.isCachedOffline ?? existing?.isCachedOffline ?? false,
    progress: patch && 'progress' in patch ? patch.progress : existing?.progress,
  };

  const db = await openDb();
  const tx = db.transaction('library', 'readwrite');
  await idbReq(tx.objectStore('library').put(entry));
  return entry;
}

export async function updateReadingProgress(book: Book, progress: ReadingProgress): Promise<SavedBookEntry> {
  return upsertSavedBook(book, {
    progress,
    lastOpenedAt: progress.lastReadAt,
    hiddenFromContinue: false,
    shelfStatus: progress.percentage >= 99 ? 'finished' : 'reading',
  });
}

/**
 * Dismisses a book/comic/manga from the Continue Reading row while keeping it in Read History.
 */
export async function hideFromContinueReading(bookId: string): Promise<void> {
  const existing = await getSavedBook(bookId);
  if (!existing) return;
  await upsertSavedBook(existing.book, { hiddenFromContinue: true });
}

/**
 * Removes a book's progress & read history entry completely (keeps book only if explicitly saved to shelf).
 */
export async function removeFromReadHistory(bookId: string): Promise<void> {
  const existing = await getSavedBook(bookId);
  if (!existing) return;
  if (!existing.inShelf && !existing.book.isLocal && !existing.isFavorite) {
    await removeSavedBook(bookId);
    return;
  }
  await upsertSavedBook(existing.book, {
    progress: undefined,
    lastOpenedAt: undefined,
    hiddenFromContinue: true,
    shelfStatus: existing.shelfStatus === 'reading' ? 'want' : existing.shelfStatus,
  });
}

export async function removeSavedBook(bookId: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(['library', 'contents', 'annotations', 'comicFiles'], 'readwrite');
  tx.objectStore('library').delete(bookId);
  tx.objectStore('contents').delete(bookId);
  tx.objectStore('comicFiles').delete(bookId);

  const annIndex = tx.objectStore('annotations').index('bookId');
  const keys = await idbReq<IDBValidKey[]>(annIndex.getAllKeys(bookId));
  for (const key of keys) {
    tx.objectStore('annotations').delete(key);
  }
}

export async function saveBookContent(content: ParsedBookContent): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction('contents', 'readwrite');
    await idbReq(tx.objectStore('contents').put(content));
  } catch {
    // ignore quota errors
  }
}

export async function getCachedBookContent(bookId: string): Promise<ParsedBookContent | undefined> {
  try {
    const db = await openDb();
    const tx = db.transaction('contents', 'readonly');
    return await idbReq<ParsedBookContent | undefined>(tx.objectStore('contents').get(bookId));
  } catch {
    return undefined;
  }
}

export async function saveLocalComicBlob(bookId: string, blob: Blob): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('comicFiles', 'readwrite');
  await idbReq(tx.objectStore('comicFiles').put({ bookId, blob }));
}

export async function getLocalComicBlob(bookId: string): Promise<Blob | undefined> {
  try {
    const db = await openDb();
    const tx = db.transaction('comicFiles', 'readonly');
    const rec = await idbReq<{ bookId: string; blob: Blob } | undefined>(
      tx.objectStore('comicFiles').get(bookId)
    );
    return rec?.blob;
  } catch {
    return undefined;
  }
}

export async function saveCachedCatalog(books: Book[]): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction('catalogCache', 'readwrite');
    await idbReq(tx.objectStore('catalogCache').put({ key: CATALOG_CACHE_KEY, books, savedAt: Date.now() }));
  } catch {
    // ignore quota errors
  }
}

export async function getCachedCatalog(): Promise<{ books: Book[]; savedAt: number } | undefined> {
  try {
    const db = await openDb();
    const tx = db.transaction('catalogCache', 'readonly');
    return await idbReq<{ books: Book[]; savedAt: number } | undefined>(
      tx.objectStore('catalogCache').get(CATALOG_CACHE_KEY)
    );
  } catch {
    return undefined;
  }
}

export async function clearCachedCatalog(): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction('catalogCache', 'readwrite');
    await idbReq(tx.objectStore('catalogCache').delete(CATALOG_CACHE_KEY));
  } catch {
    // ignore
  }
}

export async function getAnnotationsForBook(bookId: string): Promise<BookAnnotation[]> {
  try {
    const db = await openDb();
    const tx = db.transaction('annotations', 'readonly');
    const idx = tx.objectStore('annotations').index('bookId');
    const list = await idbReq<BookAnnotation[]>(idx.getAll(bookId));
    return list.sort((a, b) => a.charOffset - b.charOffset);
  } catch {
    return [];
  }
}

export async function getAllAnnotations(): Promise<BookAnnotation[]> {
  try {
    const db = await openDb();
    const tx = db.transaction('annotations', 'readonly');
    const list = await idbReq<BookAnnotation[]>(tx.objectStore('annotations').getAll());
    return list.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export async function saveAnnotation(annotation: BookAnnotation): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('annotations', 'readwrite');
  await idbReq(tx.objectStore('annotations').put(annotation));
}

export async function deleteAnnotation(annotationId: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('annotations', 'readwrite');
  await idbReq(tx.objectStore('annotations').delete(annotationId));
}
