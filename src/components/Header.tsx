import React, { useRef } from 'react';
import {
  BookMarked,
  Compass,
  Grid2x2,
  Library,
  Settings,
  Shuffle,
  Sparkles,
  Upload,
} from 'lucide-react';

export type ActiveTab = 'discover' | 'catalog' | 'comics' | 'manga' | 'library';

interface HeaderProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  catalogCount: number;
  libraryCount: number;
  onUploadFiles: (files: FileList | File[]) => void;
  onSurpriseMe: () => void;
  onOpenSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  catalogCount,
  libraryCount,
  onUploadFiles,
  onSurpriseMe,
  onOpenSettings,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <button
          type="button"
          className="brand-lockup"
          onClick={() => onTabChange('discover')}
          title="Return to Discover"
        >
          <span className="brand-title">Inkwell</span>
        </button>

        <nav className="nav-pills" aria-label="Primary Navigation">
          <button
            type="button"
            className={`nav-pill${activeTab === 'discover' ? ' active' : ''}`}
            onClick={() => onTabChange('discover')}
          >
            <Compass size={14} strokeWidth={1.9} />
            Discover
          </button>

          <button
            type="button"
            className={`nav-pill${activeTab === 'catalog' ? ' active' : ''}`}
            onClick={() => onTabChange('catalog')}
          >
            <Grid2x2 size={14} strokeWidth={1.9} />
            Catalog
            {catalogCount > 0 && (
              <span className="nav-badge">{catalogCount.toLocaleString()}</span>
            )}
          </button>

          <button
            type="button"
            className={`nav-pill${activeTab === 'comics' ? ' active' : ''}`}
            onClick={() => onTabChange('comics')}
          >
            <Sparkles size={14} strokeWidth={1.9} />
            Comics
          </button>

          <button
            type="button"
            className={`nav-pill${activeTab === 'manga' ? ' active' : ''}`}
            onClick={() => onTabChange('manga')}
          >
            <BookMarked size={14} strokeWidth={1.9} />
            Manga
          </button>

          <button
            type="button"
            className={`nav-pill${activeTab === 'library' ? ' active' : ''}`}
            onClick={() => onTabChange('library')}
          >
            <Library size={14} strokeWidth={1.9} />
            Library
            {libraryCount > 0 && <span className="nav-badge">{libraryCount}</span>}
          </button>
        </nav>

        <div className="header-actions">
          <button
            type="button"
            className="ui-btn ui-btn-icon"
            onClick={onSurpriseMe}
            title="Pick a random book, comic, or manga"
            aria-label="Surprise me"
          >
            <Shuffle size={15} strokeWidth={1.9} />
          </button>

          <button
            type="button"
            className="ui-btn ui-btn-icon"
            onClick={onOpenSettings}
            title="Settings: Themes, Color Mode, NSFW & Tag Filters"
          >
            <Settings size={15} strokeWidth={1.9} />
            <span>Settings</span>
          </button>

          <button
            type="button"
            className="ui-btn ui-btn-primary"
            onClick={() => fileInputRef.current?.click()}
            title="Import local .epub, .txt, or .cbz file"
          >
            <Upload size={14} strokeWidth={2} />
            <span>Import</span>
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
      </div>
    </header>
  );
};
