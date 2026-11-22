import type {
  FontFamilyKey,
  FontSizeKey,
  LineSpacingKey,
  MarginWidthKey,
  PageBlock,
  ParsedBookContent,
  ReaderPage,
  ReaderSettings,
  SearchMatch,
  SerifChoice,
} from '../types/book';

export interface TypographyMetrics {
  fontSizePx: number;
  lineHeightMultiplier: number;
  lineHeightPx: number;
  paragraphGapPx: number;
  marginX: number;
  marginY: number;
  fontFamilyCss: string;
  canvasFont: string;
  headingCanvasFont: string;
}

const FONT_SIZE_MAP: Record<FontSizeKey, number> = {
  S: 16,
  M: 19,
  L: 22,
  XL: 26,
};

const LINE_SPACING_MAP: Record<LineSpacingKey, number> = {
  compact: 1.42,
  normal: 1.65,
  relaxed: 1.9,
};

const MARGIN_X_MAP: Record<MarginWidthKey, number> = {
  narrow: 24,
  medium: 48,
  wide: 82,
};

const SERIF_FONT_MAP: Record<SerifChoice, string> = {
  'source-serif': "'Source Serif 4', Georgia, serif",
  literata: "'Literata', Georgia, serif",
  lora: "'Lora', Georgia, serif",
};

export function resolveTypographyMetrics(
  settings: ReaderSettings,
  viewportWidth: number
): TypographyMetrics {
  const fontSizePx =
    typeof settings.fontSizePx === 'number'
      ? Math.max(14, Math.min(32, settings.fontSizePx))
      : FONT_SIZE_MAP[settings.fontSize];
  const lineHeightMultiplier = LINE_SPACING_MAP[settings.lineSpacing];
  const lineHeightPx = Math.ceil(fontSizePx * lineHeightMultiplier);
  const paragraphGapPx = Math.round(fontSizePx * 0.65);

  const rawMarginX = MARGIN_X_MAP[settings.marginWidth];
  const maxSafeMargin = Math.max(16, Math.floor(viewportWidth * 0.22));
  const marginX = Math.min(rawMarginX, maxSafeMargin);
  const marginY = viewportWidth < 600 ? 18 : 28;

  let fontFamilyCss = SERIF_FONT_MAP[settings.serifChoice] || SERIF_FONT_MAP['source-serif'];
  if (settings.fontFamily === 'sans') {
    fontFamilyCss = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
  } else if (settings.fontFamily === 'mono') {
    fontFamilyCss = "'IBM Plex Mono', ui-monospace, monospace";
  }

  return {
    fontSizePx,
    lineHeightMultiplier,
    lineHeightPx,
    paragraphGapPx,
    marginX,
    marginY,
    fontFamilyCss,
    canvasFont: `400 ${fontSizePx}px ${fontFamilyCss}`,
    headingCanvasFont: `700 ${Math.round(fontSizePx * 1.15)}px ${fontFamilyCss}`,
  };
}

let sharedCanvasCtx: CanvasRenderingContext2D | null = null;
function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (!sharedCanvasCtx && typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    sharedCanvasCtx = canvas.getContext('2d');
  }
  return sharedCanvasCtx;
}

/**
 * Wraps a paragraph into lines that fit cleanly within `maxWidthPx`,
 * returning the exact text slice for each line and character lengths.
 */
