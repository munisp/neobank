import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  GraduationCap, Store, Bike, Medal, Briefcase, HandHeart, Users,
  CalendarClock, Wifi, Trophy, BookOpen, ShieldCheck, CreditCard,
  FileText, Package, Wallet, Repeat, Fuel, Calculator, PieChart,
  MapPin, CalendarCheck, HandCoins, TrendingUp, UsersRound, Lock,
  ChevronRight, Check, Plus, LayoutGrid,
  Globe, SendHorizontal, LineChart, Home, Sprout, CalendarDays,
  Tractor, Warehouse, Baby, School, PiggyBank,
  Coins, SplitSquareHorizontal, Sparkles, DollarSign, Building, Radar, Puzzle,
} from 'lucide-react';
import { ApiService } from '../services/ApiService';
import { NBCard } from '../components/ui/nb';
import { NBSkeletonCard } from '../components/ui/nb';
import { NBEmptyState, NBErrorState } from '../components/ui/nb';
import { NBOfflineBanner } from '../components/ui/nb';
import { Pressable, Stagger, StaggerItem } from '../components/ui/nb';

// Segment/app icons are stored as lucide names in the catalog — resolve
// dynamically with a safe fallback.
const ICONS = {
  GraduationCap, Store, Bike, Medal, Briefcase, HandHeart, Users,
  CalendarClock, Wifi, Trophy, BookOpen, ShieldCheck, CreditCard,
  FileText, Package, Wallet, Repeat, Fuel, Calculator, PieChart,
  MapPin, CalendarCheck, HandCoins, TrendingUp, UsersRound, Lock,
  Globe, SendHorizontal, LineChart, Home, Sprout, CalendarDays,
  Tractor, Warehouse, Baby, School, PiggyBank,
  Coins, SplitSquareHorizontal, Sparkles, DollarSign, Building, Radar, Puzzle,
};
const AppIcon = ({ name, size = 22 }) => {
  const Cmp = ICONS[name] || LayoutGrid;
  return <Cmp size={size} aria-hidden="true" />;
};

