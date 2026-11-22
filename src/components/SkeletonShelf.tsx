import React from 'react';

interface SkeletonShelfProps {
  label?: string;
  count?: number;
}

export const SkeletonShelf: React.FC<SkeletonShelfProps> = ({
  label = 'Loading titles…',
  count = 6,
}) => {
  return (
    <div>
      <div className="loading-pill" role="status" aria-live="polite">
        <span className="loading-spinner-dot" aria-hidden="true" />
        <span>{label}</span>
      </div>
      <div className="shelf-grid">
        {Array.from({ length: count }).map((_, idx) => (
          <div key={idx} className="skeleton-card" aria-hidden="true">
            <div className="skeleton-cover" />
            <div className="skeleton-line" />
            <div className="skeleton-line short" />
          </div>
        ))}
      </div>
    </div>
  );
};
