import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Book,
  BookAnnotation,
  CuratedShelf,
  ReaderSettings,
  SavedBookEntry,
  ShelfStatus,
  SourceFilter,
} from './types/book';
import {
  CURATED_SHELVES,
  deduplicateBooks,
  fetchCuratedShelfBooks,
  searchAllSources,
} from './services/aggregator';
import { fetchAndPrepareBook, importLocalBookFile } from './services/bookFetcher';
import { importLocalCbzFile } from './services/comicFetcher';
import {
  fetchMoreCatalogBatch,
  loadThousandBookCatalog,
  type CatalogCategory,
} from './services/catalogService';
import { searchInternetArchive } from './services/internetArchive';
import { searchMangaDexSafe } from './services/mangadex';
import {
  clearCachedCatalog,
  deleteAnnotation,
  getAllAnnotations,
  getAllSavedBooks,
  hideFromContinueReading,
  loadReaderSettings,
  removeFromReadHistory,
  removeSavedBook,
  saveCachedCatalog,
  saveReaderSettings,
  upsertSavedBook,
} from './services/storage';
import { isCleanBook, setContentFilterConfig } from './utils/contentFilter';
import { clearPageAmbientGlow } from './utils/colorExtractor';
import { Header, type ActiveTab } from './components/Header';
import { SearchBar } from './components/SearchBar';
import {
  DiscoverBookshelf,
  MyLibraryView,
  type LibrarySubTab,
} from './components/Bookshelf';
import { CatalogView } from './components/CatalogView';
import { BookDetailModal } from './components/BookDetailModal';
import { SettingsModal } from './components/SettingsModal';
import { DropZoneOverlay } from './components/DropZoneOverlay';
import { ReaderView } from './components/ReaderView';
import { ComicReaderView } from './components/ComicReaderView';

