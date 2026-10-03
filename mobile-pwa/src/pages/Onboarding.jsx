import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, ShieldCheck, Camera, UserRound, FileCheck, PartyPopper } from 'lucide-react';
import { NBButton, NBCard, NBInput, NBStatusPill } from '../components/ui/nb/index.js';

/**
 * Onboarding & KYC (Section 7.1) — the make-or-break flow.
 * Visible progress with per-step estimated time, rationale for every data
 * point, soft-decline dignity, save-and-resume (state persisted locally),
 * reduced-motion friendly.
 */

const STEPS = [
  { id: 'phone', title: 'Your details', time: '1 min', icon: UserRound,
    why: 'We need your name and date of birth to create your account — it must match your student ID.' },
  { id: 'document', title: 'Student ID or NIN slip', time: '1 min', icon: Camera,
    why: 'We’re required to verify your identity. A clear photo of your student ID or NIN slip works — it takes about a minute.' },
  { id: 'selfie', title: 'Quick selfie', time: '30 sec', icon: ShieldCheck,
    why: 'A short liveness check keeps your account safe from impersonation.' },
  { id: 'review', title: 'Review & submit', time: '30 sec', icon: FileCheck,
    why: 'Check everything is correct — you can go back and fix anything.' },
];

const DRAFT_KEY = 'nb.onboarding.draft';

