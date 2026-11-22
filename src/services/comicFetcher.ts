import JSZip from 'jszip';
import type { Book, ComicBookData, ComicVolume } from '../types/book';
import { fetchJsonWithFallback, fetchTextWithFallback } from './proxy';
import { fetchMangaDexVolumes, hydrateMangaDexChapterPages } from './mangadex';
import { getLocalComicBlob, saveLocalComicBlob, upsertSavedBook } from './storage';

interface IAMetadataFile {
  name: string;
  format?: string;
  size?: string;
}

interface IAMetadata {
  server?: string;
  d1?: string;
  d2?: string;
  dir?: string;
  files?: IAMetadataFile[];
  metadata?: {
    title?: string;
    imagecount?: string | number;
  };
}

function naturalSort(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function pad4(n: number): string {
  return String(n).padStart(4, '0');
}

export function getComicPageUrl(
  comic: ComicBookData,
  volumeIndex: number,
  pageIndex: number,
  thumbnail = false
): string {
  const vol = comic.volumes[volumeIndex];
  if (!vol) return '';

  if (vol.directUrls && vol.directUrls.length > 0) {
    if (thumbnail && vol.thumbUrls && vol.thumbUrls[pageIndex]) {
      return vol.thumbUrls[pageIndex];
    }
    return vol.directUrls[pageIndex] || '';
  }

  if (vol.server && vol.dir && vol.zipName && vol.volPrefix && comic.identifier) {
    const leaf = vol.leafNums ? vol.leafNums[pageIndex] ?? pageIndex : pageIndex;
    const scale = thumbnail ? 8 : 2;
    const innerFile = `${vol.volPrefix}_jp2/${vol.volPrefix}_${pad4(leaf)}.jp2`;
    return `https://${vol.server}/BookReader/BookReaderImages.php?zip=${encodeURIComponent(
      `${vol.dir}/${vol.zipName}`
    )}&file=${encodeURIComponent(innerFile)}&id=${encodeURIComponent(
      comic.identifier
    )}&scale=${scale}&rotate=0`;
  }

  if (comic.identifier) {
    const w = thumbnail ? 240 : 1200;
    return `https://archive.org/download/${encodeURIComponent(comic.identifier)}/page/n${pageIndex}_w${w}.jpg`;
  }

  return '';
}

export async function hydrateComicVolumePages(
  comic: ComicBookData,
  volumeIndex: number
): Promise<ComicVolume> {
  const vol = comic.volumes[volumeIndex];
  if (!vol) return vol;

  // Hydrate MangaDex hosted chapter pages
  if (vol.mangadexChapterId) {
    return hydrateMangaDexChapterPages(vol);
  }

  if (!comic.identifier) return vol;
  if (vol.leafNums && vol.leafNums.length > 0) return vol;
  if (vol.directUrls && vol.directUrls.length > 0) return vol;

  const id = comic.identifier;
  const prefix = vol.volPrefix || '';

  if (prefix) {
    try {
      const pnUrl = `https://archive.org/download/${encodeURIComponent(id)}/${encodeURIComponent(
        `${prefix}_page_numbers.json`
      )}`;
      const pn = await fetchJsonWithFallback<{ pages?: { leafNum: number }[] }>(pnUrl, {
        preferDirect: false,
        timeoutMs: 9000,
      });
      if (pn.pages && pn.pages.length > 0) {
        const leafNums = pn.pages.map((p) => p.leafNum);
        if (leafNums[0] === 1) {
          leafNums.unshift(0);
        }
        return { ...vol, leafNums, pageCount: leafNums.length };
      }
    } catch {
      // fall through
    }

    try {
      const scUrl = `https://archive.org/download/${encodeURIComponent(id)}/${encodeURIComponent(
        `${prefix}_scandata.xml`
      )}`;
      const xml = await fetchTextWithFallback(scUrl, { preferDirect: false, timeoutMs: 9000 });
      const matches = Array.from(xml.matchAll(/<page\s+[^>]*leafNum="(\d+)"/gi));
      if (matches.length > 0) {
        const leafNums = matches.map((m) => Number(m[1]));
        return { ...vol, leafNums, pageCount: leafNums.length };
      }
    } catch {
      // fall through
    }
  }

  const fallbackCount = Math.max(1, vol.pageCount || 36);
  const leafNums = Array.from({ length: fallbackCount }, (_, i) => i);
  return { ...vol, leafNums, pageCount: fallbackCount };
}

export async function fetchComicBookData(
  book: Book,
  signal?: AbortSignal
): Promise<ComicBookData> {
  // 1. Local .cbz comic stored in IndexedDB
  if (book.isLocal && book.fileType === 'cbz') {
    const blob = await getLocalComicBlob(book.id);
    if (!blob) {
      throw new Error('Local comic archive could not be found in browser storage.');
    }
    const zip = await JSZip.loadAsync(blob);
    const imageNames = Object.keys(zip.files)
      .filter((name) => !zip.files[name].dir && /\.(jpe?g|png|webp|gif)$/i.test(name) && !name.startsWith('__MACOSX'))
      .sort(naturalSort);

    if (imageNames.length === 0) {
      throw new Error('No comic page images found inside this .cbz file.');
    }

    const directUrls: string[] = [];
    for (const name of imageNames) {
      const imgBlob = await zip.files[name].async('blob');
      directUrls.push(URL.createObjectURL(imgBlob));
    }

    return {
      bookId: book.id,
      isLocalCbz: true,
      volumes: [
        {
          id: 'local-vol-1',
          title: book.title,
          pageCount: directUrls.length,
          directUrls,
        },
      ],
    };
  }

  // 2. MangaDex Safe hosted manga chapters
  if (book.mangadexId) {
    const volumes = await fetchMangaDexVolumes(book.mangadexId, signal);
    if (volumes.length === 0) {
      throw new Error(
        'This MangaDex title links out to an external official publisher. Use "Open on Source" to read it there.'
      );
    }
    const comicData: ComicBookData = {
      bookId: book.id,
      mangadexId: book.mangadexId,
      volumes,
    };
    comicData.volumes[0] = await hydrateComicVolumePages(comicData, 0);
    return comicData;
  }

  // 3. Internet Archive comic / manga / illustrated book
  const id = book.iaIdentifier;
  if (!id) {
    throw new Error('This edition does not have an image page manifest.');
  }

  const meta = await fetchJsonWithFallback<IAMetadata>(
    `https://archive.org/metadata/${encodeURIComponent(id)}`,
    { preferDirect: true, timeoutMs: 14000, signal }
  );

  const server = meta.server || meta.d1 || meta.d2;
  const dir = meta.dir;
  const files = meta.files || [];

  const jp2Zips = files
    .filter((f) => f.name.endsWith('_jp2.zip'))
    .sort((a, b) => naturalSort(a.name, b.name));

  if (jp2Zips.length > 0 && server && dir) {
    const volumes: ComicVolume[] = jp2Zips.map((f, idx) => {
      const prefix = f.name.replace(/_jp2\.zip$/i, '');
      const cleanLabel = prefix.replace(/_/g, ' ').trim() || `Volume ${idx + 1}`;
      return {
        id: `vol-${idx}`,
        title: cleanLabel,
        pageCount: Number(meta.metadata?.imagecount) || 40,
        server,
        dir,
        zipName: f.name,
        volPrefix: prefix,
      };
    });

    const comicData: ComicBookData = {
      bookId: book.id,
      identifier: id,
      volumes,
    };

    comicData.volumes[0] = await hydrateComicVolumePages(comicData, 0);
    return comicData;
  }

  const standaloneImages = files
    .filter(
      (f) =>
        /\.(jpe?g|png|webp)$/i.test(f.name) &&
        !f.name.includes('__ia_thumb') &&
        !f.name.includes('_thumb')
    )
    .sort((a, b) => naturalSort(a.name, b.name));

  if (standaloneImages.length >= 3) {
    const base = `https://archive.org/download/${encodeURIComponent(id)}`;
    const directUrls = standaloneImages.map((f) => `${base}/${encodeURIComponent(f.name)}`);
    return {
      bookId: book.id,
      identifier: id,
      volumes: [
        {
          id: 'images-vol',
          title: book.title,
          pageCount: directUrls.length,
          directUrls,
        },
      ],
    };
  }

  const count = Math.max(12, Number(meta.metadata?.imagecount) || 48);
  return {
    bookId: book.id,
    identifier: id,
    volumes: [
      {
        id: 'default-vol',
        title: book.title,
        pageCount: count,
        leafNums: Array.from({ length: count }, (_, i) => i),
      },
    ],
  };
}

export async function importLocalCbzFile(file: File): Promise<Book> {
  const zip = await JSZip.loadAsync(file);
  const imageNames = Object.keys(zip.files)
    .filter((name) => !zip.files[name].dir && /\.(jpe?g|png|webp|gif)$/i.test(name) && !name.startsWith('__MACOSX'))
    .sort(naturalSort);

  if (imageNames.length === 0) {
    throw new Error('This .cbz archive does not contain readable comic page images.');
  }

  const firstBlob = await zip.files[imageNames[0]].async('blob');
  const coverDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(firstBlob);
  });

  const baseName = file.name.replace(/\.cbz$/i, '').replace(/[_-]+/g, ' ').trim();
  const bookId = `local-cbz-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const book: Book = {
    id: bookId,
    title: baseName || 'Untitled Comic',
    authors: ['Local Comic'],
    source: 'local',
    sources: ['local'],
    coverUrl: coverDataUrl,
    subjects: ['Comic Book', 'Graphic Novel', 'Local CBZ'],
    description: `Imported locally from ${file.name} (${imageNames.length} full-color pages).`,
    language: 'EN',
    formats: {},
    isReadableInApp: true,
    isComic: true,
    category: 'Comics',
    isLocal: true,
    fileType: 'cbz',
  };

  await saveLocalComicBlob(bookId, file);
  await upsertSavedBook(book, { inShelf: true, isCachedOffline: true });
  return book;
}
