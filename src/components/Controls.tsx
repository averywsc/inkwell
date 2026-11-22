import React from 'react';
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Highlighter,
  Image as ImageIcon,
  List,
  Search,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import type {
  Book,
  BookAnnotation,
  DisplayTheme,
  FontFamilyKey,
  FontSizeKey,
  LineSpacingKey,
  MarginWidthKey,
  ParsedBookContent,
  ReaderPage,
  ReaderSettings,
  SearchMatch,
  SerifChoice,
} from '../types/book';
import { findPageForOffset } from '../utils/pagination';

export type ActiveDrawer = 'none' | 'settings' | 'toc' | 'search' | 'notes';

interface ControlsProps {
  book: Book;
  content: ParsedBookContent;
  pages: ReaderPage[];
  currentPageIndex: number;
  overlayVisible: boolean;
  activeDrawer: ActiveDrawer;
  onDrawerChange: (drawer: ActiveDrawer) => void;
  settings: ReaderSettings;
  onUpdateSettings: (patch: Partial<ReaderSettings>) => void;
  isCurrentPageBookmarked: boolean;
  onToggleBookmark: () => void;
  annotations: BookAnnotation[];
  onDeleteAnnotation: (id: string) => void;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  searchMatches: SearchMatch[];
  onJumpToPage: (pageNumber: number, highlightTerm?: string) => void;
  onJumpToOffset: (charOffset: number) => void;
  onCloseReader: () => void;
  onSwitchToComicMode?: () => void;
}

