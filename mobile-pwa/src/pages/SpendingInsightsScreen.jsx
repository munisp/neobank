import React, { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import { TrendingDown, TrendingUp, Wallet, CalendarDays } from 'lucide-react';
import { NBCard, NBStatusPill, NBSkeletonCard } from '../components/ui/nb/index.js';
import { Amount } from '../components/ui/Amount.jsx';

/**
 * Insights (Sections 7.6 + 8): "am I okay?" first, then data.
 * - Spending donut (≤5 slices, center KPI, account-wheel colors)
 * - Budget pace indicators (supportive, not judgmental)
 * - Safe-to-spend-today with transparent, tappable formula
 * - Cash-flow bar chart (honest axes, starts at zero)
 * Every chart has a text takeaway read first by screen readers.
 */

const SPEND = [
  { name: 'Food & drink', value: 18400, color: 'var(--nb-acct-03)' },
  { name: 'Data & airtime', value: 9600, color: 'var(--nb-acct-07)' },
  { name: 'Transport', value: 7200, color: 'var(--nb-acct-02)' },
  { name: 'School', value: 5000, color: 'var(--nb-acct-01)' },
  { name: 'Other', value: 4300, color: 'var(--nb-acct-05)' },
];
const CASHFLOW = [
  { wk: 'W1', inflow: 50000, outflow: 11800 },
  { wk: 'W2', inflow: 0, outflow: 9800 },
  { wk: 'W3', inflow: 15000, outflow: 12100 },
  { wk: 'W4', inflow: 0, outflow: 10800 },
];
const BUDGETS = [
  { name: 'Food & drink', spent: 18400, limit: 25000 },
  { name: 'Data & airtime', spent: 9600, limit: 8000 },
  { name: 'Transport', spent: 7200, limit: 10000 },
];

const TOTAL = SPEND.reduce((s, c) => s + c.value, 0);
const SAFE = 2340; // per day

export default function SpendingInsightsScreen() {
  const [loading, setLoading] = useState(true);
  const [showFormula, setShowFormula] = useState(false);
  useEffect(() => { const t = setTimeout(() => setLoading(false), 600); return () => clearTimeout(t); }, []);

  if (loading) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto', padding: 16 }}>
        <NBSkeletonCard /><div style={{ height: 16 }} /><NBSkeletonCard />
      </div>
    );
  }

  return (
    <div className="safe-bottom" style={{ maxWidth: 720, margin: '0 auto', padding: '16px 16px 96px' }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, margin: '8px 0 4px', color: 'var(--nb-text-primary)' }}>Insights</h1>
      <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--nb-text-secondary)' }}>October · updated just now</p>

      {/* Am I okay? — the answer before the data */}
      <NBCard padding={16} style={{ background: 'var(--nb-feedback-success-surface)', border: 'none', marginBottom: 20 }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--nb-feedback-success)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <TrendingDown size={18} aria-hidden="true" /> You’re doing fine — spending is 12% under last month.
        </p>
      </NBCard>

      {/* Safe to spend today — transparent formula */}
      <NBCard padding={20} style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--nb-text-secondary)', display: 'flex', gap: 6, alignItems: 'center' }}>
              <Wallet size={15} aria-hidden="true" /> Safe to spend today
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 30, fontWeight: 700, color: 'var(--nb-text-primary)' }}>
              <Amount value={SAFE} direction="neutral" />
            </p>
          </div>
          <button type="button" onClick={() => setShowFormula(!showFormula)} aria-expanded={showFormula}
            style={{ background: 'none', border: 'none', color: 'var(--nb-action-primary)', fontWeight: 600, fontSize: 14, cursor: 'pointer', minHeight: 44, padding: '0 8px' }}>
            How is this worked out?
          </button>
        </div>
        {showFormula && (
          <p style={{ margin: '12px 0 0', fontSize: 13, lineHeight: '19px', color: 'var(--nb-text-secondary)', borderTop: '1px solid var(--nb-border-subtle)', paddingTop: 12 }}>
            (Everyday balance ₦184,500 − upcoming bills ₦8,500 − savings goal ₦100,000) ÷ 33 days left of term = ₦2,340/day.
          </p>
        )}
      </NBCard>

      {/* Spending donut — ≤5 slices, center KPI, text takeaway first */}
      <NBCard padding={20} style={{ marginBottom: 20 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 600, color: 'var(--nb-text-primary)' }}>Where your money went</h2>
        <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--nb-text-secondary)' }}>
          Food & drink is your biggest category at ₦18,400 (41% of spending).
        </p>
        <div style={{ height: 200, position: 'relative' }} role="img" aria-label={`Spending this month totals ₦${TOTAL.toLocaleString()}. Food and drink ₦18,400, data ₦9,600, transport ₦7,200, school ₦5,000, other ₦4,300.`}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={SPEND} dataKey="value" innerRadius={60} outerRadius={85} paddingAngle={2} strokeWidth={0} isAnimationActive={!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches}>
                {SPEND.map((s) => <Cell key={s.name} fill={s.color} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <span className="tabular" style={{ fontSize: 18, fontWeight: 700, color: 'var(--nb-text-primary)' }}>₦{TOTAL.toLocaleString()}</span>
            <span style={{ fontSize: 12, color: 'var(--nb-text-secondary)' }}>this month</span>
          </div>
        </div>
        <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
          {SPEND.map((s) => (
            <li key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 14 }}>
              <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
              <span style={{ flex: 1, color: 'var(--nb-text-primary)' }}>{s.name}</span>
              <span className="tabular" style={{ color: 'var(--nb-text-secondary)' }}>₦{s.value.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </NBCard>

      {/* Budgets — pace indicator, supportive */}
      <NBCard padding={20} style={{ marginBottom: 20 }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 17, fontWeight: 600, color: 'var(--nb-text-primary)' }}>Budgets</h2>
        {BUDGETS.map((b) => {
          const pct = Math.round((b.spent / b.limit) * 100);
          const onTrack = pct <= 85;
          return (
            <div key={b.name} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 6 }}>
                <span style={{ fontWeight: 600, color: 'var(--nb-text-primary)' }}>{b.name}</span>
                <NBStatusPill tone={onTrack ? 'success' : 'warning'}>{onTrack ? 'On track' : 'Over pace — no stress, adjust below'}</NBStatusPill>
              </div>
              <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${b.name} budget ${pct}% used`}
                style={{ height: 8, borderRadius: 999, background: 'var(--nb-surface-tertiary)' }}>
                <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, borderRadius: 999, background: onTrack ? 'var(--nb-feedback-success)' : 'var(--nb-feedback-warning)' }} />
              </div>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--nb-text-secondary)' }} className="tabular">
                ₦{b.spent.toLocaleString()} of ₦{b.limit.toLocaleString()} ({pct}%)
              </p>
            </div>
          );
        })}
      </NBCard>

      {/* Cash flow — honest axes, starts at zero */}
      <NBCard padding={20}>
        <h2 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 600, color: 'var(--nb-text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <CalendarDays size={17} aria-hidden="true" /> Weekly cash flow
        </h2>
        <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--nb-text-secondary)' }}>
          Your biggest inflow was ₦50,000 in week 1; outflows stay near ₦11,000/week.
        </p>
        <div style={{ height: 180 }} role="img" aria-label="Weekly cash flow bar chart. Week 1 inflow 50,000 outflow 11,800. Week 2 outflow 9,800. Week 3 inflow 15,000 outflow 12,100. Week 4 outflow 10,800.">
          <ResponsiveContainer>
            <BarChart data={CASHFLOW} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
              <XAxis dataKey="wk" tick={{ fontSize: 12, fill: 'var(--nb-text-secondary)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--nb-text-secondary)' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₦${v / 1000}k`} />
              <Tooltip formatter={(v) => `₦${Number(v).toLocaleString()}`} cursor={{ fill: 'var(--nb-surface-tertiary)' }} />
              <Bar dataKey="inflow" name="Money in" fill="var(--nb-feedback-success)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="outflow" name="Money out" fill="var(--nb-acct-03)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </NBCard>
    </div>
  );
}
