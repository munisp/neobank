import React, { useCallback, useEffect, useState } from 'react';
import { Gift, Users, Star, Copy, Check } from 'lucide-react';
import { ApiService } from '../services/ApiService';
import {
  NBButton, NBCard, NBStatusPill, NBSkeletonCard, NBErrorState,
  Pressable, Stagger, StaggerItem, useHaptics,
} from '../components/ui/nb';

const list = (d, key) => d?.[key] || d?.items || (Array.isArray(d) ? d : []);

/**
 * Rewards — points balance, tiers, partner offers, and referrals.
 * Backed by the rewards-go service.
 */
const Rewards = () => {
  const [summary, setSummary] = useState(null);
  const [programs, setPrograms] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [referral, setReferral] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const haptics = useHaptics();

  const load = useCallback(async () => {
    setError(false);
    try {
      const [s, p, t, r] = await Promise.all([
        ApiService.get('/rewards/summary').catch(() => null),
        ApiService.get('/rewards/programs').catch(() => null),
        ApiService.get('/rewards/tiers').catch(() => null),
        ApiService.get('/rewards/referral-code').catch(() => null),
      ]);
      setSummary(s || {});
      setPrograms(list(p, 'programs'));
      setTiers(list(t, 'tiers'));
      setReferral(r?.code || r?.referral_code || null);
    } catch (e) {
      setError(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const copyCode = async () => {
    if (!referral) return;
    try { await navigator.clipboard.writeText(referral); } catch (e) { /* clipboard unavailable */ }
    setCopied(true);
    haptics.tap();
    setTimeout(() => setCopied(false), 1500);
  };

  if (error) return <NBErrorState title="Rewards unavailable" message="We couldn't load your rewards. Try again." onRetry={load} />;
  if (!summary) return <div className="p-4 space-y-3"><NBSkeletonCard /><NBSkeletonCard /></div>;

  const points = summary.points_balance ?? summary.points ?? 0;
  const cashback = summary.cashback_balance ?? summary.cashback ?? 0;
  const tier = summary.tier || 'Standard';

  return (
    <div className="p-4 pb-24 space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--nb-text-primary)' }}>Rewards</h1>
        <p className="text-sm" style={{ color: 'var(--nb-text-secondary)' }}>Every naira you spend should say thank you.</p>
      </div>

      <NBCard style={{ background: 'linear-gradient(135deg, var(--nb-brand-600), var(--nb-brand-800, var(--nb-brand-600)))' }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.8)' }}>Points balance</p>
            <p className="text-3xl font-bold" style={{ color: '#fff' }}>{Number(points).toLocaleString()}</p>
            {cashback > 0 && <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.9)' }}>+ ₦{Number(cashback).toLocaleString()} cashback pending</p>}
          </div>
          <NBStatusPill tone="neutral"><Star size={13} className="inline -mt-0.5" /> {tier}</NBStatusPill>
        </div>
      </NBCard>

      {referral && (
        <NBCard>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users size={18} style={{ color: 'var(--nb-brand-600)' }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--nb-text-primary)' }}>Invite friends, earn together</p>
                <p className="text-xs" style={{ color: 'var(--nb-text-secondary)' }}>Your code: <span className="font-mono font-bold">{referral}</span></p>
              </div>
            </div>
            <Pressable onClick={copyCode} className="p-2 rounded-lg" style={{ background: 'var(--nb-surface-secondary)' }}>
              {copied ? <Check size={16} style={{ color: 'var(--nb-feedback-success)' }} /> : <Copy size={16} style={{ color: 'var(--nb-text-secondary)' }} />}
            </Pressable>
          </div>
        </NBCard>
      )}

      <div>
        <h3 className="font-semibold mb-2" style={{ color: 'var(--nb-text-primary)' }}>Ways to earn</h3>
        {programs.length === 0 ? (
          <NBCard className="text-center py-6">
            <Gift className="mx-auto mb-2" size={32} style={{ color: 'var(--nb-text-tertiary)' }} />
            <p className="text-sm" style={{ color: 'var(--nb-text-secondary)' }}>Programs load here — spend, save, refer, repeat.</p>
          </NBCard>
        ) : (
          <Stagger className="space-y-2">
            {programs.map((p) => (
              <StaggerItem key={p.id || p.name}>
                <NBCard className="flex items-center justify-between">
                  <div>
                    <p className="font-medium" style={{ color: 'var(--nb-text-primary)' }}>{p.name}</p>
                    <p className="text-xs" style={{ color: 'var(--nb-text-secondary)' }}>{p.description || p.earn_rate || ''}</p>
                  </div>
                  {p.multiplier && <NBStatusPill tone="brand">{p.multiplier}×</NBStatusPill>}
                </NBCard>
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </div>

      {tiers.length > 0 && (
        <div>
          <h3 className="font-semibold mb-2" style={{ color: 'var(--nb-text-primary)' }}>Tiers</h3>
          <Stagger className="space-y-2">
            {tiers.map((t) => (
              <StaggerItem key={t.name || t.id}>
                <NBCard className="flex items-center justify-between">
                  <div>
                    <p className="font-medium" style={{ color: 'var(--nb-text-primary)' }}>{t.name}</p>
                    <p className="text-xs" style={{ color: 'var(--nb-text-secondary)' }}>{t.requirement || ''}</p>
                  </div>
                  <NBStatusPill tone={t.name === tier ? 'success' : 'neutral'}>{t.name === tier ? 'Current' : t.perks || ''}</NBStatusPill>
                </NBCard>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      )}

      <NBButton variant="primary" style={{ width: '100%' }} onClick={() => ApiService.post('/rewards/redeem/cashback', {}).then(load).catch(() => {})}>
        Redeem cashback
      </NBButton>
    </div>
  );
};

export default Rewards;