export const Controls: React.FC<ControlsProps> = ({
  book,
  content,
  pages,
  currentPageIndex,
  overlayVisible,
  activeDrawer,
  onDrawerChange,
  settings,
  onUpdateSettings,
  isCurrentPageBookmarked,
  onToggleBookmark,
  annotations,
  onDeleteAnnotation,
  searchQuery,
  onSearchQueryChange,
  searchMatches,
  onJumpToPage,
  onJumpToOffset,
  onCloseReader,
  onSwitchToComicMode,
}) => {
  if (!overlayVisible && activeDrawer === 'none') {
    return null;
  }

  const currentPage = pages[currentPageIndex];
  const toggleDrawer = (drawer: ActiveDrawer) => {
    onDrawerChange(activeDrawer === drawer ? 'none' : drawer);
  };

  return (
    <>
      {/* Clean Floating Top Overlay Menu */}
      <div className="reader-top-overlay" onClick={(e) => e.stopPropagation()}>
        <div className="reader-overlay-left">
          <button
            type="button"
            className="ui-btn"
            onClick={onCloseReader}
            title="Return to Library"
          >
            <ArrowLeft size={15} />
            Library
          </button>
          <div className="reader-overlay-bookinfo">
            <div className="reader-overlay-title">{book.title}</div>
            <div className="reader-overlay-author">{book.authors.join(', ')}</div>
          </div>
        </div>

        <div className="reader-overlay-actions">
          {onSwitchToComicMode && book.iaIdentifier && (
            <button
              type="button"
              className="ui-btn"
              onClick={onSwitchToComicMode}
              title="Switch to full-color scanned / illustrated pages"
            >
              <ImageIcon size={14} />
              Color Pages
            </button>
          )}

          <button
            type="button"
            className={`ui-btn${isCurrentPageBookmarked ? ' active' : ''}`}
            onClick={onToggleBookmark}
            title="Bookmark this page (Shortcut: B)"
          >
            {isCurrentPageBookmarked ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
            <span>{isCurrentPageBookmarked ? 'Saved' : 'Bookmark'}</span>
          </button>

          <button
            type="button"
            className={`ui-btn${activeDrawer === 'toc' ? ' active' : ''}`}
            onClick={() => toggleDrawer('toc')}
          >
            <List size={14} />
            <span>Contents</span>
          </button>

          <button
            type="button"
            className={`ui-btn${activeDrawer === 'search' ? ' active' : ''}`}
            onClick={() => toggleDrawer('search')}
          >
            <Search size={14} />
            <span>Search</span>
          </button>

          <button
            type="button"
            className={`ui-btn${activeDrawer === 'notes' ? ' active' : ''}`}
            onClick={() => toggleDrawer('notes')}
          >
            <Highlighter size={14} />
            <span>Notes{annotations.length > 0 ? ` (${annotations.length})` : ''}</span>
          </button>

          <button
            type="button"
            className={`ui-btn${activeDrawer === 'settings' ? ' active' : ''}`}
            onClick={() => toggleDrawer('settings')}
          >
            <Type size={14} />
            <span>Aa</span>
          </button>
        </div>
      </div>

      {/* Settings Drawer (Aa) */}
      {activeDrawer === 'settings' && (
        <aside className="reader-drawer" onClick={(e) => e.stopPropagation()} aria-label="Appearance">
          <div className="reader-drawer-header">
            <span>Reading Appearance</span>
            <button
              type="button"
              className="ui-btn ui-btn-ghost"
              style={{ padding: 5 }}
              onClick={() => onDrawerChange('none')}
              aria-label="Close settings"
            >
              <X size={16} />
            </button>
          </div>
          <div className="reader-drawer-body">
            <div className="control-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="control-label">Text Zoom</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-primary)' }}>
                  {settings.fontSizePx ??
                    ({ S: 16, M: 19, L: 22, XL: 26 }[settings.fontSize])}
                  px
                </span>
              </div>
              <div className="zoom-slider-row">
                <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>A</span>
                <input
                  type="range"
                  className="reader-zoom-slider"
                  min={14}
                  max={30}
                  step={1}
                  value={
                    settings.fontSizePx ??
                    ({ S: 16, M: 19, L: 22, XL: 26 }[settings.fontSize])
                  }
                  onChange={(e) => {
                    const px = Number(e.target.value);
                    const preset: FontSizeKey =
                      px <= 16 ? 'S' : px <= 20 ? 'M' : px <= 24 ? 'L' : 'XL';
                    onUpdateSettings({ fontSizePx: px, fontSize: preset });
                  }}
                  aria-label="Text zoom size"
                />
                <span style={{ fontSize: 17, fontWeight: 600, color: 'var(--ink-primary)' }}>A</span>
              </div>
              <div className="segmented-control">
                {(
                  [
                    { key: 'S', px: 16 },
                    { key: 'M', px: 19 },
                    { key: 'L', px: 22 },
                    { key: 'XL', px: 26 },
                  ] as { key: FontSizeKey; px: number }[]
                ).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`segmented-btn${
                      (settings.fontSizePx ?? ({ S: 16, M: 19, L: 22, XL: 26 }[settings.fontSize])) ===
                      item.px
                        ? ' active'
                        : ''
                    }`}
                    onClick={() => onUpdateSettings({ fontSize: item.key, fontSizePx: item.px })}
                  >
                    {item.key}
                  </button>
                ))}
              </div>
            </div>

            <div className="control-group">
              <span className="control-label">Font Style</span>
              <div className="segmented-control">
                {(
                  [
                    { id: 'serif', label: 'Serif' },
                    { id: 'sans', label: 'Sans' },
                    { id: 'mono', label: 'Mono' },
                  ] as { id: FontFamilyKey; label: string }[]
                ).map((ff) => (
                  <button
                    key={ff.id}
                    type="button"
                    className={`segmented-btn${settings.fontFamily === ff.id ? ' active' : ''}`}
                    onClick={() => onUpdateSettings({ fontFamily: ff.id })}
                  >
                    {ff.label}
                  </button>
                ))}
              </div>
            </div>

            {settings.fontFamily === 'serif' && (
              <div className="control-group">
                <span className="control-label">Typeface</span>
                <div className="segmented-control">
                  {(
                    [
                      { id: 'source-serif', label: 'Source Serif' },
                      { id: 'literata', label: 'Literata' },
                      { id: 'lora', label: 'Lora' },
                    ] as { id: SerifChoice; label: string }[]
                  ).map((sf) => (
                    <button
                      key={sf.id}
                      type="button"
                      className={`segmented-btn${settings.serifChoice === sf.id ? ' active' : ''}`}
                      onClick={() => onUpdateSettings({ serifChoice: sf.id })}
                    >
                      {sf.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="control-group">
              <span className="control-label">Line Spacing</span>
              <div className="segmented-control">
                {(
                  [
                    { id: 'compact', label: 'Compact' },
                    { id: 'normal', label: 'Normal' },
                    { id: 'relaxed', label: 'Relaxed' },
                  ] as { id: LineSpacingKey; label: string }[]
                ).map((ls) => (
                  <button
                    key={ls.id}
                    type="button"
                    className={`segmented-btn${settings.lineSpacing === ls.id ? ' active' : ''}`}
                    onClick={() => onUpdateSettings({ lineSpacing: ls.id })}
                  >
                    {ls.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="control-group">
              <span className="control-label">Margins</span>
              <div className="segmented-control">
                {(
                  [
                    { id: 'narrow', label: 'Narrow' },
                    { id: 'medium', label: 'Medium' },
                    { id: 'wide', label: 'Wide' },
                  ] as { id: MarginWidthKey; label: string }[]
                ).map((mw) => (
                  <button
                    key={mw.id}
                    type="button"
                    className={`segmented-btn${settings.marginWidth === mw.id ? ' active' : ''}`}
                    onClick={() => onUpdateSettings({ marginWidth: mw.id })}
                  >
                    {mw.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="control-group">
              <span className="control-label">Page Theme</span>
              <div className="segmented-control">
                {(
                  [
                    { id: 'paper', label: 'Paper' },
                    { id: 'frontlight', label: 'Sepia' },
                    { id: 'night', label: 'Night' },
                  ] as { id: DisplayTheme; label: string }[]
                ).map((th) => (
                  <button
                    key={th.id}
                    type="button"
                    className={`segmented-btn${settings.theme === th.id ? ' active' : ''}`}
                    onClick={() => onUpdateSettings({ theme: th.id })}
                  >
                    {th.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="control-group">
              <span className="control-label">Subtle Page-Turn Flash</span>
              <div className="segmented-control">
                <button
                  type="button"
                  className={`segmented-btn${settings.einkFlash ? ' active' : ''}`}
                  onClick={() => onUpdateSettings({ einkFlash: true })}
                >
                  On
                </button>
                <button
                  type="button"
                  className={`segmented-btn${!settings.einkFlash ? ' active' : ''}`}
                  onClick={() => onUpdateSettings({ einkFlash: false })}
                >
                  Off
                </button>
              </div>
            </div>
          </div>
        </aside>
      )}

      {/* Table of Contents Drawer */}
      {activeDrawer === 'toc' && (
        <aside className="reader-drawer" onClick={(e) => e.stopPropagation()} aria-label="Contents">
          <div className="reader-drawer-header">
            <span>Table of Contents ({content.chapters.length})</span>
            <button
              type="button"
              className="ui-btn ui-btn-ghost"
              style={{ padding: 5 }}
              onClick={() => onDrawerChange('none')}
              aria-label="Close Table of Contents"
            >
              <X size={16} />
            </button>
          </div>
          <div className="reader-drawer-body">
            <div className="toc-list">
              {content.chapters.map((chapter, idx) => {
                const startPage = findPageForOffset(pages, chapter.startOffset);
                const isActive = currentPage?.chapterIndex === idx;
                return (
                  <button
                    key={chapter.id}
                    type="button"
                    className={`toc-item${isActive ? ' active' : ''}`}
                    onClick={() => {
                      onJumpToPage(startPage);
                      onDrawerChange('none');
                    }}
                  >
                    <span className="toc-item-title">{chapter.title}</span>
                    <span className="toc-item-page">p. {startPage}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>
      )}

      {/* In-Book Search Drawer */}
      {activeDrawer === 'search' && (
        <aside className="reader-drawer" onClick={(e) => e.stopPropagation()} aria-label="Search">
          <div className="reader-drawer-header">
            <span>Find in Book</span>
            <button
              type="button"
              className="ui-btn ui-btn-ghost"
              style={{ padding: 5 }}
              onClick={() => onDrawerChange('none')}
              aria-label="Close search"
            >
              <X size={16} />
            </button>
          </div>
          <div className="reader-drawer-body">
            <div className="search-bar-shell" style={{ padding: '4px 10px' }}>
              <input
                type="text"
                className="search-input"
                style={{ fontSize: 13.5, padding: '7px 4px' }}
                value={searchQuery}
                onChange={(e) => onSearchQueryChange(e.target.value)}
                placeholder="Search words or phrases…"
                autoFocus
              />
              {searchQuery && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => onSearchQueryChange('')}
                >
                  <X size={15} />
                </button>
              )}
            </div>

            <div style={{ fontSize: 12.5, color: 'var(--ink-secondary)' }}>
              {searchQuery.trim().length < 2
                ? 'Type at least 2 characters.'
                : `${searchMatches.length} ${searchMatches.length === 1 ? 'match' : 'matches'} found`}
            </div>

            {searchMatches.length > 0 && (
              <div className="search-results-list">
                {searchMatches.map((m, idx) => (
                  <button
                    key={`${m.charOffset}-${idx}`}
                    type="button"
                    className="search-result-item"
                    onClick={() => {
                      onJumpToPage(m.pageNumber, searchQuery.trim());
                      onDrawerChange('none');
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11.5,
                        color: 'var(--ink-secondary)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        width: '100%',
                        fontWeight: 500,
                      }}
                    >
                      <span>{m.chapterTitle}</span>
                      <span>Page {m.pageNumber}</span>
                    </div>
                    <div className="search-snippet">
                      {m.snippetBefore}
                      <strong>{m.matchText}</strong>
                      {m.snippetAfter}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>
      )}

      {/* Bookmarks & Highlights Drawer */}
      {activeDrawer === 'notes' && (
        <aside className="reader-drawer" onClick={(e) => e.stopPropagation()} aria-label="Notes">
          <div className="reader-drawer-header">
            <span>Bookmarks &amp; Highlights ({annotations.length})</span>
            <button
              type="button"
              className="ui-btn ui-btn-ghost"
              style={{ padding: 5 }}
              onClick={() => onDrawerChange('none')}
              aria-label="Close notes"
            >
              <X size={16} />
            </button>
          </div>
          <div className="reader-drawer-body">
            {annotations.length === 0 ? (
              <p style={{ fontSize: 13.5, color: 'var(--ink-secondary)', margin: 0, lineHeight: 1.5 }}>
                Select text on any page to highlight a passage, or tap Bookmark to save your spot.
              </p>
            ) : (
              <div className="search-results-list">
                {annotations.map((ann) => {
                  const pg = findPageForOffset(pages, ann.charOffset);
                  return (
                    <div key={ann.id} className="search-result-item" style={{ cursor: 'default' }}>
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--ink-secondary)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          width: '100%',
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>
                          {ann.type === 'highlight' ? 'Highlight' : 'Bookmark'} · Page {pg}
                        </span>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            type="button"
                            className="ui-btn"
                            style={{ padding: '4px 10px', fontSize: 11.5 }}
                            onClick={() => {
                              onJumpToOffset(ann.charOffset);
                              onDrawerChange('none');
                            }}
                          >
                            Jump
                          </button>
                          <button
                            type="button"
                            className="ui-btn ui-btn-ghost"
                            style={{ padding: '4px 6px' }}
                            onClick={() => onDeleteAnnotation(ann.id)}
                            aria-label="Delete"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                      <div className="search-snippet">“{ann.text}”</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
      )}
    </>
  );
};
