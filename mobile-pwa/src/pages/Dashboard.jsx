import React, { useState, useEffect, useContext, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Send, HandCoins, Plus, Receipt, ArrowDownLeft, ShoppingBag, Coffee, Wifi, GraduationCap } from 'lucide-react';
import { AuthContext } from '../contexts/AuthContext';
import {
  NBCard, NBBalanceCard, NBTransactionRow, NBButton,
  NBSkeletonCard, NBSkeletonTransactionRow, NBOfflineBanner, NBErrorState,
} from '../components/ui/nb/index.js';
import { getStoredTenant } from '../design/tenantTheme';

/**
 * Home dashboard (Section 7.2): greeting, total balance with privacy blur,
 * account carousel with color coding, quick actions, intelligent insight
 * strip, recent activity (last 5), offline cached-data banner, pull-down
 * "as of" timestamp. Skeletons match layout; error state has retry + support.
 */

const CATEGORY_ICONS = {
  income: <ArrowDownLeft size={18} />,
  groceries: <ShoppingBag size={18} />,
  food: <Coffee size={18} />,
  data: <Wifi size={18} />,
  fees: <GraduationCap size={18} />,
};

const QUICK_ACTIONS = [
  { label: 'Send', icon: Send, to: '/transfers' },
  { label: 'Request', icon: HandCoins, to: '/transfers?mode=request' },
  { label: 'Top up', icon: Plus, to: '/banking' },
  { label: 'Pay bill', icon: Receipt, to: '/bills' },
];

