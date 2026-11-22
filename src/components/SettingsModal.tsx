import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Contrast,
  Moon,
  Palette,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Sun,
  SunMedium,
  X,
} from 'lucide-react';
import type {
  DisplayTheme,
  FontFamilyKey,
  FontSizeKey,
  LineSpacingKey,
  MarginWidthKey,
  ReaderSettings,
  SerifChoice,
} from '../types/book';
import { DEFAULT_BLOCKED_TAGS } from '../utils/contentFilter';

interface SettingsModalProps {
  settings: ReaderSettings;
  onUpdateSettings: (patch: Partial<ReaderSettings>) => void;
  onToggleNsfw: (nextBlockNsfw: boolean) => void;
  onRefreshCatalog: () => void;
  onClose: () => void;
}

const SUGGESTED_TAGS = [
  'how to draw',
  'textbook',
  'horror',
  'gore',
  'fanfiction',
  'harem',
  'romance',
  'anatomy for artists',
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onUpdateSettings,
  onToggleNsfw,
  onRefreshCatalog,
  onClose,
}) => {
  const [tagInput, setTagInput] = useState('');
  const [showNsfwWarning, setShowNsfwWarning] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const currentPx =
    settings.fontSizePx ?? ({ S: 16, M: 19, L: 22, XL: 26 }[settings.fontSize]);

  const handleAddTag = (raw: string) => {
    const cleaned = raw.trim().toLowerCase();
    if (cleaned.length < 2) return;
    if (settings.blockedTags.includes(cleaned)) {
      setTagInput('');
      return;
    }
    onUpdateSettings({ blockedTags: [...settings.blockedTags, cleaned] });
    setTagInput('');
  };

  const handleRemoveTag = (tag: string) => {
    onUpdateSettings({
      blockedTags: settings.blockedTags.filter((t) => t !== tag),
    });
  };

  const handleToggleSuggested = (tag: string) => {
    if (settings.blockedTags.includes(tag)) {
      handleRemoveTag(tag);
    } else {
      handleAddTag(tag);
    }
  };

  const handleNsfwSwitchClick = () => {
    if (settings.blockNsfw) {
      setShowNsfwWarning(true);
    } else {
      setShowNsfwWarning(false);
      onToggleNsfw(true);
    }
  };

  const confirmUnblockNsfw = () => {
    setShowNsfwWarning(false);
    onToggleNsfw(false);
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-panel settings-panel">
        <div className="settings-header">
          <div>
            <h2 id="settings-modal-title" className="settings-title">
              Settings
            </h2>
            <p className="settings-subtitle">
              Appearance, reading defaults, and content filters
            </p>
          </div>
          <button
            type="button"
            className="modal-close-floating"
            style={{ position: 'static' }}
            onClick={onClose}
            aria-label="Close settings"
          >
            <X size={17} />
          </button>
        </div>

        <div className="settings-body">
          {/* Section 1: Appearance & Display */}
          <section className="settings-section">
            <h3 className="settings-section-title">Appearance &amp; Color Modes</h3>

            <div className="control-group">
              <span className="control-label">Page &amp; Paper Mode</span>
              <div className="segmented-control">
                {(
                  [
                    { id: 'paper', label: 'Paper', icon: <Sun size={14} /> },
                    { id: 'frontlight', label: 'Warm Sepia', icon: <SunMedium size={14} /> },
                    { id: 'night', label: 'Night Ink', icon: <Moon size={14} /> },
                  ] as { id: DisplayTheme; label: string; icon: React.ReactNode }[]
                ).map((th) => (
                  <button
                    key={th.id}
                    type="button"
                    className={`segmented-btn${settings.theme === th.id ? ' active' : ''}`}
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    onClick={() => onUpdateSettings({ theme: th.id })}
                  >
                    {th.icon}
                    {th.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="control-group">
              <span className="control-label">Cover Color Mode</span>
              <div className="segmented-control">
                <button
                  type="button"
                  className={`segmented-btn${!settings.einkCovers ? ' active' : ''}`}
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  onClick={() => onUpdateSettings({ einkCovers: false })}
                >
                  <Palette size={14} />
                  Full Color Covers
                </button>
                <button
                  type="button"
                  className={`segmented-btn${settings.einkCovers ? ' active' : ''}`}
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  onClick={() => onUpdateSettings({ einkCovers: true })}
                >
                  <Contrast size={14} />
                  Monochrome E-Ink
                </button>
              </div>
            </div>

            <div className="settings-row">
              <div>
                <div className="settings-row-label">Ambient Cover Hover Glow</div>
                <div className="settings-row-desc">
                  Subtly tints the page background with the dominant color of hovered covers
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.hoverGlow}
                className={`toggle-switch${settings.hoverGlow ? ' on' : ''}`}
                onClick={() => onUpdateSettings({ hoverGlow: !settings.hoverGlow })}
              >
                <span className="toggle-knob" />
              </button>
            </div>

            <div className="settings-row">
              <div>
                <div className="settings-row-label">E-Ink Page-Turn Flash</div>
                <div className="settings-row-desc">
                  Adds a brief retro electrophoretic refresh pulse when turning book pages
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.einkFlash}
                className={`toggle-switch${settings.einkFlash ? ' on' : ''}`}
                onClick={() => onUpdateSettings({ einkFlash: !settings.einkFlash })}
              >
                <span className="toggle-knob" />
              </button>
            </div>
          </section>

          {/* Section 2: Reading Defaults */}
          <section className="settings-section">
            <h3 className="settings-section-title">Reading Defaults</h3>

            <div className="control-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="control-label">Default Text Zoom</span>
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>{currentPx}px</span>
              </div>
              <div className="zoom-slider-row">
                <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>A</span>
                <input
                  type="range"
                  className="reader-zoom-slider"
                  min={14}
                  max={30}
                  step={1}
                  value={currentPx}
                  onChange={(e) => {
                    const px = Number(e.target.value);
                    const preset: FontSizeKey =
                      px <= 16 ? 'S' : px <= 20 ? 'M' : px <= 24 ? 'L' : 'XL';
                    onUpdateSettings({ fontSizePx: px, fontSize: preset });
                  }}
                />
                <span style={{ fontSize: 17, fontWeight: 600 }}>A</span>
              </div>
            </div>

            <div className="settings-two-col">
              <div className="control-group">
                <span className="control-label">Reading Font</span>
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
                  <span className="control-label">Serif Face</span>
                  <div className="segmented-control">
                    {(
                      [
                        { id: 'source-serif', label: 'Source' },
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
                <span className="control-label">Page Margins</span>
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
            </div>
          </section>

          {/* Section 3: Catalog Cache */}
          <section className="settings-section">
            <h3 className="settings-section-title">Catalog Data</h3>
            <div className="settings-row">
              <div>
                <div className="settings-row-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={14} />
                  Refresh Catalog Index
                </div>
                <div className="settings-row-desc">
                  Re-sync books, comics, and manga from all 8 archives with your current filters
                </div>
              </div>
              <button
                type="button"
                className="ui-btn"
                onClick={() => {
                  onRefreshCatalog();
                  onClose();
                }}
              >
                <RefreshCw size={14} />
                Refresh
              </button>
            </div>
          </section>

          {/* Section 4 (Bottom): Content Filters, Tag Blocks & NSFW Block */}
          <section className="settings-section" style={{ marginBottom: 0 }}>
            <h3 className="settings-section-title">Content Filters &amp; Tag Blocks</h3>

            <div className="control-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="control-label">
                  Blocked Tags &amp; Keywords ({settings.blockedTags.length})
                </span>
                <button
                  type="button"
                  className="ui-btn ui-btn-ghost"
                  style={{ padding: '3px 8px', fontSize: 11.5 }}
                  onClick={() => onUpdateSettings({ blockedTags: [...DEFAULT_BLOCKED_TAGS] })}
                >
                  Reset Defaults
                </button>
              </div>

              <form
                className="search-bar-shell"
                style={{ padding: '4px 6px 4px 12px' }}
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAddTag(tagInput);
                }}
              >
                <input
                  type="text"
                  className="search-input"
                  style={{ fontSize: 13.5, padding: '7px 4px' }}
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="Block any tag or keyword (e.g., gore, textbook, horror)..."
                  aria-label="Add blocked tag or keyword"
                />
                <button type="submit" className="ui-btn ui-btn-primary" style={{ padding: '6px 12px' }}>
                  <Plus size={14} />
                  Block
                </button>
              </form>

              {settings.blockedTags.length > 0 && (
                <div className="blocked-tags-list">
                  {settings.blockedTags.map((tag) => (
                    <span key={tag} className="blocked-tag-chip">
                      <span>{tag}</span>
                      <button
                        type="button"
                        className="blocked-tag-remove"
                        onClick={() => handleRemoveTag(tag)}
                        aria-label={`Unblock tag ${tag}`}
                        title={`Remove "${tag}"`}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div style={{ marginTop: 4 }}>
                <div style={{ fontSize: 11.5, color: 'var(--ink-muted)', marginBottom: 6 }}>
                  Quick tag blocks:
                </div>
                <div className="filter-chips">
                  {SUGGESTED_TAGS.map((tag) => {
                    const active = settings.blockedTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        className={`filter-chip${active ? ' active' : ''}`}
                        style={{ fontSize: 11.5, padding: '4px 10px' }}
                        onClick={() => handleToggleSuggested(tag)}
                      >
                        {active ? `Blocked: ${tag}` : `+ ${tag}`}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="settings-row" style={{ marginTop: 6 }}>
              <div>
                <div className="settings-row-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {settings.blockNsfw ? (
                    <ShieldCheck size={15} style={{ color: '#15803D' }} />
                  ) : (
                    <ShieldAlert size={15} style={{ color: '#D9483B' }} />
                  )}
                  Block NSFW &amp; Adult Content
                </div>
                <div className="settings-row-desc">
                  {settings.blockNsfw
                    ? 'Safe Mode is active. Porn, hentai, ecchi, erotica, and 18+ tags are filtered out across all archives.'
                    : 'NSFW filter is currently disabled (18+ mature content may appear in search and catalog).'}
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.blockNsfw}
                aria-label="Block NSFW and Adult Content"
                className={`toggle-switch${settings.blockNsfw ? ' on' : ''}`}
                onClick={handleNsfwSwitchClick}
              >
                <span className="toggle-knob" />
              </button>
            </div>

            {showNsfwWarning && (
              <div className="nsfw-warning-box" role="alert">
                <div className="nsfw-warning-header">
                  <AlertTriangle size={17} />
                  <span>Mature Content Warning (18+)</span>
                </div>
                <p className="nsfw-warning-text">
                  Disabling the NSFW block allows unmoderated adult, erotic, hentai, and suggestive
                  titles from external public archives (Internet Archive, Open Library, and
                  MangaDex) to appear in search and catalog results. Please confirm you are at least
                  18 years old and want to unblock NSFW tags.
                </p>
                <div className="nsfw-warning-actions">
                  <button
                    type="button"
                    className="ui-btn ui-btn-primary"
                    onClick={() => setShowNsfwWarning(false)}
                  >
                    Cancel, keep Safe Mode
                  </button>
                  <button
                    type="button"
                    className="ui-btn ui-btn-warm"
                    onClick={confirmUnblockNsfw}
                  >
                    I am 18+, unblock NSFW
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
