import React from 'react';
import { Search, X } from 'lucide-react';
import type { SourceFilter } from '../types/book';

interface SearchBarProps {
  query: string;
  onQueryChange: (val: string) => void;
  onSearch: (e: React.FormEvent) => void;
  onClear: () => void;
  sourceFilter: SourceFilter;
  onSourceFilterChange: (filter: SourceFilter) => void;
  isSearching: boolean;
  resultCount?: number;
  catalogCount: number;
  catalogLoading: boolean;
}

const SOURCE_OPTIONS: { id: SourceFilter; label: string }[] = [
  { id: 'all', label: 'All (8 APIs)' },
  { id: 'manga', label: 'Manga' },
  { id: 'comics', label: 'Comics' },
  { id: 'mangadex', label: 'MangaDex' },
  { id: 'gutenberg', label: 'Gutenberg' },
  { id: 'openlibrary', label: 'Open Library' },
  { id: 'archive', label: 'Internet Archive' },
  { id: 'poetrydb', label: 'PoetryDB' },
  { id: 'wikisource', label: 'Wikisource' },
  { id: 'standardebooks', label: 'Standard Ebooks' },
];

export const SearchBar: React.FC<SearchBarProps> = ({
  query,
  onQueryChange,
  onSearch,
  onClear,
  sourceFilter,
  onSourceFilterChange,
  isSearching,
  resultCount,
  catalogCount,
  catalogLoading,
}) => {
  return (
    <section className="search-area" aria-label="Search Books, Comics, and Manga">
      <div className="search-top-row">
        <form className="search-bar-shell" onSubmit={onSearch}>
          <Search size={17} strokeWidth={2} style={{ color: 'var(--ink-muted)', flexShrink: 0 }} />
          <input
            type="text"
            className="search-input"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search books, manga, comics, or authors…"
            aria-label="Search books, manga, comics, or authors"
          />
          {query && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={onClear}
              aria-label="Clear search"
            >
              <X size={16} strokeWidth={2} />
            </button>
          )}
          <button type="submit" className="ui-btn ui-btn-primary" disabled={isSearching}>
            {isSearching ? 'Searching…' : 'Search'}
          </button>
        </form>
      </div>

      <div className="filter-chip-row">
        <div className="filter-chips" role="group" aria-label="Filter by source">
          {SOURCE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`filter-chip${sourceFilter === opt.id ? ' active' : ''}`}
              onClick={() => onSourceFilterChange(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <span style={{ fontSize: 12.5, color: 'var(--ink-muted)', fontWeight: 500 }}>
          {typeof resultCount === 'number'
            ? `${resultCount.toLocaleString()} ${resultCount === 1 ? 'result' : 'results'}`
            : catalogCount >= 1000
            ? `${catalogCount.toLocaleString()} titles indexed`
            : catalogLoading
            ? `Indexing ${catalogCount.toLocaleString()} titles…`
            : `${catalogCount.toLocaleString()} titles`}
        </span>
      </div>
    </section>
  );
};
