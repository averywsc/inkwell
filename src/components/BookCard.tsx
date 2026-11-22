import React, { useRef, useState } from 'react';
import type { Book, SavedBookEntry } from '../types/book';
import { SOURCE_LABELS } from '../services/aggregator';
import {
  clearPageAmbientGlow,
  extractCoverGlowRgb,
  getFallbackGlowRgb,
  setPageAmbientGlow,
} from '../utils/colorExtractor';
import { TypographicCover } from './TypographicCover';

interface BookCardProps {
  book: Book;
  savedEntry?: SavedBookEntry;
  onSelect: (book: Book) => void;
}

export const BookCard: React.FC<BookCardProps> = ({ book, savedEntry, onSelect }) => {
  const [imgState, setImgState] = useState<'loading' | 'loaded' | 'failed'>(
    book.coverUrl ? 'loading' : 'failed'
  );
  const [useCors, setUseCors] = useState(true);
  const imgRef = useRef<HTMLImageElement>(null);

  const primaryAuthor = book.authors.join(', ') || 'Unknown Author';
  const progress = savedEntry?.progress;

  const handleMouseEnter = () => {
    if (imgState === 'loaded' && imgRef.current && book.coverUrl) {
      const rgb = extractCoverGlowRgb(imgRef.current, book.coverUrl, book.title);
      setPageAmbientGlow(rgb);
    } else {
      setPageAmbientGlow(getFallbackGlowRgb(book.title));
    }
  };

  const handleMouseLeave = () => {
    clearPageAmbientGlow();
  };

  return (
    <article
      className="book-card"
      role="button"
      tabIndex={0}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
      onClick={() => {
        clearPageAmbientGlow();
        onSelect(book);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          clearPageAmbientGlow();
          onSelect(book);
        }
      }}
      aria-label={`${book.title} by ${primaryAuthor}`}
    >
      <div className="book-cover-frame">
        <div className="book-card-badges">
          {book.isManga ? (
            <span className="cover-pill cover-pill-manga">Manga</span>
          ) : book.isComic ? (
            <span className="cover-pill cover-pill-comic">Comic</span>
          ) : (
            <span />
          )}
          <div style={{ display: 'flex', gap: 4 }}>
            {savedEntry?.shelfStatus === 'finished' && (
              <span className="cover-pill cover-pill-read">Read</span>
            )}
            {savedEntry?.isCachedOffline && (
              <span className="cover-pill cover-pill-offline" title="Saved offline">
                Offline
              </span>
            )}
          </div>
        </div>

        {imgState !== 'loaded' && (
          <TypographicCover title={book.title} author={primaryAuthor} source={book.source} />
        )}

        {book.coverUrl && imgState !== 'failed' && (
          <img
            ref={imgRef}
            src={book.coverUrl}
            crossOrigin={useCors ? 'anonymous' : undefined}
            alt={`Cover of ${book.title}`}
            className="book-cover-img"
            loading="lazy"
            style={{
              position: 'absolute',
              inset: 0,
              opacity: imgState === 'loaded' ? 1 : 0,
              transition: 'opacity 0.22s ease',
            }}
            onLoad={(e) => {
              if (e.currentTarget.naturalWidth < 20 || e.currentTarget.naturalHeight < 20) {
                setImgState('failed');
              } else {
                setImgState('loaded');
              }
            }}
            onError={() => {
              if (useCors) {
                // Retry once without CORS if host disallows crossOrigin anonymous
                setUseCors(false);
              } else {
                setImgState('failed');
              }
            }}
          />
        )}
      </div>

      <div className="book-card-body">
        <h3 className="book-card-title">{book.title}</h3>
        <div className="book-card-author">{primaryAuthor}</div>

        {progress && progress.totalPages > 0 ? (
          <div className="book-card-progress">
            <div className="book-card-progress-bar">
              <div
                className="book-card-progress-fill"
                style={{ width: `${Math.min(100, Math.max(3, progress.percentage))}%` }}
              />
            </div>
            <div className="book-card-meta-row">
              <span>
                Page {progress.pageNumber}/{progress.totalPages}
              </span>
              <span>{progress.percentage}%</span>
            </div>
          </div>
        ) : (
          <div className="book-card-meta-row">
            <span>{SOURCE_LABELS[book.source]}</span>
            <span>{book.publishYear ? String(book.publishYear) : ''}</span>
          </div>
        )}
      </div>
    </article>
  );
};
