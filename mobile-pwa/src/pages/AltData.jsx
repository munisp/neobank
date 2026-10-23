import React, { useCallback, useEffect, useState } from 'react';
import { Database, MessageSquare, FileText, Radio, Zap, Link2, Trash2 } from 'lucide-react';
import { ApiService } from '../services/ApiService';
import {
  NBButton, NBCard, NBStatusPill, NBSkeletonCard, NBErrorState,
  Stagger, StaggerItem, useHaptics,
} from '../components/ui/nb';

const fmt = (n) => `₦${Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

const SOURCES = [
  { key: 'sms', name: 'Bank SMS alerts', icon: MessageSquare,
    hint: 'Forward credit/debit alerts from your other banks — proves income that lands elsewhere' },
  { key: 'statement', name: 'Bank statement', icon: FileText,
    hint: 'Upload a CSV statement from any bank or mobile-money app' },
  { key: 'aggregator', name: 'Linked bank accounts', icon: Link2,
    hint: 'Secure open-banking connection (Mono/Okra) — strongest evidence' },
  { key: 'telco', name: 'Airtime & data history', icon: Radio,
    hint: 'Regular top-ups show stable cashflow' },
  { key: 'utility', name: 'Utility bills', icon: Zap,
    hint: 'Power, water, TV payments prove address and tenure' },
];

/**
 * Credit Data — NDPR consent centre for alternative data. Users see exactly
 * which sources feed their credit score, grant or revoke consent per source
 * (revocation deletes the data), and watch their evidence base grow.
 */
const AltData = () => {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState('');
  const haptics = useHaptics();

  const load = useCallback(async () => {
    setError(false);
    try {
      const d = await ApiService.get('/alt-data/summary');
      setSummary(d);
    } catch (err) {
      setError(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const grant = async (source) => {
    setBusy(source);
    try {
      await ApiService.post('/alt-data/consent', { source });
      haptics.success();
      await load();
    } finally {
      setBusy('');
    }
  };

  const withdraw = async (source) => {
    setBusy(source);
    try {
      await ApiService.delete(`/alt-data/consent/${source}`);
      haptics.tap();
      await load();
    } finally {
      setBusy('');
    }
  };

  if (error) return <NBErrorState title="Credit data unavailable" message="We couldn't load your data consents. Try again." onRetry={load} />;
  if (!summary) return <div className="p-4 space-y-3"><NBSkeletonCard /><NBSkeletonCard /></div>;

  const active = new Set(summary.sources_active || []);

  return (
    <div className="p-4 pb-24 space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--nb-text-primary)' }}>Credit Data</h1>
        <p className="text-sm" style={{ color: 'var(--nb-text-secondary)' }}>
          Your score grows with evidence. Choose what counts — revoke anytime and the data is deleted.
        </p>
      </div>

      <NBCard>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database size={18} style={{ color: 'var(--nb-brand-600)' }} />
            <p className="font-medium" style={{ color: 'var(--nb-text-primary)' }}>Evidence base</p>
          </div>
          <NBStatusPill tone={active.size > 0 ? 'success' : 'neutral'}>
            {active.size} source{active.size === 1 ? '' : 's'} active
          </NBStatusPill>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <div>
            <p className="text-xs" style={{ color: 'var(--nb-text-secondary)' }}>External income found</p>
            <p className="font-bold" style={{ color: 'var(--nb-text-primary)' }}>{fmt(summary.external_monthly_income)}</p>
          </div>
          <div>
            <p className="text-xs" style={{ color: 'var(--nb-text-secondary)' }}>Signals (180 days)</p>
            <p className="font-bold" style={{ color: 'var(--nb-text-primary)' }}>{summary.signal_count_180d || 0}</p>
          </div>
        </div>
        {summary.external_income_corroborated && (
          <p className="text-xs mt-2" style={{ color: 'var(--nb-success-600, green)' }}>
            External income matches your account activity — fully counted toward your score.
          </p>
        )}
      </NBCard>

      <Stagger className="space-y-2">
        {SOURCES.map((s) => {
          const Icon = s.icon;
          const isActive = active.has(s.key);
          return (
            <StaggerItem key={s.key}>
              <NBCard className="flex items-center justify-between">
                <div className="flex items-start gap-3">
                  <Icon size={20} style={{ color: 'var(--nb-brand-600)', marginTop: 2 }} />
                  <div>
                    <p className="font-medium" style={{ color: 'var(--nb-text-primary)' }}>{s.name}</p>
                    <p className="text-xs" style={{ color: 'var(--nb-text-secondary)' }}>{s.hint}</p>
                  </div>
                </div>
                {isActive ? (
                  <NBButton variant="ghost" onClick={() => withdraw(s.key)} disabled={busy === s.key}>
                    <Trash2 size={14} /> Revoke
                  </NBButton>
                ) : (
                  <NBButton variant="secondary" onClick={() => grant(s.key)} disabled={busy === s.key}>
                    {busy === s.key ? 'Enabling…' : 'Enable'}
                  </NBButton>
                )}
              </NBCard>
            </StaggerItem>
          );
        })}
      </Stagger>

      <p className="text-xs text-center" style={{ color: 'var(--nb-text-tertiary)' }}>
        Protected under NDPR — data is used only for your credit assessment and deleted on revocation.
      </p>
    </div>
  );
};

export default AltData;
