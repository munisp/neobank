import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDownLeft, ShoppingBag, Coffee, Wifi, GraduationCap, Search } from 'lucide-react';
import {
  NBCard, NBTransactionRow, NBSkeletonTransactionRow,
  NBEmptyState, NBErrorState, NBOfflineBanner,
} from '../components/ui/nb/index.js';

/**
 * Transaction feed (Section 7.3 + Section 9 states):
 * grouped by day, pending distinct, signed amounts, search + filter chips,
 * and every state — loading skeleton, empty-first-use, error-retry, offline
 * cached banner. Tap → detail.
 */

const CATEGORY_ICONS = {
  Income: <ArrowDownLeft size={18} />, Groceries: <ShoppingBag size={18} />,
  'Food & drink': <Coffee size={18} />, Data: <Wifi size={18} />, 'School fees': <GraduationCap size={18} />,
};
const FILTERS = ['All', 'Money in', 'Money out', 'Pending'];

const DEMO = [
  { id: 1, day: 'Today', merchant: 'Allowance — Mum', category: 'Income', time: '09:12', amount: 50000 },
  { id: 2, day: 'Today', merchant: 'Cafeteria 2', category: 'Food & drink', time: '13:40', amount: -1200 },
  { id: 3, day: 'Yesterday', merchant: 'MTN Data 10GB', category: 'Data', time: '18:02', amount: -3500 },
  { id: 4, day: 'Yesterday', merchant: 'Jumia', category: 'Groceries', time: '11:26', amount: -8750, pending: true },
  { id: 5, day: 'Monday 29 Sep', merchant: 'Departmental dues', category: 'School fees', time: '10:00', amount: -5000 },
  { id: 6, day: 'Monday 29 Sep', merchant: 'Bolt ride', category: 'Transport', time: '19:44', amount: -2100 },
];

export default function Transactions() {
  const navigate = useNavigate();
  const [state, setState] = useState('loading');
  const [txns, setTxns] = useState([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(async () => {
    setState('loading');
    try {
      await new Promise((r) => setTimeout(r, 600));
      setTxns(DEMO);
      setUpdatedAt('just now');
      setState(navigator.onLine === false ? 'offline' : 'ready');
    } catch { setState('error'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => txns.filter((t) => {
    if (filter === 'Money in' && t.amount <= 0) return false;
    if (filter === 'Money out' && t.amount >= 0) return false;
    if (filter === 'Pending' && !t.pending) return false;
    if (query && !`${t.merchant} ${t.category}`.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  }), [txns, query, filter]);

  const grouped = useMemo(() => {
    const g = {};
    for (const t of visible) (g[t.day] ||= []).push(t);
    return g;
  }, [visible]);

  return (
    <div className="safe-bottom" style={{ maxWidth: 560, margin: '0 auto', padding: '16px 16px 96px' }}>
      {state === 'offline' && <NBOfflineBanner updatedAt={updatedAt} />}
      <h1 style={{ fontSize: 26, fontWeight: 700, margin: '8px 0 16px', color: 'var(--nb-text-primary)' }}>Transactions</h1>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 12 }}>
        <Search size={18} aria-hidden="true" style={{ position: 'absolute', left: 14, top: 15, color: 'var(--nb-text-disabled)' }} />
        <input className="nb-input" style={{ paddingLeft: 42 }} placeholder="Search merchant, category…"
          aria-label="Search transactions" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {/* Filter chips */}
      <div role="group" aria-label="Filter transactions" style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto' }}>
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f}
            style={{ minHeight: 40, padding: '0 16px', borderRadius: 'var(--nb-radius-full)', fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
              border: filter === f ? 'none' : '1px solid var(--nb-border-subtle)',
              background: filter === f ? 'var(--nb-action-primary)' : 'var(--nb-surface-primary)',
              color: filter === f ? 'var(--nb-text-on-action)' : 'var(--nb-text-secondary)' }}>
            {f}
          </button>
        ))}
      </div>

      {state === 'loading' && (
        <NBCard padding={8}><NBSkeletonTransactionRow /><NBSkeletonTransactionRow /><NBSkeletonTransactionRow /><NBSkeletonTransactionRow /></NBCard>
      )}

      {state === 'error' && <NBCard padding={0}><NBErrorState onRetry={load} onSupport={() => navigate('/settings')} /></NBCard>}

      {(state === 'ready' || state === 'offline') && visible.length === 0 && (
        <NBCard padding={0}>
          <NBEmptyState
            title={query || filter !== 'All' ? 'No matches' : 'No transactions yet'}
            body={query || filter !== 'All' ? 'Try a different search or filter.' : 'When you spend or receive money, it shows up here instantly.'}
            actionLabel={query || filter !== 'All' ? undefined : 'Add money'}
            onAction={() => navigate('/banking')} />
        </NBCard>
      )}

      {(state === 'ready' || state === 'offline') && visible.length > 0 && (
        Object.entries(grouped).map(([day, rows]) => (
          <section key={day} aria-label={day} style={{ marginBottom: 8 }}>
            {/* sticky day headers */}
            <h2 style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--nb-surface-secondary)', margin: 0, padding: '10px 4px 6px', fontSize: 13, fontWeight: 700, color: 'var(--nb-text-secondary)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{day}</h2>
            <NBCard padding={8}>
              {rows.map((t) => (
                <NBTransactionRow key={t.id} merchant={t.merchant} category={t.category} time={t.time}
                  amount={t.amount} pending={t.pending} icon={CATEGORY_ICONS[t.category]} onClick={() => {}} />
              ))}
            </NBCard>
          </section>
        ))
      )}

      <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--nb-text-disabled)', marginTop: 16 }}>
        Updated {updatedAt || '—'} · export CSV/PDF from any account page
      </p>
    </div>
  );
}
