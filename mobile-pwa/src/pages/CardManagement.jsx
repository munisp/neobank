import React, { useState } from 'react';
import { Wifi, Globe, CreditCard, Snowflake, Sun, Copy, Check, Plus, Eye, EyeOff } from 'lucide-react';
import { NBCard, NBButton, NBStatusPill, NBSheet } from '../components/ui/nb/index.js';
import { Amount } from '../components/ui/Amount.jsx';

/**
 * Cards (Section 7.5): carousel with per-card color identity and frozen
 * state, instant-apply control toggles, freeze/unfreeze with immediate
 * status feedback, number reveal behind explicit action, virtual card
 * creation, clear education about recurring payments.
 */

const INITIAL_CARDS = [
  { id: 1, label: 'Debit — Everyday', last4: '4521', color: 1, type: 'physical', frozen: false,
    controls: { online: true, atm: true, international: false, contactless: true } },
  { id: 2, label: 'Virtual — Subscriptions', last4: '8890', color: 4, type: 'virtual', frozen: false,
    controls: { online: true, atm: false, international: true, contactless: false } },
];

const CONTROL_META = [
  ['online', 'Online payments', Globe],
  ['atm', 'ATM withdrawals', CreditCard],
  ['international', 'International use', Globe],
  ['contactless', 'Contactless', Wifi],
];