const Dashboard = () => {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [state, setState] = useState('loading'); // loading | ready | error | offline
  const [updatedAt, setUpdatedAt] = useState(null);
  const [data, setData] = useState({ accounts: [], recentTransactions: [], insight: null });
  const tenant = getStoredTenant();

  const loadDashboardData = useCallback(async () => {
    setState('loading');
    try {
      await new Promise((r) => setTimeout(r, 700));
      setData({
        accounts: [
          { id: 1, name: 'Everyday', balance: 184500.75, color: 1 },
          { id: 2, name: 'Savings — School fees', balance: 350000, color: 2 },
          { id: 3, name: 'Flex (USD)', balance: 210.4, color: 7, currency: '$' },
        ],
        recentTransactions: [
          { id: 1, merchant: 'Allowance — Mum', category: 'Income', time: '09:12', amount: 50000, icon: CATEGORY_ICONS.income },
          { id: 2, merchant: 'MTN Data 10GB', category: 'Data', time: 'Yesterday', amount: -3500, icon: CATEGORY_ICONS.data },
          { id: 3, merchant: 'Cafeteria 2', category: 'Food & drink', time: 'Yesterday', amount: -1200, icon: CATEGORY_ICONS.food },
          { id: 4, merchant: 'Jumia', category: 'Groceries', time: 'Mon', amount: -8750, pending: true, icon: CATEGORY_ICONS.groceries },
          { id: 5, merchant: 'Departmental dues', category: 'School fees', time: 'Fri', amount: -5000, icon: CATEGORY_ICONS.fees },
        ],
        insight: { text: 'Spending on data is 18% lower than last month — you’re on track to save ₦4,200 more.', tone: 'success' },
      });
      setUpdatedAt('just now');
      setState(navigator.onLine === false ? 'offline' : 'ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => { loadDashboardData(); }, [loadDashboardData]);

  const greeting = tenant.voice?.greeting || 'Hello';
  const firstName = user?.name?.split(' ')[0] || user?.firstName || 'there';
  const totalNgn = data.accounts.filter((a) => !a.currency || a.currency === '₦').reduce((s, a) => s + a.balance, 0);

  if (state === 'error') {
    return <NBErrorState onRetry={loadDashboardData} onSupport={() => navigate('/settings')} />;
  }

  return (
    <div className="safe-bottom" style={{ maxWidth: 720, margin: '0 auto', padding: '16px 16px 96px' }}>
      {state === 'offline' && <NBOfflineBanner updatedAt={updatedAt} />}

      {/* Greeting */}
      <header style={{ margin: '8px 0 20px' }}>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--nb-text-secondary)' }}>
          {new Date().toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <h1 style={{ margin: '2px 0 0', fontSize: 28, fontWeight: 700, lineHeight: '34px', color: 'var(--nb-text-primary)' }}>
          {greeting}, {firstName}
        </h1>
      </header>

      {state === 'loading' ? (
        <>
          <NBSkeletonCard />
          <div style={{ height: 16 }} />
          <NBCard padding={8}>
            <NBSkeletonTransactionRow /><NBSkeletonTransactionRow /><NBSkeletonTransactionRow />
          </NBCard>
        </>
      ) : (
        <>
          {/* Total balance hero */}
          <NBBalanceCard
            label="Total balance"
            amount={totalNgn}
            accountColor={1}
            updatedAt={updatedAt}
          />

          {/* Account carousel */}
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '16px 2px 8px', scrollSnapType: 'x mandatory' }}>
            {data.accounts.map((a) => (
              <Link
                key={a.id} to="/accounts"
                style={{ scrollSnapAlign: 'start', minWidth: 220, textDecoration: 'none' }}
                aria-label={`${a.name} account`}
              >
                <NBCard padding={16} className={`acct-color-0${a.color}`} style={{ borderTop: '3px solid var(--acct)' }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--nb-text-secondary)' }}>{a.name}</p>
                  <p className="amount tabular" style={{ margin: '6px 0 0', fontSize: 20, fontWeight: 700, color: 'var(--nb-text-primary)' }}>
                    <span className="currency-symbol">{a.currency || '₦'}</span>
                    {a.balance.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                  </p>
                </NBCard>
              </Link>
            ))}
          </div>

          {/* Quick actions — thumb-zone, 44px+ targets */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, margin: '12px 0 20px' }}>
            {QUICK_ACTIONS.map(({ label, icon: Icon, to }) => (
              <Link
                key={label} to={to}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 4px', textDecoration: 'none', borderRadius: 'var(--nb-radius-sm)' }}
              >
                <span style={{ width: 48, height: 48, borderRadius: 'var(--nb-radius-full)', background: 'var(--nb-brand-50)', color: 'var(--nb-brand-700)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={20} strokeWidth={2} />
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--nb-text-primary)' }}>{label}</span>
              </Link>
            ))}
          </div>

          {/* Intelligent insight strip — "am I okay?" before data */}
          {data.insight && (
            <NBCard padding={14} style={{ background: 'var(--nb-feedback-success-surface)', border: 'none', marginBottom: 20 }}>
              <p style={{ margin: 0, fontSize: 14, lineHeight: '20px', color: 'var(--nb-feedback-success)', fontWeight: 600 }}>
                {data.insight.text}
              </p>
            </NBCard>
          )}

          {/* Recent activity — last 5, tap → detail */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: 'var(--nb-text-primary)' }}>Recent activity</h2>
            <Link to="/transactions" style={{ fontSize: 14, fontWeight: 600, color: 'var(--nb-action-primary)', textDecoration: 'none' }}>See all</Link>
          </div>
          <NBCard padding={8}>
            {data.recentTransactions.map((t) => (
              <NBTransactionRow
                key={t.id}
                merchant={t.merchant}
                category={t.category}
                time={t.time}
                amount={t.amount}
                pending={t.pending}
                icon={t.icon}
                onClick={() => navigate('/transactions')}
              />
            ))}
          </NBCard>

          {/* New-customer activation checklist (empty-first-use pattern) */}
          <NBCard padding={16} style={{ marginTop: 20 }}>
            <p style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 600, color: 'var(--nb-text-primary)' }}>Get the most out of your account</p>
            {['Verify your student ID (2 min)', 'Set a savings goal for next term', 'Turn on transaction alerts'].map((step, i) => (
              <Link key={step} to={i === 0 ? '/onboarding' : i === 1 ? '/budget' : '/settings'}
                style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 0', textDecoration: 'none', borderTop: i ? '1px solid var(--nb-border-subtle)' : 'none' }}>
                <span style={{ width: 24, height: 24, borderRadius: 'var(--nb-radius-full)', border: '2px solid var(--nb-brand-500)', color: 'var(--nb-brand-600)', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                <span style={{ fontSize: 14, color: 'var(--nb-text-primary)' }}>{step}</span>
              </Link>
            ))}
          </NBCard>
        </>
      )}
    </div>
  );
};

export default Dashboard;
