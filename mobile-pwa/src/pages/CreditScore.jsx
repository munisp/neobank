import React, { useCallback, useEffect, useState } from 'react';
import { Gauge, TrendingUp, ShieldCheck, Lightbulb } from 'lucide-react';
import { ApiService } from '../services/ApiService';
import {
  NBCard, NBStatusPill, NBSkeletonCard, NBErrorState, useHaptics,
} from '../components/ui/nb';

const fmt = (n) => `₦${Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

const GRADE_TONE = { A: 'success', B: 'success', C: 'brand', D: 'warning', E: 'danger' };
const GRADE_LABEL = {
  A: 'Excellent', B: 'Very good', C: 'Fair', D: 'Building', E: 'Getting started',
};

/**
 * Credit Score — real score from the decision pipeline: credit_mlp PD +
 * authenticity engine + policy rules, blended into 300–850 with grade,
 * verified-income limit, and personalised improvement tips.
 */
const CreditScore = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const haptics = useHaptics();

  const load = useCallback(async () => {
    setError(false);
    try {
      const d = await ApiService.get('/credit/score');
      setData(d);
    } catch (err) {
      setError(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) return <NBErrorState title="Credit score unavailable" message="We couldn't compute your score right now. Try again." onRetry={load} />;
  if (!data) return <div className="p-4 space-y-3"><NBSkeletonCard /><NBSkeletonCard /></div>;

  const score = data.credit_score || 300;
  const pct = Math.max(0, Math.min(100, ((score - 300) / 550) * 100));
  const grade = data.grade || 'E';
  const completeness = Math.round((data.data_completeness || 0) * 100);

  return (
    <div className="p-4 pb-24 space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--nb-text-primary)' }}>Credit Score</h1>
        <p className="text-sm" style={{ color: 'var(--nb-text-secondary)' }}>Built from how you actually bank — no payslip needed.</p>
      </div>

      <NBCard className="text-center py-6">
        <div className="relative inline-flex items-center justify-center">
          <svg width="160" height="160" viewBox="0 0 160 160">
            <circle cx="80" cy="80" r="70" fill="none" stroke="var(--nb-border-subtle)" strokeWidth="10" />
            <circle cx="80" cy="80" r="70" fill="none" stroke="var(--nb-brand-600)" strokeWidth="10"
              strokeLinecap="round" strokeDasharray={`${(pct / 100) * 440} 440`}
              transform="rotate(-90 80 80)" style={{ transition: 'stroke-dasharray 0.8s ease' }} />
          </svg>
          <div className="absolute">
            <p className="text-4xl font-bold" style={{ color: 'var(--nb-text-primary)' }}>{score}</p>
            <p className="text-xs" style={{ color: 'var(--nb-text-secondary)' }}>out of 850</p>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-center gap-2">
          <NBStatusPill tone={GRADE_TONE[grade]}>Grade {grade} · {GRADE_LABEL[grade]}</NBStatusPill>
        </div>
      </NBCard>

      <div className="grid grid-cols-2 gap-2">
        <NBCard>
          <TrendingUp size={18} style={{ color: 'var(--nb-brand-600)' }} />
          <p className="text-xs mt-2" style={{ color: 'var(--nb-text-secondary)' }}>Credit limit</p>
          <p className="text-lg font-bold" style={{ color: 'var(--nb-text-primary)' }}>{fmt(data.max_limit)}</p>
        </NBCard>
        <NBCard>
          <ShieldCheck size={18} style={{ color: 'var(--nb-brand-600)' }} />
          <p className="text-xs mt-2" style={{ color: 'var(--nb-text-secondary)' }}>Verified income</p>
          <p className="text-lg font-bold" style={{ color: 'var(--nb-text-primary)' }}>{fmt(data.verified_monthly_income)}</p>
        </NBCard>
      </div>

      <NBCard>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium" style={{ color: 'var(--nb-text-primary)' }}>Profile completeness</p>
          <p className="text-sm font-bold" style={{ color: 'var(--nb-brand-600)' }}>{completeness}%</p>
        </div>
        <div className="h-2 rounded-full" style={{ background: 'var(--nb-border-subtle)' }}>
          <div className="h-2 rounded-full" style={{ width: `${completeness}%`, background: 'var(--nb-brand-600)', transition: 'width 0.6s ease' }} />
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--nb-text-secondary)' }}>
          More history = higher confidence = better limits.
        </p>
      </NBCard>

      {(data.tips || []).length > 0 && (
        <div>
          <h3 className="font-semibold mb-2 flex items-center gap-1.5" style={{ color: 'var(--nb-text-primary)' }}>
            <Lightbulb size={16} /> Improve your score
          </h3>
          <div className="space-y-2">
            {data.tips.map((tip, i) => (
              <NBCard key={i} className="py-3">
                <p className="text-sm" style={{ color: 'var(--nb-text-primary)' }}>{tip}</p>
              </NBCard>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-center" style={{ color: 'var(--nb-text-tertiary)' }}>
        Score model {data.model_version || 'rules-only'} · updates as your account activity grows
      </p>
    </div>
  );
};

export default CreditScore;
