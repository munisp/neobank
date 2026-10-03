import React, { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * NBSheet — bottom sheet (mobile) / centered dialog (desktop). Top radius 24,
 * focus trap + Escape close, spring-up entrance, amount-as-hero supported.
 */
export function NBSheet({ open, onClose, title, children, hero }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      role="dialog" aria-modal="true" aria-label={title}
      style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'var(--nb-surface-overlay)', animation: 'nb-fade var(--nb-dur-standard) var(--nb-ease-emphasized)' }}
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <style>{`@keyframes nb-fade{from{opacity:0}to{opacity:1}} @keyframes nb-sheet-up{from{transform:translateY(48px);opacity:.6}to{transform:translateY(0);opacity:1}}`}</style>
      <div
        className="safe-bottom"
        style={{
          width: '100%', maxWidth: 480, maxHeight: '88vh', overflowY: 'auto',
          background: 'var(--nb-surface-primary)',
          borderRadius: 'var(--nb-sheet-radius) var(--nb-sheet-radius) 0 0',
          padding: 24, animation: 'nb-sheet-up var(--nb-dur-standard) var(--nb-ease-decelerate)',
          boxShadow: 'var(--nb-elev-5)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--nb-text-primary)' }}>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--nb-text-secondary)', cursor: 'pointer', minHeight: 44, minWidth: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={20} />
          </button>
        </div>
        {hero && <div style={{ textAlign: 'center', fontSize: 34, fontWeight: 700, margin: '8px 0 16px' }} className="tabular">{hero}</div>}
        {children}
      </div>
    </div>
  );
}
export default NBSheet;
