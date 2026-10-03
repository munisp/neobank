import React from 'react';
import { Amount } from '../Amount.jsx';
import { NBStatusPill } from './NBStatusPill.jsx';

/**
 * NBTransactionRow — merchant + category icon, pending visually distinct
 * (translucent + pill), amount signed (+ inflow tinted, outflow neutral),
 * 44px+ row target, full-row press.
 */
export function NBTransactionRow({
  merchant,
  category,
  time,
  amount,
  currency = '₦',
  pending = false,
  icon,
  onClick,
  className = '',
}) {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={className}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%',
        padding: '12px 8px', minHeight: 56, textAlign: 'left',
        background: 'none', border: 'none', cursor: onClick ? 'pointer' : 'default',
        borderBottom: '1px solid var(--nb-border-subtle)',
        opacity: pending ? 0.75 : 1,
        borderRadius: 'var(--nb-radius-xs)',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: 40, height: 40, borderRadius: 'var(--nb-radius-full)', flexShrink: 0,
          background: 'var(--nb-surface-tertiary)', color: 'var(--nb-text-secondary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
        }}
      >
        {icon || (merchant?.[0] ?? '·')}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--nb-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {merchant}
        </div>
        <div style={{ fontSize: 13, color: 'var(--nb-text-secondary)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span>{category}{time ? ` · ${time}` : ''}</span>
          {pending && <NBStatusPill tone="pending">Pending</NBStatusPill>}
        </div>
      </div>
      <Amount value={amount} currency={currency} className="" />
    </Wrapper>
  );
}
export default NBTransactionRow;
