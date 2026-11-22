import React from 'react';
import { FileUp } from 'lucide-react';

interface DropZoneOverlayProps {
  visible: boolean;
}

export const DropZoneOverlay: React.FC<DropZoneOverlayProps> = ({ visible }) => {
  if (!visible) return null;

  return (
    <div className="dropzone-overlay" aria-live="assertive">
      <div className="dropzone-frame">
        <FileUp size={40} strokeWidth={1.6} style={{ marginBottom: 14, color: 'var(--accent-warm)' }} />
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 26,
            fontWeight: 600,
            margin: '0 0 8px',
          }}
        >
          Drop to add to Inkwell
        </h2>
        <p style={{ fontSize: 14, color: 'var(--ink-secondary)', margin: 0, lineHeight: 1.55 }}>
          Supports <strong>.epub</strong> books, <strong>.txt</strong> manuscripts, and full-color{' '}
          <strong>.cbz</strong> comic archives.
        </p>
      </div>
    </div>
  );
};
