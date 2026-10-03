import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, Clock } from 'lucide-react';

const MAP = {
  success: { Icon: CheckCircle2, cls: 'status-pill--success' },
  warning: { Icon: AlertTriangle, cls: 'status-pill--warning' },
  error:   { Icon: XCircle,       cls: 'status-pill--error' },
  info:    { Icon: Info,          cls: 'status-pill--info' },
  pending: { Icon: Clock,         cls: 'status-pill--pending' },
};

/** NBStatusPill — status is never color-only: always icon + label. */
export function NBStatusPill({ tone = 'info', children, className = '' }) {
  const { Icon, cls } = MAP[tone] || MAP.info;
  return (
    <span className={`status-pill ${cls} ${className}`}>
      <Icon size={14} strokeWidth={2.5} aria-hidden="true" />
      <span>{children}</span>
    </span>
  );
}
export default NBStatusPill;