export default function Onboarding() {
  const navigate = useNavigate();
  const draft = (() => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY)) || {}; } catch { return {}; } })();
  const [step, setStep] = useState(draft.step || 0);
  const [form, setForm] = useState({ name: '', dob: '', docType: 'student-id', ...draft.form });
  const [submitted, setSubmitted] = useState(false);

  const persist = (s, f) => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ step: s, form: f })); } catch {}
  };
  const go = (next, f = form) => { setStep(next); persist(next, f); };
  const set = (k, v) => { const f = { ...form, [k]: v }; setForm(f); persist(step, f); };

  const submit = async () => {
    setSubmitted(true);
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
  };

  if (submitted) {
    return (
      <div className="safe-bottom" style={{ maxWidth: 520, margin: '0 auto', padding: 16, textAlign: 'center', paddingTop: 64 }}>
        <div aria-hidden="true" style={{ width: 72, height: 72, margin: '0 auto 16px', borderRadius: 'var(--nb-radius-full)', background: 'var(--nb-feedback-success-surface)', color: 'var(--nb-feedback-success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <PartyPopper size={34} />
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--nb-text-primary)' }}>All submitted</h1>
        <p style={{ color: 'var(--nb-text-secondary)', fontSize: 15, lineHeight: '22px', maxWidth: 340, margin: '8px auto' }}>
          Verification usually takes under 10 minutes. We’ll notify you the moment your account is fully active — you can already browse around.
        </p>
        <NBStatusPill tone="pending">Verification in review</NBStatusPill>
        <div style={{ marginTop: 32 }}>
          <NBButton variant="primary" onClick={() => navigate('/dashboard')}>Continue to home</NBButton>
        </div>
      </div>
    );
  }

  const CurrentIcon = STEPS[step].icon;

  return (
    <div className="safe-bottom" style={{ maxWidth: 520, margin: '0 auto', padding: 16 }}>
      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--nb-action-primary)', margin: '8px 0 4px' }}>
        Step {step + 1} of {STEPS.length} · about {STEPS[step].time}
      </p>
      <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: 'var(--nb-text-primary)' }}>{STEPS[step].title}</h1>

      <div role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={STEPS.length}
        style={{ height: 4, borderRadius: 999, background: 'var(--nb-surface-tertiary)', margin: '16px 0 24px', display: 'flex', gap: 4, background: 'none' }}>
        {STEPS.map((s, i) => (
          <div key={s.id} style={{ flex: 1, height: 4, borderRadius: 999, background: i <= step ? 'var(--nb-action-primary)' : 'var(--nb-surface-tertiary)' }} />
        ))}
      </div>

      <NBCard padding={16} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 24, background: 'var(--nb-brand-25)', border: 'none' }}>
        <CurrentIcon size={20} color="var(--nb-brand-600)" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
        <p style={{ margin: 0, fontSize: 14, lineHeight: '20px', color: 'var(--nb-text-primary)' }}>{STEPS[step].why}</p>
      </NBCard>

      {step === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <NBInput label="Full name (as on your ID)" required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Adaeze Okafor" />
          <NBInput label="Date of birth" required type="date" value={form.dob} onChange={(e) => set('dob', e.target.value)} />
          <NBButton variant="primary" disabled={!form.name || !form.dob} onClick={() => go(1)}>Continue</NBButton>
        </div>
      )}

      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div role="radiogroup" aria-label="Document type" style={{ display: 'flex', gap: 8 }}>
            {[['student-id', 'Student ID'], ['nin', 'NIN slip']].map(([v, l]) => (
              <NBButton key={v} variant={form.docType === v ? 'primary' : 'secondary'} size="sm" onClick={() => set('docType', v)} aria-pressed={form.docType === v}>{l}</NBButton>
            ))}
          </div>
          <NBCard padding={32} style={{ textAlign: 'center', borderStyle: 'dashed', borderWidth: 2 }}>
            <Camera size={32} color="var(--nb-text-secondary)" aria-hidden="true" style={{ margin: '0 auto 8px' }} />
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--nb-text-primary)' }}>Take a photo of your {form.docType === 'nin' ? 'NIN slip' : 'student ID'}</p>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--nb-text-secondary)' }}>Good light, no glare — we auto-check blur. Offline? We’ll queue the upload.</p>
            <NBButton variant="secondary" size="sm" style={{ marginTop: 12 }} onClick={() => go(2)}>Open camera</NBButton>
          </NBCard>
          <NBButton variant="ghost" onClick={() => go(2)}>Skip for now — finish later</NBButton>
        </div>
      )}

      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <NBCard padding={32} style={{ textAlign: 'center' }}>
            <ShieldCheck size={32} color="var(--nb-text-secondary)" aria-hidden="true" style={{ margin: '0 auto 8px' }} />
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--nb-text-primary)' }}>Look at the camera and blink</p>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--nb-text-secondary)' }}>10 seconds. The video never leaves your account unencrypted.</p>
            <NBButton variant="secondary" size="sm" style={{ marginTop: 12 }} onClick={() => go(3)}>Start liveness check</NBButton>
          </NBCard>
          <NBButton variant="ghost" onClick={() => go(3)}>Skip for now</NBButton>
        </div>
      )}

      {step === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <NBCard padding={16}>
            {[
              ['Name', form.name || '—'],
              ['Date of birth', form.dob || '—'],
              ['Document', form.docType === 'nin' ? 'NIN slip' : 'Student ID'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--nb-border-subtle)', fontSize: 15 }}>
                <span style={{ color: 'var(--nb-text-secondary)' }}>{k}</span>
                <span style={{ fontWeight: 600, color: 'var(--nb-text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {v} <CheckCircle2 size={15} color="var(--nb-feedback-success)" aria-hidden="true" />
                </span>
              </div>
            ))}
          </NBCard>
          <p style={{ fontSize: 13, color: 'var(--nb-text-secondary)', margin: 0 }}>
            By submitting you agree to the account terms and confirm the details are yours. {'{{LEGAL_REVIEW}}'}
          </p>
          <NBButton variant="primary" onClick={submit}>Submit for verification</NBButton>
        </div>
      )}

      {step > 0 && step < 3 && (
        <NBButton variant="ghost" style={{ marginTop: 12 }} onClick={() => go(step - 1)}>Back</NBButton>
      )}
      <p style={{ fontSize: 12, color: 'var(--nb-text-disabled)', textAlign: 'center', marginTop: 24 }}>
        Progress saved automatically — you can leave and resume anytime.
      </p>
    </div>
  );
}
