import React, { useId } from 'react';
import { AlertCircle } from 'lucide-react';

/**
 * NBInput — label always visible, validation as you type, error formula:
 * what happened + what to do. Never placeholder-as-label.
 */
export function NBInput({
  label, error, helper, required = false, id, className = '', ...props
}) {
  const autoId = useId();
  const inputId = id || autoId;
  const errId = `${inputId}-error`;
  const helpId = `${inputId}-helper`;
  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label htmlFor={inputId} style={{ fontSize: 14, fontWeight: 600, color: 'var(--nb-text-primary)' }}>
        {label}{required && <span aria-hidden="true" style={{ color: 'var(--nb-feedback-error)' }}> *</span>}
      </label>
      <input
        id={inputId}
        className="nb-input"
        required={required}
        aria-invalid={!!error || undefined}
        aria-describedby={error ? errId : helper ? helpId : undefined}
        style={error ? { borderColor: 'var(--nb-feedback-error)' } : undefined}
        {...props}
      />
      {error && (
        <p id={errId} role="alert" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'var(--nb-feedback-error)', margin: 0 }}>
          <AlertCircle size={16} aria-hidden="true" /> {error}
        </p>
      )}
      {!error && helper && (
        <p id={helpId} style={{ fontSize: 14, color: 'var(--nb-text-secondary)', margin: 0 }}>{helper}</p>
      )}
    </div>
  );
}
export default NBInput;