const SegmentSection = ({ title, subtitle, segments, onEnroll, enrolling }) => (
  <section aria-label={title} className="space-y-4">
    <div>
      <h2 className="text-lg font-semibold" style={{ color: 'var(--nb-text-primary)' }}>{title}</h2>
      {subtitle && (
        <p className="text-sm" style={{ color: 'var(--nb-text-secondary)' }}>{subtitle}</p>
      )}
    </div>
    <Stagger className="space-y-4">
    {segments.map((seg, i) => (
      <StaggerItem key={seg.key}>
      <NBCard className="overflow-hidden" padding={0}>
        <div
          className="h-1.5"
          style={{ background: `var(--nb-acct-0${(i % 8) + 1})` }}
          aria-hidden="true"
        />
        <div className="p-4">
          <div className="flex items-start gap-3">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
              style={{
                background: 'var(--nb-brand-50)',
                color: 'var(--nb-brand-600)',
              }}
            >
              <AppIcon name={seg.icon} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold" style={{ color: 'var(--nb-text-primary)' }}>
                  {seg.name}
                </h3>
                <button
                  type="button"
                  onClick={() => onEnroll(seg)}
                  disabled={seg.enrolled || enrolling === seg.key}
                  className="nb-btn nb-btn--sm"
                  style={{
                    minHeight: 36,
                    borderRadius: 'var(--nb-radius-full, 999px)',
                    padding: '0 14px',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: seg.enrolled ? 'default' : 'pointer',
                    border: 'none',
                    background: seg.enrolled ? 'var(--nb-feedback-success-bg)' : 'var(--nb-action-primary-bg)',
                    color: seg.enrolled ? 'var(--nb-feedback-success)' : 'var(--nb-action-primary-text)',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}
                  aria-label={seg.enrolled ? `Joined ${seg.name}` : `Join ${seg.name}`}
                >
                  {seg.enrolled ? <><Check size={14} /> Joined</> : <><Plus size={14} /> Join</>}
                </button>
              </div>
              {seg.description && (
                <p className="mt-0.5 text-sm" style={{ color: 'var(--nb-text-secondary)' }}>
                  {seg.description}
                </p>
              )}
            </div>
          </div>

          {seg.apps?.length > 0 && (
            <ul className="mt-3 divide-y" style={{ borderColor: 'var(--nb-border-subtle)' }}>
              {seg.apps.map((app) => (
                <li key={app.key}>
                  <AppTile app={app} locked={!seg.enrolled} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </NBCard>
      </StaggerItem>
    ))}
    </Stagger>
  </section>
);

const AppTile = ({ app, locked }) => {
  const navigate = useNavigate();
  return (
    <Pressable
      onClick={() => !locked && navigate(app.route)}
      disabled={locked}
      haptic={!locked}
      className="flex w-full items-center gap-3 py-3 text-left"
      style={{ minHeight: 56, cursor: locked ? 'not-allowed' : 'pointer', opacity: locked ? 0.55 : 1, background: 'none', border: 'none' }}
      aria-label={locked ? `${app.name} — join this segment to use` : `Open ${app.name}`}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{ background: 'var(--nb-surface-secondary)', color: 'var(--nb-text-secondary)' }}
      >
        <AppIcon name={app.icon} size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium" style={{ color: 'var(--nb-text-primary)' }}>
          {app.name}
        </span>
        {app.tagline && (
          <span className="block truncate text-xs" style={{ color: 'var(--nb-text-tertiary)' }}>
            {app.tagline}
          </span>
        )}
      </span>
      {locked
        ? <Lock size={16} style={{ color: 'var(--nb-text-tertiary)' }} aria-hidden="true" />
        : <ChevronRight size={18} style={{ color: 'var(--nb-text-tertiary)' }} aria-hidden="true" />}
    </Pressable>
  );
};

/**
 * "For You" — the segmentation app store. Shows apps for the segments the
 * user has joined first, then a discovery catalog of other segments they
 * can join in one tap.
 */
const AppStore = () => {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [enrolling, setEnrolling] = useState(null);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await ApiService.get('/app-store');
      setData(res);
      setStatus('ready');
    } catch (err) {
      console.error('Failed to load app store:', err);
      setStatus('error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleEnroll = async (seg) => {
    setEnrolling(seg.key);
    try {
      await ApiService.post('/app-store/enroll', { segment_key: seg.key });
      await load();
    } catch (err) {
      console.error('Enroll failed:', err);
    } finally {
      setEnrolling(null);
    }
  };

  if (status === 'loading') {
    return (
      <div className="space-y-4 p-4" aria-busy="true" aria-label="Loading your apps">
        <NBSkeletonCard /><NBSkeletonCard /><NBSkeletonCard />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="p-4">
        <NBErrorState
          title="Couldn't load your apps"
          body="Check your connection and try again."
          onRetry={load}
        />
      </div>
    );
  }

  const forYou = data?.for_you ?? [];
  const discover = data?.discover ?? [];

  return (
    <div className="space-y-6 p-4 pb-24">
      <NBOfflineBanner />
      <header>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--nb-text-primary)' }}>
          Apps for you
        </h1>
        <p className="text-sm" style={{ color: 'var(--nb-text-secondary)' }}>
          Join a segment to unlock apps built for how you use money.
        </p>
      </header>

      {forYou.length > 0 ? (
        <SegmentSection
          title="For you"
          subtitle="Apps from the segments you've joined"
          segments={forYou}
          onEnroll={handleEnroll}
          enrolling={enrolling}
        />
      ) : (
        <NBEmptyState
          title="No segments yet"
          body="Join a segment below and your apps will show up here."
        />
      )}

      {discover.length > 0 && (
        <SegmentSection
          title="Discover"
          subtitle="More segments on the platform"
          segments={discover}
          onEnroll={handleEnroll}
          enrolling={enrolling}
        />
      )}
    </div>
  );
};

export default AppStore;
