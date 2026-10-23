import React, { useCallback, useEffect, useState } from 'react';
import { Sparkles, Repeat, TrendingUp, Bell, ThumbsUp, ThumbsDown } from 'lucide-react';
import { ApiService } from '../services/ApiService';
import { NBCard, NBStatusPill, NBSkeletonCard, NBErrorState, useHaptics } from '../components/ui/nb';

export default function Intelligence() {
  const [nextActions, setNextActions] = useState([]);
  const [dueSoon, setDueSoon] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const haptics = useHaptics();

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [na, due, rec] = await Promise.all([
        ApiService.get('/intelligence/next-actions', { limit: 4 }),
        ApiService.get('/intelligence/recurring/due-soon'),
        ApiService.get('/intelligence/recurring'),
      ]);
      setNextActions(na?.suggestions || []);
      setDueSoon(due?.due || []);
      setRecurring(rec?.patterns || []);
    } catch (err) {
      setError(err.message || 'Failed to load insights');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const feedback = async (suggestionId, accepted) => {
    try {
      await ApiService.post(`/intelligence/suggestions/${encodeURIComponent(suggestionId)}/feedback`, { accepted });
      haptics.tap();
      setNextActions((prev) => prev.filter((s) => s.suggestion_id !== suggestionId));
    } catch (err) {
      haptics.error();
    }
  };

  if (loading) return <div className="p-4"><NBSkeletonCard /></div>;
  if (error) return <div className="p-4"><NBErrorState title="Insights unavailable" body={error} onRetry={load} /></div>;

  return (
    <div className="p-4 space-y-6">
      <header className="flex items-center gap-2">
        <Sparkles className="w-5 h-5" />
        <h1 className="text-lg font-semibold">Smart For You</h1>
      </header>

      <section>
        <h2 className="text-sm font-medium mb-2">Suggested next actions</h2>
        {nextActions.length === 0 && (
          <p className="text-sm opacity-70">Use the app a little more and suggestions will appear here.</p>
        )}
        <div className="grid gap-2">
          {nextActions.map((s) => (
            <NBCard key={s.suggestion_id} className="flex items-center justify-between p-3">
              <div>
                <div className="font-medium">{s.label}</div>
                <NBStatusPill tone="info">{Math.round(s.score * 100)}% likely</NBStatusPill>
              </div>
              <div className="flex gap-2">
                <button aria-label="accept" onClick={() => feedback(s.suggestion_id, true)}>
                  <ThumbsUp className="w-4 h-4" />
                </button>
                <button aria-label="dismiss" onClick={() => feedback(s.suggestion_id, false)}>
                  <ThumbsDown className="w-4 h-4" />
                </button>
              </div>
            </NBCard>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium mb-2 flex items-center gap-1">
          <Bell className="w-4 h-4" /> Coming up
        </h2>
        {dueSoon.length === 0 && <p className="text-sm opacity-70">No recurring payments due soon.</p>}
        <div className="grid gap-2">
          {dueSoon.map((p) => (
            <NBCard key={p.counterparty} className="flex items-center justify-between p-3">
              <div>
                <div className="font-medium capitalize">{p.counterparty}</div>
                <div className="text-xs opacity-70">{p.cadence} · avg {p.average_amount}</div>
              </div>
              <NBStatusPill tone={p.days_until <= 1 ? 'warning' : 'pending'}>
                {p.days_until <= 0 ? 'due now' : `in ${p.days_until}d`}
              </NBStatusPill>
            </NBCard>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium mb-2 flex items-center gap-1">
          <Repeat className="w-4 h-4" /> Detected recurring payments
        </h2>
        <div className="grid gap-2">
          {recurring.map((p) => (
            <NBCard key={p.counterparty} className="flex items-center justify-between p-3">
              <div>
                <div className="font-medium capitalize">{p.counterparty}</div>
                <div className="text-xs opacity-70">{p.occurrences}× {p.cadence}</div>
              </div>
              <div className="flex items-center gap-1 text-sm">
                <TrendingUp className="w-4 h-4" /> {p.average_amount}
              </div>
            </NBCard>
          ))}
          {recurring.length === 0 && (
            <p className="text-sm opacity-70">No patterns detected yet — recurring payments will be spotted automatically.</p>
          )}
        </div>
      </section>
    </div>
  );
}
