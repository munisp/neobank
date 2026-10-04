import React, { useCallback, useEffect, useState } from 'react';
import { PiggyBank, Lock, Users } from 'lucide-react';
import { ApiService } from '../services/ApiService';
import {
  NBButton, NBInput, NBCard, NBStatusPill, NBSkeletonCard, NBErrorState,
  Pressable, Stagger, StaggerItem, SuccessCheck, useHaptics,
} from '../components/ui/nb';

const fmt = (n) => `₦${Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
const list = (d, key) => d?.[key] || d?.items || (Array.isArray(d) ? d : []);

/**
 * Savings — goal vaults, fixed deposits, group savings (Ajo/Esusu),
 * and salary advance. Backed by the savings-go service.
 */
const Savings = () => {
  const [tab, setTab] = useState('vaults');
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({ name: '', target_amount: '', amount: '' });
  const haptics = useHaptics();

  const load = useCallback(async () => {
    setError(false);
    try {
      const [v, fd, g] = await Promise.all([
        ApiService.get('/savings/vaults').catch(() => null),
        ApiService.get('/savings/fixed-deposits').catch(() => null),
        ApiService.get('/savings/groups').catch(() => null),
      ]);
      setData({ vaults: list(v, 'vaults'), fixed: list(fd, 'fixed_deposits'), groups: list(g, 'groups') });
    } catch (e) {
      setError(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createVault = async () => {
    setCreating(true);
    try {
      await ApiService.post('/savings/vaults', {
        name: form.name,
        target_amount: Number(form.target_amount),
      });
      haptics.success();
      setDone(true);
      setForm({ ...form, name: '', target_amount: '' });
      await load();
    } finally {
      setCreating(false);
    }
  };

  const deposit = async (id) => {
    if (!form.amount) return;
    await ApiService.post(`/savings/vaults/${id}/deposit`, { amount: Number(form.amount) });
    haptics.confirm();
    setForm({ ...form, amount: '' });
    await load();
  };

  if (error) return <NBErrorState title="Savings unavailable" message="We couldn't reach the savings service. Please retry." onRetry={load} />;
  if (!data) return <div className="p-4 space-y-3"><NBSkeletonCard /><NBSkeletonCard /></div>;

  const tabs = [['vaults', 'Vaults', PiggyBank], ['fixed', 'Fixed', Lock], ['groups', 'Ajo/Esusu', Users]];

  return (
    <div className="p-4 pb-24 space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--nb-text-primary)' }}>Savings</h1>
        <p className="text-sm" style={{ color: 'var(--nb-text-secondary)' }}>Small steps, big goals. Your money, working quietly.</p>
      </div>

      <div className="flex gap-2">
        {tabs.map(([key, label, Icon]) => (
          <Pressable key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium ${tab === key ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600'}`}>
            <Icon size={15} /> {label}
          </Pressable>
        ))}
      </div>

      {done && (
        <NBCard className="flex items-center gap-3">
          <SuccessCheck size={28} />
          <p className="text-sm font-medium" style={{ color: 'var(--nb-text-primary)' }}>Vault created — first deposit is the hardest. You've got this.</p>
        </NBCard>
      )}

      {tab === 'vaults' && (
        <Stagger className="space-y-3">
          <StaggerItem>
          <NBCard>
            <h3 className="font-semibold mb-3" style={{ color: 'var(--nb-text-primary)' }}>New goal vault</h3>
            <div className="space-y-2">
              <NBInput label="Goal name" placeholder="e.g. Rent, new laptop, japa fund" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <NBInput label="Target amount (₦)" type="number" placeholder="500000" value={form.target_amount}
                onChange={(e) => setForm({ ...form, target_amount: e.target.value })} />
              <NBButton variant="primary" onClick={createVault} disabled={creating || !form.name || !form.target_amount} style={{ width: '100%' }}>
                {creating ? 'Creating…' : 'Start saving'}
              </NBButton>
            </div>
          </NBCard>
          </StaggerItem>

          {data.vaults.length === 0 ? (
            <StaggerItem>
            <NBCard className="text-center py-8">
              <PiggyBank className="mx-auto mb-2" size={36} style={{ color: 'var(--nb-text-tertiary)' }} />
              <p className="text-sm" style={{ color: 'var(--nb-text-secondary)' }}>No vaults yet. Name a goal — the app does the reminding.</p>
            </NBCard>
            </StaggerItem>
          ) : data.vaults.map((v) => {
            const pct = v.target_amount ? Math.min(100, Math.round((v.balance || v.current_amount || 0) / v.target_amount * 100)) : 0;
            return (
              <StaggerItem key={v.id}>
                <NBCard>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-semibold" style={{ color: 'var(--nb-text-primary)' }}>{v.name}</p>
                      <p className="text-xs" style={{ color: 'var(--nb-text-secondary)' }}>{fmt(v.balance || v.current_amount)} of {fmt(v.target_amount)}</p>
                    </div>
                    <NBStatusPill tone="brand">{pct}%</NBStatusPill>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden mb-3" style={{ background: 'var(--nb-surface-secondary)' }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--nb-brand-500)', transition: 'width 400ms ease' }} />
                  </div>
                  <div className="flex gap-2">
                    <NBInput type="number" placeholder="Amount" value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                    <NBButton variant="primary" onClick={() => deposit(v.id)} disabled={!form.amount}>Top up</NBButton>
                  </div>
                </NBCard>
              </StaggerItem>
            );
          })}
        </Stagger>
      )}

      {tab === 'fixed' && (
        <Stagger className="space-y-3">
          {data.fixed.length === 0 ? (
            <StaggerItem>
            <NBCard className="text-center py-8">
              <Lock className="mx-auto mb-2" size={36} style={{ color: 'var(--nb-text-tertiary)' }} />
              <p className="text-sm" style={{ color: 'var(--nb-text-secondary)' }}>Lock funds for a fixed tenor and earn premium rates. No temptation, just yield.</p>
            </NBCard>
            </StaggerItem>
          ) : data.fixed.map((f) => (
            <StaggerItem key={f.id}>
              <NBCard className="flex items-center justify-between">
                <div>
                  <p className="font-semibold" style={{ color: 'var(--nb-text-primary)' }}>{fmt(f.amount)}</p>
                  <p className="text-xs" style={{ color: 'var(--nb-text-secondary)' }}>{f.tenor_months || f.tenor} months · matures {f.maturity_date ? new Date(f.maturity_date).toLocaleDateString() : '—'}</p>
                </div>
                <NBStatusPill tone="success">{f.rate_pct || f.interest_rate}% p.a.</NBStatusPill>
              </NBCard>
            </StaggerItem>
          ))}
        </Stagger>
      )}

      {tab === 'groups' && (
        <Stagger className="space-y-3">
          {data.groups.length === 0 ? (
            <StaggerItem>
            <NBCard className="text-center py-8">
              <Users className="mx-auto mb-2" size={36} style={{ color: 'var(--nb-text-tertiary)' }} />
              <p className="text-sm" style={{ color: 'var(--nb-text-secondary)' }}>Ajo, Esusu, Adashe — the oldest savings tech in Nigeria, now with receipts.</p>
            </NBCard>
            </StaggerItem>
          ) : data.groups.map((g) => (
            <StaggerItem key={g.id}>
              <NBCard className="flex items-center justify-between">
                <div>
                  <p className="font-semibold" style={{ color: 'var(--nb-text-primary)' }}>{g.name}</p>
                  <p className="text-xs" style={{ color: 'var(--nb-text-secondary)' }}>{fmt(g.contribution_amount)} {g.frequency || 'monthly'} · {g.member_count || g.members || '—'} members</p>
                </div>
              </NBCard>
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </div>
  );
};

export default Savings;
