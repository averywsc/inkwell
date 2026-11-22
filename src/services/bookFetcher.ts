import ePub from 'epubjs';
import type { Book, ParsedBookContent } from '../types/book';
import { fetchArrayBufferWithFallback, fetchTextWithFallback } from './proxy';
import { resolveArchiveReadableUrls, searchInternetArchive } from './internetArchive';
import { searchGutendex } from './gutendex';
import { fetchPoetryDbBookContent } from './poetryDb';
import { fetchWikisourceBookContent } from './wikisource';
import {
  buildParsedBookContent,
  htmlToCleanText,
  parsePlainTextToBook,
} from '../utils/textParser';
import { getCachedBookContent, saveBookContent, upsertSavedBook } from './storage';

export class ExternalPreviewOnlyError extends Error {
  externalUrl?: string;
  constructor(message: string, externalUrl?: string) {
    super(message);
    this.name = 'ExternalPreviewOnlyError';
    this.externalUrl = externalUrl;
  }
}

const ERROR_PAGE_PATTERNS = [
  /temporarily down for maintenance/i,
  /503 service temporarily unavailable/i,
  /502 bad gateway/i,
  /404 not found/i,
  /access denied/i,
  /just a moment\.\.\./i,
  /enable javascript and cookies to continue/i,
];

function isInvalidPlainTextPayload(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed.length < 300) return true;
  const head = trimmed.slice(0, 600);
  if (/^<!doctype\s+html/i.test(head) || /^<html[\s>]/i.test(head)) return true;
  if (trimmed.length < 6000 && ERROR_PAGE_PATTERNS.some((re) => re.test(trimmed))) return true;
  return false;
}

function isInvalidHtmlPayload(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed.length < 400) return true;
  if (trimmed.length < 8000 && ERROR_PAGE_PATTERNS.some((re) => re.test(trimmed))) return true;
  return false;
}

