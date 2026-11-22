import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BookMarked,
  BookOpen,
  Bookmark,
  Check,
  Clock,
  Heart,
  Highlighter,
  Image as ImageIcon,
  Minus,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type {
  Book,
  BookAnnotation,
  CuratedShelf,
  SavedBookEntry,
  ShelfStatus,
  SourceFilter,
} from '../types/book';
import type { CatalogCategory } from '../services/catalogService';
import { BookCard } from './BookCard';
import { SkeletonShelf } from './SkeletonShelf';
import { TypographicCover } from './TypographicCover';

const QUICK_GENRES: { label: string; category: CatalogCategory }[] = [
  { label: 'Manga', category: 'Manga' },
  { label: 'Comics', category: 'Comics' },
  { label: 'Sci-Fi', category: 'Sci-Fi' },
  { label: 'Mystery', category: 'Mystery' },
  { label: 'Adventure', category: 'Adventure' },
  { label: 'Horror & Gothic', category: 'Horror & Gothic' },
  { label: 'Fiction', category: 'Fiction' },
  { label: 'Philosophy', category: 'Philosophy' },
  { label: 'History', category: 'History' },
  { label: 'Science', category: 'Science' },
  { label: 'Poetry & Drama', category: 'Poetry & Drama' },
  { label: 'Biography', category: 'Biography' },
];

function formatRelativeDate(ts?: number): string {
  if (!ts) return '';
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 2) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface ContinueCardItemProps {
  entry: SavedBookEntry;
  onResume: (book: Book) => void;
  onRemove: (bookId: string) => void;
}

