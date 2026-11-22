import React, { useEffect, useMemo, useState } from 'react';
import { BookMarked, ChevronLeft, ChevronRight, Plus, Search, Sparkles, X } from 'lucide-react';
import type { Book, SavedBookEntry } from '../types/book';
import { CATALOG_CATEGORIES, type CatalogCategory } from '../services/catalogService';
import { BookCard } from './BookCard';
import { SkeletonShelf } from './SkeletonShelf';

interface CatalogViewProps {
  books: Book[];
  loading: boolean;
  loadedWaves: number;
  totalWaves: number;
  savedMap: Map<string, SavedBookEntry>;
  onSelectBook: (book: Book) => void;
  sectionMode?: 'all' | 'comics' | 'manga';
  initialCategory?: CatalogCategory;
  onSearchRemote?: (query: string) => void;
  extraItems?: Book[];
  extraLoading?: boolean;
  onLoadMore?: () => void;
  loadingMore?: boolean;
}

type SortKey = 'popular' | 'title' | 'newest' | 'oldest';
const PAGE_SIZE = 48;

export const CatalogView: React.FC<CatalogViewProps> = ({
  books,
  loading,
  loadedWaves,
  totalWaves,
  savedMap,
  onSelectBook,
  sectionMode = 'all',
  initialCategory,
  onSearchRemote,
  extraItems,
  extraLoading = false,
  onLoadMore,
  loadingMore = false,
}) => {
  const [category, setCategory] = useState<CatalogCategory>(
    initialCategory || (sectionMode === 'manga' ? 'Manga' : sectionMode === 'comics' ? 'Comics' : 'All')
  );
  const [filterText, setFilterText] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('popular');
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (initialCategory && sectionMode === 'all') {
      setCategory(initialCategory);
      setPage(1);
    }
  }, [initialCategory, sectionMode]);

  const sourceList = useMemo(() => {
    if (sectionMode === 'manga') {
      if (extraItems && extraItems.length > 0) return extraItems;
      return books.filter((b) => b.isManga || b.category === 'Manga');
    }
    if (sectionMode === 'comics') {
      if (extraItems && extraItems.length > 0) return extraItems;
      return books.filter((b) => (b.isComic && !b.isManga) || b.category === 'Comics');
    }
    return books;
  }, [books, sectionMode, extraItems]);

  const filteredBooks = useMemo(() => {
    let list = sourceList;

    if (sectionMode === 'all' && category !== 'All') {
      if (category === 'Manga') {
        list = list.filter((b) => b.isManga || b.category === 'Manga');
      } else if (category === 'Comics') {
        list = list.filter((b) => (b.isComic && !b.isManga) || b.category === 'Comics');
      } else {
        const catLow = category.toLowerCase();
        list = list.filter(
          (b) =>
            b.category === category ||
            b.subjects.some((s) => s.toLowerCase().includes(catLow.split(' ')[0]))
        );
      }
    }

    const q = filterText.trim().toLowerCase();
    if (q) {
      list = list.filter((b) =>
        `${b.title} ${b.authors.join(' ')} ${b.subjects.join(' ')}`.toLowerCase().includes(q)
      );
    }

    if (sortBy === 'title') {
      return [...list].sort((a, b) => a.title.localeCompare(b.title));
    }
    if (sortBy === 'newest') {
      return [...list].sort((a, b) => (Number(b.publishYear) || 0) - (Number(a.publishYear) || 0));
    }
    if (sortBy === 'oldest') {
      return [...list].sort(
        (a, b) => (Number(a.publishYear) || 9999) - (Number(b.publishYear) || 9999)
      );
    }
    return list;
  }, [sourceList, sectionMode, category, filterText, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredBooks.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filteredBooks.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const handleFilterChange = (val: string) => {
    setFilterText(val);
    setPage(1);
  };

  const titleText =
    sectionMode === 'manga'
      ? 'Manga'
      : sectionMode === 'comics'
      ? 'Comics & Graphic Novels'
      : 'Full Catalog';

  const subtitleText =
    sectionMode === 'manga'
      ? 'Iconic Japanese manga series with right-to-left reading, spreads, and volume switching'
      : sectionMode === 'comics'
      ? 'Full-color superhero runs, compendiums, and classic comic strips'
      : `Browse ${books.length.toLocaleString()} curated public-domain books, comics, and manga`;

  return (
    <div>
      <div className="shelf-header" style={{ marginBottom: 18 }}>
        <div className="shelf-title-wrap">
          <h1 className="shelf-title" style={{ fontSize: 28 }}>
            {titleText}
          </h1>
          <span className="shelf-subtitle">{subtitleText}</span>
        </div>

        <select
          className="catalog-sort-select"
          value={sortBy}
          onChange={(e) => {
            setSortBy(e.target.value as SortKey);
            setPage(1);
          }}
          aria-label="Sort catalog"
        >
          <option value="popular">Sort: Popular</option>
          <option value="title">Sort: Title A–Z</option>
          <option value="newest">Sort: Newest</option>
          <option value="oldest">Sort: Oldest Classics</option>
        </select>
      </div>

      {loading && (
        <div className="catalog-progress-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="loading-spinner-dot" />
            <span style={{ fontSize: 13.5, fontWeight: 500 }}>
              Loading full catalog… {books.length.toLocaleString()} titles ready (batch {loadedWaves} of{' '}
              {totalWaves})
            </span>
          </div>
          <div className="progress-track-clean" style={{ marginTop: 0, width: 170 }}>
            <div
              className="progress-fill-clean"
              style={{ width: `${Math.round((loadedWaves / Math.max(1, totalWaves)) * 100)}%` }}
            />
          </div>
        </div>
      )}

      <form
        className="search-bar-shell"
        style={{ marginBottom: 16 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (onSearchRemote) onSearchRemote(filterText);
        }}
      >
        <Search size={17} style={{ color: 'var(--ink-muted)', flexShrink: 0 }} />
        <input
          type="text"
          className="search-input"
          value={filterText}
          onChange={(e) => handleFilterChange(e.target.value)}
          placeholder={
            sectionMode === 'manga'
              ? 'Filter manga or press Enter to search archive for any manga title…'
              : sectionMode === 'comics'
              ? 'Filter comics or press Enter to search archive for any comic series…'
              : `Filter ${books.length.toLocaleString()} titles by name, author, or genre…`
          }
        />
        {filterText && (
          <button
            type="button"
            className="search-clear-btn"
            onClick={() => {
              handleFilterChange('');
              if (onSearchRemote) onSearchRemote('');
            }}
            aria-label="Clear filter"
          >
            <X size={16} />
          </button>
        )}
        {sectionMode === 'manga' && onSearchRemote && (
          <button type="submit" className="ui-btn ui-btn-manga">
            <BookMarked size={14} />
            Search Manga
          </button>
        )}
        {sectionMode === 'comics' && onSearchRemote && (
          <button type="submit" className="ui-btn ui-btn-warm">
            <Sparkles size={14} />
            Search Comics
          </button>
        )}
      </form>

      {sectionMode === 'all' && (
        <div className="filter-chips" style={{ marginBottom: 22 }}>
          {CATALOG_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`filter-chip${category === cat ? ' active' : ''}`}
              onClick={() => {
                setCategory(cat);
                setPage(1);
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 18,
          fontSize: 13,
          color: 'var(--ink-secondary)',
        }}
      >
        <span>
          Showing{' '}
          <strong>
            {filteredBooks.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1}–
            {Math.min(filteredBooks.length, safePage * PAGE_SIZE)}
          </strong>{' '}
          of <strong>{filteredBooks.length.toLocaleString()}</strong>{' '}
          {sectionMode === 'manga' ? 'manga' : sectionMode === 'comics' ? 'comics' : 'titles'}
        </span>
        {totalPages > 1 && (
          <span>
            Page {safePage} of {totalPages}
          </span>
        )}
      </div>

      {extraLoading || (loading && pageItems.length === 0) ? (
        <SkeletonShelf label="Loading titles…" count={12} />
      ) : pageItems.length > 0 ? (
        <>
          <div className="shelf-grid">
            {pageItems.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                savedEntry={savedMap.get(book.id)}
                onSelect={onSelectBook}
              />
            ))}
          </div>

          <div className="pagination-bar">
            {totalPages > 1 && (
              <>
                <button
                  type="button"
                  className="ui-btn"
                  disabled={safePage <= 1}
                  onClick={() => {
                    setPage((p) => Math.max(1, p - 1));
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  <ChevronLeft size={15} />
                  Previous
                </button>

                <span style={{ fontSize: 13.5, fontWeight: 500, padding: '0 8px' }}>
                  Page {safePage} of {totalPages}
                </span>

                <button
                  type="button"
                  className="ui-btn"
                  disabled={safePage >= totalPages}
                  onClick={() => {
                    setPage((p) => Math.min(totalPages, p + 1));
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  Next
                  <ChevronRight size={15} />
                </button>
              </>
            )}

            {onLoadMore && (
              <button
                type="button"
                className="ui-btn ui-btn-primary"
                disabled={loadingMore || loading}
                onClick={onLoadMore}
              >
                <Plus size={15} />
                {loadingMore
                  ? 'Fetching more from archives…'
                  : `Load More ${
                      sectionMode === 'manga'
                        ? 'Manga'
                        : sectionMode === 'comics'
                        ? 'Comics'
                        : 'Books'
                    } (+200)`}
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="empty-state">
          <h3 className="empty-state-title">No titles match your filter</h3>
          <p className="empty-state-desc">Try clearing your search or choosing another category.</p>
          <button
            type="button"
            className="ui-btn ui-btn-primary"
            onClick={() => {
              setCategory('All');
              handleFilterChange('');
              if (onSearchRemote) onSearchRemote('');
            }}
          >
            Reset Filters
          </button>
        </div>
      )}
    </div>
  );
};
