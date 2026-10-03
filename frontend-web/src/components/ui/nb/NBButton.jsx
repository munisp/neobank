import React from 'react';

/**
 * NBButton — one primary action per screen; confirm buttons name the action.
 * States: default, hover, pressed, focused, disabled, loading.
 */
export function NBButton({
  variant = 'primary', // 'primary' | 'secondary' | 'ghost' | 'destructive'
  size = 'md',         // 'sm' | 'md' | 'lg'
  loading = false,
  disabled = false,
  icon: Icon,
  children,
  className = '',
  style = {},
  ...props
}) {
  const heights = { sm: 40, md: 48, lg: 56 };
  const pad = { sm: '0 16px', md: '0 24px', lg: '0 32px' };
  const variants = {
    primary: {
      background: 'var(--nb-button-primary-bg)', color: 'var(--nb-button-primary-text)',
      border: '1px solid transparent',
    },
    secondary: {
      background: 'var(--nb-surface-primary)', color: 'var(--nb-text-primary)',
      border: '1px solid var(--nb-border-subtle)',
    },
    ghost: {
      background: 'transparent', color: 'var(--nb-action-primary)',
      border: '1px solid transparent',
    },
    destructive: {
      background: 'var(--nb-feedback-error)', color: 'var(--nb-feedback-on-error)',
      border: '1px solid transparent',
    },
  };
  const isDisabled = disabled || loading;
  return (
    <button
      className={`nb-btn nb-btn--${variant} ${className}`}
      disabled={isDisabled}
      aria-disabled={isDisabled || undefined}
      aria-busy={loading || undefined}
      style={{
        height: heights[size], padding: pad[size],
        fontSize: size === 'sm' ? 14 : 16, fontWeight: 600,
        ...variants[variant], ...style,
      }}
      {...props}
    >
      {loading && <span className="nb-spinner" aria-hidden="true" />}
      {!loading && Icon && <Icon size={18} strokeWidth={2} aria-hidden="true" />}
      <span>{children}</span>
    </button>
  );
}
export default NBButton;