function isValidParsedContent(content: ParsedBookContent | undefined): content is ParsedBookContent {
  if (!content || content.chapters.length === 0) return false;
  if (content.sourceFormat !== 'local' && content.wordCount < 120) {
    if (ERROR_PAGE_PATTERNS.some((re) => re.test(content.fullText)) || /<html|<!doctype/i.test(content.fullText)) {
      return false;
    }
  }
  return true;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Parses an EPUB ArrayBuffer using epub.js, extracting metadata, cover art,
 * Table of Contents labels, and clean structured chapters for the E-Ink pagination engine.
 */
export async function parseEpubBuffer(
  buffer: ArrayBuffer,
  bookId: string,
  fallbackTitle: string
): Promise<{
  content: ParsedBookContent;
  metadata: {
    title?: string;
    author?: string;
    description?: string;
    coverDataUrl?: string;
  };
}> {
  const epubBook = ePub(buffer);
  await epubBook.ready;

  const meta = await epubBook.loaded.metadata;
  const navigation = await epubBook.loaded.navigation;
  const spine: any = await epubBook.loaded.spine;

  // Map href -> TOC title
  const tocTitleByHref = new Map<string, string>();
  const registerToc = (items: any[]) => {
    for (const item of items || []) {
      if (item.href && item.label) {
        const cleanHref = String(item.href).split('#')[0].replace(/^\/+/, '');
        if (!tocTitleByHref.has(cleanHref)) {
          tocTitleByHref.set(cleanHref, String(item.label).trim());
        }
      }
      if (item.subitems && item.subitems.length > 0) {
        registerToc(item.subitems);
      }
    }
  };
  registerToc(navigation?.toc || []);

  // Extract cover image as Data URL for offline IndexedDB persistence
  let coverDataUrl: string | undefined;
  try {
    const coverHref = await epubBook.coverUrl();
    if (coverHref) {
      const resp = await fetch(coverHref);
      if (resp.ok) {
        const blob = await resp.blob();
        coverDataUrl = await blobToDataUrl(blob);
      }
    }
  } catch {
    // Cover extraction optional
  }

  const spineItems: any[] = spine?.spineItems || spine?.items || [];
  const chapters: { title: string; paragraphs: string[] }[] = [];

  for (let i = 0; i < spineItems.length; i++) {
    const section = spineItems[i];
    try {
      const loadedDoc = await section.load(epubBook.load.bind(epubBook));
      let htmlString = '';
      if (typeof loadedDoc === 'string') {
        htmlString = loadedDoc;
      } else if (loadedDoc?.documentElement) {
        htmlString = loadedDoc.documentElement.outerHTML;
      } else if (loadedDoc?.body) {
        htmlString = loadedDoc.body.innerHTML;
      }
      section.unload?.();

      if (!htmlString) continue;

      const parsed = htmlToCleanText(htmlString);
      const hrefClean = String(section.href || '').split('#')[0].replace(/^\/+/, '');

      let tocTitle = tocTitleByHref.get(hrefClean);
      if (!tocTitle) {
        for (const [k, v] of tocTitleByHref.entries()) {
          if (hrefClean.endsWith(k) || k.endsWith(hrefClean)) {
            tocTitle = v;
            break;
          }
        }
      }

      if (parsed.detectedChapters && parsed.detectedChapters.length > 0) {
        for (const dc of parsed.detectedChapters) {
          if (dc.paragraphs.length > 0) {
            chapters.push({
              title: tocTitle && parsed.detectedChapters.length === 1 ? tocTitle : dc.title,
              paragraphs: dc.paragraphs,
            });
          }
        }
      } else {
        const paras = parsed.text
          .split(/\n\s*\n+/)
          .map((p) => p.trim())
          .filter((p) => p.length > 0);
        if (paras.length > 0) {
          chapters.push({
            title: tocTitle || `Section ${chapters.length + 1}`,
            paragraphs: paras,
          });
        }
      }
    } catch {
      // Skip unreadable spine section gracefully
    }
  }

  try {
    epubBook.destroy();
  } catch {
    // ignore
  }

  if (chapters.length === 0) {
    throw new Error('Could not extract readable text chapters from this EPUB file.');
  }

  const content = buildParsedBookContent(bookId, chapters, 'epub');
  return {
    content,
    metadata: {
      title: meta?.title?.trim() || fallbackTitle,
      author: meta?.creator?.trim() || undefined,
      description: meta?.description?.trim() || undefined,
      coverDataUrl,
    },
  };
}

async function tryDownloadStreams(
  bookId: string,
  bookTitle: string,
  streams: { textUrl?: string; htmlUrl?: string; epubUrl?: string },
  onStatus?: (status: string) => void,
  signal?: AbortSignal
): Promise<ParsedBookContent | null> {
  // 1. Plain Text stream
  if (streams.textUrl) {
    try {
      onStatus?.('Downloading plain-text edition…');
      const rawText = await fetchTextWithFallback(streams.textUrl, { timeoutMs: 18000, signal });
      if (!isInvalidPlainTextPayload(rawText)) {
        onStatus?.('Parsing chapters & typography…');
        const parsed = parsePlainTextToBook(bookId, rawText, bookTitle, 'text');
        if (isValidParsedContent(parsed)) return parsed;
      }
    } catch {
      // Fall through to HTML or EPUB
    }
  }

  // 2. HTML stream
  if (streams.htmlUrl) {
    try {
      onStatus?.('Downloading HTML edition…');
      const rawHtml = await fetchTextWithFallback(streams.htmlUrl, { timeoutMs: 18000, signal });
      if (!isInvalidHtmlPayload(rawHtml)) {
        onStatus?.('Extracting clean chapters from HTML…');
        const extracted = htmlToCleanText(rawHtml);
        const parsed =
          extracted.detectedChapters && extracted.detectedChapters.length >= 2
            ? buildParsedBookContent(bookId, extracted.detectedChapters, 'html')
            : parsePlainTextToBook(bookId, extracted.text, bookTitle, 'html');
        if (isValidParsedContent(parsed)) return parsed;
      }
    } catch {
      // Fall through to EPUB
    }
  }

  // 3. EPUB stream
  if (streams.epubUrl) {
    try {
      onStatus?.('Downloading EPUB package…');
      const buf = await fetchArrayBufferWithFallback(streams.epubUrl, { timeoutMs: 24000, signal });
      onStatus?.('Unpacking EPUB chapters & TOC…');
      const parsedEpub = await parseEpubBuffer(buf, bookId, bookTitle);
      if (isValidParsedContent(parsedEpub.content)) return parsedEpub.content;
    } catch {
      // Fall through
    }
  }

  return null;
}

/**
 * Fetches and parses a book's full text into chapters, caching it offline in IndexedDB.
 * Automatically falls back across Gutenberg and Internet Archive mirrors if one archive
 * is undergoing maintenance.
 */
export async function fetchAndPrepareBook(
  book: Book,
  onStatus?: (status: string) => void,
  signal?: AbortSignal
): Promise<ParsedBookContent> {
  // 1. Check offline IndexedDB cache first (validating it isn't a stale error page)
  const cached = await getCachedBookContent(book.id);
  if (isValidParsedContent(cached)) {
    return cached;
  }

  let content: ParsedBookContent | null = null;

  // 1b. Direct PoetryDB anthology reader
  if (book.poetryAuthor) {
    onStatus?.(`Loading collected poems by ${book.poetryAuthor}…`);
    content = await fetchPoetryDbBookContent(book.id, book.poetryAuthor, signal);
  }

  // 1c. Direct Wikisource text reader
  if (!content && book.wikisourceTitle) {
    onStatus?.('Loading text from Wikisource…');
    try {
      content = await fetchWikisourceBookContent(book.id, book.wikisourceTitle, signal);
    } catch {
      // fall through to archive mirrors
    }
  }

  // 2. Try primary direct streams (text / html / epub)
  if (book.formats.textUrl || book.formats.htmlUrl || book.formats.epubUrl) {
    content = await tryDownloadStreams(
      book.id,
      book.title,
      {
        textUrl: book.formats.textUrl,
        htmlUrl: book.formats.htmlUrl,
        epubUrl: book.formats.epubUrl,
      },
      onStatus,
      signal
    );
  }

  // 3. Try direct Internet Archive identifier if present
  if (!content && book.iaIdentifier) {
    onStatus?.('Querying Internet Archive manifest…');
    try {
      const iaUrls = await resolveArchiveReadableUrls(book.iaIdentifier, signal);
      content = await tryDownloadStreams(book.id, book.title, iaUrls, onStatus, signal);
    } catch {
      // Continue to cross-archive fallback
    }
  }

  // 4. Cross-archive mirror fallback: if primary archive failed (e.g. Gutenberg maintenance) or
  //    Open Library lacks raw text, locate a public-domain mirror on Internet Archive or Gutenberg
  if (!content) {
    const cleanTitle = book.title.split(':')[0].split(';')[0].trim();
    const authorLast = (book.authors[0] || '').split(' ').slice(-1)[0] || '';
    const mirrorQuery = `${cleanTitle} ${authorLast}`.trim();

    onStatus?.('Checking Internet Archive mirror for full text…');
    try {
      const iaMatches = await searchInternetArchive({ query: mirrorQuery, limit: 4, signal });
      const normTitle = cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
      const matchingIa = iaMatches.find((m) => {
        const nm = m.title.toLowerCase().replace(/[^a-z0-9]/g, '');
        return m.iaIdentifier && (nm.includes(normTitle.slice(0, 10)) || normTitle.includes(nm.slice(0, 10)));
      });
      if (matchingIa?.iaIdentifier) {
        const iaUrls = await resolveArchiveReadableUrls(matchingIa.iaIdentifier, signal);
        content = await tryDownloadStreams(book.id, book.title, iaUrls, onStatus, signal);
      }
    } catch {
      // Continue to Gutendex mirror
    }
  }

  if (!content && !book.formats.textUrl) {
    onStatus?.('Checking Project Gutenberg mirror…');
    try {
      const q = `${book.title.split(':')[0]} ${book.authors[0] || ''}`.trim();
      const matches = await searchGutendex({ query: q, limit: 4, signal });
      const normTarget = book.title.toLowerCase().replace(/[^a-z0-9]/g, '');
      const exact = matches.find((m) => {
        const nm = m.title.toLowerCase().replace(/[^a-z0-9]/g, '');
        return m.isReadableInApp && (nm.includes(normTarget.slice(0, 12)) || normTarget.includes(nm.slice(0, 12)));
      });
      if (exact) {
        content = await tryDownloadStreams(book.id, book.title, exact.formats, onStatus, signal);
      }
    } catch {
      // ignore
    }
  }

  if (!content) {
    throw new ExternalPreviewOnlyError(
      'Unable to stream the raw public-domain text right now (the remote archive may be under maintenance or offer only an external preview). You can still view this title directly on the source site.',
      book.formats.externalUrl
    );
  }

  // Cache validated full text offline in IndexedDB
  await saveBookContent(content);
  await upsertSavedBook(book, { isCachedOffline: true });

  return content;
}

/**
 * Imports a user-dropped local .txt or .epub file into the E-Ink library,
 * extracting cover art and Table of Contents automatically.
 */
export async function importLocalBookFile(file: File): Promise<{
  book: Book;
  content: ParsedBookContent;
}> {
  const lower = file.name.toLowerCase();
  const baseName = file.name.replace(/\.(epub|txt)$/i, '').replace(/[_-]+/g, ' ').trim();
  const bookId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  if (lower.endsWith('.epub')) {
    const buffer = await file.arrayBuffer();
    const { content, metadata } = await parseEpubBuffer(buffer, bookId, baseName);

    const book: Book = {
      id: bookId,
      title: metadata.title || baseName || 'Untitled EPUB',
      authors: metadata.author ? [metadata.author] : ['Local Edition'],
      source: 'local',
      sources: ['local'],
      coverUrl: metadata.coverDataUrl,
      subjects: ['Local EPUB', 'Personal Library'],
      description:
        metadata.description ||
        `Imported locally from ${file.name} (${content.chapters.length} chapters, ~${content.wordCount.toLocaleString()} words).`,
      language: 'EN',
      formats: {},
      isReadableInApp: true,
      isLocal: true,
      fileType: 'epub',
    };

    await saveBookContent(content);
    await upsertSavedBook(book, { inShelf: true, isCachedOffline: true });
    return { book, content };
  }

  if (lower.endsWith('.txt')) {
    const rawText = await file.text();
    const content = parsePlainTextToBook(bookId, rawText, baseName || 'Untitled Text', 'local');

    let title = baseName || 'Untitled Text';
    let author = 'Local Edition';
    const dashParts = file.name.replace(/\.txt$/i, '').split(' - ');
    if (dashParts.length === 2) {
      author = dashParts[0].trim();
      title = dashParts[1].trim();
    }

    const book: Book = {
      id: bookId,
      title,
      authors: [author],
      source: 'local',
      sources: ['local'],
      subjects: ['Local Text', 'Personal Library'],
      description: `Imported locally from ${file.name} (${content.chapters.length} sections, ~${content.wordCount.toLocaleString()} words).`,
      language: 'EN',
      formats: {},
      isReadableInApp: true,
      isLocal: true,
      fileType: 'txt',
    };

    await saveBookContent(content);
    await upsertSavedBook(book, { inShelf: true, isCachedOffline: true });
    return { book, content };
  }

  throw new Error('Unsupported file format. Please drop a .txt or .epub e-book file.');
}
