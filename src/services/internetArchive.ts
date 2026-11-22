import type { Book } from '../types/book';
import { fetchJsonWithFallback } from './proxy';
import { getContentFilterConfig, isCleanMetadata } from '../utils/contentFilter';

interface ArchiveDoc {
  identifier: string;
  title?: string | string[];
  creator?: string | string[];
  year?: string | number;
  subject?: string | string[];
  collection?: string | string[];
  description?: string | string[];
  downloads?: number;
  language?: string | string[];
}

interface ArchiveSearchResponse {
  response?: {
    numFound: number;
    docs: ArchiveDoc[];
  };
}

interface ArchiveMetadataFile {
  name: string;
  format?: string;
  size?: string;
}

interface ArchiveMetadataResponse {
  files?: ArchiveMetadataFile[];
  metadata?: {
    title?: string;
    description?: string | string[];
  };
}

function toStringArray(val?: string | string[]): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.map((v) => String(v).trim()).filter(Boolean);
  return [String(val).trim()].filter(Boolean);
}

function stripHtmlTags(raw: string): string {
  return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Strict content & quality sanitizer so NSFW, spam, textbooks, drawing guides,
 * and random raw filename dumps never pollute the front page or catalog.
 */
const BLOCKED_CONTENT_REGEX =
  /\b(erotica|erotic|porn|pornography|hentai|ecchi|nsfw|doujinshi|doujin|fetish|sexy|nude|nudity|lust|virgin change|futari|velvet kiss|aki sora|to love ru|domestic na kanojo|household affairs|fuzoku|saurus|sonichu|how to draw|anatomy for artists|drawing people|kana practice|frequency dictionary|physics principles|solution manual|textbook|workbook|re-take|bellybuttons|efiling|young_jump|scanlation|raws|lewd|boobs|harem|adult only|18\+|xxx|playboy|penthouse|hustler|waifu|furries|furry)\b/i;

const SPAM_IDENTIFIER_REGEX = /^(db_\d+|09_\d+|jp-|\d{8}_\d{8})/i;

export function isCleanArchiveDoc(doc: ArchiveDoc): boolean {
  const title = toStringArray(doc.title)[0] || '';
  if (!title || title.length < 2) return false;
  if (/^\d{4,}$/.test(title.trim())) return false;
  if (/^manga\s*\(\d{4}\)/i.test(title.trim())) return false;
  if (/^NOVEL:/i.test(title.trim()) && /mushoku|bookworm/i.test(title)) return false;
  if (SPAM_IDENTIFIER_REGEX.test(doc.identifier) && title.length <= 4) return false;

  return isCleanMetadata({
    id: doc.identifier,
    title,
    authors: toStringArray(doc.creator),
    subjects: [...toStringArray(doc.subject), ...toStringArray(doc.collection)],
    description: toStringArray(doc.description).join(' '),
  });
}

function cleanDisplayTitle(raw: string): string {
  return raw
    .replace(/^(?:MANGA|COMIC|NOVEL)\s*:\s*/i, '')
    .replace(/^\[(?:JP|EN|ENG|US)\]\s*/i, '')
    .replace(/\s*\((?:PDF Format|Digital|danke-Empire|IN PROGRESS|DEUTSCH|GERMAN|PT-BR|GrumpyBear[^)]*|Zone-Empire)\)/gi, '')
    .replace(/\s*\[[^\]]*(?:ドラゴンボール|超画集|愛蔵版|鳥山明)[^\]]*\]/g, '')
    .replace(/\s+With Correct Shading in PDF Format\.?/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const MANGA_REGEX =
  /\b(manga|berserk|akira|alita|evangelion|barefoot gen|yotsubato|one piece|naruto|dragon ball|fullmetal|death note|vagabond|vinland saga|slam dunk|uzumaki|nausicaa|ghost in the shell|astro boy|cowboy bebop|jojo|steel ball run|chainsaw man|bleach|one punch man|doraemon|sailor moon|lone wolf and cub|trigun|demon slayer|jujutsu|hunter x hunter)\b/i;

const COMIC_REGEX =
  /\b(comic|comics|graphic novel|superhero|compendium|batman|superman|spider-man|spiderman|invincible|daredevil|asterix|tintin|garfield|captain america|x-men|avengers|watchmen|hellboy|sandman|peanuts|calvin|wonder woman|flash|archie|marvel|dc comics)\b/i;

function normalizeArchiveDoc(
  doc: ArchiveDoc,
  options?: { forceComic?: boolean; forceManga?: boolean; category?: string }
): Book {
  const rawTitle = toStringArray(doc.title)[0] || doc.identifier;
  const title = cleanDisplayTitle(rawTitle) || rawTitle;
  const authors = toStringArray(doc.creator).slice(0, 3);
  const subjects = toStringArray(doc.subject).slice(0, 8);
  const descRaw = toStringArray(doc.description)[0];
  const lang = toStringArray(doc.language)[0];

  const hay = `${toStringArray(doc.collection).join(' ')} ${subjects.join(' ')} ${rawTitle}`;
  const isManga = Boolean(options?.forceManga || MANGA_REGEX.test(hay));
  const isComic = Boolean(options?.forceComic || isManga || COMIC_REGEX.test(hay));

  const resolvedCategory = isManga
    ? 'Manga'
    : isComic
    ? 'Comics'
    : options?.category;

  return {
    id: `archive-${doc.identifier}`,
    title,
    authors:
      authors.length > 0
        ? authors
        : [isManga ? 'Manga Edition' : isComic ? 'Comic Edition' : 'Internet Archive'],
    source: 'archive',
    sources: ['archive'],
    coverUrl: `https://archive.org/services/img/${encodeURIComponent(doc.identifier)}`,
    subjects:
      subjects.length > 0
        ? subjects
        : isManga
        ? ['Manga', 'Graphic Novel']
        : isComic
        ? ['Comics', 'Graphic Novel']
        : [],
    description: descRaw ? stripHtmlTags(descRaw).slice(0, 700) : undefined,
    publishYear: doc.year,
    language: lang ? lang.toUpperCase().slice(0, 3) : 'EN',
    downloadCount: doc.downloads,
    iaIdentifier: doc.identifier,
    formats: {
      externalUrl: `https://archive.org/details/${encodeURIComponent(doc.identifier)}`,
    },
    isReadableInApp: true,
    isComic,
    isManga,
    category: resolvedCategory,
  };
}

/**
 * Curated clean iconic comics query for recognizable graphic novels
 * and classic superhero/strip comics with zero spam or weird uploads.
 */
const CURATED_COMICS_CLAUSE =
  '(collection:comics OR collection:goldenagecomics OR collection:silver_age_comics) AND title:(Batman OR Superman OR Spider-Man OR Invincible OR Tintin OR Asterix OR Watchmen OR Daredevil OR X-Men OR Avengers OR Garfield OR Calvin OR Peanuts OR Hellboy OR Sandman OR "Captain America" OR "Wonder Woman" OR Flash OR Archie OR Fantastic)';

/**
 * Curated clean iconic manga query for classic and modern manga series.
 */
const CURATED_MANGA_CLAUSE =
  '(subject:manga OR collection:comics OR title:manga) AND title:(Berserk OR Akira OR Alita OR Evangelion OR "Barefoot Gen" OR Yotsubato OR "One Piece" OR Naruto OR "Dragon Ball" OR Fullmetal OR "Death Note" OR Vagabond OR "Vinland Saga" OR "Slam Dunk" OR Uzumaki OR Nausicaa OR "Ghost in the Shell" OR "Astro Boy" OR "Cowboy Bebop" OR JoJo OR Chainsaw OR Bleach OR "One Punch" OR Doraemon OR "Sailor Moon" OR "Lone Wolf" OR Trigun OR "Demon Slayer" OR Jujutsu)';

export async function searchInternetArchive(params: {
  query?: string;
  subject?: string;
  collection?: string;
  comicsOnly?: boolean;
  mangaOnly?: boolean;
  category?: string;
  limit?: number;
  page?: number;
  signal?: AbortSignal;
}): Promise<Book[]> {
  const limit = params.limit ?? 20;
  const page = params.page ?? 1;
  const { blockNsfw } = getContentFilterConfig();
  const parts: string[] = [
    'mediatype:texts',
    'NOT access-restricted-item:true',
  ];
  if (blockNsfw) {
    parts.push(
      'NOT subject:(erotica OR pornography OR porn OR hentai OR adult OR nsfw OR ecchi OR doujinshi OR nudity OR fetish OR bondage)'
    );
  }

  if (params.mangaOnly) {
    if (params.query) {
      const safeQ = params.query.replace(/["()]/g, ' ').trim();
      parts.push('(subject:manga OR title:manga OR collection:comics)');
      parts.push(`(title:(${safeQ}) OR creator:(${safeQ}) OR subject:(${safeQ}))`);
    } else {
      parts.push(CURATED_MANGA_CLAUSE);
    }
  } else if (params.comicsOnly) {
    if (params.query) {
      const safeQ = params.query.replace(/["()]/g, ' ').trim();
      parts.push('(collection:comics OR subject:"comic books" OR subject:comics)');
      parts.push(`(title:(${safeQ}) OR creator:(${safeQ}) OR subject:(${safeQ}))`);
    } else {
      parts.push(CURATED_COMICS_CLAUSE);
    }
  } else {
    parts.push('(language:eng OR language:English)');
    if (params.collection) {
      parts.push(`collection:${params.collection}`);
    }
    if (params.query) {
      const safeQ = params.query.replace(/["()]/g, ' ').trim();
      parts.push(`(title:(${safeQ}) OR creator:(${safeQ}) OR subject:(${safeQ}))`);
    } else if (params.subject) {
      const safeSub = params.subject.replace(/["()]/g, ' ').trim();
      parts.push(`subject:(${safeSub})`);
    }
  }

  const url = new URL('https://archive.org/advancedsearch.php');
  url.searchParams.set('q', parts.join(' AND '));
  url.searchParams.append('fl[]', 'identifier');
  url.searchParams.append('fl[]', 'title');
  url.searchParams.append('fl[]', 'creator');
  url.searchParams.append('fl[]', 'year');
  url.searchParams.append('fl[]', 'subject');
  url.searchParams.append('fl[]', 'collection');
  url.searchParams.append('fl[]', 'description');
  url.searchParams.append('fl[]', 'downloads');
  url.searchParams.append('fl[]', 'language');
  url.searchParams.append('sort[]', 'downloads desc');
  url.searchParams.set('rows', String(limit));
  url.searchParams.set('page', String(page));
  url.searchParams.set('output', 'json');

  const data = await fetchJsonWithFallback<ArchiveSearchResponse>(url.toString(), {
    preferDirect: true,
    timeoutMs: 14000,
    signal: params.signal,
  });

  return (data.response?.docs || [])
    .filter((d) => Boolean(d.identifier && d.title) && isCleanArchiveDoc(d))
    .map((d) =>
      normalizeArchiveDoc(d, {
        forceComic: params.comicsOnly,
        forceManga: params.mangaOnly,
        category: params.category,
      })
    );
}

/**
 * Resolves direct readable text/HTML/EPUB download URLs for an Internet Archive identifier.
 */
export async function resolveArchiveReadableUrls(
  identifier: string,
  signal?: AbortSignal
): Promise<{ textUrl?: string; htmlUrl?: string; epubUrl?: string; hasPageImages?: boolean }> {
  const meta = await fetchJsonWithFallback<ArchiveMetadataResponse>(
    `https://archive.org/metadata/${encodeURIComponent(identifier)}`,
    { preferDirect: true, timeoutMs: 12000, signal }
  );

  const files = meta.files || [];
  const base = `https://archive.org/download/${encodeURIComponent(identifier)}`;

  const plainTxt = files.find(
    (f) =>
      (f.name.endsWith('.txt') && !f.name.endsWith('_djvu.txt') && !f.name.includes('_meta')) ||
      f.format === 'Text'
  );
  const djvuTxt = files.find((f) => f.name.endsWith('_djvu.txt') || f.format === 'DjVuTXT');
  const epub = files.find((f) => f.name.endsWith('.epub') || f.format === 'EPUB');
  const html = files.find((f) => f.name.endsWith('.htm') || f.name.endsWith('.html'));
  const hasPageImages = files.some((f) => f.name.endsWith('_jp2.zip') || f.name.toLowerCase().endsWith('.cbz'));

  const textFile = plainTxt || djvuTxt;
  return {
    textUrl: textFile ? `${base}/${encodeURIComponent(textFile.name)}` : undefined,
    epubUrl: epub ? `${base}/${encodeURIComponent(epub.name)}` : undefined,
    htmlUrl: html ? `${base}/${encodeURIComponent(html.name)}` : undefined,
    hasPageImages,
  };
}