const ContinueCardItem: React.FC<ContinueCardItemProps> = ({ entry, onResume, onRemove }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const progress = entry.progress;

  return (
    <div
      className="continue-item-card"
      role="button"
      tabIndex={0}
      onClick={() => onResume(entry.book)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onResume(entry.book);
        }
      }}
    >
      <button
        type="button"
        className="continue-remove-btn"
        title="Remove from Continue Reading"
        aria-label={`Remove ${entry.book.title} from Continue Reading`}
        onClick={(e) => {
          e.stopPropagation();
          onRemove(entry.book.id);
        }}
      >
        <X size={14} />
      </button>

      <div className="continue-thumb">
        {entry.book.coverUrl && !imgFailed ? (
          <img
            src={entry.book.coverUrl}
            alt={entry.book.title}
            className="book-cover-img"
            onLoad={(e) => {
              if (e.currentTarget.naturalWidth < 20 || e.currentTarget.naturalHeight < 20) {
                setImgFailed(true);
              }
            }}
            onError={() => setImgFailed(true)}
          />
        ) : (
          <TypographicCover
            title={entry.book.title}
            author={entry.book.authors[0] || ''}
            compact
          />
        )}
      </div>

      <div className="continue-meta" style={{ paddingRight: 22 }}>
        <div className="continue-eyebrow">
          {entry.book.isManga ? 'Manga' : entry.book.isComic ? 'Comic' : 'Book'}
          {progress ? ` · ${progress.percentage}%` : ''}
        </div>
        <h3 className="continue-title" style={{ fontSize: 15.5 }}>
          {entry.book.title}
        </h3>
        <div className="continue-sub" style={{ fontSize: 12 }}>
          {progress
            ? `Page ${progress.pageNumber} of ${progress.totalPages}`
            : entry.book.authors[0] || ''}
        </div>
        {progress && (
          <div className="progress-track-clean" style={{ marginTop: 8 }}>
            <div
              className="progress-fill-clean"
              style={{ width: `${Math.max(4, progress.percentage)}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

interface DiscoverBookshelfProps {
  shelves: CuratedShelf[];
  activeSearchTerm: string;
  searchResults: Book[] | null;
  isSearching: boolean;
  sourceFilter: SourceFilter;
  savedMap: Map<string, SavedBookEntry>;
  continueReadingEntries: SavedBookEntry[];
  readHistoryCount: number;
  catalogCount: number;
  onSelectBook: (book: Book) => void;
  onResumeBook: (book: Book) => void;
  onRemoveFromContinue: (bookId: string) => void;
  onOpenHistory: () => void;
  onQuickTopic: (topic: string, shelfId?: string) => void;
  onJumpCategory: (cat: CatalogCategory) => void;
  onOpenCatalog: () => void;
}

export const DiscoverBookshelf: React.FC<DiscoverBookshelfProps> = ({
  shelves,
  activeSearchTerm,
  searchResults,
  isSearching,
  sourceFilter,
  savedMap,
  continueReadingEntries,
  readHistoryCount,
  catalogCount,
  onSelectBook,
  onResumeBook,
  onRemoveFromContinue,
  onOpenHistory,
  onQuickTopic,
  onJumpCategory,
  onOpenCatalog,
}) => {
  const [spotlightIndex, setSpotlightIndex] = useState(0);
  const [spotlightImgFailed, setSpotlightImgFailed] = useState(false);

  const filterBooks = (list: Book[]): Book[] => {
    if (sourceFilter === 'all') return list;
    if (sourceFilter === 'manga') return list.filter((b) => Boolean(b.isManga));
    if (sourceFilter === 'comics') return list.filter((b) => Boolean(b.isComic && !b.isManga));
    return list.filter((b) => b.source === sourceFilter || b.sources.includes(sourceFilter));
  };

  const spotlightPool = useMemo(() => {
    const picks: Book[] = [];
    for (const s of shelves) {
      if (s.books.length > 0) {
        const candidate = s.books.find((b) => Boolean(b.coverUrl)) || s.books[0];
        if (candidate) picks.push(candidate);
      }
    }
    return picks;
  }, [shelves]);

  const spotlightBook =
    spotlightPool.length > 0 ? spotlightPool[spotlightIndex % spotlightPool.length] : null;

  return (
    <div>
      {/* Quick Genre Shortcut Strip */}
      {!activeSearchTerm && (
        <div className="genre-strip" aria-label="Browse by genre">
          {QUICK_GENRES.map((g) => (
            <button
              key={g.category}
              type="button"
              className="genre-pill"
              onClick={() => onJumpCategory(g.category)}
            >
              {g.label}
            </button>
          ))}
        </div>
      )}

      {/* Multi-Book Continue Reading Row with One-Click Remove */}
      {continueReadingEntries.length > 0 && !activeSearchTerm && (
        <section className="continue-section" aria-label="Continue Reading">
          <div className="shelf-header" style={{ marginBottom: 14 }}>
            <div className="shelf-title-wrap">
              <h2 className="shelf-title">Continue Reading</h2>
              <span className="shelf-subtitle">
                Pick up right where you left off · click × to dismiss any title
              </span>
            </div>
            {readHistoryCount > 0 && (
              <button type="button" className="ui-btn ui-btn-ghost" onClick={onOpenHistory}>
                <Clock size={14} />
                All Read History ({readHistoryCount})
              </button>
            )}
          </div>

          <div className="continue-row">
            {continueReadingEntries.slice(0, 6).map((entry) => (
              <ContinueCardItem
                key={entry.book.id}
                entry={entry}
                onResume={onResumeBook}
                onRemove={onRemoveFromContinue}
              />
            ))}
          </div>
        </section>
      )}

      {/* Featured Spotlight Card */}
      {spotlightBook && !activeSearchTerm && sourceFilter === 'all' && (
        <section className="spotlight-card" aria-label="Featured Pick">
          <div className="spotlight-cover">
            {spotlightBook.coverUrl && !spotlightImgFailed ? (
              <img
                key={spotlightBook.id}
                src={spotlightBook.coverUrl}
                alt={spotlightBook.title}
                className="book-cover-img"
                onError={() => setSpotlightImgFailed(true)}
              />
            ) : (
              <TypographicCover
                title={spotlightBook.title}
                author={spotlightBook.authors[0] || ''}
                source={spotlightBook.source}
              />
            )}
          </div>

          <div>
            <div className="spotlight-tag-row">
              <span className="spotlight-eyebrow">
                Featured Pick
                {spotlightBook.isManga && (
                  <span className="cover-pill cover-pill-manga">Manga</span>
                )}
                {!spotlightBook.isManga && spotlightBook.isComic && (
                  <span className="cover-pill cover-pill-comic">Comic</span>
                )}
              </span>

              {spotlightPool.length > 1 && (
                <button
                  type="button"
                  className="ui-btn ui-btn-ghost"
                  style={{ padding: '5px 10px', fontSize: 12 }}
                  onClick={() => {
                    setSpotlightImgFailed(false);
                    setSpotlightIndex((i) => (i + 1) % spotlightPool.length);
                  }}
                >
                  <RefreshCw size={13} />
                  Next pick
                </button>
              )}
            </div>

            <h2 className="spotlight-title">{spotlightBook.title}</h2>
            <p className="spotlight-author">{spotlightBook.authors.join(', ')}</p>
            <p className="spotlight-desc">
              {spotlightBook.description ||
                (spotlightBook.isManga
                  ? 'Open directly in Inkwell’s Right-to-Left Manga Viewer with spreads, zoom, and chapter/volume switching.'
                  : spotlightBook.isComic
                  ? 'Open directly in Inkwell’s Full-Color Comic Reader with spread view, vertical strip scroll, and thumbnails.'
                  : 'Open immediately in Inkwell’s paginated reader with offline caching, search, and highlights.')}
            </p>

            <div className="modal-actions">
              <button
                type="button"
                className={`ui-btn ${
                  spotlightBook.isManga
                    ? 'ui-btn-manga'
                    : spotlightBook.isComic
                    ? 'ui-btn-warm'
                    : 'ui-btn-primary'
                }`}
                onClick={() => onResumeBook(spotlightBook)}
              >
                {spotlightBook.isManga ? (
                  <>
                    <BookMarked size={15} /> Read Manga
                  </>
                ) : spotlightBook.isComic ? (
                  <>
                    <ImageIcon size={15} /> Read Comic
                  </>
                ) : (
                  <>
                    <BookOpen size={15} /> Read Now
                  </>
                )}
              </button>
              <button
                type="button"
                className="ui-btn"
                onClick={() => onSelectBook(spotlightBook)}
              >
                Details
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Search Results View */}
      {activeSearchTerm ? (
        <section className="shelf-section" aria-label="Search Results">
          <div className="shelf-header">
            <div className="shelf-title-wrap">
              <h2 className="shelf-title">Results for “{activeSearchTerm}”</h2>
              <span className="shelf-subtitle">
                Safe-filtered and deduplicated across 8 open book, comic &amp; manga APIs
              </span>
            </div>
          </div>

          {isSearching ? (
            <SkeletonShelf label="Searching across 8 open libraries…" count={8} />
          ) : searchResults && searchResults.length > 0 ? (
            <div className="shelf-grid">
              {searchResults.map((book) => (
                <BookCard
                  key={book.id}
                  book={book}
                  savedEntry={savedMap.get(book.id)}
                  onSelect={onSelectBook}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h3 className="empty-state-title">No matching titles found</h3>
              <p className="empty-state-desc">
                Try another search term or switch the source filter to “All (8 APIs)”.
              </p>
            </div>
          )}
        </section>
      ) : (
        <>
          {shelves.map((shelf, shelfIdx) => {
            const visibleBooks = filterBooks(shelf.books);
            if (!shelf.loading && sourceFilter !== 'all' && visibleBooks.length === 0) {
              return null;
            }
            return (
              <React.Fragment key={shelf.id}>
                <section className="shelf-section" aria-label={shelf.title}>
                  <div className="shelf-header">
                    <div className="shelf-title-wrap">
                      <h2 className="shelf-title">{shelf.title}</h2>
                      <span className="shelf-subtitle">{shelf.subtitle}</span>
                    </div>
                    <button
                      type="button"
                      className="ui-btn ui-btn-ghost"
                      onClick={() => onQuickTopic(shelf.topic, shelf.id)}
                    >
                      See all
                      <ArrowRight size={14} />
                    </button>
                  </div>

                  {shelf.loading ? (
                    <SkeletonShelf label={`Loading ${shelf.title}…`} count={6} />
                  ) : (
                    <div className="shelf-grid">
                      {visibleBooks.map((book) => (
                        <BookCard
                          key={book.id}
                          book={book}
                          savedEntry={savedMap.get(book.id)}
                          onSelect={onSelectBook}
                        />
                      ))}
                    </div>
                  )}
                </section>

                {shelfIdx === 2 && sourceFilter === 'all' && (
                  <div className="catalog-promo-card">
                    <div>
                      <h3
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontSize: 20,
                          fontWeight: 700,
                          letterSpacing: '-0.02em',
                          margin: '0 0 4px',
                        }}
                      >
                        Browse {Math.max(1000, catalogCount).toLocaleString()}+ books, comics &amp; manga
                      </h3>
                      <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink-secondary)' }}>
                        Powered by 8 open APIs with infinite archive expansion and safe content filtering.
                      </p>
                    </div>
                    <button type="button" className="ui-btn ui-btn-primary" onClick={onOpenCatalog}>
                      Open Full Catalog
                      <ArrowRight size={15} />
                    </button>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </>
      )}
    </div>
  );
};

export type LibrarySubTab =
  | 'history'
  | 'all'
  | 'reading'
  | 'finished'
  | 'favorites'
  | 'want'
  | 'local'
  | 'notes';

interface MyLibraryViewProps {
  savedEntries: SavedBookEntry[];
  annotations: BookAnnotation[];
  yearlyGoal: number;
  initialSubTab?: LibrarySubTab;
  onChangeYearlyGoal: (nextGoal: number) => void;
  onSelectBook: (book: Book) => void;
  onResumeBook: (book: Book) => void;
  onRemoveFromContinue: (bookId: string) => void;
  onRemoveFromHistory: (bookId: string) => void;
  onSetShelfStatus: (book: Book, status: ShelfStatus) => void;
  onJumpToAnnotation: (book: Book, charOffset: number) => void;
  onDeleteAnnotation: (id: string) => void;
  onUploadFiles: (files: FileList | File[]) => void;
  onSwitchToDiscover: () => void;
}

export const MyLibraryView: React.FC<MyLibraryViewProps> = ({
  savedEntries,
  annotations,
  yearlyGoal,
  initialSubTab = 'history',
  onChangeYearlyGoal,
  onSelectBook,
  onResumeBook,
  onRemoveFromContinue,
  onRemoveFromHistory,
  onSetShelfStatus,
  onJumpToAnnotation,
  onDeleteAnnotation,
  onUploadFiles,
  onSwitchToDiscover,
}) => {
  const [subTab, setSubTab] = useState<LibrarySubTab>(initialSubTab);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  const entryById = new Map(savedEntries.map((e) => [e.book.id, e]));

  // Every book, comic, or manga the user has opened, read, or finished
  const readHistory = useMemo(
    () =>
      savedEntries
        .filter((e) => Boolean(e.progress) || Boolean(e.lastOpenedAt) || e.shelfStatus === 'finished')
        .sort(
          (a, b) =>
            (b.progress?.lastReadAt || b.lastOpenedAt || b.addedAt) -
            (a.progress?.lastReadAt || a.lastOpenedAt || a.addedAt)
        ),
    [savedEntries]
  );

  const continueActive = useMemo(
    () =>
      savedEntries.filter(
        (e) =>
          Boolean(e.progress) &&
          !e.hiddenFromContinue &&
          e.shelfStatus !== 'finished' &&
          (e.progress?.percentage ?? 0) < 99
      ),
    [savedEntries]
  );

  const favorites = savedEntries.filter((e) => Boolean(e.isFavorite));
  const wantToRead = savedEntries.filter((e) => e.shelfStatus === 'want');
  const finishedBooks = savedEntries.filter(
    (e) => e.shelfStatus === 'finished' || (e.progress && e.progress.percentage >= 99)
  );
  const localBooks = savedEntries.filter((e) => Boolean(e.book.isLocal));
  const shelfBooks = savedEntries.filter(
    (e) => e.inShelf || Boolean(e.progress) || e.isCachedOffline || e.isFavorite
  );

  const totalPagesRead = savedEntries.reduce((sum, e) => sum + (e.progress?.pageNumber || 0), 0);
  const goalPct = Math.min(100, Math.round((finishedBooks.length / Math.max(1, yearlyGoal)) * 100));

  const visibleEntries =
    subTab === 'reading'
      ? continueActive
      : subTab === 'want'
      ? wantToRead
      : subTab === 'finished'
      ? finishedBooks
      : subTab === 'favorites'
      ? favorites
      : subTab === 'local'
      ? localBooks
      : shelfBooks;

  return (
    <div>
      {/* Yearly Reading Goal Tracker */}
      <div className="goal-card">
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-warm)', marginBottom: 2 }}>
            Reading Goal
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>
            {finishedBooks.length} of {yearlyGoal} titles finished ({goalPct}%)
          </div>
          <div className="progress-track-clean" style={{ maxWidth: 380, marginTop: 10 }}>
            <div className="progress-fill-clean" style={{ width: `${Math.max(2, goalPct)}%` }} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12.5, color: 'var(--ink-secondary)' }}>Goal:</span>
          <button
            type="button"
            className="ui-btn ui-btn-icon"
            onClick={() => onChangeYearlyGoal(Math.max(1, yearlyGoal - 2))}
            aria-label="Decrease yearly goal"
          >
            <Minus size={13} />
          </button>
          <span style={{ fontSize: 14, fontWeight: 600, minWidth: 28, textAlign: 'center' }}>
            {yearlyGoal}
          </span>
          <button
            type="button"
            className="ui-btn ui-btn-icon"
            onClick={() => onChangeYearlyGoal(Math.min(200, yearlyGoal + 2))}
            aria-label="Increase yearly goal"
          >
            <Plus size={13} />
          </button>
        </div>
      </div>

      {/* Reading Stats Bar */}
      <div className="stats-grid" aria-label="Reading Statistics">
        <div className="stat-card">
          <div className="stat-value">{readHistory.length}</div>
          <div className="stat-label">Total Read / Opened</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{continueActive.length}</div>
          <div className="stat-label">Continue Reading</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{finishedBooks.length}</div>
          <div className="stat-label">Finished</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{totalPagesRead.toLocaleString()}</div>
          <div className="stat-label">Pages Tracked</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{annotations.length}</div>
          <div className="stat-label">Highlights &amp; Marks</div>
        </div>
      </div>

      {/* Local Importer Card */}
      <div className="library-drop-banner">
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.015em' }}>
            Import your own books, comics &amp; manga
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--ink-secondary)', marginTop: 3 }}>
            Drop <strong>.epub</strong>, <strong>.txt</strong>, or <strong>.cbz</strong> files anywhere to
            read offline.
          </div>
        </div>
        <button
          type="button"
          className="ui-btn ui-btn-primary"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={15} />
          Choose Files
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".epub,.txt,.cbz"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              onUploadFiles(e.target.files);
              e.target.value = '';
            }
          }}
        />
      </div>

      {/* Library Tabs */}
      <div className="filter-chips" style={{ marginBottom: 24 }}>
        <button
          type="button"
          className={`filter-chip${subTab === 'history' ? ' active' : ''}`}
          onClick={() => setSubTab('history')}
        >
          Read History ({readHistory.length})
        </button>
        <button
          type="button"
          className={`filter-chip${subTab === 'reading' ? ' active' : ''}`}
          onClick={() => setSubTab('reading')}
        >
          Continue Reading ({continueActive.length})
        </button>
        <button
          type="button"
          className={`filter-chip${subTab === 'finished' ? ' active' : ''}`}
          onClick={() => setSubTab('finished')}
        >
          Finished ({finishedBooks.length})
        </button>
        <button
          type="button"
          className={`filter-chip${subTab === 'favorites' ? ' active' : ''}`}
          onClick={() => setSubTab('favorites')}
        >
          Favorites ({favorites.length})
        </button>
        <button
          type="button"
          className={`filter-chip${subTab === 'want' ? ' active' : ''}`}
          onClick={() => setSubTab('want')}
        >
          Want to Read ({wantToRead.length})
        </button>
        <button
          type="button"
          className={`filter-chip${subTab === 'all' ? ' active' : ''}`}
          onClick={() => setSubTab('all')}
        >
          All Saved ({shelfBooks.length})
        </button>
        <button
          type="button"
          className={`filter-chip${subTab === 'local' ? ' active' : ''}`}
          onClick={() => setSubTab('local')}
        >
          Local Files ({localBooks.length})
        </button>
        <button
          type="button"
          className={`filter-chip${subTab === 'notes' ? ' active' : ''}`}
          onClick={() => setSubTab('notes')}
        >
          Notes ({annotations.length})
        </button>
      </div>

      {/* READ HISTORY VIEW: shows all books, comics, and manga you have ever read */}
      {subTab === 'history' ? (
        readHistory.length > 0 ? (
          <div className="history-list">
            {readHistory.map((entry) => {
              const pg = entry.progress;
              const isDone = entry.shelfStatus === 'finished' || (pg && pg.percentage >= 99);
              return (
                <div key={entry.book.id} className="history-row">
                  <div
                    className="history-left"
                    style={{ cursor: 'pointer' }}
                    onClick={() => onSelectBook(entry.book)}
                  >
                    <div className="continue-thumb">
                      {entry.book.coverUrl ? (
                        <img
                          src={entry.book.coverUrl}
                          alt={entry.book.title}
                          className="book-cover-img"
                        />
                      ) : (
                        <TypographicCover
                          title={entry.book.title}
                          author={entry.book.authors[0] || ''}
                          compact
                        />
                      )}
                    </div>

                    <div className="continue-meta">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                        {entry.book.isManga && (
                          <span className="cover-pill cover-pill-manga">Manga</span>
                        )}
                        {!entry.book.isManga && entry.book.isComic && (
                          <span className="cover-pill cover-pill-comic">Comic</span>
                        )}
                        {isDone && <span className="cover-pill cover-pill-offline">Finished</span>}
                        {entry.isFavorite && (
                          <Heart size={13} fill="#D9483B" color="#D9483B" />
                        )}
                        <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                          {formatRelativeDate(pg?.lastReadAt || entry.lastOpenedAt || entry.addedAt)}
                        </span>
                      </div>

                      <div className="continue-title">{entry.book.title}</div>
                      <div className="continue-sub">
                        {entry.book.authors.join(', ')}
                        {pg ? ` · Page ${pg.pageNumber} of ${pg.totalPages} (${pg.percentage}%)` : ''}
                      </div>

                      {pg && (
                        <div className="progress-track-clean" style={{ marginTop: 7 }}>
                          <div
                            className="progress-fill-clean"
                            style={{ width: `${Math.max(4, pg.percentage)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="history-actions">
                    <button
                      type="button"
                      className="ui-btn ui-btn-primary"
                      onClick={() => onResumeBook(entry.book)}
                    >
                      {isDone ? 'Read Again' : 'Resume'}
                    </button>

                    {!isDone && (
                      <button
                        type="button"
                        className="ui-btn"
                        onClick={() => onSetShelfStatus(entry.book, 'finished')}
                        title="Mark as Finished"
                      >
                        <Check size={14} />
                        Finished
                      </button>
                    )}

                    {!entry.hiddenFromContinue && pg && !isDone && (
                      <button
                        type="button"
                        className="ui-btn ui-btn-ghost"
                        onClick={() => onRemoveFromContinue(entry.book.id)}
                        title="Remove from Continue Reading row"
                      >
                        <X size={14} />
                        Hide from Continue
                      </button>
                    )}

                    <button
                      type="button"
                      className="ui-btn ui-btn-ghost"
                      onClick={() => onRemoveFromHistory(entry.book.id)}
                      title="Remove from Read History"
                      aria-label={`Remove ${entry.book.title} from Read History`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <h3 className="empty-state-title">No reading history yet</h3>
            <p className="empty-state-desc">
              Every book, comic, and manga you open will automatically be tracked here.
            </p>
            <button type="button" className="ui-btn ui-btn-primary" onClick={onSwitchToDiscover}>
              Browse Catalog
            </button>
          </div>
        )
      ) : subTab === 'reading' ? (
        continueActive.length > 0 ? (
          <div className="continue-row">
            {continueActive.map((entry) => (
              <ContinueCardItem
                key={entry.book.id}
                entry={entry}
                onResume={onResumeBook}
                onRemove={onRemoveFromContinue}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3 className="empty-state-title">No active books in Continue Reading</h3>
            <p className="empty-state-desc">
              Open any book, comic, or manga to track your exact page here.
            </p>
          </div>
        )
      ) : subTab === 'notes' ? (
        annotations.length > 0 ? (
          <div className="annotation-list">
            {annotations.map((ann) => {
              const entry = entryById.get(ann.bookId);
              return (
                <div key={ann.id} className="annotation-item">
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-secondary)' }}>
                      {ann.type === 'highlight' ? (
                        <Highlighter size={13} style={{ marginRight: 6, verticalAlign: '-2px' }} />
                      ) : (
                        <Bookmark size={13} style={{ marginRight: 6, verticalAlign: '-2px' }} />
                      )}
                      {entry?.book.title || 'Book'} · {ann.chapterTitle}
                    </span>

                    <div style={{ display: 'flex', gap: 6 }}>
                      {entry && (
                        <button
                          type="button"
                          className="ui-btn"
                          style={{ padding: '5px 11px', fontSize: 12 }}
                          onClick={() => onJumpToAnnotation(entry.book, ann.charOffset)}
                        >
                          Open Page
                        </button>
                      )}
                      <button
                        type="button"
                        className="ui-btn ui-btn-ghost"
                        style={{ padding: '5px 8px' }}
                        onClick={() => onDeleteAnnotation(ann.id)}
                        aria-label="Delete note"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <blockquote className="annotation-quote">{ann.text}</blockquote>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <h3 className="empty-state-title">No bookmarks or highlights yet</h3>
            <p className="empty-state-desc">
              Select text while reading any book to highlight it, or tap Bookmark to save your spot.
            </p>
          </div>
        )
      ) : visibleEntries.length > 0 ? (
        <div className="shelf-grid">
          {visibleEntries.map((entry) => (
            <BookCard
              key={entry.book.id}
              book={entry.book}
              savedEntry={entry}
              onSelect={onSelectBook}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h3 className="empty-state-title">Nothing here yet</h3>
          <p className="empty-state-desc">
            Save any book, comic, or manga from the catalog, or drop a local .epub, .txt, or .cbz file.
          </p>
          <button type="button" className="ui-btn ui-btn-primary" onClick={onSwitchToDiscover}>
            Browse Catalog
          </button>
        </div>
      )}
    </div>
  );
};
