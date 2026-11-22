import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Highlighter,
  Image as ImageIcon,
  SlidersHorizontal,
} from 'lucide-react';
import type {
  Book,
  BookAnnotation,
  PageBlock,
  ParsedBookContent,
  ReaderPage,
  ReaderSettings,
} from '../types/book';
import {
  ExternalPreviewOnlyError,
  fetchAndPrepareBook,
} from '../services/bookFetcher';
import {
  deleteAnnotation,
  getAnnotationsForBook,
  getSavedBook,
  saveAnnotation,
  updateReadingProgress,
} from '../services/storage';
import {
  findPageForOffset,
  paginateBook,
  resolveTypographyMetrics,
  searchInBook,
} from '../utils/pagination';
import { Controls, type ActiveDrawer } from './Controls';

interface ReaderViewProps {
  book: Book;
  initialCharOffset?: number;
  settings: ReaderSettings;
  onUpdateSettings: (patch: Partial<ReaderSettings>) => void;
  onClose: () => void;
  onSwitchToComicMode?: () => void;
  onLibraryChanged: () => void;
  onNotify: (msg: string) => void;
}

interface SelectionState {
  text: string;
  startOffset: number;
  endOffset: number;
  x: number;
  y: number;
}

function renderAnnotatedText(
  block: PageBlock,
  highlights: BookAnnotation[],
  activeSearchTerm: string
): React.ReactNode {
  const text = block.text;
  const spans: { start: number; end: number; kind: 'highlight' | 'search' }[] = [];

  for (const h of highlights) {
    const hStart = h.charOffset;
    const hEnd = h.endOffset ?? h.charOffset + h.text.length;
    if (hEnd > block.startOffset && hStart < block.endOffset) {
      const localStart = Math.max(0, hStart - block.startOffset);
      const localEnd = Math.min(text.length, hEnd - block.startOffset);
      if (localEnd > localStart) {
        spans.push({ start: localStart, end: localEnd, kind: 'highlight' });
      }
    }
  }

  if (activeSearchTerm.length >= 2) {
    const lowerText = text.toLowerCase();
    const needle = activeSearchTerm.toLowerCase();
    let idx = 0;
    while (idx < lowerText.length) {
      const found = lowerText.indexOf(needle, idx);
      if (found === -1) break;
      spans.push({ start: found, end: found + needle.length, kind: 'search' });
      idx = found + needle.length;
    }
  }

  if (spans.length === 0) return text;

  spans.sort((a, b) => a.start - b.start || (a.kind === 'search' ? -1 : 1));
  const nodes: React.ReactNode[] = [];
  let cursor = 0;

  for (let i = 0; i < spans.length; i++) {
    const s = spans[i];
    if (s.start < cursor) continue;
    if (s.start > cursor) {
      nodes.push(text.slice(cursor, s.start));
    }
    nodes.push(
      <mark
        key={`${s.start}-${s.end}-${i}`}
        className={s.kind === 'search' ? 'reader-search-mark' : 'reader-highlight-mark'}
      >
        {text.slice(s.start, s.end)}
      </mark>
    );
    cursor = s.end;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }
  return nodes;
}

