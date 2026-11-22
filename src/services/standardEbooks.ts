import type { Book } from '../types/book';
import { fetchTextWithFallback } from './proxy';

/**
 * Standard Ebooks curated public domain catalog & OPDS feed integration.
 * Attempts live Standard Ebooks OPDS feed fetch (via proxy) and merges with a
 * verified curated index of flagship Standard Ebooks editions with direct Gutenberg
 * plain-text fallback URLs so every edition opens smoothly inside the E-Ink reader.
 */

const CURATED_STANDARD_EBOOKS: Book[] = [
  {
    id: 'standardebooks-frankenstein',
    title: 'Frankenstein',
    authors: ['Mary Shelley'],
    source: 'standardebooks',
    sources: ['standardebooks'],
    coverUrl: 'https://www.gutenberg.org/cache/epub/84/pg84.cover.medium.jpg',
    subjects: ['Science Fiction', 'Gothic Fiction', '19th Century Fiction', 'Horror'],
    description:
      'Mary Shelley’s landmark Gothic and science fiction novel following Victor Frankenstein and the sentient creature he brings to life in an unorthodox scientific experiment.',
    publishYear: 1818,
    language: 'EN',
    gutenbergId: 84,
    formats: {
      textUrl: 'https://www.gutenberg.org/cache/epub/84/pg84.txt',
      htmlUrl: 'https://www.gutenberg.org/files/84/84-h/84-h.htm',
      externalUrl: 'https://standardebooks.org/ebooks/mary-shelley/frankenstein',
    },
    isReadableInApp: true,
  },
  {
    id: 'standardebooks-time-machine',
    title: 'The Time Machine',
    authors: ['H. G. Wells'],
    source: 'standardebooks',
    sources: ['standardebooks'],
    coverUrl: 'https://www.gutenberg.org/cache/epub/35/pg35.cover.medium.jpg',
    subjects: ['Science Fiction', 'Sci-Fi Classics', 'Time Travel', 'Dystopia'],
    description:
      'An unnamed Victorian scientist journeys eight hundred thousand years into the future, discovering humanity divided into the gentle Eloi and the subterranean Morlocks.',
    publishYear: 1895,
    language: 'EN',
    gutenbergId: 35,
    formats: {
      textUrl: 'https://www.gutenberg.org/cache/epub/35/pg35.txt',
      htmlUrl: 'https://www.gutenberg.org/files/35/35-h/35-h.htm',
      externalUrl: 'https://standardebooks.org/ebooks/h-g-wells/the-time-machine',
    },
    isReadableInApp: true,
  },
  {
    id: 'standardebooks-meditations',
    title: 'Meditations',
    authors: ['Marcus Aurelius'],
    source: 'standardebooks',
    sources: ['standardebooks'],
    coverUrl: 'https://www.gutenberg.org/cache/epub/2680/pg2680.cover.medium.jpg',
    subjects: ['Philosophy', 'Stoicism', 'Ethics', 'Ancient Rome'],
    description:
      'Private reflections on duty, restraint, mortality, and Stoic virtue written by Roman Emperor Marcus Aurelius during military campaigns.',
    publishYear: 180,
    language: 'EN',
    gutenbergId: 2680,
    formats: {
      textUrl: 'https://www.gutenberg.org/cache/epub/2680/pg2680.txt',
      externalUrl: 'https://standardebooks.org/ebooks/marcus-aurelius/meditations/george-long',
    },
    isReadableInApp: true,
  },
  {
    id: 'standardebooks-hound-of-the-baskervilles',
    title: 'The Hound of the Baskervilles',
    authors: ['Arthur Conan Doyle'],
    source: 'standardebooks',
    sources: ['standardebooks'],
    coverUrl: 'https://www.gutenberg.org/cache/epub/2852/pg2852.cover.medium.jpg',
    subjects: ['Mystery', 'Detective Fiction', 'Noir', 'Sherlock Holmes'],
    description:
      'Sherlock Holmes and Dr. Watson investigate an ancient family curse and a spectral hound haunting the foggy moors of Devonshire.',
    publishYear: 1902,
    language: 'EN',
    gutenbergId: 2852,
    formats: {
      textUrl: 'https://www.gutenberg.org/cache/epub/2852/pg2852.txt',
      externalUrl: 'https://standardebooks.org/ebooks/arthur-conan-doyle/the-hound-of-the-baskervilles',
    },
    isReadableInApp: true,
  },
  {
    id: 'standardebooks-pride-and-prejudice',
    title: 'Pride and Prejudice',
    authors: ['Jane Austen'],
    source: 'standardebooks',
    sources: ['standardebooks'],
    coverUrl: 'https://www.gutenberg.org/cache/epub/1342/pg1342.cover.medium.jpg',
    subjects: ['19th Century Fiction', 'Romance', 'Social Satire', 'Classic Literature'],
    description:
      'Elizabeth Bennet navigates family folly, class pride, and first impressions in Jane Austen’s razor-sharp Regency comedy of manners.',
    publishYear: 1813,
    language: 'EN',
    gutenbergId: 1342,
    formats: {
      textUrl: 'https://www.gutenberg.org/cache/epub/1342/pg1342.txt',
      externalUrl: 'https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice',
    },
    isReadableInApp: true,
  },
  {
    id: 'standardebooks-republic',
    title: 'The Republic',
    authors: ['Plato'],
    source: 'standardebooks',
    sources: ['standardebooks'],
    coverUrl: 'https://www.gutenberg.org/cache/epub/1497/pg1497.cover.medium.jpg',
    subjects: ['Philosophy', 'Political Philosophy', 'Ancient Greece', 'Justice'],
    description:
      'Plato’s Socratic dialogue exploring the nature of justice, the ideal city-state, the Allegory of the Cave, and the philosopher-king.',
    publishYear: -375,
    language: 'EN',
    gutenbergId: 1497,
    formats: {
      textUrl: 'https://www.gutenberg.org/cache/epub/1497/pg1497.txt',
      externalUrl: 'https://standardebooks.org/ebooks/plato/the-republic/benjamin-jowett',
    },
    isReadableInApp: true,
  },
  {
    id: 'standardebooks-war-of-the-worlds',
    title: 'The War of the Worlds',
    authors: ['H. G. Wells'],
    source: 'standardebooks',
    sources: ['standardebooks'],
    coverUrl: 'https://www.gutenberg.org/cache/epub/36/pg36.cover.medium.jpg',
    subjects: ['Science Fiction', 'Sci-Fi Classics', 'Alien Invasion'],
    description:
      'Martian cylinders descend upon southern England, unleashing towering fighting-machines in one of the earliest tales of alien conflict.',
    publishYear: 1898,
    language: 'EN',
    gutenbergId: 36,
    formats: {
      textUrl: 'https://www.gutenberg.org/cache/epub/36/pg36.txt',
      externalUrl: 'https://standardebooks.org/ebooks/h-g-wells/the-war-of-the-worlds',
    },
    isReadableInApp: true,
  },
  {
    id: 'standardebooks-moonstone',
    title: 'The Moonstone',
    authors: ['Wilkie Collins'],
    source: 'standardebooks',
    sources: ['standardebooks'],
    coverUrl: 'https://www.gutenberg.org/cache/epub/155/pg155.cover.medium.jpg',
    subjects: ['Mystery', 'Detective Fiction', '19th Century Fiction', 'Suspense'],
    description:
      'Widely regarded as the first modern English detective novel, tracing the theft of a priceless cursed Indian diamond through multiple narrators.',
    publishYear: 1868,
    language: 'EN',
    gutenbergId: 155,
    formats: {
      textUrl: 'https://www.gutenberg.org/cache/epub/155/pg155.txt',
      externalUrl: 'https://standardebooks.org/ebooks/wilkie-collins/the-moonstone',
    },
    isReadableInApp: true,
  },
];

