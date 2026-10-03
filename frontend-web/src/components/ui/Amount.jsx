import React from 'react';
import { amountParts } from '../../design/tenantTheme';

/**
 * Amount — canonical money display.
 * Tabular numerals, currency symbol at ~70% size/secondary weight, explicit
 * sign; inflow tinted (never color-only — always carries "+" / "−").
 */
export function Amount({ value, currency = '₦', className = '', direction }) {
  const { symbol, value: v, sign } = amountParts(value, currency);
  const dir = direction || (value > 0 ? 'inflow' : value < 0 ? 'outflow' : 'neutral');
  const dirClass = dir === 'inflow' ? 'amount-inflow' : dir === 'outflow' ? 'amount-outflow' : '';
  const shown = dir === 'outflow' && sign === '' ? '−' : sign;
  return (
    <span className={`amount tabular ${dirClass} ${className}`} data-amount aria-label={`${shown === '+' ? 'plus' : shown === '−' ? 'minus' : ''} ${v} ${currency}`}>
      <span className="currency-symbol" aria-hidden="true">{symbol}</span>
      {shown}{v}
    </span>
  );
}

export default Amount;
