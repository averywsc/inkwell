import type { Book } from '../types/book';

export interface ContentFilterConfig {
  blockNsfw: boolean;
  blockedTags: string[];
}

export const DEFAULT_BLOCKED_TAGS: string[] = [
  'how to draw',
  'textbook',
  'solution manual',
  'anatomy for artists',
];

let activeConfig: ContentFilterConfig = {
  blockNsfw: true,
  blockedTags: [...DEFAULT_BLOCKED_TAGS],
};

export function setContentFilterConfig(config: ContentFilterConfig): void {
  activeConfig = {
    blockNsfw: config.blockNsfw,
    blockedTags: (config.blockedTags || [])
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
  };
}

export function getContentFilterConfig(): ContentFilterConfig {
  return activeConfig;
}

/**
 * NSFW / Porn / Hentai / Ecchi regex, active whenever `blockNsfw` is true (default).
 */
const NSFW_BLOCKED_REGEX =
  /\b(porn|pornography|pornographic|hentai|ecchi|erotica|erotic|nsfw|xxx|18\+|r-?18|adult\s+only|doujinshi|doujin|fetish|bdsm|bondage|smut|nudity|nude|naked|lewd|sexy|lust|orgasm|playboy|penthouse|hustler|futanari|futa|lolicon|loli|shotacon|shota|incest|milf|gangbang|ahegao|oppai|netorare|ntr|gravure|uncensored|brothel|courtesan|prostitute|stripper|lingerie|bikini|boobs|breasts|tits|vagina|penis|cock|pussy|kama\s*sutra|kamasutra|fanny\s*hill|marquis\s*de\s*sade|romance\s*of\s*lust|virgin\s*change|futari\s*ecchi|velvet\s*kiss|aki\s*sora|to\s*love\s*ru|domestic\s*na\s*kanojo|household\s*affairs|fuzoku|girls\s*saurus|waifu|furries|furry|harem|yaoi|yuri|smutty|sensual\s+tales|naughty|taboo\s+sex|sexual\s+violence|sex\s+guide|sex\s+manual|eroge|brazzers|onlyfans|camgirl|peep\s*show|topless|upskirt|panty|panties|tentacle)\b/i;

const NSFW_SUBSTRINGS = [
  'hentai',
  'porn',
  'erotica',
  'ecchi',
  'doujin',
  'nsfw',
  'fuzoku',
  'akisora',
  'velvet_kiss',
  'futari_ecchi',
  'to_love-ru',
  'domestic_na_kanojo',
  'household_affairs',
  'girls_saurus',
  'draw-girls-body',
  'sexy-girl',
  'sexyanime',
  'romance-of-lust',
  'fanny-hill',
];

/**
 * Low-quality spam / raw file-dump noise always filtered out.
 */
const SPAM_NOISE_REGEX =
  /\b(sonichu|kana\s*practice|frequency\s*dictionary|physics\s*principles|efiling|young_jump|bellybuttons)\b/i;

export function isCleanMetadata(
  parts: {
    id?: string;
    title?: string;
    authors?: string[];
    subjects?: string[];
    description?: string;
  },
  overrideConfig?: ContentFilterConfig
): boolean {
  const cfg = overrideConfig ?? activeConfig;
  const title = (parts.title || '').trim();
  if (!title || title.length < 2) return false;
  if (/^\d{4,}$/.test(title)) return false;

  const combined = [
    parts.id || '',
    title,
    ...(parts.authors || []),
    ...(parts.subjects || []),
    parts.description || '',
  ].join(' ');

  if (SPAM_NOISE_REGEX.test(combined)) return false;

  const lower = combined.toLowerCase();

  // Check NSFW filter when enabled
  if (cfg.blockNsfw) {
    if (NSFW_BLOCKED_REGEX.test(combined)) return false;
    for (const sub of NSFW_SUBSTRINGS) {
      if (lower.includes(sub)) return false;
    }
  }

  // Always enforce user's custom blocked tags & keywords
  for (const tag of cfg.blockedTags) {
    if (tag.length >= 2 && lower.includes(tag)) {
      return false;
    }
  }

  return true;
}

export function isCleanBook(book: Book, overrideConfig?: ContentFilterConfig): boolean {
  return isCleanMetadata(
    {
      id: book.id,
      title: book.title,
      authors: book.authors,
      subjects: book.subjects,
      description: book.description,
    },
    overrideConfig
  );
}
