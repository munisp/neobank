import React, { useCallback, useEffect, useState } from 'react';
import { Home, Calculator, ChevronRight, CheckCircle2 } from 'lucide-react';
import { ApiService } from '../services/ApiService';
import { NBButton, NBInput, NBCard, NBStatusPill, NBSkeletonCard, NBErrorState, Pressable, Stagger, StaggerItem } from '../components/ui/nb';

const fmt = (n) => `₦${Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

/**
 * Mortgages — browse products, get an instant amortization quote, apply,
 * and view your payment plan.
 */
const Mortgages = () => {
  const [products, setProducts] = useState(null);
  const [mine, setMine] = useState([]);
  const [error, setError] = useState(false);
  const [quote, setQuote] = useState(null);
  const [applying, setApplying] = useState(false);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({ property_value: 45000000, deposit_pct: 20, tenor_years: 20 });
  const [product, setProduct] = useState(null);

  const load = useCallback(async () => {
    try {
      const [p, m] = await Promise.all([
        ApiService.get('/mortgages/products'),
        ApiService.get('/mortgages/my').catch(() => ({ applications: [] })),
      ]);
      setProducts(p.products);
      if (!product && p.products.length) setProduct(p.products[0]);
      setMine(m.applications || []);
    } catch (e) {
      setError(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const getQuote = async () => {
    if (!product) return;
    const q = await ApiService.post('/mortgages/quote', {
      property_value: Number(form.property_value),
      deposit_pct: Number(form.deposit_pct),
      tenor_years: Number(form.tenor_years),
      annual_rate_pct: product.annual_rate_pct,
    });
    setQuote(q);
    setDone(false);
  };

  const apply = async () => {
    setApplying(true);
    try {
      await ApiService.post('/mortgages/apply', {
        product_id: product.id,
        property_value: Number(form.property_value),
        deposit_pct: Number(form.deposit_pct),
        tenor_years: Number(form.tenor_years),
      });
      setDone(true);
      await load();
    } finally {
      setApplying(false);
    }
  };

  if (error) {
    return <div className="p-4"><NBErrorState title="Couldn't load mortgages" onRetry={load} /></div>;
  }
  if (!products) {
    return <div className="space-y-4 p-4" aria-busy="true"><NBSkeletonCard /><NBSkeletonCard /></div>;
  }

  return (
    <div className="space-y-6 p-4 pb-24">
      <header>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--nb-text-primary)' }}>Home mortgages</h1>
        <p className="text-sm" style={{ color: 'var(--nb-text-secondary)' }}>
          Own your home with a structured payment plan.
        </p>
      </header>

      {mine.length > 0 && (
        <section className="space-y-3" aria-label="Your applications">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--nb-text-primary)' }}>Your applications</h2>
          {mine.map((a) => (
            <NBCard key={a.id} padding={16}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold" style={{ color: 'var(--nb-text-primary)' }}>{fmt(a.principal)}</p>
                  <p className="text-sm" style={{ color: 'var(--nb-text-secondary)' }}>
                    {fmt(a.monthly_payment)}/mo · {a.tenor_months / 12} yrs · {a.annual_rate_pct}%
                  </p>
                </div>
                <NBStatusPill tone={a.status === 'active' ? 'success' : a.status === 'submitted' ? 'pending' : 'info'}>
                  {a.status}
                </NBStatusPill>
              </div>
            </NBCard>
          ))}
        </section>
      )}

      <section className="space-y-3" aria-label="Products">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--nb-text-primary)' }}>Products</h2>
        <Stagger className="space-y-3">
        {products.map((p) => (
          <StaggerItem key={p.id}>
          <Pressable onClick={() => { setProduct(p); setQuote(null); }}
            className="w-full text-left" aria-pressed={product?.id === p.id}>
            <NBCard padding={16} style={product?.id === p.id ? { outline: '2px solid var(--nb-brand-500)' } : {}}>
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{ background: 'var(--nb-brand-50)', color: 'var(--nb-brand-600)' }}>
                  <Home size={20} aria-hidden="true" />
                </span>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold" style={{ color: 'var(--nb-text-primary)' }}>{p.name}</p>
                    <p className="text-sm font-semibold" style={{ color: 'var(--nb-brand-600)' }}>{p.annual_rate_pct}%</p>
                  </div>
                  <p className="text-sm" style={{ color: 'var(--nb-text-secondary)' }}>{p.description}</p>
                  <p className="mt-1 text-xs" style={{ color: 'var(--nb-text-tertiary)' }}>
                    Up to {p.max_tenor_years} yrs · min {p.min_deposit_pct}% deposit
                  </p>
                </div>
              </div>
            </NBCard>
          </Pressable>
          </StaggerItem>
        ))}
        </Stagger>
      </section>

      {product && (
        <NBCard padding={20}>
          <h2 className="mb-4 flex items-center gap-2 font-semibold" style={{ color: 'var(--nb-text-primary)' }}>
            <Calculator size={18} aria-hidden="true" /> Payment plan calculator
          </h2>
          <div className="space-y-4">
            <NBInput label="Property value (₦)" type="number" value={form.property_value}
              onChange={(e) => setForm({ ...form, property_value: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <NBInput label={`Deposit (${form.deposit_pct}%)`} type="number" value={form.deposit_pct}
                onChange={(e) => setForm({ ...form, deposit_pct: e.target.value })} />
              <NBInput label="Tenor (years)" type="number" value={form.tenor_years}
                onChange={(e) => setForm({ ...form, tenor_years: e.target.value })} />
            </div>
            <NBButton onClick={getQuote}>Get quote</NBButton>
          </div>

          {quote && (
            <div className="mt-5 space-y-2 rounded-xl p-4" style={{ background: 'var(--nb-surface-secondary)' }}>
              <Row label="Deposit" value={fmt(quote.deposit_amount)} />
              <Row label="Loan amount" value={fmt(quote.principal)} />
              <Row label="Monthly payment" value={fmt(quote.monthly_payment)} strong />
              <Row label="Total repayable" value={fmt(quote.total_repayable)} />
              <Row label="Total interest" value={fmt(quote.total_interest)} />
              {done ? (
                <p className="flex items-center gap-2 pt-2 text-sm font-medium" role="status"
                  style={{ color: 'var(--nb-feedback-success)' }}>
                  <CheckCircle2 size={16} aria-hidden="true" /> Application submitted — we'll review and generate your schedule.
                </p>
              ) : (
                <NBButton className="mt-3 w-full" onClick={apply} loading={applying}>
                  Apply for this plan <ChevronRight size={16} className="ml-1 inline" />
                </NBButton>
              )}
            </div>
          )}
        </NBCard>
      )}
    </div>
  );
};

const Row = ({ label, value, strong }) => (
  <div className="flex items-center justify-between">
    <span className="text-sm" style={{ color: 'var(--nb-text-secondary)' }}>{label}</span>
    <span className={strong ? 'amount text-lg font-bold' : 'amount text-sm font-semibold'}
      style={{ color: strong ? 'var(--nb-brand-600)' : 'var(--nb-text-primary)' }}>{value}</span>
  </div>
);

export default Mortgages;