function parseStandardEbooksOpds(xmlText: string): Book[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  const entries = Array.from(doc.querySelectorAll('entry'));
  const books: Book[] = [];

  for (const entry of entries) {
    const title = entry.querySelector('title')?.textContent?.trim();
    if (!title) continue;
    const idRaw = entry.querySelector('id')?.textContent?.trim() || title;
    const authorName = entry.querySelector('author > name')?.textContent?.trim() || 'Unknown Author';
    const summary = entry.querySelector('summary')?.textContent?.trim();
    const categories = Array.from(entry.querySelectorAll('category'))
      .map((c) => c.getAttribute('label') || c.getAttribute('term') || '')
      .filter(Boolean)
      .slice(0, 6);

    const links = Array.from(entry.querySelectorAll('link'));
    const coverLink = links.find((l) => l.getAttribute('rel')?.includes('image'))?.getAttribute('href') || undefined;
    const epubLink = links.find((l) => l.getAttribute('type')?.includes('epub+zip'))?.getAttribute('href') || undefined;
    const altLink = links.find((l) => l.getAttribute('rel') === 'alternate')?.getAttribute('href') || idRaw;

    const absUrl = (href?: string) => {
      if (!href) return undefined;
      if (href.startsWith('http')) return href;
      return `https://standardebooks.org${href.startsWith('/') ? '' : '/'}${href}`;
    };

    const slug = idRaw.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(-40);
    books.push({
      id: `standardebooks-${slug}`,
      title,
      authors: [authorName],
      source: 'standardebooks',
      sources: ['standardebooks'],
      coverUrl: absUrl(coverLink),
      subjects: categories,
      description: summary,
      language: 'EN',
      formats: {
        epubUrl: absUrl(epubLink),
        externalUrl: absUrl(altLink),
      },
      isReadableInApp: Boolean(epubLink),
    });
  }

  return books;
}

export async function searchStandardEbooks(params: {
  query?: string;
  topic?: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<Book[]> {
  const term = (params.query || params.topic || '').trim().toLowerCase();
  const limit = params.limit ?? 8;

  // Match against curated Standard Ebooks first (fast & always reliable)
  const curatedMatches = term
    ? CURATED_STANDARD_EBOOKS.filter((b) => {
        const hay = `${b.title} ${b.authors.join(' ')} ${b.subjects.join(' ')} ${b.description || ''}`.toLowerCase();
        return term.split(/\s+/).some((tok) => tok.length > 2 && hay.includes(tok));
      })
    : CURATED_STANDARD_EBOOKS;

  // Try live OPDS feed opportunistically where CORS/proxy permits
  try {
    if (params.query) {
      const opdsUrl = `https://standardebooks.org/feeds/opds/all?query=${encodeURIComponent(params.query)}`;
      const xml = await fetchTextWithFallback(opdsUrl, {
        preferDirect: false,
        timeoutMs: 6500,
        signal: params.signal,
      });
      if (xml.includes('<feed') && xml.includes('<entry')) {
        const live = parseStandardEbooksOpds(xml);
        if (live.length > 0) {
          return [...curatedMatches, ...live].slice(0, limit);
        }
      }
    }
  } catch {
    // Gracefully fall back to curated index if Standard Ebooks blocks automated requests
  }

  return curatedMatches.slice(0, limit);
}
