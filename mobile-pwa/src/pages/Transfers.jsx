import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, UserRound, Building2, BadgeCheck } from 'lucide-react';
import {
  NBButton, NBInput, NBCard, NBSheet, NBStatusPill, SuccessCheck,
} from '../components/ui/nb/index.js';
import { Amount } from '../components/ui/Amount.jsx';

/**
 * Send money (Section 7.4) — the most safety-critical flow.
 * Steps: recipient → amount → review (amount hero) → success.
 * Every step reversible until the confirm button, which NAMES the action.
 * Fee preview inline, arrival estimate, idempotent "payment in progress"
 * state — never double-charge on retry.
 */

const RECENTS = [
  { id: 1, name: 'Adaeze Okafor', bank: 'GTBank', account: '••4521', verified: true },
  { id: 2, name: 'Tunde Bakare', bank: 'Kuda', account: '••8834', verified: true },
  { id: 3, name: 'Chiamaka Eze', bank: 'Access Bank', account: '••2290', verified: false },
];

const STEPS = ['Recipient', 'Amount', 'Review', 'Done'];

export default function Transfers() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const mode = params.get('mode') === 'request' ? 'request' : 'send';

  const [step, setStep] = useState(0);
  const [recipient, setRecipient] = useState(null);
  const [accountInput, setAccountInput] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [amountError, setAmountError] = useState('');

  const parsed = Number(amount) || 0;
  const fee = 0; // free P2P
  const available = 184500.75;

  const recipientLabel = recipient?.name || (accountInput.length === 10 ? 'Account ••' + accountInput.slice(-4) : '');

  const validateAmount = () => {
    if (parsed <= 0) { setAmountError('Enter an amount to continue.'); return false; }
    if (parsed > available) {
      setAmountError(`That’s more than your available balance of ₦${available.toLocaleString('en-NG', { minimumFractionDigits: 2 })} — try a smaller amount or top up first.`);
      return false;
    }
    setAmountError('');
    return true;
  };

  const confirm = async () => {
    setSending(true); // idempotent: button disabled while in flight
    await new Promise((r) => setTimeout(r, 1200));
    setSending(false);
    setStep(3);
  };

  const canReview = useMemo(() => recipient || accountInput.length === 10, [recipient, accountInput]);

  return (
    <div className="safe-bottom" style={{ maxWidth: 520, margin: '0 auto', padding: '16px 16px 48px' }}>
      {/* Header with progress (Step X of 4) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        {step < 3 && (
          <button type="button" aria-label="Back" onClick={() => (step === 0 ? navigate('/dashboard') : setStep(step - 1))}
            style={{ background: 'none', border: 'none', color: 'var(--nb-text-secondary)', cursor: 'pointer', minHeight: 44, minWidth: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <ArrowLeft size={20} />
          </button>
        )}
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--nb-text-primary)' }}>
            {mode === 'request' ? 'Request money' : 'Send money'}
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--nb-text-secondary)' }}>Step {Math.min(step + 1, 4)} of 4 — {STEPS[Math.min(step, 3)]}</p>
        </div>
      </div>
      {/* Progress bar */}
      <div role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={4}
        style={{ height: 4, borderRadius: 999, background: 'var(--nb-surface-tertiary)', margin: '8px 0 24px' }}>
        <div style={{ height: '100%', width: `${((step + 1) / 4) * 100}%`, borderRadius: 999, background: 'var(--nb-action-primary)', transition: 'width var(--nb-dur-standard) var(--nb-ease-emphasized)' }} />
      </div>

      {step === 0 && (
        <section aria-label="Choose recipient">
          <NBInput
            label="Account number or tag"
            placeholder="10-digit account number"
            inputMode="numeric"
            value={accountInput}
            onChange={(e) => { setAccountInput(e.target.value.replace(/\D/g, '').slice(0, 10)); setRecipient(null); }}
            helper={accountInput.length === 10 ? 'We’ll verify the account name before you continue.' : 'Recent recipients below, or type an account number.'}
          />
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--nb-text-secondary)', margin: '24px 0 8px' }}>Recent</h2>
          <NBCard padding={8}>
            {RECENTS.map((r) => (
              <button key={r.id} type="button"
                onClick={() => { setRecipient(r); setAccountInput(''); }}
                style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 8px', minHeight: 56, background: recipient?.id === r.id ? 'var(--nb-brand-50)' : 'none', border: 'none', borderBottom: '1px solid var(--nb-border-subtle)', borderRadius: 'var(--nb-radius-xs)', cursor: 'pointer', textAlign: 'left' }}>
                <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 'var(--nb-radius-full)', background: 'var(--nb-surface-tertiary)', color: 'var(--nb-text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <UserRound size={18} />
                </span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 15, fontWeight: 600, color: 'var(--nb-text-primary)' }}>
                    {r.name} {r.verified && <BadgeCheck size={15} color="var(--nb-feedback-success)" aria-label="Verified recipient" />}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--nb-text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Building2 size={13} aria-hidden="true" /> {r.bank} {r.account}
                  </span>
                </span>
              </button>
            ))}
          </NBCard>
          <NBButton variant="primary" style={{ width: '100%', marginTop: 24 }} disabled={!canReview} onClick={() => setStep(1)}>
            Continue
          </NBButton>
        </section>
      )}

      {step === 1 && (
        <section aria-label="Enter amount">
          <NBInput
            label={`Amount ${mode === 'request' ? 'to request' : 'to send'}`}
            placeholder="0.00"
            inputMode="decimal"
            value={amount}
            error={amountError}
            onChange={(e) => { setAmount(e.target.value.replace(/[^\d.]/g, '')); setAmountError(''); }}
            helper={`Available: ₦${available.toLocaleString('en-NG', { minimumFractionDigits: 2 })} · Fee: ₦0.00 · Arrives instantly`}
          />
          {/* Quick amounts */}
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {[1000, 2000, 5000, 10000].map((q) => (
              <NBButton key={q} variant="secondary" size="sm" onClick={() => { setAmount(String(q)); setAmountError(''); }}>
                ₦{q.toLocaleString()}
              </NBButton>
            ))}
          </div>
          <div style={{ marginTop: 16 }}>
            <NBInput label="Note (optional)" placeholder="What’s it for?" value={note} onChange={(e) => setNote(e.target.value.slice(0, 60))} />
          </div>
          <NBButton variant="primary" style={{ width: '100%', marginTop: 24 }} onClick={() => validateAmount() && setStep(2)}>
            Review {mode === 'request' ? 'request' : 'payment'}
          </NBButton>
        </section>
      )}

      {step === 2 && (
        <NBSheet
          open
          onClose={() => setStep(1)}
          title={`Review ${mode === 'request' ? 'request' : 'payment'}`}
          hero={<Amount value={mode === 'request' ? parsed : -parsed} direction="neutral" />}
        >
          <dl style={{ margin: 0, fontSize: 15 }}>
            {[
              [mode === 'request' ? 'From' : 'To', recipientLabel],
              recipient?.bank ? ['Bank', `${recipient.bank} ${recipient.account}`] : null,
              ['Fee', '₦0.00 — free'],
              ['Arrives', 'Instantly'],
              note ? ['Note', note] : null,
            ].filter(Boolean).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--nb-border-subtle)' }}>
                <dt style={{ color: 'var(--nb-text-secondary)' }}>{k}</dt>
                <dd style={{ margin: 0, fontWeight: 600, color: 'var(--nb-text-primary)', textAlign: 'right' }}>{v}</dd>
              </div>
            ))}
          </dl>
          <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
            <NBButton variant="primary" style={{ flex: 1 }} loading={sending} onClick={confirm}>
              {mode === 'request' ? `Request ₦${parsed.toLocaleString()} from ${recipient?.name?.split(' ')[0] || 'them'}` : `Send ₦${parsed.toLocaleString()} to ${recipient?.name?.split(' ')[0] || 'recipient'}`}
            </NBButton>
            <NBButton variant="secondary" onClick={() => setStep(1)} disabled={sending}>Back</NBButton>
          </div>
          {sending && <p role="status" style={{ textAlign: 'center', marginTop: 12, fontSize: 13, color: 'var(--nb-text-secondary)' }}>Payment in progress — don’t close the app.</p>}
        </NBSheet>
      )}

      {step === 3 && (
        <section aria-label="Success" style={{ textAlign: 'center', paddingTop: 48 }}>
          <div aria-hidden="true" style={{ margin: '0 auto 16px', display: 'flex', justifyContent: 'center', color: 'var(--nb-feedback-success)' }}>
            <SuccessCheck size={72} />
          </div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: 'var(--nb-text-primary)' }}>
            {mode === 'request' ? 'Request sent' : 'Money sent'}
          </h2>
          <p style={{ margin: '8px 0 0', fontSize: 15, color: 'var(--nb-text-secondary)' }}>
            <Amount value={mode === 'request' ? parsed : -parsed} direction="neutral" /> {mode === 'request' ? 'requested from' : 'sent to'} {recipientLabel} · arrived instantly
          </p>
          <div style={{ marginTop: 12 }}><NBStatusPill tone="success">Completed</NBStatusPill></div>
          <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
            <NBButton variant="primary" style={{ flex: 1 }} onClick={() => navigate('/dashboard')}>Done</NBButton>
            <NBButton variant="secondary" onClick={() => { setStep(0); setAmount(''); setNote(''); setRecipient(null); setAccountInput(''); }}>
              {mode === 'request' ? 'Request again' : 'Send again'}
            </NBButton>
          </div>
        </section>
      )}
    </div>
  );
}
