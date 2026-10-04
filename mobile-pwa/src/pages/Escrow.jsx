import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, Handshake, Package } from 'lucide-react';
import { ApiService } from '../services/ApiService';
import {
  NBButton, NBInput, NBCard, NBStatusPill, NBSkeletonCard, NBErrorState,
  Stagger, StaggerItem, useHaptics,
} from '../components/ui/nb';

const fmt = (n) => `₦${Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
const list = (d, key) => d?.[key] || d?.escrows || d?.items || (Array.isArray(d) ? d : []);

/**
 * Escrow — trust-as-a-service for marketplace deals: create, fund,
 * release on delivery. Backed by the escrow-go service with
 * TigerBeetle holding accounts.
 */
const Escrow = () => {
  const [escrows, setEscrows] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [error, setError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', amount: '', counterparty: '' });
  const haptics = useHaptics();

  const load = useCallback(async () => {
    setError(false);
    try {
      const [e, t] = await Promise.all([
        ApiService.get('/escrow/?user_id=me').catch(() => null),
        ApiService.get('/escrow/templates').catch(() => null),
      ]);
      setEscrows(list(e, 'escrows'));
      setTemplates(list(t, 'templates'));
    } catch (err) {
      setError(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setCreating(true);
    try {
      await ApiService.post('/escrow/', {
        title: form.title,
        amount: Number(form.amount),
        counterparty: form.counterparty,
      });
      haptics.success();
      setForm({ title: '', amount: '', counterparty: '' });
      await load();
    } finally {
      setCreating(false);
    }
  };

  if (error) return <NBErrorState title="Escrow unavailable" message="We couldn't reach the escrow service. Try again." onRetry={load} />;
  if (!escrows) return <div className="p-4 space-y-3"><NBSkeletonCard /><NBSkeletonCard /></div>;

  const tone = (s) => ({ funded: 'brand', released: 'success', disputed: 'danger', created: 'warning' }[s] || 'neutral');

  return (
    <div className="p-4 pb-24 space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--nb-text-primary)' }}>Escrow</h1>
        <p className="text-sm" style={{ color: 'var(--nb-text-secondary)' }}>Buy and sell with strangers, minus the stranger danger.</p>
      </div>

      <NBCard className="flex items-start gap-3">
        <ShieldCheck size={20} style={{ color: 'var(--nb-brand-600)', marginTop: 2 }} />
        <p className="text-sm" style={{ color: 'var(--nb-text-primary)' }}>Funds sit in a protected holding account until both sides confirm. No delivery, no release.</p>
      </NBCard>

      <NBCard>
        <h3 className="font-semibold mb-3 flex items-center gap-1.5" style={{ color: 'var(--nb-text-primary)' }}><Handshake size={16} /> New escrow deal</h3>
        <div className="space-y-2">
          <NBInput label="What are you trading?" placeholder="e.g. iPhone 15 Pro, Tokunbo Camry" value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <NBInput label="Amount (₦)" type="number" placeholder="850000" value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <NBInput label="Counterparty (phone or email)" placeholder="0803… or name@mail.com" value={form.counterparty}
            onChange={(e) => setForm({ ...form, counterparty: e.target.value })} />
          <NBButton variant="primary" onClick={create} disabled={creating || !form.title || !form.amount} style={{ width: '100%' }}>
            {creating ? 'Creating…' : 'Create protected deal'}
          </NBButton>
        </div>
      </NBCard>

      <div>
        <h3 className="font-semibold mb-2" style={{ color: 'var(--nb-text-primary)' }}>Your deals</h3>
        {escrows.length === 0 ? (
          <NBCard className="text-center py-8">
            <Package className="mx-auto mb-2" size={36} style={{ color: 'var(--nb-text-tertiary)' }} />
            <p className="text-sm" style={{ color: 'var(--nb-text-secondary)' }}>No deals yet. Create one and share the link with your buyer or seller.</p>
          </NBCard>
        ) : (
          <Stagger className="space-y-2">
            {escrows.map((e) => (
              <StaggerItem key={e.id}>
                <NBCard className="flex items-center justify-between">
                  <div>
                    <p className="font-medium" style={{ color: 'var(--nb-text-primary)' }}>{e.title || e.description}</p>
                    <p className="text-xs" style={{ color: 'var(--nb-text-secondary)' }}>{fmt(e.amount)} · {e.reference || String(e.id || '').slice(0, 8)}</p>
                  </div>
                  <NBStatusPill tone={tone(e.status)}>{e.status || 'created'}</NBStatusPill>
                </NBCard>
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </div>

      {templates.length > 0 && (
        <div>
          <h3 className="font-semibold mb-2" style={{ color: 'var(--nb-text-primary)' }}>Deal templates</h3>
          <Stagger className="space-y-2">
            {templates.map((t, i) => (
              <StaggerItem key={t.id || i}>
                <NBCard className="flex items-center justify-between">
                  <p className="font-medium" style={{ color: 'var(--nb-text-primary)' }}>{t.name}</p>
                  <p className="text-xs" style={{ color: 'var(--nb-text-secondary)' }}>{t.description || ''}</p>
                </NBCard>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      )}
    </div>
  );
};

export default Escrow;
