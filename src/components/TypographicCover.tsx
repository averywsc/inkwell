import React from 'react';
import type { BookSource } from '../types/book';
import { SOURCE_LABELS } from '../services/aggregator';

interface TypographicCoverProps {
  title: string;
  author: string;
  source?: BookSource;
  compact?: boolean;
}

const CLOTHBOUND_PALETTES = [
  'linear-gradient(155deg, #32465A 0%, #1F2D3B 100%)', // Midnight slate
  'linear-gradient(155deg, #6E342A 0%, #4A2018 100%)', // Oxblood cloth
  'linear-gradient(155deg, #2F4B3C 0%, #1D3126 100%)', // Library forest
  'linear-gradient(155deg, #4B3D54 0%, #2F2436 100%)', // Plum linen
  'linear-gradient(155deg, #685035 0%, #42311F 100%)', // Warm umber
  'linear-gradient(155deg, #2E4C52 0%, #1B3136 100%)', // Deep teal
  'linear-gradient(155deg, #3C3834 0%, #24211E 100%)', // Charcoal buckram
];

function hashTitle(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export const TypographicCover: React.FC<TypographicCoverProps> = ({
  title,
  author,
  source,
  compact = false,
}) => {
  const bg = CLOTHBOUND_PALETTES[hashTitle(title) % CLOTHBOUND_PALETTES.length];

  return (
    <div
      className={`typo-cover${compact ? ' compact' : ''}`}
      style={{ background: bg }}
      aria-label={`Cover for ${title}`}
    >
      <div className="typo-cover-inner">
        <div className="typo-ornament" aria-hidden="true">
          ✦
        </div>
        <div>
          <div className="typo-title">{title}</div>
          {!compact && <div className="typo-rule" />}
          {!compact && <div className="typo-author">{author}</div>}
        </div>
        <div className="typo-imprint">
          {source ? SOURCE_LABELS[source] : 'Classic Edition'}
        </div>
      </div>
    </div>
  );
};
