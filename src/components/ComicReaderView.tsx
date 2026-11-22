import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowLeftRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Contrast,
  ExternalLink,
  Grid,
  Palette,
  Rows3,
  Square,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { Book, ComicBookData, ComicViewMode } from '../types/book';
import {
  fetchComicBookData,
  getComicPageUrl,
  hydrateComicVolumePages,
} from '../services/comicFetcher';
import { getSavedBook, updateReadingProgress } from '../services/storage';

interface ComicReaderViewProps {
  book: Book;
  onClose: () => void;
  onSwitchToText?: () => void;
  onLibraryChanged: () => void;
}

const MIN_ZOOM = 50;
const MAX_ZOOM = 240;

export const ComicReaderView: React.FC<ComicReaderViewProps> = ({
  book,
  onClose,
  onSwitchToText,
  onLibraryChanged,
}) => {
  const [comicData, setComicData] = useState<ComicBookData | null>(null);
  const [loadingMsg, setLoadingMsg] = useState(
    book.isManga ? 'Loading manga pages…' : 'Loading full-color comic pages…'
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [volumeIndex, setVolumeIndex] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [viewMode, setViewMode] = useState<ComicViewMode>('single');
  const [rtlMode, setRtlMode] = useState<boolean>(Boolean(book.isManga));
  const [fitToScreen, setFitToScreen] = useState(true);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [bwMode, setBwMode] = useState(false);
  const [showThumbs, setShowThumbs] = useState(false);
  const [imgLoading, setImgLoading] = useState(true);
  const [volumeHydrating, setVolumeHydrating] = useState(false);

  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let createdUrls: string[] = [];

    const load = async () => {
      setErrorMsg(null);
      setComicData(null);
      setRtlMode(Boolean(book.isManga));
      setLoadingMsg(book.isManga ? 'Loading manga pages…' : 'Loading full-color comic pages…');

      try {
        const [saved, data] = await Promise.all([
          getSavedBook(book.id),
          fetchComicBookData(book, controller.signal),
        ]);
        if (!active) return;

        if (data.isLocalCbz && data.volumes[0]?.directUrls) {
          createdUrls = data.volumes[0].directUrls;
        }

        const savedVol = Math.min(
          Math.max(0, saved?.progress?.volumeIndex ?? 0),
          Math.max(0, data.volumes.length - 1)
        );
        if (savedVol > 0) {
          data.volumes[savedVol] = await hydrateComicVolumePages(data, savedVol);
        }

        const maxPg = Math.max(0, (data.volumes[savedVol]?.pageCount || 1) - 1);
        const savedPg = Math.min(Math.max(0, (saved?.progress?.pageNumber ?? 1) - 1), maxPg);

        setComicData(data);
        setVolumeIndex(savedVol);
        setPageIndex(savedPg);
      } catch (err: any) {
        if (!active || err?.name === 'AbortError') return;
        setErrorMsg(err?.message || 'Unable to load pages right now.');
      }
    };

    load();
    return () => {
      active = false;
      controller.abort();
      for (const u of createdUrls) {
        if (u.startsWith('blob:')) URL.revokeObjectURL(u);
      }
    };
  }, [book]);

  const currentVolume = comicData?.volumes[volumeIndex];
  const totalPages = currentVolume?.pageCount || 0;

  useEffect(() => {
    if (!comicData || !currentVolume || totalPages <= 0) return;
    const pct = totalPages > 1 ? Math.round((pageIndex / (totalPages - 1)) * 100) : 100;
    const timer = window.setTimeout(() => {
      updateReadingProgress(book, {
        bookId: book.id,
        charOffset: pageIndex,
        pageNumber: pageIndex + 1,
        totalPages,
        percentage: pct,
        chapterTitle: currentVolume.title,
        volumeIndex,
        lastReadAt: Date.now(),
      }).then(() => onLibraryChanged());
    }, 400);
    return () => window.clearTimeout(timer);
  }, [book, comicData, currentVolume, volumeIndex, pageIndex, totalPages]);

  // Preload next 3 pages
  useEffect(() => {
    if (!comicData || totalPages <= 1 || viewMode === 'strip') return;
    for (let offset = 1; offset <= 3; offset++) {
      const idx = pageIndex + offset;
      if (idx < totalPages) {
        const url = getComicPageUrl(comicData, volumeIndex, idx, false);
        if (url) {
          const pre = new Image();
          pre.src = url;
        }
      }
    }
  }, [comicData, volumeIndex, pageIndex, totalPages, viewMode]);

  const stepSize = viewMode === 'spread' ? 2 : 1;

  const goNext = useCallback(() => {
    if (totalPages <= 0) return;
    setPageIndex((p) => {
      const next = Math.min(totalPages - 1, p + stepSize);
      if (next !== p) {
        setImgLoading(true);
        stageRef.current?.scrollTo({ top: 0 });
      }
      return next;
    });
  }, [totalPages, stepSize]);

  const goPrev = useCallback(() => {
    setPageIndex((p) => {
      const prev = Math.max(0, p - stepSize);
      if (prev !== p) {
        setImgLoading(true);
        stageRef.current?.scrollTo({ top: 0 });
      }
      return prev;
    });
  }, [stepSize]);

  const handleVolumeChange = async (nextVolIdx: number) => {
    if (!comicData || nextVolIdx === volumeIndex) return;
    setVolumeHydrating(true);
    try {
      const hydrated = await hydrateComicVolumePages(comicData, nextVolIdx);
      setComicData((prev) => {
        if (!prev) return prev;
        const copy = [...prev.volumes];
        copy[nextVolIdx] = hydrated;
        return { ...prev, volumes: copy };
      });
      setVolumeIndex(nextVolIdx);
      setPageIndex(0);
      setImgLoading(true);
    } finally {
      setVolumeHydrating(false);
    }
  };

  // Keyboard shortcuts (respects RTL manga direction!)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (viewMode !== 'strip') {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          if (rtlMode) goPrev();
          else goNext();
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          if (rtlMode) goNext();
          else goPrev();
        } else if (e.key === 'PageDown' || e.key === ' ') {
          e.preventDefault();
          goNext();
        } else if (e.key === 'PageUp') {
          e.preventDefault();
          goPrev();
        }
      }
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === '+' || e.key === '=') {
        setFitToScreen(false);
        setZoomPercent((z) => Math.min(MAX_ZOOM, z + 15));
      } else if (e.key === '-') {
        setFitToScreen(false);
        setZoomPercent((z) => Math.max(MIN_ZOOM, z - 15));
      } else if (e.key === '0') {
        setFitToScreen(true);
        setZoomPercent(100);
      } else if (e.key === 'd' || e.key === 'D') {
        setViewMode((m) => (m === 'spread' ? 'single' : 'spread'));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goNext, goPrev, onClose, viewMode, rtlMode]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1 || viewMode === 'strip') return;
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY, time: Date.now() };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current || e.changedTouches.length !== 1) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;
    const dt = Date.now() - touchStartRef.current.time;
    touchStartRef.current = null;

    if (dt < 550 && Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      if (rtlMode) {
        if (dx > 0) goNext();
        else goPrev();
      } else {
        if (dx < 0) goNext();
        else goPrev();
      }
    }
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (totalPages <= 1) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setPageIndex(Math.round(ratio * (totalPages - 1)));
    setImgLoading(true);
  };

  const imgStyle: React.CSSProperties = fitToScreen
    ? {}
    : {
        width: `${Math.min(2200, Math.round(7.6 * zoomPercent))}px`,
        maxWidth: 'none',
        height: 'auto',
      };

  const primaryPageUrl = comicData ? getComicPageUrl(comicData, volumeIndex, pageIndex, false) : '';
  const secondPageUrl =
    comicData && viewMode === 'spread' && pageIndex + 1 < totalPages
      ? getComicPageUrl(comicData, volumeIndex, pageIndex + 1, false)
      : '';

  const percentage =
    totalPages > 1 ? Math.round((pageIndex / (totalPages - 1)) * 100) : totalPages === 1 ? 100 : 0;

  const thumbStart = Math.max(0, pageIndex - 12);
  const thumbEnd = Math.min(totalPages, thumbStart + 36);

  // Determine left/right edge actions based on RTL vs LTR
  const leftAction = rtlMode ? goNext : goPrev;
  const rightAction = rtlMode ? goPrev : goNext;
  const showLeftBtn = rtlMode ? pageIndex < totalPages - 1 : pageIndex > 0;
  const showRightBtn = rtlMode ? pageIndex > 0 : pageIndex < totalPages - 1;

  return (
    <div className="comic-reader-root" role="region" aria-label={`Reader: ${book.title}`}>
      <header className="comic-topbar">
        <div className="comic-topbar-left">
          <button type="button" className="comic-btn" onClick={onClose}>
            <ArrowLeft size={15} />
            Library
          </button>
          <div className="comic-title-block">
            <div className="comic-title">{book.title}</div>
            <div className="comic-sub">
              {currentVolume ? `${currentVolume.title} · ` : ''}
              {totalPages > 0 ? `Page ${pageIndex + 1} of ${totalPages}` : 'Preparing pages'}
            </div>
          </div>
        </div>

        <div className="comic-controls">
          {comicData && comicData.volumes.length > 1 && (
            <select
              className="comic-select"
              value={volumeIndex}
              disabled={volumeHydrating}
              onChange={(e) => handleVolumeChange(Number(e.target.value))}
              aria-label="Select volume or issue"
            >
              {comicData.volumes.map((v, i) => (
                <option key={v.id} value={i}>
                  {v.title}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            className={`comic-btn${rtlMode ? ' active' : ''}`}
            style={rtlMode ? { background: '#6D28D9' } : undefined}
            onClick={() => setRtlMode((r) => !r)}
            title="Toggle reading direction: Right-to-Left (Manga) vs Left-to-Right (Comic)"
          >
            <ArrowLeftRight size={14} />
            <span>{rtlMode ? 'RTL · Manga' : 'LTR · Comic'}</span>
          </button>

          <button
            type="button"
            className={`comic-btn${viewMode === 'single' ? ' active' : ''}`}
            onClick={() => setViewMode('single')}
            title="Single page"
          >
            <Square size={14} />
            Single
          </button>

          <button
            type="button"
            className={`comic-btn${viewMode === 'spread' ? ' active' : ''}`}
            onClick={() => setViewMode('spread')}
            title="Two-page spread (D)"
          >
            <Columns2 size={14} />
            Spread
          </button>

          <button
            type="button"
            className={`comic-btn${viewMode === 'strip' ? ' active' : ''}`}
            onClick={() => setViewMode('strip')}
            title="Vertical scroll"
          >
            <Rows3 size={14} />
            Strip
          </button>

          <div className="comic-zoom-group" aria-label="Zoom controls">
            <button
              type="button"
              className={`comic-zoom-fit${fitToScreen ? ' active' : ''}`}
              onClick={() => {
                setFitToScreen(true);
                setZoomPercent(100);
              }}
              title="Fit page to screen (Shortcut: 0)"
            >
              Fit
            </button>
            <button
              type="button"
              className="comic-zoom-step"
              onClick={() => {
                setFitToScreen(false);
                setZoomPercent((z) => Math.max(MIN_ZOOM, z - 15));
              }}
              aria-label="Zoom out"
            >
              <ZoomOut size={13} />
            </button>
            <input
              type="range"
              className="comic-zoom-slider"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={5}
              value={fitToScreen ? 100 : zoomPercent}
              onChange={(e) => {
                setFitToScreen(false);
                setZoomPercent(Number(e.target.value));
              }}
              aria-label="Zoom slider"
            />
            <button
              type="button"
              className="comic-zoom-step"
              onClick={() => {
                setFitToScreen(false);
                setZoomPercent((z) => Math.min(MAX_ZOOM, z + 15));
              }}
              aria-label="Zoom in"
            >
              <ZoomIn size={13} />
            </button>
            <span className="comic-zoom-label">
              {fitToScreen ? 'Fit' : `${zoomPercent}%`}
            </span>
          </div>

          <button
            type="button"
            className={`comic-btn${!bwMode ? ' active' : ''}`}
            onClick={() => setBwMode((b) => !b)}
            title="Toggle Color vs B&W"
          >
            {bwMode ? <Contrast size={14} /> : <Palette size={14} />}
            <span>{bwMode ? 'B&W' : 'Color'}</span>
          </button>

          <button
            type="button"
            className={`comic-btn${showThumbs ? ' active' : ''}`}
            onClick={() => setShowThumbs((s) => !s)}
            title="Page thumbnails"
          >
            <Grid size={14} />
            Pages
          </button>

          {onSwitchToText && !book.isComic && (
            <button type="button" className="comic-btn" onClick={onSwitchToText}>
              <BookOpen size={14} />
              Text
            </button>
          )}
        </div>
      </header>

      {errorMsg ? (
        <div className="reader-loading-state">
          <div className="reader-loading-box" style={{ background: '#1C1B1A', color: '#F2EFE9' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', margin: '0 0 10px' }}>{book.title}</h2>
            <p style={{ color: '#A9A49A', margin: '0 0 20px', fontSize: 14 }}>{errorMsg}</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button type="button" className="comic-btn" onClick={onClose}>
                Back to Library
              </button>
              {book.formats.externalUrl && (
                <a
                  href={book.formats.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="comic-btn active"
                  style={{ textDecoration: 'none' }}
                >
                  <ExternalLink size={14} />
                  Open on Archive
                </a>
              )}
            </div>
          </div>
        </div>
      ) : !comicData || !currentVolume ? (
        <div className="reader-loading-state">
          <div className="loading-pill" style={{ background: 'rgba(255,255,255,0.1)', color: '#F2EFE9' }}>
            <span className="loading-spinner-dot" />
            <span>{loadingMsg}</span>
          </div>
        </div>
      ) : viewMode === 'strip' ? (
        <div ref={stageRef} className="comic-stage strip-mode">
          {Array.from({ length: Math.min(totalPages, pageIndex + 14) - Math.max(0, pageIndex - 2) }).map(
            (_, offset) => {
              const idx = Math.max(0, pageIndex - 2) + offset;
              const url = getComicPageUrl(comicData, volumeIndex, idx, false);
              return (
                <div key={`${volumeIndex}-${idx}`} style={{ textAlign: 'center', maxWidth: '100%' }}>
                  <img
                    src={url}
                    alt={`Page ${idx + 1}`}
                    className={`comic-page-img${bwMode ? ' bw-filter' : ''}`}
                    style={{
                      width: fitToScreen ? 'min(860px, 94vw)' : `${Math.round(7.6 * zoomPercent)}px`,
                      height: 'auto',
                    }}
                    loading="lazy"
                  />
                  <div style={{ fontSize: 12, color: '#8A847A', marginTop: 6 }}>
                    Page {idx + 1} of {totalPages}
                  </div>
                </div>
              );
            }
          )}
          {pageIndex + 14 < totalPages && (
            <button
              type="button"
              className="comic-btn active"
              style={{ marginTop: 12 }}
              onClick={() => {
                setPageIndex((p) => Math.min(totalPages - 1, p + 12));
                stageRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              Load Next Pages ({pageIndex + 15}–{Math.min(totalPages, pageIndex + 28)})
            </button>
          )}
        </div>
      ) : (
        <div
          ref={stageRef}
          className="comic-stage"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {showLeftBtn && (
            <button
              type="button"
              className="tap-zone-prev"
              style={{ opacity: 0.72 }}
              onClick={leftAction}
              aria-label={rtlMode ? 'Next Page (Manga RTL)' : 'Previous Page'}
            >
              <span className="tap-zone-pill" style={{ background: 'rgba(28,27,25,0.85)', color: '#FFF' }}>
                <ChevronLeft size={20} />
              </span>
            </button>
          )}

          <div
            className="comic-spread-wrap"
            style={rtlMode && viewMode === 'spread' ? { flexDirection: 'row-reverse' } : undefined}
            onDoubleClick={() => {
              if (fitToScreen) {
                setFitToScreen(false);
                setZoomPercent(145);
              } else {
                setFitToScreen(true);
                setZoomPercent(100);
              }
            }}
            title={
              rtlMode
                ? 'Manga Right-to-Left mode · Left arrow for next page · Double-click to zoom'
                : 'Comic Left-to-Right mode · Right arrow for next page · Double-click to zoom'
            }
          >
            {primaryPageUrl && (
              <img
                key={primaryPageUrl}
                src={primaryPageUrl}
                alt={`${book.title}, Page ${pageIndex + 1}`}
                className={`comic-page-img${fitToScreen ? ' fit-screen' : ''}${
                  bwMode ? ' bw-filter' : ''
                }`}
                style={{
                  ...imgStyle,
                  opacity: imgLoading ? 0.55 : 1,
                  transition: 'opacity 0.18s ease',
                }}
                onLoad={() => setImgLoading(false)}
                onError={(e) => {
                  const fallback = comicData.identifier
                    ? `https://archive.org/download/${encodeURIComponent(
                        comicData.identifier
                      )}/page/n${pageIndex}_w1200.jpg`
                    : '';
                  if (fallback && e.currentTarget.src !== fallback) {
                    e.currentTarget.src = fallback;
                  } else {
                    setImgLoading(false);
                  }
                }}
              />
            )}

            {secondPageUrl && (
              <img
                key={secondPageUrl}
                src={secondPageUrl}
                alt={`${book.title}, Page ${pageIndex + 2}`}
                className={`comic-page-img${fitToScreen ? ' fit-screen' : ''}${
                  bwMode ? ' bw-filter' : ''
                }`}
                style={imgStyle}
              />
            )}
          </div>

          {showRightBtn && (
            <button
              type="button"
              className="tap-zone-next"
              style={{ opacity: 0.72 }}
              onClick={rightAction}
              aria-label={rtlMode ? 'Previous Page (Manga RTL)' : 'Next Page'}
            >
              <span className="tap-zone-pill" style={{ background: 'rgba(28,27,25,0.85)', color: '#FFF' }}>
                <ChevronRight size={20} />
              </span>
            </button>
          )}
        </div>
      )}

      {comicData && totalPages > 0 && (
        <footer className="comic-bottom-bar">
          {showThumbs && (
            <div className="comic-thumb-strip">
              {Array.from({ length: thumbEnd - thumbStart }).map((_, i) => {
                const idx = thumbStart + i;
                const thumbUrl = getComicPageUrl(comicData, volumeIndex, idx, true);
                return (
                  <button
                    key={idx}
                    type="button"
                    className={`comic-thumb-item${idx === pageIndex ? ' active' : ''}`}
                    onClick={() => {
                      setPageIndex(idx);
                      setImgLoading(true);
                    }}
                  >
                    <img
                      src={thumbUrl}
                      alt={`Page ${idx + 1}`}
                      className="comic-thumb-img"
                      loading="lazy"
                    />
                    <span className="comic-thumb-num">{idx + 1}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div
            className="reader-progress-track"
            style={{ backgroundColor: 'rgba(255,255,255,0.14)' }}
            onClick={handleProgressClick}
            title="Click to jump to any page"
          >
            <div
              className="reader-progress-fill"
              style={{
                width: `${Math.max(1, percentage)}%`,
                backgroundColor: rtlMode ? '#8B5CF6' : '#D9483B',
              }}
            />
          </div>

          <div className="reader-status-meta" style={{ color: '#A39E95' }}>
            <span>
              {volumeHydrating
                ? 'Loading volume…'
                : viewMode === 'spread' && pageIndex + 1 < totalPages
                ? `Pages ${pageIndex + 1}–${pageIndex + 2} of ${totalPages}`
                : `Page ${pageIndex + 1} of ${totalPages}`}
              {rtlMode ? ' · Right-to-Left' : ''}
            </span>
            <span>{percentage}%</span>
          </div>
        </footer>
      )}
    </div>
  );
};
