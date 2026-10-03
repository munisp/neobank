import React, { useState } from 'react';
import { Send, ShoppingBag, Coffee, ArrowDownLeft } from 'lucide-react';
import {
  NBButton, NBInput, NBCard, NBStatusPill,
  NBSkeletonCard, NBSkeletonTransactionRow,
  NBBalanceCard, NBTransactionRow,
  NBEmptyState, NBErrorState, NBOfflineBanner, NBSheet,
} from '@/components/ui/nb/index.js';
import { Amount } from '@/components/ui/Amount.jsx';
import { ThemeToggle } from '@/components/ui/ThemeToggle.jsx';
import { TENANT_ROSTER, applyTenantTheme, getStoredTenant } from '@/design/tenantTheme';

const Section = ({ title, children }) => (
  <section style={{ marginBottom: 40 }}>
    <h2 style={{ fontSize: 22, fontWeight: 700, lineHeight: '28px', margin: '0 0 16px', color: 'var(--nb-text-primary)' }}>{title}</h2>
    {children}
  </section>
);

export default function DesignSystemPage() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [tenant, setTenant] = useState(getStoredTenant().tenantId);

  const switchTenant = (pack) => { applyTenantTheme(pack); setTenant(pack.tenantId); };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, lineHeight: '34px', margin: 0, color: 'var(--nb-text-primary)' }}>Design System</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--nb-text-secondary)', fontSize: 14 }}>
            World-class fintech skin — tokens, components, states. Tenant: <strong>{tenant}</strong>
          </p>
        </div>
        <ThemeToggle />
      </header>

      <Section title="Tenant Brand Packs">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {TENANT_ROSTER.map((t) => (
            <NBButton
              key={t.tenantId}
              variant={tenant === t.tenantId ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => switchTenant(t)}
            >
              {t.displayName}
            </NBButton>
          ))}
        </div>
        <p style={{ fontSize: 13, color: 'var(--nb-text-secondary)', marginTop: 8 }}>
          One system, many faces — brand swaps live with contrast-floor enforcement. Try dark mode after each swap.
        </p>
      </Section>

      <Section title="Buttons — one primary action, named actions">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <NBButton variant="primary" icon={Send}>Send ₦25,000 to Adaeze</NBButton>
          <NBButton variant="secondary">View statement</NBButton>
          <NBButton variant="ghost">Not now</NBButton>
          <NBButton variant="destructive">Freeze card</NBButton>
          <NBButton variant="primary" loading>Processing</NBButton>
          <NBButton variant="primary" disabled>Unavailable</NBButton>
        </div>
      </Section>

      <Section title="Balance — privacy blur, account color, tabular numerals">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 16 }}>
          <NBBalanceCard label="Everyday account" amount={1284500.75} accountColor={1} updatedAt="just now" />
          <NBBalanceCard label="Savings — Emergency fund" amount={350000} accountColor={2} masked updatedAt="2h ago (offline cache)" />
          <NBBalanceCard label="Business" amount={89210.4} accountColor={3} updatedAt="just now" />
        </div>
      </Section>

      <Section title="Transactions — pending distinct, signed amounts">
        <NBCard padding={8}>
          <NBTransactionRow merchant="Shoprite Lekki" category="Groceries" time="14:02" amount={-21450} icon={<ShoppingBag size={18} />} onClick={() => {}} />
          <NBTransactionRow merchant="Salary — Andela" category="Income" time="09:00" amount={1850000} icon={<ArrowDownLeft size={18} />} onClick={() => {}} />
          <NBTransactionRow merchant="Blue Bottle Coffee" category="Food & drink" time="Yesterday" amount={-4200} pending icon={<Coffee size={18} />} onClick={() => {}} />
        </NBCard>
      </Section>

      <Section title="Status — never color-only">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <NBStatusPill tone="success">Completed</NBStatusPill>
          <NBStatusPill tone="pending">Pending</NBStatusPill>
          <NBStatusPill tone="warning">Review needed</NBStatusPill>
          <NBStatusPill tone="error">Declined</NBStatusPill>
          <NBStatusPill tone="info">Scheduled</NBStatusPill>
        </div>
      </Section>

      <Section title="Inputs — labels always, errors human">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 16 }}>
          <NBInput label="Recipient account number" required placeholder="10 digits" helper="We verify the account name before you send." />
          <NBInput label="Amount" defaultValue="500" error="That’s more than your available balance of ₦350.00 — try a smaller amount." />
        </div>
      </Section>

      <Section title="Loading — skeletons match the layout">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 16 }}>
          <NBSkeletonCard />
          <NBCard padding={8}>
            <NBSkeletonTransactionRow />
            <NBSkeletonTransactionRow />
            <NBSkeletonTransactionRow />
          </NBCard>
        </div>
      </Section>

      <Section title="Empty / error / offline — designed before the happy path">
        <NBOfflineBanner updatedAt="2h ago" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16, marginTop: 16 }}>
          <NBCard padding={0}><NBEmptyState title="No transactions yet" body="When you spend or receive money, it shows up here instantly." actionLabel="Add money" onAction={() => {}} /></NBCard>
          <NBCard padding={0}><NBErrorState onRetry={() => {}} onSupport={() => {}} /></NBCard>
        </div>
      </Section>

      <Section title="Sheet — confirm with the amount as hero">
        <NBButton variant="primary" onClick={() => setSheetOpen(true)}>Preview confirm sheet</NBButton>
        <NBSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title="Confirm payment"
          hero={<Amount value={-25000} direction="neutral" />}
        >
          <p style={{ color: 'var(--nb-text-secondary)', fontSize: 15, lineHeight: '22px' }}>
            To <strong style={{ color: 'var(--nb-text-primary)' }}>Adaeze Okafor</strong> · GTBank ··4521.
            Arrives instantly. No fee.
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
            <NBButton variant="primary" style={{ flex: 1 }} onClick={() => setSheetOpen(false)}>Send ₦25,000 to Adaeze</NBButton>
            <NBButton variant="secondary" onClick={() => setSheetOpen(false)}>Back</NBButton>
          </div>
        </NBSheet>
      </Section>
    </div>
  );
}