export function App() {
  const [settings, setSettings] = useState<ReaderSettings>(() => {
    const loaded = loadReaderSettings();
    setContentFilterConfig({ blockNsfw: loaded.blockNsfw, blockedTags: loaded.blockedTags });
    return loaded;
  });
  const [activeTab, setActiveTab] = useState<ActiveTab>('discover');
  const [catalogInitialCategory, setCatalogInitialCategory] = useState<CatalogCategory>('All');
  const [librarySubTab, setLibrarySubTab] = useState<LibrarySubTab>('history');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  // Search state
  const [searchInput, setSearchInput] = useState('');
  const [activeSearchTerm, setActiveSearchTerm] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Book[] | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  // Curated Discover shelves
  const [shelves, setShelves] = useState<CuratedShelf[]>(() =>
    CURATED_SHELVES.map((cfg) => ({
      id: cfg.id,
      title: cfg.title,
      subtitle: cfg.subtitle,
      query: cfg.gutendexTopic || cfg.archiveSubject,
      topic: cfg.gutendexTopic || cfg.archiveSubject,
      books: [],
      loading: true,
    }))
  );

  // Full 1,500+ Expanding Catalog state
  const [catalogBooks, setCatalogBooks] = useState<Book[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogProgress, setCatalogProgress] = useState({ loadedWaves: 0, totalWaves: 5 });
  const [extraBatchCounter, setExtraBatchCounter] = useState(0);
  const [loadingMoreCatalog, setLoadingMoreCatalog] = useState(false);

  // Dedicated Comics & Manga remote searches
  const [extraComics, setExtraComics] = useState<Book[]>([]);
  const [extraComicsLoading, setExtraComicsLoading] = useState(false);
  const [extraManga, setExtraManga] = useState<Book[]>([]);
  const [extraMangaLoading, setExtraMangaLoading] = useState(false);

  // Persisted library & annotations
  const [savedEntries, setSavedEntries] = useState<SavedBookEntry[]>([]);
  const [allAnnotations, setAllAnnotations] = useState<BookAnnotation[]>([]);

  // Modal & Reader state
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [readingTarget, setReadingTarget] = useState<{
    book: Book;
    mode: 'text' | 'comic';
    initialCharOffset?: number;
  } | null>(null);

  // Drag & Drop + Toast
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const dragDepthRef = useRef(0);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const notify = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastMsg(null), 3200);
  }, []);

  // Sync theme, cover mode, hover glow, and content filter config immediately
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme);
    document.documentElement.classList.toggle('eink-covers-enabled', settings.einkCovers);
    document.documentElement.classList.toggle('no-hover-glow', !settings.hoverGlow);
    if (!settings.hoverGlow) clearPageAmbientGlow();
    setContentFilterConfig({
      blockNsfw: settings.blockNsfw,
      blockedTags: settings.blockedTags,
    });
    saveReaderSettings(settings);
  }, [settings]);

  const updateSettings = useCallback((patch: Partial<ReaderSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      setContentFilterConfig({ blockNsfw: next.blockNsfw, blockedTags: next.blockedTags });
      return next;
    });
  }, []);

  const refreshLibrary = useCallback(async () => {
    const [entries, notes] = await Promise.all([getAllSavedBooks(), getAllAnnotations()]);
    setSavedEntries(entries);
    setAllAnnotations(notes);
  }, []);

  useEffect(() => {
    refreshLibrary();
  }, [refreshLibrary, settings.blockNsfw, settings.blockedTags]);

  const handleRefreshCatalog = useCallback(async () => {
    await clearCachedCatalog();
    setCatalogBooks([]);
    setShelves(
      CURATED_SHELVES.map((cfg) => ({
        id: cfg.id,
        title: cfg.title,
        subtitle: cfg.subtitle,
        query: cfg.gutendexTopic || cfg.archiveSubject,
        topic: cfg.gutendexTopic || cfg.archiveSubject,
        books: [],
        loading: true,
      }))
    );
    setReloadNonce((n) => n + 1);
    notify('Refreshing catalog with updated filters…');
  }, [notify]);

  const handleToggleNsfw = useCallback(
    async (nextBlockNsfw: boolean) => {
      updateSettings({ blockNsfw: nextBlockNsfw });
      await clearCachedCatalog();
      setReloadNonce((n) => n + 1);
      notify(
        nextBlockNsfw
          ? 'Safe Mode enabled. NSFW content is now blocked.'
          : 'NSFW filter disabled (18+ mode). Refreshing results.'
      );
    },
    [notify, updateSettings]
  );

  // Load curated Discover shelves
  useEffect(() => {
    const controller = new AbortController();

    CURATED_SHELVES.forEach((cfg) => {
      fetchCuratedShelfBooks(cfg, controller.signal)
        .then((books) => {
          if (controller.signal.aborted) return;
          setShelves((prev) =>
            prev.map((s) => (s.id === cfg.id ? { ...s, books, loading: false } : s))
          );
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setShelves((prev) =>
            prev.map((s) => (s.id === cfg.id ? { ...s, loading: false } : s))
          );
        });
    });

    return () => controller.abort();
  }, [reloadNonce]);

  // Progressively load 1,500+ books, comics, and manga across 8 APIs
  useEffect(() => {
    const controller = new AbortController();
    setCatalogLoading(true);

    loadThousandBookCatalog(
      (books, meta) => {
        if (controller.signal.aborted) return;
        setCatalogBooks(books);
        setCatalogProgress({ loadedWaves: meta.loadedWaves, totalWaves: meta.totalWaves });
        if (meta.done) setCatalogLoading(false);
      },
      controller.signal
    ).catch(() => {
      if (!controller.signal.aborted) setCatalogLoading(false);
    });

    return () => controller.abort();
  }, [reloadNonce]);

  // Live reactive filtering whenever blockedTags or blockNsfw changes!
  const filterCfg = useMemo(
    () => ({ blockNsfw: settings.blockNsfw, blockedTags: settings.blockedTags }),
    [settings.blockNsfw, settings.blockedTags]
  );

  const visibleCatalogBooks = useMemo(
    () => catalogBooks.filter((b) => isCleanBook(b, filterCfg)),
    [catalogBooks, filterCfg]
  );

  const visibleShelves = useMemo(
    () =>
      shelves.map((s) => ({
        ...s,
        books: s.books.filter((b) => isCleanBook(b, filterCfg)),
      })),
    [shelves, filterCfg]
  );

  const visibleSearchResults = useMemo(
    () => (searchResults ? searchResults.filter((b) => isCleanBook(b, filterCfg)) : null),
    [searchResults, filterCfg]
  );

  const handleLoadMoreCatalog = useCallback(
    async (mode: 'all' | 'comics' | 'manga') => {
      if (loadingMoreCatalog) return;
      setLoadingMoreCatalog(true);
      try {
        const nextWave = extraBatchCounter;
        setExtraBatchCounter((c) => c + 1);
        const fresh = await fetchMoreCatalogBatch(nextWave, mode);
        if (fresh.length > 0) {
          setCatalogBooks((prev) => {
            const merged = deduplicateBooks([...prev, ...fresh]);
            saveCachedCatalog(merged).catch(() => {});
            const addedCount = merged.length - prev.length;
            notify(
              addedCount > 0
                ? `Added ${addedCount} new titles (${merged.length.toLocaleString()} total)`
                : 'Catalog refreshed with latest archive items'
            );
            return merged;
          });
        } else {
          notify('No additional titles returned for this batch. Try again for the next genre wave.');
        }
      } finally {
        setLoadingMoreCatalog(false);
      }
    },
    [extraBatchCounter, loadingMoreCatalog, notify]
  );

  const handleSearchArchiveComics = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) {
      setExtraComics([]);
      return;
    }
    setExtraComicsLoading(true);
    try {
      const results = await searchInternetArchive({ query: trimmed, comicsOnly: true, limit: 60 });
      setExtraComics(deduplicateBooks(results));
    } catch {
      setExtraComics([]);
    } finally {
      setExtraComicsLoading(false);
    }
  }, []);

  const handleSearchArchiveManga = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) {
      setExtraManga([]);
      return;
    }
    setExtraMangaLoading(true);
    try {
      const [md, ia] = await Promise.allSettled([
        searchMangaDexSafe({ query: trimmed, limit: 40 }),
        searchInternetArchive({ query: trimmed, mangaOnly: true, limit: 40 }),
      ]);
      const combined = [
        ...(md.status === 'fulfilled' ? md.value : []),
        ...(ia.status === 'fulfilled' ? ia.value : []),
      ];
      setExtraManga(deduplicateBooks(combined));
    } catch {
      setExtraManga([]);
    } finally {
      setExtraMangaLoading(false);
    }
  }, []);

  const executeSearch = useCallback(async (term: string, filter: SourceFilter) => {
    const cleaned = term.trim();
    if (!cleaned) {
      setActiveSearchTerm('');
      setSearchResults(null);
      setIsSearching(false);
      return;
    }

    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    setActiveTab('discover');
    setActiveSearchTerm(cleaned);
    setIsSearching(true);

    try {
      const res = await searchAllSources(cleaned, filter, controller.signal);
      if (!controller.signal.aborted) {
        setSearchResults(res.books);
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setSearchResults([]);
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsSearching(false);
      }
    }
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSearch(searchInput, sourceFilter);
  };

  const handleClearSearch = () => {
    searchAbortRef.current?.abort();
    setSearchInput('');
    setActiveSearchTerm('');
    setSearchResults(null);
    setIsSearching(false);
  };

  const handleSourceFilterChange = (nextFilter: SourceFilter) => {
    setSourceFilter(nextFilter);
    if (activeSearchTerm) {
      executeSearch(activeSearchTerm, nextFilter);
    }
  };

  const handleQuickTopic = (topic: string, shelfId?: string) => {
    if (shelfId === 'manga') {
      setActiveTab('manga');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (shelfId === 'comics') {
      setActiveTab('comics');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (shelfId === 'poetry') {
      setCatalogInitialCategory('Poetry & Drama');
      setActiveTab('catalog');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setSearchInput(topic);
    executeSearch(topic, sourceFilter);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleJumpCategory = (cat: CatalogCategory) => {
    if (cat === 'Manga') {
      setActiveTab('manga');
    } else if (cat === 'Comics') {
      setActiveTab('comics');
    } else {
      setCatalogInitialCategory(cat);
      setActiveTab('catalog');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSurpriseMe = () => {
    const pool =
      visibleCatalogBooks.length > 0
        ? visibleCatalogBooks
        : visibleShelves.flatMap((s) => s.books);
    if (pool.length === 0) {
      notify('Catalog is still loading. Try again in a second.');
      return;
    }
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setSelectedBook(pick);
  };

  const savedMap = useMemo(
    () => new Map(savedEntries.map((entry) => [entry.book.id, entry])),
    [savedEntries]
  );

  const continueReadingEntries = useMemo(
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

  const readHistoryCount = useMemo(
    () =>
      savedEntries.filter(
        (e) => Boolean(e.progress) || Boolean(e.lastOpenedAt) || e.shelfStatus === 'finished'
      ).length,
    [savedEntries]
  );

  const shelfCount = useMemo(
    () =>
      savedEntries.filter(
        (e) => e.inShelf || Boolean(e.progress) || e.isCachedOffline || e.isFavorite
      ).length,
    [savedEntries]
  );

  const handleToggleShelf = async (book: Book) => {
    const existing = savedMap.get(book.id);
    const nextInShelf = !existing?.inShelf;
    await upsertSavedBook(book, {
      inShelf: nextInShelf,
      shelfStatus: nextInShelf ? existing?.shelfStatus || 'want' : undefined,
    });
    await refreshLibrary();
    notify(nextInShelf ? `Saved “${book.title}” to Library` : `Removed “${book.title}” from Library`);
  };

  const handleToggleFavorite = async (book: Book) => {
    const existing = savedMap.get(book.id);
    const nextFav = !existing?.isFavorite;
    await upsertSavedBook(book, { inShelf: true, isFavorite: nextFav });
    await refreshLibrary();
    notify(nextFav ? `Added “${book.title}” to Favorites` : `Removed from Favorites`);
  };

  const handleSetRating = async (book: Book, rating: number) => {
    await upsertSavedBook(book, { inShelf: true, rating });
    await refreshLibrary();
    notify(`Rated “${book.title}” ${rating}/5 stars`);
  };

  const handleSetShelfStatus = async (book: Book, status: ShelfStatus) => {
    await upsertSavedBook(book, {
      inShelf: true,
      shelfStatus: status,
      lastOpenedAt: status === 'finished' ? Date.now() : savedMap.get(book.id)?.lastOpenedAt,
      hiddenFromContinue: status === 'finished' ? true : savedMap.get(book.id)?.hiddenFromContinue,
    });
    await refreshLibrary();
    const label =
      status === 'want' ? 'Want to Read' : status === 'reading' ? 'Currently Reading' : 'Finished';
    notify(`Marked “${book.title}” as ${label}`);
  };

  const handleRemoveFromContinue = async (bookId: string) => {
    await hideFromContinueReading(bookId);
    await refreshLibrary();
    notify('Removed from Continue Reading (kept in Read History)');
  };

  const handleRemoveFromHistory = async (bookId: string) => {
    await removeFromReadHistory(bookId);
    await refreshLibrary();
    notify('Removed from Read History');
  };

  const handleCacheOffline = async (book: Book) => {
    try {
      notify(`Saving “${book.title}” offline…`);
      await fetchAndPrepareBook(book);
      await upsertSavedBook(book, { inShelf: true, isCachedOffline: true });
      await refreshLibrary();
      notify(`“${book.title}” is ready offline`);
    } catch (err: any) {
      notify(err?.message || 'Could not save this edition offline');
    }
  };

  const handleRemoveLocalBook = async (bookId: string) => {
    await removeSavedBook(bookId);
    await refreshLibrary();
    notify('Removed local file from Library');
  };

  const handleDeleteAnnotation = async (annotationId: string) => {
    await deleteAnnotation(annotationId);
    await refreshLibrary();
    notify('Note deleted');
  };

  const handleOpenReader = (book: Book, mode?: 'text' | 'comic', initialCharOffset?: number) => {
    setSelectedBook(null);
    clearPageAmbientGlow();
    upsertSavedBook(book, { lastOpenedAt: Date.now(), hiddenFromContinue: false })
      .then(() => refreshLibrary())
      .catch(() => {});
    const resolvedMode: 'text' | 'comic' = mode ?? (book.isComic || book.isManga ? 'comic' : 'text');
    setReadingTarget({ book, mode: resolvedMode, initialCharOffset });
  };

  const handleUploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).filter((f) => /\.(epub|txt|cbz)$/i.test(f.name));
      if (list.length === 0) {
        notify('Please choose an .epub, .txt, or .cbz file.');
        return;
      }

      let lastImported: Book | null = null;
      for (const file of list) {
        try {
          notify(`Importing “${file.name}”…`);
          if (file.name.toLowerCase().endsWith('.cbz')) {
            lastImported = await importLocalCbzFile(file);
          } else {
            const { book } = await importLocalBookFile(file);
            lastImported = book;
          }
        } catch (err: any) {
          notify(`Could not import ${file.name}: ${err?.message || 'Parse error'}`);
        }
      }

      await refreshLibrary();
      if (lastImported) {
        setLibrarySubTab('local');
        setActiveTab('library');
        notify(`Imported “${lastImported.title}”`);
        if (list.length === 1) {
          setSelectedBook(lastImported);
        }
      }
    },
    [notify, refreshLibrary]
  );

  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      dragDepthRef.current += 1;
      setIsDraggingFile(true);
    };

    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
    };

    const onDragLeave = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setIsDraggingFile(false);
    };

    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      dragDepthRef.current = 0;
      setIsDraggingFile(false);
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        handleUploadFiles(e.dataTransfer.files);
      }
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [handleUploadFiles]);

  return (
    <div className="app-shell">
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        catalogCount={visibleCatalogBooks.length}
        libraryCount={shelfCount}
        onUploadFiles={handleUploadFiles}
        onSurpriseMe={handleSurpriseMe}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="main-container">
        {activeTab === 'discover' && (
          <>
            <SearchBar
              query={searchInput}
              onQueryChange={setSearchInput}
              onSearch={handleSearchSubmit}
              onClear={handleClearSearch}
              sourceFilter={sourceFilter}
              onSourceFilterChange={handleSourceFilterChange}
              isSearching={isSearching}
              resultCount={
                activeSearchTerm && visibleSearchResults ? visibleSearchResults.length : undefined
              }
              catalogCount={visibleCatalogBooks.length}
              catalogLoading={catalogLoading}
            />

            <DiscoverBookshelf
              shelves={visibleShelves}
              activeSearchTerm={activeSearchTerm}
              searchResults={visibleSearchResults}
              isSearching={isSearching}
              sourceFilter={sourceFilter}
              savedMap={savedMap}
              continueReadingEntries={continueReadingEntries}
              readHistoryCount={readHistoryCount}
              catalogCount={visibleCatalogBooks.length}
              onSelectBook={setSelectedBook}
              onResumeBook={(book) => handleOpenReader(book)}
              onRemoveFromContinue={handleRemoveFromContinue}
              onOpenHistory={() => {
                setLibrarySubTab('history');
                setActiveTab('library');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onQuickTopic={handleQuickTopic}
              onJumpCategory={handleJumpCategory}
              onOpenCatalog={() => {
                setCatalogInitialCategory('All');
                setActiveTab('catalog');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </>
        )}

        {activeTab === 'catalog' && (
          <CatalogView
            books={visibleCatalogBooks}
            loading={catalogLoading}
            loadedWaves={catalogProgress.loadedWaves}
            totalWaves={catalogProgress.totalWaves}
            savedMap={savedMap}
            onSelectBook={setSelectedBook}
            sectionMode="all"
            initialCategory={catalogInitialCategory}
            onLoadMore={() => handleLoadMoreCatalog('all')}
            loadingMore={loadingMoreCatalog}
          />
        )}

        {activeTab === 'comics' && (
          <CatalogView
            books={visibleCatalogBooks}
            loading={catalogLoading}
            loadedWaves={catalogProgress.loadedWaves}
            totalWaves={catalogProgress.totalWaves}
            savedMap={savedMap}
            onSelectBook={setSelectedBook}
            sectionMode="comics"
            onSearchRemote={handleSearchArchiveComics}
            extraItems={extraComics.filter((b) => isCleanBook(b, filterCfg))}
            extraLoading={extraComicsLoading}
            onLoadMore={() => handleLoadMoreCatalog('comics')}
            loadingMore={loadingMoreCatalog}
          />
        )}

        {activeTab === 'manga' && (
          <CatalogView
            books={visibleCatalogBooks}
            loading={catalogLoading}
            loadedWaves={catalogProgress.loadedWaves}
            totalWaves={catalogProgress.totalWaves}
            savedMap={savedMap}
            onSelectBook={setSelectedBook}
            sectionMode="manga"
            onSearchRemote={handleSearchArchiveManga}
            extraItems={extraManga.filter((b) => isCleanBook(b, filterCfg))}
            extraLoading={extraMangaLoading}
            onLoadMore={() => handleLoadMoreCatalog('manga')}
            loadingMore={loadingMoreCatalog}
          />
        )}

        {activeTab === 'library' && (
          <MyLibraryView
            savedEntries={savedEntries}
            annotations={allAnnotations}
            yearlyGoal={settings.yearlyGoal || 12}
            initialSubTab={librarySubTab}
            onChangeYearlyGoal={(nextGoal) => updateSettings({ yearlyGoal: nextGoal })}
            onSelectBook={setSelectedBook}
            onResumeBook={(book) => handleOpenReader(book)}
            onRemoveFromContinue={handleRemoveFromContinue}
            onRemoveFromHistory={handleRemoveFromHistory}
            onSetShelfStatus={handleSetShelfStatus}
            onJumpToAnnotation={(book, offset) => handleOpenReader(book, 'text', offset)}
            onDeleteAnnotation={handleDeleteAnnotation}
            onUploadFiles={handleUploadFiles}
            onSwitchToDiscover={() => setActiveTab('catalog')}
          />
        )}
      </main>

      <footer className="site-footer">
        <div className="site-footer-inner">
          <span>
            Inkwell · 8 open libraries (Gutenberg · Open Library · Internet Archive · MangaDex · PoetryDB · Wikisource · Standard Ebooks · LibriVox)
          </span>
          <span>Drop .epub, .txt, or .cbz anywhere to import</span>
        </div>
      </footer>

      {settingsOpen && (
        <SettingsModal
          settings={settings}
          onUpdateSettings={updateSettings}
          onToggleNsfw={handleToggleNsfw}
          onRefreshCatalog={handleRefreshCatalog}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {selectedBook && (
        <BookDetailModal
          book={selectedBook}
          savedEntry={savedMap.get(selectedBook.id)}
          onClose={() => setSelectedBook(null)}
          onReadNow={(book, mode) => handleOpenReader(book, mode)}
          onToggleShelf={handleToggleShelf}
          onToggleFavorite={handleToggleFavorite}
          onSetRating={handleSetRating}
          onSetShelfStatus={handleSetShelfStatus}
          onCacheOffline={handleCacheOffline}
          onRemoveLocal={handleRemoveLocalBook}
        />
      )}

      {readingTarget && readingTarget.mode === 'text' && (
        <ReaderView
          book={readingTarget.book}
          initialCharOffset={readingTarget.initialCharOffset}
          settings={settings}
          onUpdateSettings={updateSettings}
          onClose={() => setReadingTarget(null)}
          onSwitchToComicMode={
            readingTarget.book.iaIdentifier
              ? () => setReadingTarget({ book: readingTarget.book, mode: 'comic' })
              : undefined
          }
          onLibraryChanged={refreshLibrary}
          onNotify={notify}
        />
      )}

      {readingTarget && readingTarget.mode === 'comic' && (
        <ComicReaderView
          book={readingTarget.book}
          onClose={() => setReadingTarget(null)}
          onSwitchToText={
            !readingTarget.book.isComic && !readingTarget.book.isManga
              ? () => setReadingTarget({ book: readingTarget.book, mode: 'text' })
              : undefined
          }
          onLibraryChanged={refreshLibrary}
        />
      )}

      <DropZoneOverlay visible={isDraggingFile} />

      {toastMsg && (
        <div className="ui-toast" role="status" aria-live="polite">
          {toastMsg}
        </div>
      )}
    </div>
  );
}

export default App;
