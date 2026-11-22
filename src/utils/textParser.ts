import type { Chapter, ParsedBookContent } from '../types/book';

const CHAPTER_PATTERNS: RegExp[] = [
  /^(?:CHAPTER|Chapter|CHAP\.?)\s+(?:[IVXLCDM]+|\d+|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|ELEVEN|TWELVE|THIRTEEN|FOURTEEN|FIFTEEN|SIXTEEN|SEVENTEEN|EIGHTEEN|NINETEEN|TWENTY|[A-Z][a-z]+)\b.{0,80}$/,
  /^(?:BOOK|PART|SECTION|VOLUME|ACT|CANTO|LETTER|STAVE|MEDITATION|ESSAY|LECTURE)\s+(?:[IVXLCDM]+|\d+|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|[A-Z][a-z]+)\b.{0,70}$/i,
  /^(?:PROLOGUE|EPILOGUE|INTRODUCTION|PREFACE|FOREWORD|AFTERWORD|PRELUDE|POSTSCRIPT|CONTENTS|APPENDIX(?:\s+[A-Z\d]+)?)\b.{0,50}$/i,
  /^(?:[IVXLCDM]{1,7})\.?(?:\s+[—–-]\s+.{1,60})?$/,
  /^(?:[IVXLCDM]{1,7})\.\s+[A-Z][A-Za-z0-9\s,'’"-]{2,65}$/,
];

/**
 * Removes Project Gutenberg license headers and footers cleanly.
 */
export function stripGutenbergBoilerplate(raw: string): string {
  let text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const startMarkers = [
    /\*\*\*\s*START OF TH(?:IS|E) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i,
    /\*\*\*START OF THE PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i,
    /\*END\*THE SMALL PRINT[^\n]*\n/i,
  ];

  for (const re of startMarkers) {
    const m = re.exec(text);
    if (m) {
      text = text.slice(m.index + m[0].length);
      break;
    }
  }

  const endMarkers = [
    /\*\*\*\s*END OF TH(?:IS|E) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i,
    /\*\*\*END OF THE PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i,
    /End of (?:the )?Project Gutenberg(?:'s)? EBook/i,
  ];

  for (const re of endMarkers) {
    const m = re.exec(text);
    if (m && m.index > text.length * 0.25) {
      text = text.slice(0, m.index);
      break;
    }
  }

  return text.trim();
}

/**
 * Converts HTML book content into clean paragraph-delimited plain text,
 * preserving chapter headings on standalone blocks.
 */
export function htmlToCleanText(html: string): { text: string; detectedChapters?: { title: string; paragraphs: string[] }[] } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Remove non-reading elements
  doc.querySelectorAll('script, style, nav, head, noscript, iframe, svg, .pgheader, .pgfooter, #pg-header, #pg-footer').forEach((el) => el.remove());

  const body = doc.body || doc.documentElement;
  const blocks: string[] = [];

  const blockTags = new Set(['H1', 'H2', 'H3', 'H4', 'P', 'BLOCKQUOTE', 'DIV', 'LI', 'PRE']);

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const val = (node.textContent || '').replace(/\s+/g, ' ').trim();
      if (val && node.parentElement && !blockTags.has(node.parentElement.tagName)) {
        blocks.push(val);
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName;

    if (tag === 'H1' || tag === 'H2' || tag === 'H3' || tag === 'H4') {
      const heading = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (heading.length > 0 && heading.length < 140) {
        blocks.push(`@@HEADING@@${heading}`);
      }
      return;
    }

    if (tag === 'P' || tag === 'BLOCKQUOTE' || tag === 'LI') {
      const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (txt.length > 0) {
        blocks.push(txt);
      }
      return;
    }

    // For container divs/sections, walk children if they contain block elements, else treat as paragraph
    const hasBlockChild = Array.from(el.children).some((child) =>
      ['P', 'DIV', 'SECTION', 'ARTICLE', 'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'UL', 'OL'].includes(child.tagName)
    );
    if (!hasBlockChild && tag === 'DIV') {
      const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (txt.length > 0) {
        blocks.push(txt);
      }
      return;
    }

    for (const child of Array.from(el.childNodes)) {
      walk(child);
    }
  };

  walk(body);

  // Check if we got clean HTML headings
  const headingCount = blocks.filter((b) => b.startsWith('@@HEADING@@')).length;
  if (headingCount >= 2) {
    const chapters: { title: string; paragraphs: string[] }[] = [];
    let currentTitle = 'Opening';
    let currentParas: string[] = [];

    for (const block of blocks) {
      if (block.startsWith('@@HEADING@@')) {
        const title = block.slice('@@HEADING@@'.length).trim();
        if (currentParas.length > 0) {
          chapters.push({ title: currentTitle, paragraphs: currentParas });
          currentParas = [];
        }
        currentTitle = title;
      } else {
        currentParas.push(block);
      }
    }
    if (currentParas.length > 0) {
      chapters.push({ title: currentTitle, paragraphs: currentParas });
    }

    // Filter out tiny license/table-of-contents noise if large real chapters exist
    const nonEmpty = chapters.filter((c) => c.paragraphs.length > 0);
    if (nonEmpty.length >= 2) {
      return {
        text: nonEmpty.map((c) => `${c.title}\n\n${c.paragraphs.join('\n\n')}`).join('\n\n'),
        detectedChapters: nonEmpty,
      };
    }
  }

  const plain = blocks
    .map((b) => (b.startsWith('@@HEADING@@') ? b.slice('@@HEADING@@'.length) : b))
    .join('\n\n');

  return { text: stripGutenbergBoilerplate(plain) };
}

function isLikelyChapterHeading(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 95) return false;
  // Ignore lines ending with typical sentence punctuation unless it's a numbered title
  if (/[;,?!]$/.test(trimmed)) return false;

  for (const pattern of CHAPTER_PATTERNS) {
    if (pattern.test(trimmed)) {
      // Guard against standalone "I" pronoun mistaken for Roman numeral I
      if (trimmed === 'I') return false;
      return true;
    }
  }
  return false;
}

/**
 * Normalizes raw plain text into clean paragraphs (unwrapping hard 72-char line breaks)
 * and parses chapter headings into a structured Table of Contents with exact character offsets.
 */
export function parsePlainTextToBook(
  bookId: string,
  rawText: string,
  fallbackTitle: string,
  sourceFormat: ParsedBookContent['sourceFormat'] = 'text'
): ParsedBookContent {
  const cleaned = stripGutenbergBoilerplate(rawText);

  // Split by blank lines (two or more newlines) into raw paragraph blocks
  const rawBlocks = cleaned
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);

  const normalizedBlocks: { isHeading: boolean; text: string }[] = [];

  for (const block of rawBlocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    // Check if the first line is a chapter heading (possibly followed by subtitle or body)
    if (lines.length <= 2 && isLikelyChapterHeading(lines[0])) {
      const headingText = lines.join(': ').replace(/\s+/g, ' ').trim();
      normalizedBlocks.push({ isHeading: true, text: headingText });
      continue;
    }

    // Unwrap hard line breaks inside prose paragraphs
    const joined = lines.join(' ').replace(/\s+/g, ' ').trim();
    if (joined.length > 0) {
      normalizedBlocks.push({ isHeading: false, text: joined });
    }
  }

  // Group blocks into chapters
  const rawChapters: { title: string; paragraphs: string[] }[] = [];
  let currentTitle = fallbackTitle || 'Chapter I';
  let currentParagraphs: string[] = [];

  for (const block of normalizedBlocks) {
    if (block.isHeading) {
      // Avoid creating duplicate empty chapters for consecutive heading lines (e.g., "BOOK I" then "CHAPTER 1")
      if (currentParagraphs.length === 0 && rawChapters.length === 0 && currentTitle === fallbackTitle) {
        currentTitle = block.text;
      } else if (currentParagraphs.length === 0) {
        currentTitle = `${currentTitle}: ${block.text}`.slice(0, 90);
      } else {
        rawChapters.push({ title: currentTitle, paragraphs: currentParagraphs });
        currentTitle = block.text;
        currentParagraphs = [];
      }
    } else {
      currentParagraphs.push(block.text);
    }
  }

  if (currentParagraphs.length > 0) {
    rawChapters.push({ title: currentTitle, paragraphs: currentParagraphs });
  }

  // If no headings were found and book is long, create clean logical sections
  if (rawChapters.length === 0) {
    rawChapters.push({
      title: fallbackTitle || 'Text',
      paragraphs: [cleaned.slice(0, 500000) || 'Empty document.'],
    });
  } else if (rawChapters.length === 1 && rawChapters[0].paragraphs.length > 90) {
    const allParas = rawChapters[0].paragraphs;
    const chunkSize = 60;
    const splitChapters: { title: string; paragraphs: string[] }[] = [];
    for (let i = 0; i < allParas.length; i += chunkSize) {
      const sectionNum = Math.floor(i / chunkSize) + 1;
      splitChapters.push({
        title: sectionNum === 1 ? rawChapters[0].title : `Section ${sectionNum}`,
        paragraphs: allParas.slice(i, i + chunkSize),
      });
    }
    return buildParsedBookContent(bookId, splitChapters, sourceFormat);
  }

  return buildParsedBookContent(bookId, rawChapters, sourceFormat);
}