export default function CardManagement() {
  const [cards, setCards] = useState(INITIAL_CARDS);
  const [active, setActive] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [freezeSheet, setFreezeSheet] = useState(false);

  const card = cards[active];

  const patchCard = (patch) => setCards(cards.map((c, i) => (i === active ? { ...c, ...patch } : c)));
  const toggleControl = (key) => patchCard({ controls: { ...card.controls, [key]: !card.controls[key] } });

  const copyNumber = async () => {
    try { await navigator.clipboard.writeText(`5399 83•• •••• ${card.last4}`); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };

  return (
    <div className="safe-bottom" style={{ maxWidth: 560, margin: '0 auto', padding: '16px 16px 96px' }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, margin: '8px 0 16px', color: 'var(--nb-text-primary)' }}>Cards</h1>

      {/* Card carousel */}
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '4px 2px 12px', scrollSnapType: 'x mandatory' }}>
        {cards.map((c, i) => (
          <button key={c.id} type="button" onClick={() => { setActive(i); setRevealed(false); }}
            aria-label={`${c.label} card${c.frozen ? ', frozen' : ''}`} aria-pressed={i === active}
            className={`acct-color-0${c.color}`}
            style={{
              scrollSnapAlign: 'start', minWidth: 300, height: 176, textAlign: 'left', cursor: 'pointer',
              borderRadius: 'var(--nb-radius-md)', padding: 20, border: i === active ? '2px solid var(--nb-action-primary)' : '2px solid transparent',
              background: `linear-gradient(135deg, var(--acct), color-mix(in srgb, var(--acct) 60%, #000))`,
              color: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              opacity: c.frozen ? 0.72 : 1, transition: 'opacity var(--nb-dur-standard) var(--nb-ease-emphasized)',
            }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{c.label}</span>
              {c.frozen ? <Snowflake size={18} aria-label="Frozen" /> : <Wifi size={18} aria-hidden="true" />}
            </div>
            <div>
              <p className="tabular" style={{ margin: 0, fontSize: 18, letterSpacing: 2 }}>
                {revealed && i === active ? `5399 8304 2210 ${c.last4}` : `•••• •••• •••• ${c.last4}`}
              </p>
              <p style={{ margin: '6px 0 0', fontSize: 12, opacity: .85, display: 'flex', gap: 8, alignItems: 'center' }}>
                {c.type === 'virtual' ? 'Virtual card' : 'Physical card'} · Verve
                {c.frozen && <NBStatusPill tone="info">Frozen</NBStatusPill>}
              </p>
            </div>
          </button>
        ))}
        <button type="button" aria-label="Create virtual card"
          style={{ scrollSnapAlign: 'start', minWidth: 120, borderRadius: 'var(--nb-radius-md)', border: '2px dashed var(--nb-border-strong)', background: 'none', color: 'var(--nb-text-secondary)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
          <Plus size={22} /> New virtual card
        </button>
      </div>

      {/* Primary actions */}
      <div style={{ display: 'flex', gap: 8, margin: '8px 0 20px' }}>
        <NBButton variant={card.frozen ? 'primary' : 'secondary'} icon={card.frozen ? Sun : Snowflake}
          onClick={() => (card.frozen ? patchCard({ frozen: false }) : setFreezeSheet(true))} style={{ flex: 1 }}>
          {card.frozen ? 'Unfreeze card' : 'Freeze card'}
        </NBButton>
        <NBButton variant="secondary" icon={revealed ? EyeOff : Eye} onClick={() => setRevealed(!revealed)} aria-pressed={revealed}>
          {revealed ? 'Hide' : 'Show'}
        </NBButton>
        <NBButton variant="secondary" icon={copied ? Check : Copy} onClick={copyNumber} aria-label="Copy card number">
          {copied ? 'Copied' : 'Copy'}
        </NBButton>
      </div>

      {/* Controls — instant apply */}
      <NBCard padding={8}>
        <p style={{ margin: '12px 12px 4px', fontSize: 15, fontWeight: 600, color: 'var(--nb-text-primary)' }}>Card controls</p>
        <p style={{ margin: '0 12px 8px', fontSize: 13, color: 'var(--nb-text-secondary)' }}>Changes apply instantly.</p>
        {CONTROL_META.map(([key, label, Icon]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px', borderTop: '1px solid var(--nb-border-subtle)', minHeight: 56 }}>
            <Icon size={20} color="var(--nb-text-secondary)" aria-hidden="true" />
            <span style={{ flex: 1, fontSize: 15, color: 'var(--nb-text-primary)' }}>{label}</span>
            <button
              role="switch" aria-checked={card.controls[key]} aria-label={label}
              onClick={() => toggleControl(key)}
              style={{
                width: 48, height: 28, borderRadius: 999, border: 'none', cursor: 'pointer', position: 'relative',
                background: card.controls[key] ? 'var(--nb-action-primary)' : 'var(--nb-border-strong)',
                transition: 'background var(--nb-dur-micro) var(--nb-ease-emphasized)',
              }}>
              <span style={{
                position: 'absolute', top: 3, left: card.controls[key] ? 23 : 3, width: 22, height: 22,
                borderRadius: '50%', background: '#fff',
                transition: 'left var(--nb-dur-micro) var(--nb-ease-emphasized)',
              }} />
            </button>
          </div>
        ))}
      </NBCard>

      {/* Education: recurring payments */}
      <NBCard padding={16} style={{ marginTop: 16, background: 'var(--nb-feedback-info-surface)', border: 'none' }}>
        <p style={{ margin: 0, fontSize: 13, lineHeight: '19px', color: 'var(--nb-feedback-info)' }}>
          Freezing stops new payments. Subscriptions you already set up may still try to charge — freezing declines them until you unfreeze.
        </p>
      </NBCard>

      {/* Spend this month */}
      <NBCard padding={16} style={{ marginTop: 16 }}>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--nb-text-secondary)' }}>Spent on this card in October</p>
        <p style={{ margin: '4px 0 0', fontSize: 24, fontWeight: 700, color: 'var(--nb-text-primary)' }}>
          <Amount value={-32450} direction="neutral" />
        </p>
      </NBCard>

      {/* Freeze confirmation sheet — explicit, reversible */}
      <NBSheet open={freezeSheet} onClose={() => setFreezeSheet(false)} title="Freeze this card?">
        <p style={{ color: 'var(--nb-text-secondary)', fontSize: 15, lineHeight: '22px' }}>
          {card.label} ··{card.last4} will decline all new payments instantly. You can unfreeze anytime — it takes effect immediately.
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <NBButton variant="destructive" style={{ flex: 1 }} icon={Snowflake}
            onClick={() => { patchCard({ frozen: true }); setFreezeSheet(false); }}>
            Freeze ··{card.last4}
          </NBButton>
          <NBButton variant="secondary" onClick={() => setFreezeSheet(false)}>Keep active</NBButton>
        </div>
      </NBSheet>
    </div>
  );
}
