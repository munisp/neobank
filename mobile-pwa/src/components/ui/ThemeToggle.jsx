import React, { useEffect, useState } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { getColorMode, applyColorMode } from '../../design/tenantTheme';

const ORDER = ['light', 'dark', 'system'];
const LABELS = { light: 'Light', dark: 'Dark', system: 'Auto' };
const ICONS = { light: Sun, dark: Moon, system: Monitor };

/**
 * ThemeToggle — cycles Light → Dark → Auto(system).
 * 44px touch target, icon + text label (never icon-only).
 */
export function ThemeToggle({ className = '' }) {
  const [mode, setMode] = useState('system');
  useEffect(() => setMode(getColorMode()), []);

  const next = () => {
    const m = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
    setMode(m);
    applyColorMode(m);
  };

  const Icon = ICONS[mode];
  return (
    <button
      type="button"
      onClick={next}
      className={`nb-btn nb-btn--secondary ${className}`}
      style={{ height: 44, padding: '0 16px' }}
      aria-label={`Color theme: ${LABELS[mode]}. Activate to switch.`}
    >
      <Icon size={18} strokeWidth={2} aria-hidden="true" />
      <span>{LABELS[mode]}</span>
    </button>
  );
}

export default ThemeToggle;