/**
 * Builds canonical ParsedBookContent with exact character offsets so pagination,
 * search, bookmarks, and highlights remain 100% synchronized.
 */
export function buildParsedBookContent(
  bookId: string,
  chapterInputs: { title: string; paragraphs: string[] }[],
  sourceFormat: ParsedBookContent['sourceFormat']
): ParsedBookContent {
  const chapters: Chapter[] = [];
  const fullParts: string[] = [];
  let cursor = 0;
  let wordCount = 0;

  for (let i = 0; i < chapterInputs.length; i++) {
    const ch = chapterInputs[i];
    const cleanTitle = (ch.title || `Chapter ${i + 1}`).replace(/\s+/g, ' ').trim();
    const cleanParas = ch.paragraphs
      .map((p) => p.replace(/\s+/g, ' ').trim())
      .filter((p) => p.length > 0);

    if (cleanParas.length === 0) continue;

    const startOffset = cursor;

    // Account for chapter title in canonical text
    const headingChunk = `${cleanTitle}\n\n`;
    fullParts.push(headingChunk);
    cursor += headingChunk.length;

    for (const para of cleanParas) {
      const paraChunk = `${para}\n\n`;
      fullParts.push(paraChunk);
      cursor += paraChunk.length;
      wordCount += para.split(/\s+/).length;
    }

    chapters.push({
      id: `ch-${i + 1}`,
      title: cleanTitle,
      startOffset,
      paragraphs: cleanParas,
    });
  }

  return {
    bookId,
    fullText: fullParts.join(''),
    chapters,
    wordCount,
    fetchedAt: Date.now(),
    sourceFormat,
  };
}