export const ReaderView: React.FC<ReaderViewProps> = ({
  book,
  initialCharOffset,
  settings,
  onUpdateSettings,
  onClose,
  onSwitchToComicMode,
  onLibraryChanged,
  onNotify,
}) => {
  const [content, setContent] = useState<ParsedBookContent | null>(null);
  const [loadingStatus, setLoadingStatus] = useState<string>('Preparing book…');
  const [errorInfo, setErrorInfo] = useState<{ message: string; externalUrl?: string } | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState<{ width: number; height: number }>({
    width: typeof window !== 'undefined' ? Math.min(window.innerWidth, 840) : 760,
    height: typeof window !== 'undefined' ? Math.max(360, window.innerHeight - 112) : 600,
  });
  const [fontsReady, setFontsReady] = useState(false);

  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const anchorOffsetRef = useRef<number>(initialCharOffset ?? 0);
  const initializedProgressRef = useRef(false);

  const [overlayVisible, setOverlayVisible] = useState(false);
  const [activeDrawer, setActiveDrawer] = useState<ActiveDrawer>('none');
  const [isFlashing, setIsFlashing] = useState(false);

  const [annotations, setAnnotations] = useState<BookAnnotation[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearchHighlight, setActiveSearchHighlight] = useState('');
  const [selectionPopover, setSelectionPopover] = useState<SelectionState | null>(null);

  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  useEffect(() => {
    let active = true;
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        if (active) setFontsReady(true);
      });
    } else {
      setFontsReady(true);
    }
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    initializedProgressRef.current = false;

    const load = async () => {
      setErrorInfo(null);
      setContent(null);
      setLoadingStatus('Opening edition…');

      try {
        const [saved, existingNotes] = await Promise.all([
          getSavedBook(book.id),
          getAnnotationsForBook(book.id),
        ]);

        if (!active) return;
        setAnnotations(existingNotes);

        if (typeof initialCharOffset === 'number') {
          anchorOffsetRef.current = initialCharOffset;
        } else if (saved?.progress?.charOffset) {
          anchorOffsetRef.current = saved.progress.charOffset;
        } else {
          anchorOffsetRef.current = 0;
        }

        const prepared = await fetchAndPrepareBook(
          book,
          (msg) => {
            if (active) setLoadingStatus(msg);
          },
          controller.signal
        );

        if (!active) return;
        setContent(prepared);
        onLibraryChanged();
      } catch (err: any) {
        if (!active || err?.name === 'AbortError') return;
        if (err instanceof ExternalPreviewOnlyError) {
          setErrorInfo({ message: err.message, externalUrl: err.externalUrl });
        } else {
          setErrorInfo({
            message: err?.message || 'Unable to load this edition right now.',
            externalUrl: book.formats.externalUrl,
          });
        }
      }
    };

    load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [book, initialCharOffset]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 100 && rect.height > 100) {
        setStageSize((prev) =>
          Math.abs(prev.width - rect.width) > 2 || Math.abs(prev.height - rect.height) > 2
            ? { width: Math.floor(rect.width), height: Math.floor(rect.height) }
            : prev
        );
      }
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [content]);

  const pages: ReaderPage[] = useMemo(() => {
    if (!content) return [];
    return paginateBook(content, stageSize.width, stageSize.height, settings);
  }, [content, stageSize.width, stageSize.height, settings, fontsReady]);

  useEffect(() => {
    if (pages.length === 0) return;
    const targetPageNum = findPageForOffset(pages, anchorOffsetRef.current);
    setCurrentPageIndex(Math.max(0, Math.min(pages.length - 1, targetPageNum - 1)));
    initializedProgressRef.current = true;
  }, [pages]);

  const currentPage = pages[currentPageIndex];
  const totalPages = pages.length;
  const percentage =
    totalPages > 1 ? Math.round((currentPageIndex / (totalPages - 1)) * 100) : totalPages === 1 ? 100 : 0;

  useEffect(() => {
    if (!content || !currentPage || !initializedProgressRef.current) return;
    anchorOffsetRef.current = currentPage.startOffset;

    const timer = window.setTimeout(() => {
      updateReadingProgress(book, {
        bookId: book.id,
        charOffset: currentPage.startOffset,
        pageNumber: currentPage.pageNumber,
        totalPages,
        percentage,
        chapterTitle: currentPage.chapterTitle,
        lastReadAt: Date.now(),
      }).then(() => onLibraryChanged());
    }, 350);

    return () => window.clearTimeout(timer);
  }, [book, content, currentPage, totalPages, percentage]);

  const triggerEinkFlash = useCallback(() => {
    if (!settings.einkFlash) return;
    setIsFlashing(false);
    requestAnimationFrame(() => setIsFlashing(true));
  }, [settings.einkFlash]);

  const goToPageIndex = useCallback(
    (nextIndex: number) => {
      if (pages.length === 0) return;
      const clamped = Math.max(0, Math.min(pages.length - 1, nextIndex));
      if (clamped !== currentPageIndex) {
        triggerEinkFlash();
        setCurrentPageIndex(clamped);
        anchorOffsetRef.current = pages[clamped].startOffset;
        setSelectionPopover(null);
      }
    },
    [pages, currentPageIndex, triggerEinkFlash]
  );

  const goNext = useCallback(() => goToPageIndex(currentPageIndex + 1), [goToPageIndex, currentPageIndex]);
  const goPrev = useCallback(() => goToPageIndex(currentPageIndex - 1), [goToPageIndex, currentPageIndex]);

  const currentPageBookmark = useMemo(() => {
    if (!currentPage) return undefined;
    return annotations.find(
      (a) =>
        a.type === 'bookmark' &&
        a.charOffset >= currentPage.startOffset &&
        a.charOffset <= currentPage.endOffset
    );
  }, [annotations, currentPage]);

  const handleToggleBookmark = useCallback(async () => {
    if (!currentPage) return;
    if (currentPageBookmark) {
      await deleteAnnotation(currentPageBookmark.id);
      setAnnotations((prev) => prev.filter((a) => a.id !== currentPageBookmark.id));
      onNotify('Bookmark removed');
    } else {
      const preview = currentPage.blocks.map((b) => b.text).join(' ').slice(0, 120).trim();
      const newBookmark: BookAnnotation = {
        id: `bm-${Date.now()}`,
        bookId: book.id,
        type: 'bookmark',
        charOffset: currentPage.startOffset,
        text: preview || `Page ${currentPage.pageNumber}`,
        chapterTitle: currentPage.chapterTitle,
        createdAt: Date.now(),
      };
      await saveAnnotation(newBookmark);
      setAnnotations((prev) => [...prev, newBookmark].sort((a, b) => a.charOffset - b.charOffset));
      onNotify(`Bookmarked page ${currentPage.pageNumber}`);
    }
    onLibraryChanged();
  }, [book.id, currentPage, currentPageBookmark, onLibraryChanged, onNotify]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        if (e.key === 'Escape') {
          setActiveDrawer('none');
          target.blur();
        }
        return;
      }

      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'Escape') {
        if (activeDrawer !== 'none') {
          setActiveDrawer('none');
        } else if (overlayVisible) {
          setOverlayVisible(false);
        } else {
          onClose();
        }
      } else if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        handleToggleBookmark();
      } else if (e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f')) {
        e.preventDefault();
        setOverlayVisible(true);
        setActiveDrawer('search');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goNext, goPrev, activeDrawer, overlayVisible, onClose, handleToggleBookmark]);

  const searchMatches = useMemo(() => {
    if (!content || pages.length === 0 || searchQuery.trim().length < 2) return [];
    return searchInBook(content, pages, searchQuery);
  }, [content, pages, searchQuery]);

  const handleTextMouseUp = () => {
    if (!currentPage) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      setSelectionPopover(null);
      return;
    }

    const selectedStr = sel.toString().replace(/\s+/g, ' ').trim();
    if (selectedStr.length < 3) {
      setSelectionPopover(null);
      return;
    }

    let foundStart = -1;
    let foundEnd = -1;
    const normNeedle = selectedStr.toLowerCase();

    for (const block of currentPage.blocks) {
      const idx = block.text.toLowerCase().indexOf(normNeedle);
      if (idx !== -1) {
        foundStart = block.startOffset + idx;
        foundEnd = foundStart + selectedStr.length;
        break;
      }
    }

    if (foundStart === -1) {
      foundStart = currentPage.startOffset;
      foundEnd = Math.min(currentPage.endOffset, foundStart + selectedStr.length);
    }

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    setSelectionPopover({
      text: selectedStr.slice(0, 320),
      startOffset: foundStart,
      endOffset: foundEnd,
      x: Math.max(16, Math.min(window.innerWidth - 190, rect.left + rect.width / 2 - 80)),
      y: Math.max(58, rect.top - 48),
    });
  };

  const handleSaveHighlight = async () => {
    if (!selectionPopover || !currentPage) return;
    const newHl: BookAnnotation = {
      id: `hl-${Date.now()}`,
      bookId: book.id,
      type: 'highlight',
      charOffset: selectionPopover.startOffset,
      endOffset: selectionPopover.endOffset,
      text: selectionPopover.text,
      chapterTitle: currentPage.chapterTitle,
      createdAt: Date.now(),
    };
    await saveAnnotation(newHl);
    setAnnotations((prev) => [...prev, newHl].sort((a, b) => a.charOffset - b.charOffset));
    window.getSelection()?.removeAllRanges();
    setSelectionPopover(null);
    onLibraryChanged();
    onNotify('Passage highlighted');
  };

  const handleDeleteAnnotation = async (id: string) => {
    await deleteAnnotation(id);
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
    onLibraryChanged();
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
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

    if (dt < 550 && Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      if (dx < 0) goNext();
      else goPrev();
    }
  };

  const handleStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) return;

    if (activeDrawer !== 'none') {
      setActiveDrawer('none');
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;

    if (relX < 0.25) {
      goPrev();
    } else if (relX > 0.75) {
      goNext();
    } else {
      setOverlayVisible((v) => !v);
    }
  };

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (totalPages <= 1) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    goToPageIndex(Math.round(ratio * (totalPages - 1)));
  };

  const metrics = resolveTypographyMetrics(settings, Math.min(stageSize.width, 840));
  const bookHighlights = useMemo(
    () => annotations.filter((a) => a.type === 'highlight'),
    [annotations]
  );

  const chapterTicks = useMemo(() => {
    if (!content || totalPages <= 2 || content.chapters.length > 65) return [];
    return content.chapters.slice(1).map((ch) => {
      const pg = findPageForOffset(pages, ch.startOffset);
      return ((pg - 1) / Math.max(1, totalPages - 1)) * 100;
    });
  }, [content, pages, totalPages]);

  return (
    <div className="reader-root" role="region" aria-label={`Reading ${book.title}`}>
      <div
        className={`reader-flash-overlay${isFlashing ? ' flashing' : ''}`}
        onAnimationEnd={() => setIsFlashing(false)}
        aria-hidden="true"
      />

      {/* Running Top Header */}
      <div className="reader-running-header">
        <span className="reader-running-title">
          {book.title} {book.authors[0] ? `by ${book.authors[0]}` : ''}
        </span>
        <button
          type="button"
          className="ui-btn ui-btn-ghost"
          style={{ padding: '5px 11px', fontSize: 12 }}
          onClick={() => setOverlayVisible((v) => !v)}
        >
          <SlidersHorizontal size={13} />
          Menu
        </button>

        {currentPageBookmark && (
          <button
            type="button"
            className="dogear-indicator"
            onClick={handleToggleBookmark}
            title="Bookmarked (click to remove)"
            aria-label="Page Bookmarked"
          >
            <Bookmark size={11} />
          </button>
        )}
      </div>

      {/* Main Content Stage */}
      {errorInfo ? (
        <div className="reader-loading-state">
          <div className="reader-loading-box">
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, margin: '0 0 10px' }}>
              {book.title}
            </h2>
            <p style={{ fontSize: 14.5, lineHeight: 1.6, color: 'var(--ink-secondary)', margin: '0 0 22px' }}>
              {errorInfo.message}
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button type="button" className="ui-btn" onClick={onClose}>
                <ArrowLeft size={14} />
                Back to Library
              </button>
              {onSwitchToComicMode && book.iaIdentifier && (
                <button type="button" className="ui-btn ui-btn-warm" onClick={onSwitchToComicMode}>
                  <ImageIcon size={14} />
                  Open Scanned Color Pages
                </button>
              )}
              {errorInfo.externalUrl && (
                <a
                  href={errorInfo.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ui-btn ui-btn-primary"
                  style={{ textDecoration: 'none' }}
                >
                  <ExternalLink size={14} />
                  Open Source
                </a>
              )}
            </div>
          </div>
        </div>
      ) : !content || !currentPage ? (
        <div className="reader-loading-state">
          <div className="reader-loading-box">
            <div className="loading-pill" style={{ marginBottom: 16 }}>
              <span className="loading-spinner-dot" />
              <span>{loadingStatus}</span>
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 21, fontWeight: 600 }}>
              {book.title}
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--ink-secondary)', marginTop: 4 }}>
              {book.authors.join(', ')}
            </div>
            <button type="button" className="ui-btn" style={{ marginTop: 22 }} onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div
            ref={stageRef}
            className="reader-stage"
            onClick={handleStageClick}
            onMouseUp={handleTextMouseUp}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {currentPageIndex > 0 && (
              <div
                className="tap-zone-prev"
                onClick={(e) => {
                  e.stopPropagation();
                  goPrev();
                }}
                aria-label="Previous Page"
              >
                <span className="tap-zone-pill">
                  <ChevronLeft size={18} strokeWidth={1.8} />
                </span>
              </div>
            )}

            <div
              className="reader-page-surface"
              style={{ padding: `${metrics.marginY}px ${metrics.marginX}px` }}
            >
              <div
                className="reader-page-content"
                style={{
                  fontFamily: metrics.fontFamilyCss,
                  fontSize: `${metrics.fontSizePx}px`,
                  lineHeight: `${metrics.lineHeightPx}px`,
                }}
              >
                {currentPage.blocks.map((block, idx) =>
                  block.type === 'chapter-heading' ? (
                    <h2
                      key={`${block.startOffset}-${idx}`}
                      className="reader-chapter-heading"
                      style={{
                        fontSize: `${Math.round(metrics.fontSizePx * 1.25)}px`,
                        lineHeight: `${Math.ceil(metrics.fontSizePx * 1.25 * 1.32)}px`,
                      }}
                    >
                      {renderAnnotatedText(block, bookHighlights, activeSearchHighlight)}
                    </h2>
                  ) : (
                    <p
                      key={`${block.startOffset}-${idx}`}
                      className={`reader-paragraph${block.isContinuation ? ' no-indent' : ''}`}
                      style={{
                        marginBottom:
                          idx === currentPage.blocks.length - 1 ? 0 : `${metrics.paragraphGapPx}px`,
                      }}
                    >
                      {renderAnnotatedText(block, bookHighlights, activeSearchHighlight)}
                    </p>
                  )
                )}
              </div>
            </div>

            {currentPageIndex < totalPages - 1 && (
              <div
                className="tap-zone-next"
                onClick={(e) => {
                  e.stopPropagation();
                  goNext();
                }}
                aria-label="Next Page"
              >
                <span className="tap-zone-pill">
                  <ChevronRight size={18} strokeWidth={1.8} />
                </span>
              </div>
            )}
          </div>

          {/* Selection Highlight Action Popover */}
          {selectionPopover && (
            <div
              className="selection-popover"
              style={{ left: selectionPopover.x, top: selectionPopover.y }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="ui-btn ui-btn-warm"
                style={{ padding: '6px 12px', fontSize: 12 }}
                onClick={handleSaveHighlight}
              >
                <Highlighter size={13} />
                Highlight
              </button>
              <button
                type="button"
                className="ui-btn ui-btn-ghost"
                style={{ padding: '6px 11px', fontSize: 12 }}
                onClick={() => {
                  navigator.clipboard?.writeText(selectionPopover.text);
                  setSelectionPopover(null);
                  window.getSelection()?.removeAllRanges();
                  onNotify('Copied quote');
                }}
              >
                <Copy size={13} />
                Copy
              </button>
            </div>
          )}

          {/* Bottom Status Bar */}
          <footer className="reader-status-bar">
            <div
              className="reader-progress-track"
              role="slider"
              aria-label="Reading progress"
              aria-valuemin={1}
              aria-valuemax={totalPages}
              aria-valuenow={currentPage.pageNumber}
              tabIndex={0}
              onClick={handleProgressBarClick}
            >
              <div
                className="reader-progress-fill"
                style={{ width: `${Math.max(1, percentage)}%` }}
              />
              {chapterTicks.map((pct, i) => (
                <span
                  key={i}
                  className="reader-chapter-tick"
                  style={{ left: `${pct}%` }}
                  aria-hidden="true"
                />
              ))}
            </div>

            <div className="reader-status-meta">
              <span className="reader-status-chapter" title={currentPage.chapterTitle}>
                {currentPage.chapterTitle}
              </span>
              <span>
                Page {currentPage.pageNumber} of {totalPages} · {percentage}%
              </span>
            </div>
          </footer>

          <Controls
            book={book}
            content={content}
            pages={pages}
            currentPageIndex={currentPageIndex}
            overlayVisible={overlayVisible}
            activeDrawer={activeDrawer}
            onDrawerChange={setActiveDrawer}
            settings={settings}
            onUpdateSettings={onUpdateSettings}
            isCurrentPageBookmarked={Boolean(currentPageBookmark)}
            onToggleBookmark={handleToggleBookmark}
            annotations={annotations}
            onDeleteAnnotation={handleDeleteAnnotation}
            searchQuery={searchQuery}
            onSearchQueryChange={(q) => {
              setSearchQuery(q);
              if (!q.trim()) setActiveSearchHighlight('');
            }}
            searchMatches={searchMatches}
            onJumpToPage={(pageNum, highlightTerm) => {
              if (highlightTerm) setActiveSearchHighlight(highlightTerm);
              goToPageIndex(pageNum - 1);
            }}
            onJumpToOffset={(offset) => {
              const pg = findPageForOffset(pages, offset);
              goToPageIndex(pg - 1);
            }}
            onCloseReader={onClose}
            onSwitchToComicMode={onSwitchToComicMode}
          />
        </>
      )}
    </div>
  );
};
