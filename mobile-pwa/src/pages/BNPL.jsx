import React, { useCallback, useEffect, useState } from 'react';
import { SplitSquareHorizontal, Store, CalendarClock } from 'lucide-react';
import { ApiService } from '../services/ApiService';
import {
  NBButton, NBInput, NBCard, NBStatusPill, NBSkeletonCard, NBErrorState,
  Stagger, StaggerItem, SuccessCheck, useHaptics,
} from '../components/ui/nb';

const fmt = (n) => `₦${Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
const list = (d, key) => d?.[key] || d?.items || (Array.isArray(d) ? d : []);

/**
 * BNPL — check eligibility, split a purchase into instalments,
 * and track repayment schedules. Backed by the bnpl-go service.
 */
const BNPL = () => {
  const [eligibility, setEligibility] = useState(null);
  const [plans, setPlans] = useState([]);
  const [orders, setOrders] = useState([]);
  const [calc, setCalc] = useState(null);
  const [amount, setAmount] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);
  const haptics = useHaptics();

  const load = useCallback(async () => {
    setError(false);
    try {
      const [e, p, o] = await Promise.all([
        ApiService.get('/bnpl/eligibility').catch(() => null),
        ApiService.get('/bnpl/plans').catch(() => null),
        ApiService.get('/bnpl/orders').catch(() => null),
      ]);
      setEligibility(e || {});
      setPlans(list(p, 'plans'));
      setOrders(list(o, 'orders'));
    } catch (err) {
      setError(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const calculate = async () => {
    if (!amount) return;
    const c = await ApiService.post('/bnpl/calculate', { amount: Number(amount) }).catch(() => null);
    setCalc(c);
  };

  const pay = async (id) => {
    await ApiService.post(`/bnpl/orders/${id}/pay`, {}).then(() => {
      haptics.success();
      setDone(true);
      load();
    }).catch(() => {});
  };

  if (error) return <NBErrorState title="BNPL unavailable" message="We couldn't reach the credit service. Try again." onRetry={load} />;
  if (!eligibility) return <div className="p-4 space-y-3"><NBSkeletonCard /><NBSkeletonCard /></div>;

  const eligible = eligibility.eligible !== false;
  const limit = eligibility.limit ?? eligibility.credit_limit ?? 0;

  return (
    <div className="p-4 pb-24 space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--nb-text-primary)' }}>Buy Now, Pay Later</h1>
        <p className="text-sm" style={{ color: 'var(--nb-text-secondary)' }}>Split purchases into bites your budget can chew.</p>
      </div>

      <NBCard className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--nb-text-secondary)' }}>Available credit</p>
          <p className="text-2xl font-bold" style={{ color: 'var(--nb-text-primary)' }}>{fmt(limit)}</p>
        </div>
        <NBStatusPill tone={eligible ? 'success' : 'warning'}>{eligible ? 'Eligible' : 'Not eligible yet'}</NBStatusPill>
      </NBCard>

      {done && (
        <NBCard className="flex items-center gap-3">
          <SuccessCheck size={28} />
          <p className="text-sm font-medium" style={{ color: 'var(--nb-text-primary)' }}>Instalment paid. One step closer to done.</p>
        </NBCard>
      )}

      <NBCard>
        <h3 className="font-semibold mb-3" style={{ color: 'var(--nb-text-primary)' }}>Split a purchase</h3>
        <div className="flex gap-2">
          <NBInput type="number" placeholder="Purchase amount (₦)" value={amount} onChange={(e) => { setAmount(e.target.value); setCalc(null); }} />
          <NBButton variant="primary" onClick={calculate} disabled={!amount}>Calculate</NBButton>
        </div>
        {calc && (
          <div className="mt-3 space-y-2">
            {list(calc, 'options').map((opt, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: 'var(--nb-surface-secondary)' }}>
                <p className="text-sm font-medium" style={{ color: 'var(--nb-text-primary)' }}>{opt.installments || opt.count} × {fmt(opt.per_installment || opt.amount)}</p>
                <p className="text-xs" style={{ color: 'var(--nb-text-secondary)' }}>{opt.interest_pct ? `${opt.interest_pct}% interest` : 'Interest-free'}</p>
              </div>
            ))}
            {list(calc, 'options').length === 0 && (
              <p className="text-sm" style={{ color: 'var(--nb-text-secondary)' }}>Monthly: <span className="font-semibold">{fmt(calc.per_installment || calc.monthly)}</span></p>
            )}
          </div>
        )}
      </NBCard>

      <div>
        <h3 className="font-semibold mb-2" style={{ color: 'var(--nb-text-primary)' }}>Your plans</h3>
        {orders.length === 0 ? (
          <NBCard className="text-center py-6">
            <SplitSquareHorizontal className="mx-auto mb-2" size={32} style={{ color: 'var(--nb-text-tertiary)' }} />
            <p className="text-sm" style={{ color: 'var(--nb-text-secondary)' }}>No active plans. When you split a purchase, it lands here.</p>
          </NBCard>
        ) : (
          <Stagger className="space-y-2">
            {orders.map((o) => (
              <StaggerItem key={o.id}>
                <NBCard>
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <p className="font-medium" style={{ color: 'var(--nb-text-primary)' }}>{o.merchant_name || o.description || 'Purchase'}</p>
                      <p className="text-xs flex items-center gap-1" style={{ color: 'var(--nb-text-secondary)' }}>
                        <CalendarClock size={12} /> Next: {fmt(o.next_installment_amount)} {o.next_due_date ? `· ${new Date(o.next_due_date).toLocaleDateString()}` : ''}
                      </p>
                    </div>
                    <NBStatusPill tone={o.status === 'active' ? 'brand' : 'neutral'}>{o.status || 'active'}</NBStatusPill>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-sm" style={{ color: 'var(--nb-text-secondary)' }}>{fmt(o.amount)} total</p>
                    <NBButton variant="primary" onClick={() => pay(o.id)} style={{ padding: '6px 12px', fontSize: 14 }}>Pay instalment</NBButton>
                  </div>
                </NBCard>
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </div>

      {plans.length > 0 && (
        <div>
          <h3 className="font-semibold mb-2 flex items-center gap-1.5" style={{ color: 'var(--nb-text-primary)' }}><Store size={16} /> Partner merchants</h3>
          <Stagger className="space-y-2">
            {plans.map((p, i) => (
              <StaggerItem key={p.id || i}>
                <NBCard className="flex items-center justify-between">
                  <p className="font-medium" style={{ color: 'var(--nb-text-primary)' }}>{p.name || p.merchant}</p>
                  <NBStatusPill tone="neutral">{p.installments ? `${p.installments} splits` : p.terms || ''}</NBStatusPill>
                </NBCard>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      )}
    </div>
  );
};

export default BNPL;
