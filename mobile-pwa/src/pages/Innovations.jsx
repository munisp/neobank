import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Sparkles, Radar, SplitSquareHorizontal, Coins, ShieldCheck } from 'lucide-react';
import { ApiService } from '../services/ApiService';
import {
  NBButton, NBInput, NBCard, NBStatusPill, NBSkeletonCard, NBErrorState,
  Pressable, Stagger, StaggerItem, useHaptics,
} from '../components/ui/nb';

const fmt = (n) => `₦${Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;

/**
 * Innovations — the smart-money suite: Round-Ups, Subscription Radar,
 * Salary Sorter, Money Copilot, Safe-to-Spend. Deep-linked from app-store
 * tiles via /innovations?app=<key>.
 */
const TABS = [
  ['round-ups', 'Round-Ups', Coins],
  ['subscriptions', 'Sub Radar', Radar],
  ['salary-sorter', 'Salary Sorter', SplitSquareHorizontal],
  ['copilot', 'Copilot', Sparkles],
  ['safe-to-spend', 'Safe to Spend', ShieldCheck],
];

const Innovations = () => {
  const [params, setParams] = useSearchParams();
  const tab = params.get('app') || 'round-ups';
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [rules, setRules] = useState({ save_pct: 20, bills_pct: 30 });
  const haptics = useHaptics();

  const load = useCallback(async () => {
    setError(false);
    setData(null);
    const url = {
      'round-ups': '/innovations/round-ups/preview',
      'subscriptions': '/innovations/subscriptions',
      'salary-sorter': '/innovations/salary-sorter/preview',
      'copilot': '/innovations/copilot',
      'safe-to-spend': '/innovations/safe-to-spend',
    }[tab];
    try {
      setData(await ApiService.get(url));
    } catch (e) {
      setError(true);
    }
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const enableRoundUps = async () => {
    await ApiService.post('/innovations/round-ups/settings', { enabled: true, multiplier: 1, round_to: 100 }).catch(() => {});
    haptics.success();
    load();
  };

  const saveRules = async () => {
    await ApiService.post('/innovations/salary-sorter/rules', {
      save_pct: Number(rules.save_pct), bills_pct: Number(rules.bills_pct),
    }).catch(() => {});
    haptics.confirm();
    load();
  };

  const sevTone = { warning: 'warning', success: 'success', info: 'neutral' };

  return (
    <div className="p-4 pb-24 space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--nb-text-primary)' }}>Smart Money</h1>
        <p className="text-sm" style={{ color: 'var(--nb-text-secondary)' }}>Automation that saves before you can spend.</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {TABS.map(([key, label, Icon]) => (
          <Pressable key={key} onClick={() => setParams({ app: key })}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium ${tab === key ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600'}`}>
            <Icon size={14} /> {label}
          </Pressable>
        ))}
      </div>

      {error && <NBErrorState title="Couldn't load" message="This innovation hit a snag. Try again." onRetry={load} />}
      {!error && !data && <div className="space-y-3"><NBSkeletonCard /><NBSkeletonCard /></div>}

      {!error && data && tab === 'round-ups' && (
        <Stagger className="space-y-3">
          <StaggerItem>
          <NBCard className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--nb-text-secondary)' }}>Swept this month</p>
              <p className="text-2xl font-bold" style={{ color: 'var(--nb-text-primary)' }}>{fmt(data.month_to_date_sweep)}</p>
              <p className="text-xs" style={{ color: 'var(--nb-text-secondary)' }}>{data.transactions_scanned} transactions scanned</p>
            </div>
            {data.enabled
              ? <NBStatusPill tone="success">Active</NBStatusPill>
              : <NBButton variant="primary" onClick={enableRoundUps}>Turn on</NBButton>}
          </NBCard>
          </StaggerItem>
          {(data.examples || []).map((ex, i) => (
            <StaggerItem key={i}>
              <NBCard className="flex items-center justify-between">
                <p className="text-sm" style={{ color: 'var(--nb-text-primary)' }}>{ex.description || 'Purchase'}</p>
                <p className="text-sm font-semibold" style={{ color: 'var(--nb-brand-600)' }}>+{fmt(ex.sweep)}</p>
              </NBCard>
            </StaggerItem>
          ))}
        </Stagger>
      )}

      {!error && data && tab === 'subscriptions' && (
        <Stagger className="space-y-3">
          {(data.subscriptions || data.items || []).length === 0 ? (
            <StaggerItem>
            <NBCard className="text-center py-8">
              <Radar className="mx-auto mb-2" size={36} style={{ color: 'var(--nb-text-tertiary)' }} />
              <p className="text-sm" style={{ color: 'var(--nb-text-secondary)' }}>No recurring charges detected in the last 90 days. Clean bill of health.</p>
            </NBCard>
            </StaggerItem>
          ) : (data.subscriptions || data.items).map((sub, i) => (
            <StaggerItem key={i}>
              <NBCard className="flex items-center justify-between">
                <div>
                  <p className="font-medium" style={{ color: 'var(--nb-text-primary)' }}>{sub.name || sub.merchant || sub.description}</p>
                  <p className="text-xs" style={{ color: 'var(--nb-text-secondary)' }}>{sub.occurrences || sub.count || '—'} charges · {sub.frequency || 'recurring'}</p>
                </div>
                <p className="font-semibold" style={{ color: 'var(--nb-text-primary)' }}>{fmt(sub.amount)}</p>
              </NBCard>
            </StaggerItem>
          ))}
        </Stagger>
      )}

      {!error && data && tab === 'salary-sorter' && (
        <Stagger className="space-y-3">
          <StaggerItem>
          <NBCard>
            <h3 className="font-semibold mb-3" style={{ color: 'var(--nb-text-primary)' }}>Split every salary automatically</h3>
            <div className="flex gap-2">
              <NBInput label="Save %" type="number" value={rules.save_pct} onChange={(e) => setRules({ ...rules, save_pct: e.target.value })} />
              <NBInput label="Bills %" type="number" value={rules.bills_pct} onChange={(e) => setRules({ ...rules, bills_pct: e.target.value })} />
              <NBButton variant="primary" onClick={saveRules} style={{ alignSelf: 'flex-end' }}>Save</NBButton>
            </div>
          </NBCard>
          </StaggerItem>
          {data.split && (
            <StaggerItem>
            <NBCard>
              <p className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--nb-text-secondary)' }}>
                Last salary: {fmt(data.detected_salary?.amount)}
              </p>
              {[['Save', data.split.save, 'var(--nb-feedback-success)'], ['Bills', data.split.bills, 'var(--nb-brand-500)'], ['Spend', data.split.spend, 'var(--nb-text-tertiary)']].map(([label, amt, color]) => (
                <div key={label} className="flex items-center justify-between py-1.5">
                  <p className="text-sm" style={{ color: 'var(--nb-text-secondary)' }}>{label}</p>
                  <p className="text-sm font-semibold" style={{ color }}>{fmt(amt)}</p>
                </div>
              ))}
            </NBCard>
            </StaggerItem>
          )}
          {!data.split && data.message && (
            <StaggerItem><NBCard><p className="text-sm" style={{ color: 'var(--nb-text-secondary)' }}>{data.message}</p></NBCard></StaggerItem>
          )}
        </Stagger>
      )}

      {!error && data && tab === 'copilot' && (
        <Stagger className="space-y-3">
          {(data.insights || []).map((ins, i) => (
            <StaggerItem key={i}>
              <NBCard>
                <div className="flex items-center justify-between mb-1">
                  <p className="font-medium" style={{ color: 'var(--nb-text-primary)' }}>{ins.title}</p>
                  <NBStatusPill tone={sevTone[ins.severity] || 'neutral'}>{ins.severity}</NBStatusPill>
                </div>
                <p className="text-sm" style={{ color: 'var(--nb-text-secondary)' }}>{ins.body}</p>
              </NBCard>
            </StaggerItem>
          ))}
        </Stagger>
      )}

      {!error && data && tab === 'safe-to-spend' && (
        <Stagger className="space-y-3">
          <StaggerItem>
          <NBCard className="text-center py-6">
            <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--nb-text-secondary)' }}>Safe to spend today</p>
            <p className="text-4xl font-bold my-2" style={{ color: 'var(--nb-brand-600)' }}>{fmt(data.safe_to_spend ?? data.amount ?? data.daily)}</p>
            <p className="text-sm" style={{ color: 'var(--nb-text-secondary)' }}>{data.message || 'After bills, savings goals, and a small buffer.'}</p>
          </NBCard>
          </StaggerItem>
        </Stagger>
      )}
    </div>
  );
};

export default Innovations;
