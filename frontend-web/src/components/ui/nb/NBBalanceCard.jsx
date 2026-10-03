import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Amount } from '../Amount.jsx';

/**
 * NBBalanceCard — the dashboard hero. Tap-to-privacy blur, per-account color
 * coding, tabular amounts, "as of" timestamp for stale-safety.
 */
export function NBBalanceCard({
  label = 'Total balance',
  amount,
  currency = '₦',
  accountColor = 1,
  masked = false,
  updatedAt,
  onTogglePrivacy,
  className = '',
}) {
  const [hidden, setHidden] = useState(masked);
  const toggle = () => { setHidden(!hidden); onTogglePrivacy?.(!hidden); };
  return (
    <div
      className={`nb-card acct-color-0${accountColor} ${className}`}
      style={{ padding: 24, borderTop: '4px solid var(--acct)' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--nb-text-secondary)' }}>{label}</span>
        <button
          type="button" onClick={toggle}
          aria-label={hidden ? 'Show balance' : 'Hide balance'}
          aria-pressed={hidden}
          style={{ background: 'none', border: 'none', color: 'var(--nb-text-secondary)', cursor: 'pointer', minHeight: 44, minWidth: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {hidden ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      <div style={{ fontSize: 34, fontWeight: 700, lineHeight: '40px', filter: hidden ? 'blur(8px)' : 'none', transition: 'filter var(--nb-dur-standard) var(--nb-ease-emphasized)' }}>
        <Amount value={amount} currency={currency} direction="neutral" />
      </div>
      {updatedAt && (
        <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--nb-text-secondary)' }}>
          Updated {updatedAt}
        </p>
      )}
    </div>
  );
}
export default NBBalanceCard;
