import React from 'react';
import { Inbox, WifiOff, AlertTriangle } from 'lucide-react';
import { NBButton } from './NBButton.jsx';

/**
 * NBEmptyState — education + the action that populates (empty-first-use).
 * NBErrorState — error formula: what happened, why, what to do, human path.
 * NBOfflineState — cached data + clear banner.
 */
function StateShell({ icon: Icon, tone = 'var(--nb-text-secondary)', title, body, children }) {
  return (
    <div role="status" style={{ textAlign: 'center', padding: '48px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div aria-hidden="true" style={{ width: 56, height: 56, borderRadius: 'var(--nb-radius-full)', background: 'var(--nb-surface-tertiary)', color: tone, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={26} strokeWidth={1.75} />
      </div>
      <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: 'var(--nb-text-primary)' }}>{title}</h3>
      {body && <p style={{ margin: 0, fontSize: 14, lineHeight: '20px', color: 'var(--nb-text-secondary)', maxWidth: 320 }}>{body}</p>}
      {children && <div style={{ marginTop: 8 }}>{children}</div>}
    </div>
  );
}

export function NBEmptyState({ title = 'Nothing here yet', body, actionLabel, onAction, icon = Inbox }) {
  return (
    <StateShell icon={icon} title={title} body={body}>
      {actionLabel && <NBButton variant="primary" size="sm" onClick={onAction}>{actionLabel}</NBButton>}
    </StateShell>
  );
}

export function NBErrorState({ title = 'Something went wrong', body = 'We couldn’t load this. Your money is safe — try again, or contact support if it keeps happening.', onRetry, supportLabel = 'Contact support', onSupport }) {
  return (
    <StateShell icon={AlertTriangle} tone="var(--nb-feedback-error)" title={title} body={body}>
      <div style={{ display: 'flex', gap: 12 }}>
        {onRetry && <NBButton variant="primary" size="sm" onClick={onRetry}>Try again</NBButton>}
        {onSupport && <NBButton variant="ghost" size="sm" onClick={onSupport}>{supportLabel}</NBButton>}
      </div>
    </StateShell>
  );
}

export function NBOfflineBanner({ updatedAt }) {
  return (
    <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: 'var(--nb-feedback-warning-surface)', color: 'var(--nb-feedback-warning)', fontSize: 14, fontWeight: 600 }}>
      <WifiOff size={16} aria-hidden="true" />
      <span>You’re offline — showing saved data{updatedAt ? ` from ${updatedAt}` : ''}. Actions will sync when you’re back.</span>
    </div>
  );
}
export default NBEmptyState;
