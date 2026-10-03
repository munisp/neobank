import React, { useState } from 'react';
import { ShieldCheck, Smartphone, KeyRound, Bell, EyeOff, LogOut, Fingerprint, Download, Trash2 } from 'lucide-react';
import { NBCard, NBButton, NBStatusPill, NBSheet } from '../components/ui/nb/index.js';
import { ThemeToggle } from '../components/ui/ThemeToggle.jsx';

/**
 * Security Center (Section 7.8): devices & sessions with per-device revoke,
 * biometrics with fallback, 2FA methods (passkey/TOTP preferred, SMS last),
 * alert granularity, privacy controls, data export & deletion with dignity.
 * Destructive actions always confirm with named-action buttons.
 */

const DEVICES = [
  { id: 1, name: 'This phone — Tecno Spark 20', last: 'Active now', current: true },
  { id: 2, name: 'Chrome on Windows', last: 'Yesterday, 21:14', current: false },
  { id: 3, name: 'iPad Air', last: '12 Sep 2026', current: false },
];

const ALERT_OPTS = [
  ['every', 'Every transaction'],
  ['large', 'Only over ₦10,000'],
  ['off', 'Only security alerts'],
];

export default function SecurityCenter() {
  const [devices, setDevices] = useState(DEVICES);
  const [biometrics, setBiometrics] = useState(true);
  const [twofa, setTwofa] = useState('totp');
  const [alerts, setAlerts] = useState('every');
  const [maskBalances, setMaskBalances] = useState(false);
  const [revoking, setRevoking] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const Row = ({ icon: Icon, title, sub, right }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 12px', borderTop: '1px solid var(--nb-border-subtle)', minHeight: 56 }}>
      <Icon size={20} color="var(--nb-text-secondary)" aria-hidden="true" />
      <div style={{ flex: 1 }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--nb-text-primary)' }}>{title}</p>
        {sub && <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--nb-text-secondary)' }}>{sub}</p>}
      </div>
      {right}
    </div>
  );

  const Switch = ({ checked, onChange, label }) => (
    <button role="switch" aria-checked={checked} aria-label={label} onClick={onChange}
      style={{ width: 48, height: 28, borderRadius: 999, border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0,
        background: checked ? 'var(--nb-action-primary)' : 'var(--nb-border-strong)' }}>
      <span style={{ position: 'absolute', top: 3, left: checked ? 23 : 3, width: 22, height: 22, borderRadius: '50%', background: '#fff', transition: 'left var(--nb-dur-micro) var(--nb-ease-emphasized)' }} />
    </button>
  );

  return (
    <div className="safe-bottom" style={{ maxWidth: 560, margin: '0 auto', padding: '16px 16px 96px' }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, margin: '8px 0 4px', color: 'var(--nb-text-primary)' }}>Security center</h1>
      <p style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--nb-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <ShieldCheck size={16} color="var(--nb-feedback-success)" /> Your account is well protected
      </p>

      <NBCard padding={4} style={{ marginBottom: 16 }}>
        <p style={{ margin: '12px 12px 0', fontSize: 15, fontWeight: 600, color: 'var(--nb-text-primary)' }}>Sign-in & verification</p>
        <Row icon={Fingerprint} title="Biometric sign-in" sub="Face or fingerprint — your PIN always works as a fallback"
          right={<Switch checked={biometrics} onChange={() => setBiometrics(!biometrics)} label="Biometric sign-in" />} />
        <Row icon={KeyRound} title="Two-step verification" sub="Extra check for sensitive actions"
          right={
            <div role="radiogroup" aria-label="Two-step verification method" style={{ display: 'flex', gap: 6 }}>
              {[['totp', 'App'], ['passkey', 'Passkey'], ['sms', 'SMS']].map(([v, l]) => (
                <NBButton key={v} size="sm" variant={twofa === v ? 'primary' : 'secondary'} onClick={() => setTwofa(v)} aria-pressed={twofa === v}>{l}</NBButton>
              ))}
            </div>} />
        {twofa === 'sms' && (
          <p style={{ margin: '0 12px 12px', fontSize: 12, color: 'var(--nb-feedback-warning)' }}>
            SMS is the weakest option — switch to an authenticator app or passkey when you can.
          </p>
        )}
        <Row icon={Bell} title="Transaction alerts"
          right={
            <div role="radiogroup" aria-label="Transaction alerts" style={{ display: 'flex', gap: 6 }}>
              {ALERT_OPTS.map(([v, l]) => (
                <NBButton key={v} size="sm" variant={alerts === v ? 'primary' : 'secondary'} onClick={() => setAlerts(v)} aria-pressed={alerts === v}>{l}</NBButton>
              ))}
            </div>} />
      </NBCard>

      <NBCard padding={4} style={{ marginBottom: 16 }}>
        <p style={{ margin: '12px 12px 0', fontSize: 15, fontWeight: 600, color: 'var(--nb-text-primary)' }}>Devices & sessions</p>
        {devices.map((d) => (
          <Row key={d.id} icon={Smartphone} title={d.name} sub={d.last}
            right={d.current
              ? <NBStatusPill tone="success">This device</NBStatusPill>
              : <NBButton size="sm" variant="ghost" onClick={() => setRevoking(d)}>Sign out</NBButton>} />
        ))}
      </NBCard>

      <NBCard padding={4} style={{ marginBottom: 16 }}>
        <p style={{ margin: '12px 12px 0', fontSize: 15, fontWeight: 600, color: 'var(--nb-text-primary)' }}>Privacy & data</p>
        <Row icon={EyeOff} title="Mask balances by default" sub="Amounts hidden until you tap to reveal"
          right={<Switch checked={maskBalances} onChange={() => setMaskBalances(!maskBalances)} label="Mask balances" />} />
        <Row icon={EyeOff} title="Appearance"
          right={<ThemeToggle />} />
        <Row icon={Download} title="Export your data" sub="Statements and account data as CSV/PDF"
          right={<NBButton size="sm" variant="secondary">Request</NBButton>} />
        <Row icon={Trash2} title="Close account" sub="Download your data first — this can’t be undone"
          right={<NBButton size="sm" variant="destructive" onClick={() => setDeleteOpen(true)}>Close</NBButton>} />
      </NBCard>

      <p style={{ fontSize: 13, color: 'var(--nb-text-secondary)', textAlign: 'center' }}>
        Something suspicious? <a href="/settings" style={{ color: 'var(--nb-action-primary)', fontWeight: 600 }}>Contact support</a> — a human, not a bot loop.
      </p>

      <NBSheet open={!!revoking} onClose={() => setRevoking(null)} title="Sign out this device?">
        <p style={{ color: 'var(--nb-text-secondary)', fontSize: 15 }}>
          {revoking?.name} will need full sign-in with two-step verification to access your account again.
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <NBButton variant="destructive" style={{ flex: 1 }} icon={LogOut}
            onClick={() => { setDevices(devices.filter((d) => d.id !== revoking.id)); setRevoking(null); }}>
            Sign out {revoking?.name?.split(' ')[0] === 'This' ? 'device' : revoking?.name}
          </NBButton>
          <NBButton variant="secondary" onClick={() => setRevoking(null)}>Keep signed in</NBButton>
        </div>
      </NBSheet>

      <NBSheet open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Close your account?">
        <p style={{ color: 'var(--nb-text-secondary)', fontSize: 15, lineHeight: '22px' }}>
          This permanently closes your account after any remaining balance is withdrawn. We’ll keep records only as long as the law requires. {'{{LEGAL_REVIEW}}'}
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <NBButton variant="destructive" style={{ flex: 1 }} onClick={() => setDeleteOpen(false)}>Close my account</NBButton>
          <NBButton variant="secondary" onClick={() => setDeleteOpen(false)}>Keep my account</NBButton>
        </div>
      </NBSheet>
    </div>
  );
}
