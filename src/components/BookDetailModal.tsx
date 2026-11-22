import React, { useEffect, useState } from 'react';
import {
  BookMarked,
  BookOpen,
  Bookmark,
  BookmarkCheck,
  Check,
  ExternalLink,
  HardDriveDownload,
  Heart,
  Image as ImageIcon,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import type { Book, SavedBookEntry, ShelfStatus } from '../types/book';
import { SOURCE_LABELS } from '../services/aggregator';
import { fetchOpenLibrarySynopsis } from '../services/openLibrary';
import { TypographicCover } from './TypographicCover';

interface BookDetailModalProps {
  book: Book;
  savedEntry?: SavedBookEntry;
  onClose: () => void;
  onReadNow: (book: Book, mode?: 'text' | 'comic') => void;
  onToggleShelf: (book: Book) => void;
  onToggleFavorite: (book: Book) => void;
  onSetRating: (book: Book, rating: number) => void;
  onSetShelfStatus: (book: Book, status: ShelfStatus) => void;
  onCacheOffline: (book: Book) => Promise<void>;
  onRemoveLocal?: (bookId: string) => void;
}

export const BookDetailModal: React.FC<BookDetailModalProps> = ({
  book,
  savedEntry,
  onClose,
  onReadNow,
  onToggleShelf,
  onToggleFavorite,
  onSetRating,
  onSetShelfStatus,
  onCacheOffline,
  onRemoveLocal,
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const [synopsis, setSynopsis] = useState<string | undefined>(book.description);
  const [loadingSynopsis, setLoadingSynopsis] = useState(false);
  const [caching, setCaching] = useState(false);

  const primaryAuthor = book.authors.join(', ') || 'Unknown Author';
  const isInShelf = Boolean(savedEntry?.inShelf);
  const isFavorite = Boolean(savedEntry?.isFavorite);
  const rating = savedEntry?.rating || 0;
  const isCached = Boolean(savedEntry?.isCachedOffline);
  const progress = savedEntry?.progress;
  const currentStatus = savedEntry?.shelfStatus;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    let active = true;
    if ((!book.description || book.description.length < 90) && book.openLibraryKey) {
      setLoadingSynopsis(true);
      fetchOpenLibrarySynopsis(book.openLibraryKey)
        .then((desc) => {
          if (active && desc) setSynopsis(desc);
        })
        .finally(() => {
          if (active) setLoadingSynopsis(false);
        });
    }
    return () => {
      active = false;
    };
  }, [book]);

  const handleCache = async () => {
    setCaching(true);
    try {
      await onCacheOffline(book);
    } finally {
      setCaching(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-book-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-panel">
        <button
          type="button"
          className="modal-close-floating"
          onClick={onClose}
          aria-label="Close details"
        >
          <X size={17} />
        </button>

        <div className="modal-body">
          <div className="modal-cover-col">
            <div className="modal-cover-box book-cover-frame">
              {book.coverUrl && !imgFailed ? (
                <img
                  src={book.coverUrl}
                  alt={`Cover of ${book.title}`}
                  className="book-cover-img"
                  onLoad={(e) => {
                    if (e.currentTarget.naturalWidth < 20 || e.currentTarget.naturalHeight < 20) {
                      setImgFailed(true);
                    }
                  }}
                  onError={() => setImgFailed(true)}
                />
              ) : (
                <TypographicCover title={book.title} author={primaryAuthor} source={book.source} />
              )}
            </div>

            {progress && progress.totalPages > 0 && (
              <div className="soft-notice" style={{ marginTop: 0 }}>
                <div style={{ fontWeight: 600, color: 'var(--ink-primary)' }}>
                  {progress.percentage}% read · Page {progress.pageNumber} of {progress.totalPages}
                </div>
                <div style={{ marginTop: 2 }}>{progress.chapterTitle}</div>
                <div className="progress-track-clean" style={{ marginTop: 8 }}>
                  <div
                    className="progress-fill-clean"
                    style={{ width: `${Math.max(3, progress.percentage)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="modal-source-eyebrow">
              {book.isManga ? (
                <span className="cover-pill cover-pill-manga">Manga · RTL Ready</span>
              ) : book.isComic ? (
                <span className="cover-pill cover-pill-comic">Full-Color Comic</span>
              ) : null}
              <span>{book.sources.map((s) => SOURCE_LABELS[s]).join(' · ')}</span>
            </div>

            <h2 id="modal-book-title" className="modal-title">
              {book.title}
            </h2>
            <p className="modal-author">by {primaryAuthor}</p>

            <div className="modal-meta-pills">
              {book.publishYear && <span className="meta-pill">Published {book.publishYear}</span>}
              <span className="meta-pill">{book.language || 'English'}</span>
              <span className="meta-pill">
                {book.isManga
                  ? 'Right-to-Left Manga Viewer'
                  : book.isComic
                  ? 'Color Comic Viewer'
                  : isCached
                  ? 'Saved Offline'
                  : 'Paginated Reader'}
              </span>
            </div>

            {loadingSynopsis ? (
              <p style={{ fontSize: 14, color: 'var(--ink-muted)' }}>Loading synopsis…</p>
            ) : synopsis ? (
              <p className="modal-synopsis">{synopsis}</p>
            ) : (
              <p className="modal-synopsis" style={{ color: 'var(--ink-secondary)' }}>
                {book.isManga
                  ? 'Read directly in Inkwell’s Manga Reader with authentic Right-to-Left (RTL) navigation, 2-page spreads, zoom, volume switching, and full-color artwork.'
                  : book.isComic
                  ? 'Open directly in Inkwell’s Full-Color Comic Reader with single-page, double-page spread, vertical strip scroll, zoom, and visual page scrubbing.'
                  : `Public domain edition from ${SOURCE_LABELS[book.source]}. Open directly in Inkwell to read offline, highlight quotes, and track your reading progress.`}
              </p>
            )}

            {book.subjects.length > 0 && (
              <div className="subject-tags">
                {book.subjects.slice(0, 7).map((sub) => (
                  <span key={sub} className="subject-tag">
                    {sub}
                  </span>
                ))}
              </div>
            )}

            <div className="modal-actions">
              {book.isManga ? (
                <button
                  type="button"
                  className="ui-btn ui-btn-manga"
                  onClick={() => onReadNow(book, 'comic')}
                >
                  <BookMarked size={15} />
                  {progress ? `Resume Manga (Page ${progress.pageNumber})` : 'Read Manga'}
                </button>
              ) : book.isComic ? (
                <button
                  type="button"
                  className="ui-btn ui-btn-warm"
                  onClick={() => onReadNow(book, 'comic')}
                >
                  <ImageIcon size={15} />
                  {progress ? `Resume Comic (Page ${progress.pageNumber})` : 'Read Comic'}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="ui-btn ui-btn-primary"
                    onClick={() => onReadNow(book, 'text')}
                  >
                    <BookOpen size={15} />
                    {progress ? `Resume (Page ${progress.pageNumber})` : 'Read Now'}
                  </button>

                  {book.iaIdentifier && (
                    <button
                      type="button"
                      className="ui-btn"
                      onClick={() => onReadNow(book, 'comic')}
                      title="View full-color scanned / illustrated pages"
                    >
                      <ImageIcon size={15} />
                      View Color Pages
                    </button>
                  )}
                </>
              )}

              <button
                type="button"
                className={`ui-btn${isInShelf ? ' active' : ''}`}
                onClick={() => onToggleShelf(book)}
              >
                {isInShelf ? (
                  <>
                    <BookmarkCheck size={15} />
                    In Library
                  </>
                ) : (
                  <>
                    <Bookmark size={15} />
                    Save
                  </>
                )}
              </button>

              <button
                type="button"
                className={`ui-btn${isFavorite ? ' ui-btn-warm' : ''}`}
                onClick={() => onToggleFavorite(book)}
                title={isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
              >
                <Heart size={15} fill={isFavorite ? 'currentColor' : 'none'} />
                {isFavorite ? 'Favorited' : 'Favorite'}
              </button>

              {!book.isComic && !book.isManga && book.isReadableInApp && !isCached && (
                <button
                  type="button"
                  className="ui-btn"
                  onClick={handleCache}
                  disabled={caching}
                >
                  <HardDriveDownload size={15} />
                  {caching ? 'Saving…' : 'Save Offline'}
                </button>
              )}

              {isCached && (
                <span className="ui-btn" style={{ cursor: 'default', opacity: 0.78 }}>
                  <Check size={14} />
                  Offline Ready
                </span>
              )}

              {book.formats.externalUrl && (
                <a
                  href={book.formats.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ui-btn ui-btn-ghost"
                  style={{ textDecoration: 'none' }}
                >
                  <ExternalLink size={14} />
                  Source
                </a>
              )}

              {book.isLocal && onRemoveLocal && (
                <button
                  type="button"
                  className="ui-btn ui-btn-ghost"
                  onClick={() => {
                    onRemoveLocal(book.id);
                    onClose();
                  }}
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              )}
            </div>

            {/* Reading Shelf Status & Personal Rating */}
            <div
              className="status-pill-row"
              style={{ alignItems: 'center', justifyContent: 'space-between' }}
            >
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(
                  [
                    { id: 'want', label: 'Want to Read' },
                    { id: 'reading', label: 'Currently Reading' },
                    { id: 'finished', label: 'Finished' },
                  ] as { id: ShelfStatus; label: string }[]
                ).map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    className={`filter-chip${currentStatus === st.id ? ' active' : ''}`}
                    onClick={() => onSetShelfStatus(book, st.id)}
                  >
                    {st.label}
                  </button>
                ))}
              </div>

              <div className="star-rating-row" aria-label="Your rating">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    className={`star-btn${star <= rating ? ' filled' : ''}`}
                    onClick={() => onSetRating(book, star)}
                    title={`Rate ${star} out of 5`}
                  >
                    <Star size={16} fill={star <= rating ? 'currentColor' : 'none'} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
