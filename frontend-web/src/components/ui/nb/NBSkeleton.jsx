import React from 'react';

/** NBSkeleton — layout-matched loading placeholder, never a lone spinner. */
export function NBSkeleton({ width = '100%', height = 16, circle = false, className = '', style = {} }) {
  return (
    <div
      className={`skeleton ${className}`}
      aria-hidden="true"
      style={{
        width, height,
        borderRadius: circle ? 'var(--nb-radius-full)' : 'var(--nb-radius-xs)',
        ...style,
      }}
    />
  );
}

/** Common composed skeletons matching final layouts. */
export function NBSkeletonTransactionRow() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0' }} aria-hidden="true">
      <NBSkeleton width={40} height={40} circle />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <NBSkeleton width="45%" height={14} />
        <NBSkeleton width="30%" height={12} />
      </div>
      <NBSkeleton width={72} height={16} />
    </div>
  );
}

export function NBSkeletonCard() {
  return (
    <div className="nb-card" style={{ padding: 24 }} aria-hidden="true">
      <NBSkeleton width="35%" height={14} style={{ marginBottom: 12 }} />
      <NBSkeleton width="60%" height={28} style={{ marginBottom: 16 }} />
      <NBSkeleton width="100%" height={12} style={{ marginBottom: 8 }} />
      <NBSkeleton width="80%" height={12} />
    </div>
  );
}
export default NBSkeleton;
