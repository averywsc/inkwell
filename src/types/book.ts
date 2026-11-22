export type BookSource =
  | 'gutenberg'
  | 'openlibrary'
  | 'archive'
  | 'standardebooks'
  | 'librivox'
  | 'mangadex'
  | 'wikisource'
  | 'poetrydb'
  | 'local';

export type SourceFilter = 'all' | 'manga' | 'comics' | BookSource;

export type DisplayTheme = 'paper' | 'frontlight' | 'night';

export type FontSizeKey = 'S' | 'M' | 'L' | 'XL';
export type FontFamilyKey = 'serif' | 'sans' | 'mono';
export type SerifChoice = 'source-serif' | 'literata' | 'lora';
export type LineSpacingKey = 'compact' | 'normal' | 'relaxed';
export type MarginWidthKey = 'narrow' | 'medium' | 'wide';

export type ComicViewMode = 'single' | 'spread' | 'strip';
export type ShelfStatus = 'want' | 'reading' | 'finished';

export interface BookFormats {
  textUrl?: string;
  htmlUrl?: string;
  epubUrl?: string;
  externalUrl?: string;
  audioUrl?: string;
}

export interface Book {
  id: string;
  title: string;
  authors: string[];
  source: BookSource;
  sources: BookSource[];
  coverUrl?: string;
  subjects: string[];
  description?: string;
  publishYear?: number | string;
  language?: string;
  downloadCount?: number;
  formats: BookFormats;
  gutenbergId?: number;
  openLibraryKey?: string;
  iaIdentifier?: string;
  mangadexId?: string;
  wikisourceTitle?: string;
  poetryAuthor?: string;
  isReadableInApp: boolean;
  /** True if this item is a comic book, manga, or image-based graphic novel */
  isComic?: boolean;
  /** True if this item is Manga (defaults to Right-to-Left reading order!) */
  isManga?: boolean;
  /** Category tag for 1,000+ catalog browsing */
  category?: string;
  isLocal?: boolean;
  fileType?: 'txt' | 'epub' | 'cbz';
}

export interface ComicVolume {
  id: string;
  title: string;
  pageCount: number;
  /** For IA volumes backed by *_jp2.zip */
  server?: string;
  dir?: string;
  zipName?: string;
  volPrefix?: string;
  leafNums?: number[];
  /** For MangaDex hosted chapters */
  mangadexChapterId?: string;
  /** Direct page URLs (standalone images, local .cbz, or hydrated MangaDex chapter pages) */
  directUrls?: string[];
  thumbUrls?: string[];
}

export interface ComicBookData {
  bookId: string;
  identifier?: string;
  mangadexId?: string;
  volumes: ComicVolume[];
  isLocalCbz?: boolean;
}

export interface Chapter {
  id: string;
  title: string;
  startOffset: number;
  paragraphs: string[];
}

export interface ParsedBookContent {
  bookId: string;
  fullText: string;
  chapters: Chapter[];
  wordCount: number;
  fetchedAt: number;
  sourceFormat: 'text' | 'html' | 'epub' | 'local';
}

export interface PageBlock {
  type: 'chapter-heading' | 'paragraph';
  text: string;
  startOffset: number;
  endOffset: number;
  isContinuation?: boolean;
  chapterIndex: number;
}

export interface ReaderPage {
  pageNumber: number; // 1-based
  blocks: PageBlock[];
  startOffset: number;
  endOffset: number;
  chapterIndex: number;
  chapterTitle: string;
}

export interface ReadingProgress {
  bookId: string;
  charOffset: number;
  pageNumber: number;
  totalPages: number;
  percentage: number;
  chapterTitle: string;
  volumeIndex?: number;
  lastReadAt: number;
}

export interface SavedBookEntry {
  book: Book;
  addedAt: number;
  inShelf: boolean;
  shelfStatus?: ShelfStatus;
  isFavorite?: boolean;
  rating?: number; // 1-5
  /** When true, book stays in Read History / Library but is hidden from Continue Reading */
  hiddenFromContinue?: boolean;
  /** Timestamp when user last opened/read this title (for Read History) */
  lastOpenedAt?: number;
  isCachedOffline: boolean;
  progress?: ReadingProgress;
}

export interface BookAnnotation {
  id: string;
  bookId: string;
  type: 'bookmark' | 'highlight';
  charOffset: number;
  endOffset?: number;
  text: string;
  chapterTitle: string;
  note?: string;
  createdAt: number;
}

export interface ReaderSettings {
  theme: DisplayTheme;
  einkCovers: boolean;
  einkFlash: boolean;
  hoverGlow: boolean;
  blockNsfw: boolean;
  blockedTags: string[];
  fontSize: FontSizeKey;
  /** Fine-grained reading text zoom in px (14–32), overrides preset when set */
  fontSizePx?: number;
  fontFamily: FontFamilyKey;
  serifChoice: SerifChoice;
  lineSpacing: LineSpacingKey;
  marginWidth: MarginWidthKey;
  yearlyGoal?: number;
}

export interface SearchMatch {
  charOffset: number;
  endOffset: number;
  pageNumber: number;
  chapterTitle: string;
  snippetBefore: string;
  matchText: string;
  snippetAfter: string;
}

export interface CuratedShelf {
  id: string;
  title: string;
  subtitle: string;
  query: string;
  topic: string;
  books: Book[];
  loading: boolean;
  error?: string;
}