function wrapTextIntoLines(
  text: string,
  maxWidthPx: number,
  firstLineIndentPx: number,
  ctx: CanvasRenderingContext2D | null,
  fontSizePx: number
): string[] {
  if (!text) return [];
  // Apply a conservative width safety factor (0.94) to account for browser kerning/subpixel rounding
  const safeMaxWidth = Math.max(80, maxWidthPx * 0.94);

  const measure = (str: string): number => {
    if (ctx) return ctx.measureText(str).width;
    return str.length * fontSizePx * 0.56;
  };

  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  let isFirstLine = true;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const limit = isFirstLine ? Math.max(60, safeMaxWidth - firstLineIndentPx) : safeMaxWidth;

    if (!currentLine) {
      // Handle exceptionally long single token (e.g., URL)
      if (measure(word) > limit && word.length > 16) {
        let chunk = '';
        for (const ch of word) {
          if (measure(chunk + ch) > limit && chunk.length > 0) {
            lines.push(chunk);
            isFirstLine = false;
            chunk = ch;
          } else {
            chunk += ch;
          }
        }
        currentLine = chunk;
      } else {
        currentLine = word;
      }
      continue;
    }

    const candidate = `${currentLine} ${word}`;
    if (measure(candidate) <= limit) {
      currentLine = candidate;
    } else {
      lines.push(currentLine);
      isFirstLine = false;
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Dynamic Fixed-Height Viewport Pagination Engine.
 * Splits the entire book into crisp, fixed-height E-Ink pages calculated
 * from live container width/height, margins, font family, font size, and line spacing.
 */
export function paginateBook(
  content: ParsedBookContent,
  containerWidth: number,
  containerHeight: number,
  settings: ReaderSettings
): ReaderPage[] {
  const effectiveWidth = Math.max(240, Math.min(containerWidth, 860));
  const effectiveHeight = Math.max(200, containerHeight);
  const metrics = resolveTypographyMetrics(settings, effectiveWidth);

  const innerWidth = Math.max(180, effectiveWidth - metrics.marginX * 2);
  // Leave a small 14px vertical breathing buffer so no descender ever clips at the bottom edge
  const innerHeight = Math.max(120, effectiveHeight - metrics.marginY * 2 - 14);
  const firstLineIndentPx = Math.round(metrics.fontSizePx * 1.4);

  const ctx = getMeasureCtx();
  const pages: ReaderPage[] = [];

  let currentBlocks: PageBlock[] = [];
  let usedHeight = 0;

  const flushPage = (chapterIndex: number, chapterTitle: string) => {
    if (currentBlocks.length === 0) return;
    const startOffset = currentBlocks[0].startOffset;
    const endOffset = currentBlocks[currentBlocks.length - 1].endOffset;
    pages.push({
      pageNumber: pages.length + 1,
      blocks: currentBlocks,
      startOffset,
      endOffset,
      chapterIndex,
      chapterTitle,
    });
    currentBlocks = [];
    usedHeight = 0;
  };

  for (let chIdx = 0; chIdx < content.chapters.length; chIdx++) {
    const chapter = content.chapters[chIdx];

    // Start each new chapter cleanly on a new E-Ink page
    if (currentBlocks.length > 0) {
      const prevChapter = content.chapters[Math.max(0, chIdx - 1)];
      flushPage(Math.max(0, chIdx - 1), prevChapter.title);
    }

    let cursor = chapter.startOffset;

    // Measure & place chapter heading
    if (ctx) ctx.font = metrics.headingCanvasFont;
    const headingLines = wrapTextIntoLines(
      chapter.title,
      innerWidth,
      0,
      ctx,
      Math.round(metrics.fontSizePx * 1.15)
    );
    const headingLineHeight = Math.ceil(metrics.fontSizePx * 1.15 * 1.35);
    const headingHeight =
      Math.max(1, headingLines.length) * headingLineHeight + Math.round(metrics.fontSizePx * 1.75);

    const headingStart = cursor;
    const headingEnd = cursor + chapter.title.length;
    cursor = headingEnd + 2; // + '\n\n'

    currentBlocks.push({
      type: 'chapter-heading',
      text: chapter.title,
      startOffset: headingStart,
      endOffset: headingEnd,
      chapterIndex: chIdx,
    });
    usedHeight += headingHeight;

    // Switch canvas font to body text
    if (ctx) ctx.font = metrics.canvasFont;

    for (let pIdx = 0; pIdx < chapter.paragraphs.length; pIdx++) {
      const paraText = chapter.paragraphs[pIdx];
      const paraStartOffset = cursor;
      cursor += paraText.length + 2; // + '\n\n'

      const isFirstParaAfterHeading = pIdx === 0;
      const lines = wrapTextIntoLines(
        paraText,
        innerWidth,
        isFirstParaAfterHeading ? 0 : firstLineIndentPx,
        ctx,
        metrics.fontSizePx
      );

      let lineIdx = 0;
      let consumedChars = 0;
      let isContinuation = false;

      while (lineIdx < lines.length) {
        const remainingHeight = innerHeight - usedHeight;
        const maxLinesThatFit = Math.floor(remainingHeight / metrics.lineHeightPx);

        if (maxLinesThatFit <= 0) {
          flushPage(chIdx, chapter.title);
          continue;
        }

        // Prevent lonely 1-line orphan at very bottom if we have room to push to next page cleanly
        const remainingLines = lines.length - lineIdx;
        if (maxLinesThatFit === 1 && remainingLines > 1 && currentBlocks.length > 0 && usedHeight > innerHeight * 0.6) {
          flushPage(chIdx, chapter.title);
          continue;
        }

        const takeCount = Math.min(remainingLines, maxLinesThatFit);
        const sliceLines = lines.slice(lineIdx, lineIdx + takeCount);
        const sliceText = sliceLines.join(' ');

        const blockStart = paraStartOffset + consumedChars;
        const blockEnd = Math.min(paraStartOffset + paraText.length, blockStart + sliceText.length);

        currentBlocks.push({
          type: 'paragraph',
          text: sliceText,
          startOffset: blockStart,
          endOffset: blockEnd,
          isContinuation: isContinuation || isFirstParaAfterHeading,
          chapterIndex: chIdx,
        });

        usedHeight += takeCount * metrics.lineHeightPx;
        lineIdx += takeCount;
        consumedChars += sliceText.length + 1;
        isContinuation = true;

        // Add paragraph spacing only when paragraph finishes
        if (lineIdx >= lines.length) {
          usedHeight += metrics.paragraphGapPx;
        } else {
          flushPage(chIdx, chapter.title);
        }
      }
    }

    flushPage(chIdx, chapter.title);
  }

  if (pages.length === 0) {
    pages.push({
      pageNumber: 1,
      blocks: [
        {
          type: 'paragraph',
          text: 'No readable text was found in this edition.',
          startOffset: 0,
          endOffset: 44,
          isContinuation: true,
          chapterIndex: 0,
        },
      ],
      startOffset: 0,
      endOffset: 44,
      chapterIndex: 0,
      chapterTitle: 'Notice',
    });
  }

  return pages;
}

/**
 * Finds the 1-based page number containing a given character offset.
 */
export function findPageForOffset(pages: ReaderPage[], charOffset: number): number {
  if (pages.length === 0) return 1;
  if (charOffset <= 0) return 1;

  let lo = 0;
  let hi = pages.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const p = pages[mid];
    if (charOffset < p.startOffset) {
      hi = mid - 1;
    } else if (charOffset > p.endOffset) {
      lo = mid + 1;
    } else {
      return p.pageNumber;
    }
  }
  return Math.min(pages.length, Math.max(1, lo + 1));
}

/**
 * In-book text search returning matched page numbers, chapter context, and surrounding snippets.
 */
export function searchInBook(
  content: ParsedBookContent,
  pages: ReaderPage[],
  query: string,
  maxResults = 60
): SearchMatch[] {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const haystack = content.fullText.toLowerCase();
  const needle = trimmed.toLowerCase();
  const results: SearchMatch[] = [];

  let pos = 0;
  while (results.length < maxResults) {
    const idx = haystack.indexOf(needle, pos);
    if (idx === -1) break;

    const endIdx = idx + trimmed.length;
    const pageNumber = findPageForOffset(pages, idx);
    const page = pages[pageNumber - 1];

    const snippetStart = Math.max(0, idx - 42);
    const snippetEnd = Math.min(content.fullText.length, endIdx + 54);

    const snippetBefore = content.fullText.slice(snippetStart, idx).replace(/\s+/g, ' ');
    const matchText = content.fullText.slice(idx, endIdx);
    const snippetAfter = content.fullText.slice(endIdx, snippetEnd).replace(/\s+/g, ' ');

    results.push({
      charOffset: idx,
      endOffset: endIdx,
      pageNumber,
      chapterTitle: page?.chapterTitle || 'Text',
      snippetBefore: (snippetStart > 0 ? '…' : '') + snippetBefore,
      matchText,
      snippetAfter: snippetAfter + (snippetEnd < content.fullText.length ? '…' : ''),
    });

    pos = endIdx;
  }

  return results;
}
