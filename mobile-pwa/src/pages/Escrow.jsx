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
  const [multiparty, setMultiparty] = useState(false);
  const [form, setForm] = useState({ title: '', amount: '', counterparty: '' });
  const [group, setGroup] = useState({ buyers: '', sellers: '', approvals: 'all', fee: '', deadline: '' });
  const haptics = useHaptics();

  // "userId1:40, userId2:60" → [{user_id, contribution_percentage}]
  const parseParties = (text, key) => text.split(',').map((s) => s.trim()).filter(Boolean)
    .map((s) => {
      const [id, pct] = s.split(':').map((x) => x.trim());
      return { user_id: id, [key]: Number(pct || 0) };
    });

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
      if (multiparty) {
        const buyers = parseParties(group.buyers, 'contribution_percentage');
        const sellers = parseParties(group.sellers, 'distribution_percentage');
        await ApiService.post('/escrow/multiparty', {
          title: form.title,
          total_amount: Number(form.amount),
          buyers, sellers,
          approval_config: {
            approval_type: group.approvals,
            required_approvals: buyers.length,
            ...(group.deadline ? { approval_deadline: new Date(group.deadline).toISOString() } : {}),
          },
          ...(group.fee ? { fee_percentage: Number(group.fee) } : {}),
          escrow_type: 'general',
        });
      } else {
        await ApiService.post('/escrow/', {
          title: form.title,
          amount: Number(form.amount),
          counterparty: form.counterparty,
        });
      }
      haptics.success();
      setForm({ title: '', amount: '', counterparty: '' });
      setGroup({ buyers: '', sellers: '', approvals: 'all', fee: '', deadline: '' });
      setMultiparty(false);
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
          {!multiparty && (
            <NBInput label="Counterparty (phone or email)" placeholder="0803… or name@mail.com" value={form.counterparty}
              onChange={(e) => setForm({ ...form, counterparty: e.target.value })} />
          )}
          <button type="button" onClick={() => setMultiparty(!multiparty)} className="text-xs font-medium"
            style={{ color: 'var(--nb-brand-600)' }}>
            {multiparty ? '− Switch back to a simple deal' : '+ Group deal? Multiple buyers, sellers or co-owners'}
          </button>
          {multiparty && (
            <div className="space-y-2 pt-1" style={{ borderTop: '1px solid var(--nb-border-subtle)' }}>
              <p className="text-xs" style={{ color: 'var(--nb-text-secondary)' }}>
                Format: <code>userId:percent</code>, comma-separated. Percentages must total 100 per side.
              </p>
              <NBInput label="Buyers & contributions" placeholder="ada:60, chidi:40" value={group.buyers}
                onChange={(e) => setGroup({ ...group, buyers: e.target.value })} />
              <NBInput label="Sellers & distributions" placeholder="obi:75, ngozi:25" value={group.sellers}
                onChange={(e) => setGroup({ ...group, sellers: e.target.value })} />
              <NBInput label="Approval rule" placeholder="all · majority · any" value={group.approvals}
                onChange={(e) => setGroup({ ...group, approvals: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <NBInput label="Fee % (optional)" type="number" placeholder="2.5" value={group.fee}
                  onChange={(e) => setGroup({ ...group, fee: e.target.value })} />
                <NBInput label="Approval deadline (optional)" type="date" value={group.deadline}
                  onChange={(e) => setGroup({ ...group, deadline: e.target.value })} />
              </div>
              <p className="text-xs" style={{ color: 'var(--nb-text-secondary)' }}>
                If the deadline passes without full approval, every contribution is auto-refunded in full.
              </p>
            </div>
          )}
          <NBButton variant="primary" onClick={create}
            disabled={creating || !form.title || !form.amount || (multiparty && (!group.buyers || !group.sellers))}
            style={{ width: '100%' }}>
            {creating ? 'Creating…' : multiparty ? 'Create group escrow' : 'Create protected deal'}
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
