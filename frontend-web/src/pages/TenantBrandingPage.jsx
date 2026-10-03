import React, { useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { TENANT_ROSTER, applyTenantTheme, getStoredTenant, tonalRamp, contrastRatio, ensureContrast } from '@/design/tenantTheme';
import { NBButton } from '@/components/ui/nb/index.js';

/**
 * Tenant Branding Editor (Sections 5 + 7.9): pick a seed color, radius bias
 * and motion personality; preview live on real components; instant contrast
 * validation against the WCAG floors (4.5:1 text, 3:1 interactive) — the
 * guardrails are visible and explained, never silently failing.
 */
export default function TenantBrandingPage() {
  const [tenant, setTenant] = useState(getStoredTenant());
  const [seed, setSeed] = useState(tenant.seedColor);
  const [radiusBias, setRadiusBias] = useState(tenant.radiusBias || 'default');
  const [motion, setMotion] = useState(tenant.motionPersonality || 'measured');

  const ramp = useMemo(() => tonalRamp(/^#[0-9a-fA-F]{6}$/.test(seed) ? seed : '#3D52E0'), [seed]);

  const checks = useMemo(() => {
    const action = ramp[600];
    return [
      { label: 'Action color vs white text', fg: action, bg: '#FFFFFF', floor: 4.5 },
      { label: 'Action color as focus ring on white', fg: ramp[500], bg: '#FFFFFF', floor: 3.0 },
      { label: 'Brand 700 text on brand-50 surface', fg: ramp[700], bg: ramp[50], floor: 4.5 },
    ].map((c) => ({ ...c, ratio: contrastRatio(c.fg, c.bg) }));
  }, [ramp]);

  const publish = () => {
    const pack = { ...tenant, seedColor: seed, radiusBias, motionPersonality: motion };
    applyTenantTheme(pack);
    setTenant(pack);
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, color: 'var(--nb-text-primary)' }}>Tenant branding</h1>
      <p style={{ color: 'var(--nb-text-secondary)', fontSize: 14, margin: '4px 0 24px' }}>
        One system, many faces. Tenants control brand expression — never layout, spacing, or accessibility behavior.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 24 }}>
        {/* Editor */}
        <div className="nb-card" style={{ padding: 24 }}>
          <h2 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 16px', color: 'var(--nb-text-primary)' }}>Brand pack</h2>

          <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6, color: 'var(--nb-text-primary)' }}>Brand seed color</label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20 }}>
            <input type="color" value={seed} onChange={(e) => setSeed(e.target.value)}
              aria-label="Brand seed color" style={{ width: 48, height: 48, border: '1px solid var(--nb-border-subtle)', borderRadius: 'var(--nb-radius-xs)', padding: 2, background: 'none', cursor: 'pointer' }} />
            <code className="tabular" style={{ fontSize: 15, color: 'var(--nb-text-primary)' }}>{seed}</code>
          </div>

          <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6, color: 'var(--nb-text-primary)' }}>Shape personality</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {[['sharp', 'Sharper — traditional'], ['default', 'Default'], ['round', 'Rounder — friendly']].map(([v, l]) => (
              <NBButton key={v} size="sm" variant={radiusBias === v ? 'primary' : 'secondary'} onClick={() => setRadiusBias(v)} aria-pressed={radiusBias === v}>{l}</NBButton>
            ))}
          </div>

          <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6, color: 'var(--nb-text-primary)' }}>Motion personality</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
            {[['measured', 'Measured'], ['expressive', 'Expressive']].map(([v, l]) => (
              <NBButton key={v} size="sm" variant={motion === v ? 'primary' : 'secondary'} onClick={() => setMotion(v)} aria-pressed={motion === v}>{l}</NBButton>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {TENANT_ROSTER.map((t) => (
              <NBButton key={t.tenantId} size="sm" variant="ghost" onClick={() => { setSeed(t.seedColor); setRadiusBias(t.radiusBias); applyTenantTheme(t); setTenant(t); }}>
                Load {t.displayName}
              </NBButton>
            ))}
          </div>

          <NBButton variant="primary" style={{ width: '100%', marginTop: 20 }} onClick={publish}>
            Publish theme
          </NBButton>
        </div>

        {/* Live preview + validation */}
        <div>
          <div className="nb-card" style={{ padding: 24, marginBottom: 16 }}>
            <h2 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 16px', color: 'var(--nb-text-primary)' }}>Live preview</h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              <span style={{ background: ramp[600], color: '#fff', padding: '12px 24px', borderRadius: RADIUS[radiusBias], fontWeight: 600, fontSize: 15 }}>Primary action</span>
              <span style={{ background: ramp[50], color: ramp[700], padding: '12px 24px', borderRadius: RADIUS[radiusBias], fontWeight: 600, fontSize: 15 }}>Brand surface</span>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {Object.values(ramp).map((c) => (
                <div key={c} title={c} style={{ flex: 1, height: 32, background: c, borderRadius: 4 }} />
              ))}
            </div>
          </div>

          <div className="nb-card" style={{ padding: 24 }}>
            <h2 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 12px', color: 'var(--nb-text-primary)' }}>Contrast gates (WCAG 2.2 AA)</h2>
            {checks.map((c) => (
              <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: '1px solid var(--nb-border-subtle)', fontSize: 14 }}>
                {c.ratio >= c.floor
                  ? <CheckCircle2 size={18} color="var(--nb-feedback-success)" aria-label="Passes" />
                  : <AlertTriangle size={18} color="var(--nb-feedback-error)" aria-label="Fails — will be auto-adjusted" />}
                <span style={{ flex: 1, color: 'var(--nb-text-primary)' }}>{c.label}</span>
                <span className="tabular" style={{ fontWeight: 600, color: c.ratio >= c.floor ? 'var(--nb-feedback-success)' : 'var(--nb-feedback-error)' }}>
                  {c.ratio.toFixed(2)}:1 {c.ratio < c.floor && `(needs ${c.floor}:1 — auto-corrected on publish)`}
                </span>
              </div>
            ))}
            <p style={{ fontSize: 12, color: 'var(--nb-text-secondary)', margin: '12px 0 0' }}>
              Failing pairs are darkened/lightened to the nearest passing tone and the change is logged — themes never ship below the floor.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

const RADIUS = { sharp: '6px', default: '12px', round: '16px' };
