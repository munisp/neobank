import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, UserPlus, AlertTriangle, Check, X, Trash2 } from 'lucide-react';
import { ApiService } from '../services/ApiService';
import { NBButton, NBInput, NBCard, NBStatusPill, NBSkeletonCard, NBErrorState, useHaptics } from '../components/ui/nb';

const REASON_LABELS = {
  unregistered_payee: 'Unregistered payee',
  over_single_limit: 'Over single-payment limit',
  over_daily_limit: 'Over daily limit',
  dormant_payee: 'Dormant payee',
};

export default function PositivePay() {
  const [payees, setPayees] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ payee_account: '', payee_name: '', max_single_amount: '', daily_limit: '' });
  const [submitting, setSubmitting] = useState(false);
  const haptics = useHaptics();

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [p, e] = await Promise.all([
        ApiService.get('/positive-pay/payees'),
        ApiService.get('/positive-pay/exceptions', { status: 'open' }),
      ]);
      setPayees(p || []);
      setExceptions(e || []);
    } catch (err) {
      setError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const register = async () => {
    if (!form.payee_account || !form.payee_name) return;
    setSubmitting(true);
    try {
      await ApiService.post('/positive-pay/payees', {
        payee_account: form.payee_account,
        payee_name: form.payee_name,
        max_single_amount: form.max_single_amount ? Number(form.max_single_amount) : null,
        daily_limit: form.daily_limit ? Number(form.daily_limit) : null,
      });
      haptics.success();
      setForm({ payee_account: '', payee_name: '', max_single_amount: '', daily_limit: '' });
      await load();
    } catch (err) {
      haptics.error(); setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const decide = async (id, decision) => {
    try {
      await ApiService.post(`/positive-pay/exceptions/${id}/decide`, { decision });
      haptics.success();
      await load();
    } catch (err) {
      haptics.error(); setError(err.message);
    }
  };

  const suspend = async (id) => {
    try {
      await ApiService.delete(`/positive-pay/payees/${id}`);
      await load();
    } catch (err) { setError(err.message); }
  };

  if (loading) return <div className="p-4 space-y-4"><NBSkeletonCard /><NBSkeletonCard /></div>;

  return (
    <div className="p-4 pb-24 space-y-6 max-w-2xl mx-auto">
      <header className="flex items-center gap-3">
        <ShieldCheck className="w-7 h-7 text-[var(--nb-brand-600)]" />
        <div>
          <h1 className="text-xl font-bold text-[var(--nb-text)]">Safe Payees</h1>
          <p className="text-sm text-[var(--nb-text-muted)]">Transfers to unregistered payees are held for your review</p>
        </div>
      </header>

      {error && <NBErrorState body={error} onRetry={load} />}

      {exceptions.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-[var(--nb-text)] flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" /> Pending review ({exceptions.length})
          </h2>
          {exceptions.map((ex) => (
            <NBCard key={ex.id} className="border-amber-200">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium text-[var(--nb-text)]">{ex.payee_name || ex.payee_account}</p>
                  <p className="text-sm text-[var(--nb-text-muted)]">{REASON_LABELS[ex.reason] || ex.reason}</p>
                  <p className="text-lg font-bold mt-1 text-[var(--nb-text)]">₦{Number(ex.amount).toLocaleString()}</p>
                </div>
                <NBStatusPill tone={ex.recommendation === 'reject' ? 'error' : 'warning'}>{ex.recommendation || 'review'}</NBStatusPill>
              </div>
              <div className="flex gap-2 mt-3">
                <NBButton onClick={() => decide(ex.id, 'paid')} variant="primary" size="sm">
                  <Check className="w-4 h-4" /> Pay
                </NBButton>
                <NBButton onClick={() => decide(ex.id, 'rejected')} variant="destructive" size="sm">
                  <X className="w-4 h-4" /> Reject
                </NBButton>
              </div>
            </NBCard>
          ))}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-semibold text-[var(--nb-text)]">Registered payees</h2>
        {payees.length === 0 && <p className="text-sm text-[var(--nb-text-muted)]">No payees yet — register one below.</p>}
        {payees.map((p) => (
          <NBCard key={p.id} className="flex justify-between items-center">
            <div>
              <p className="font-medium text-[var(--nb-text)]">{p.payee_name}</p>
              <p className="text-sm text-[var(--nb-text-muted)]">{p.payee_account}</p>
              {p.max_single_amount && (
                <p className="text-xs text-[var(--nb-text-muted)]">Limit ₦{Number(p.max_single_amount).toLocaleString()}/payment</p>
              )}
            </div>
            <button onClick={() => suspend(p.id)} className="text-red-500 p-2" aria-label="Remove payee">
              <Trash2 className="w-4 h-4" />
            </button>
          </NBCard>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold text-[var(--nb-text)] flex items-center gap-2">
          <UserPlus className="w-5 h-5" /> Add payee
        </h2>
        <NBCard className="space-y-3">
          <NBInput label="Account number" value={form.payee_account}
                   onChange={(e) => setForm({ ...form, payee_account: e.target.value })} placeholder="0123456789" />
          <NBInput label="Payee name" value={form.payee_name}
                   onChange={(e) => setForm({ ...form, payee_name: e.target.value })} placeholder="ABC Suppliers" />
          <div className="grid grid-cols-2 gap-3">
            <NBInput label="Max per payment (₦)" value={form.max_single_amount} type="number"
                     onChange={(e) => setForm({ ...form, max_single_amount: e.target.value })} />
            <NBInput label="Daily limit (₦)" value={form.daily_limit} type="number"
                     onChange={(e) => setForm({ ...form, daily_limit: e.target.value })} />
          </div>
          <NBButton onClick={register} disabled={submitting} variant="primary" className="w-full">
            {submitting ? 'Registering…' : 'Register payee'}
          </NBButton>
        </NBCard>
      </section>
    </div>
  );
}
