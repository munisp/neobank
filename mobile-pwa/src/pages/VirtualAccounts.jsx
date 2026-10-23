import React, { useCallback, useEffect, useState } from 'react';
import { Landmark, Copy, PauseCircle, PlayCircle, Trash2, Briefcase } from 'lucide-react';
import { ApiService } from '../services/ApiService';
import {
  NBButton, NBInput, NBCard, NBStatusPill, NBSkeletonCard, NBErrorState,
  Stagger, StaggerItem, useHaptics,
} from '../components/ui/nb';

const PURPOSES = [
  { key: 'collections', label: 'Collections', hint: 'General inbound payments' },
  { key: 'gig', label: 'Client / Gig', hint: 'One number per client — know who paid' },
  { key: 'escrow', label: 'Escrow funding', hint: 'Dedicated number for a deal' },
  { key: 'savings', label: 'Savings goal', hint: 'Pay yourself first' },
];

/**
 * Virtual Accounts — user-created NUBAN-style account numbers that resolve
 * to the primary wallet. One per client, project, or goal.
 */
const VirtualAccounts = () => {
  const [accounts, setAccounts] = useState(null);
  const [error, setError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ account_name: '', label: '', purpose: 'collections' });
  const haptics = useHaptics();

  const load = useCallback(async () => {
    setError(false);
    try {
      const d = await ApiService.get('/virtual-accounts').catch(() => null);
      setAccounts(d?.virtual_accounts || []);
    } catch (err) {
      setError(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setCreating(true);
    try {
      await ApiService.post('/virtual-accounts', {
        account_name: form.account_name,
        label: form.label || undefined,
        purpose: form.purpose,
      });
      haptics.success();
      setForm({ account_name: '', label: '', purpose: 'collections' });
      await load();
    } finally {
      setCreating(false);
    }
  };

  const copy = (n) => {
    navigator.clipboard?.writeText(n).then(() => haptics.tap());
  };

  const toggleFreeze = async (va) => {
    await ApiService.post(`/virtual-accounts/${va.id}/freeze`).catch(() => null);
    await load();
  };

  const close = async (va) => {
    await ApiService.delete(`/virtual-accounts/${va.id}`).catch(() => null);
    await load();
  };

  if (error) return <NBErrorState title="Virtual accounts unavailable" message="We couldn't load your virtual accounts. Try again." onRetry={load} />;
  if (!accounts) return <div className="p-4 space-y-3"><NBSkeletonCard /><NBSkeletonCard /></div>;

  return (
    <div className="p-4 pb-24 space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--nb-text-primary)' }}>Virtual Accounts</h1>
        <p className="text-sm" style={{ color: 'var(--nb-text-secondary)' }}>Dedicated account numbers for clients, deals and goals — all settling into your main wallet.</p>
      </div>

      <NBCard>
        <h3 className="font-semibold mb-3 flex items-center gap-1.5" style={{ color: 'var(--nb-text-primary)' }}><Landmark size={16} /> New virtual account</h3>
        <div className="space-y-2">
          <NBInput label="Account name" placeholder="e.g. Adaeze Ventures" value={form.account_name}
            onChange={(e) => setForm({ ...form, account_name: e.target.value })} />
          <NBInput label="Label (optional)" placeholder="Client: ABC Ltd, Rent 2026…" value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            {PURPOSES.map((p) => (
              <button key={p.key} type="button" onClick={() => setForm({ ...form, purpose: p.key })}
                className="p-2 text-left rounded-lg"
                style={{
                  border: `1px solid ${form.purpose === p.key ? 'var(--nb-brand-600)' : 'var(--nb-border-subtle)'}`,
                  background: form.purpose === p.key ? 'var(--nb-brand-50)' : 'transparent',
                }}>
                <p className="text-sm font-medium" style={{ color: 'var(--nb-text-primary)' }}>{p.label}</p>
                <p className="text-xs" style={{ color: 'var(--nb-text-secondary)' }}>{p.hint}</p>
              </button>
            ))}
          </div>
          <NBButton variant="primary" onClick={create} disabled={creating || form.account_name.length < 2} style={{ width: '100%' }}>
            {creating ? 'Creating…' : 'Create account number'}
          </NBButton>
        </div>
      </NBCard>

      <div>
        <h3 className="font-semibold mb-2" style={{ color: 'var(--nb-text-primary)' }}>Your numbers</h3>
        {accounts.length === 0 ? (
          <NBCard className="text-center py-8">
            <Briefcase className="mx-auto mb-2" size={36} style={{ color: 'var(--nb-text-tertiary)' }} />
            <p className="text-sm" style={{ color: 'var(--nb-text-secondary)' }}>No virtual accounts yet. Create one and share the number with your next client.</p>
          </NBCard>
        ) : (
          <Stagger className="space-y-2">
            {accounts.map((va) => (
              <StaggerItem key={va.id}>
                <NBCard>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium" style={{ color: 'var(--nb-text-primary)' }}>{va.account_name}</p>
                      <button type="button" onClick={() => copy(va.account_number)} className="flex items-center gap-1">
                        <span className="text-lg font-bold tracking-wider" style={{ color: 'var(--nb-brand-600)' }}>{va.account_number}</span>
                        <Copy size={14} style={{ color: 'var(--nb-text-tertiary)' }} />
                      </button>
                      <p className="text-xs" style={{ color: 'var(--nb-text-secondary)' }}>{va.label || va.purpose}</p>
                    </div>
                    <NBStatusPill tone={va.status === 'active' ? 'success' : 'warning'}>{va.status}</NBStatusPill>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <NBButton variant="secondary" onClick={() => toggleFreeze(va)} style={{ flex: 1 }}>
                      {va.status === 'active' ? <><PauseCircle size={14} /> Freeze</> : <><PlayCircle size={14} /> Unfreeze</>}
                    </NBButton>
                    <NBButton variant="ghost" onClick={() => close(va)}><Trash2 size={14} /></NBButton>
                  </div>
                </NBCard>
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </div>
    </div>
  );
};

export default VirtualAccounts;
