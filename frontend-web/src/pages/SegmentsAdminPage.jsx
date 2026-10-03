import React, { useCallback, useEffect, useState } from 'react';
import {
  Plus, Pencil, Check, X, Users, LayoutGrid, ChevronDown, ChevronUp,
} from 'lucide-react';
import api from '../services/api';
import { NBButton, NBInput, NBCard, NBStatusPill, NBSkeletonCard } from '../components/ui/nb';

/**
 * Admin: segment + app-store manager.
 * Create/edit market segments and the app tiles each segment offers.
 * Requires an admin or manager role on the API.
 */
const SegmentsAdminPage = () => {
  const [segments, setSegments] = useState(null);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [editingSeg, setEditingSeg] = useState(null); // {key?...} | null
  const [editingApp, setEditingApp] = useState(null); // {segmentKey, app?}
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.get('/admin/segments');
      setSegments(res.segments ?? []);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to load segments.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const flash = (msg) => { setNotice(msg); setTimeout(() => setNotice(null), 3000); };

  const saveSegment = async (form) => {
    try {
      if (editingSeg?.key && segments.some((s) => s.key === editingSeg.key)) {
        await api.patch(`/admin/segments/${editingSeg.key}`, {
          name: form.name, description: form.description, icon: form.icon,
          is_active: form.is_active, sort_order: Number(form.sort_order) || 0,
        });
      } else {
        await api.post('/admin/segments', {
          key: form.key, name: form.name, description: form.description,
          icon: form.icon, is_active: form.is_active ?? true,
          sort_order: Number(form.sort_order) || 0,
        });
      }
      setEditingSeg(null);
      flash('Segment saved.');
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Save failed — admin role required?');
    }
  };

  const saveApp = async (form) => {
    const segKey = editingApp.segmentKey;
    try {
      if (editingApp.app) {
        await api.patch(`/admin/segments/${segKey}/apps/${editingApp.app.key}`, {
          name: form.name, tagline: form.tagline, route: form.route,
          icon: form.icon, is_enabled: form.is_enabled,
          sort_order: Number(form.sort_order) || 0,
        });
      } else {
        await api.post(`/admin/segments/${segKey}/apps`, {
          key: form.key, name: form.name, tagline: form.tagline,
          route: form.route, icon: form.icon, is_enabled: true,
          sort_order: Number(form.sort_order) || 0,
        });
      }
      setEditingApp(null);
      flash('App saved.');
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Save failed — admin role required?');
    }
  };

  const toggleSegment = async (seg) => {
    try {
      await api.post(`/admin/segments/${seg.key}/toggle`);
      flash(`${seg.name} ${seg.is_active ? 'deactivated' : 'activated'}.`);
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Toggle failed — admin role required?');
    }
  };

  const toggleApp = async (segKey, app) => {
    try {
      await api.post(`/admin/segments/${segKey}/apps/${app.key}/toggle`);
      flash(`${app.name} ${app.is_enabled ? 'disabled' : 'enabled'}.`);
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || 'Toggle failed — admin role required?');
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--nb-text-primary)' }}>
            Segments & App Store
          </h1>
          <p className="text-sm" style={{ color: 'var(--nb-text-secondary)' }}>
            Define market segments and curate the apps each one offers. Users join
            segments from the mobile "Apps for You" store.
          </p>
        </div>
        <NBButton onClick={() => setEditingSeg({})}>
          <Plus size={16} className="mr-1 inline" /> New segment
        </NBButton>
      </header>

      {notice && (
        <div
          role="status"
          className="rounded-lg px-4 py-2 text-sm font-medium"
          style={{ background: 'var(--nb-feedback-success-bg)', color: 'var(--nb-feedback-success)' }}
        >
          {notice}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-lg px-4 py-2 text-sm font-medium"
          style={{ background: 'var(--nb-feedback-error-bg)', color: 'var(--nb-feedback-error)' }}
        >
          {error}
        </div>
      )}

      {editingSeg && (
        <SegmentForm
          initial={editingSeg}
          onCancel={() => setEditingSeg(null)}
          onSave={saveSegment}
        />
      )}

      {!segments && !error && (
        <div className="space-y-4" aria-busy="true">
          <NBSkeletonCard /><NBSkeletonCard />
        </div>
      )}

      <div className="space-y-4">
        {(segments ?? []).map((seg) => (
          <NBCard key={seg.key} padding={0} className="overflow-hidden">
            <button
              type="button"
              className="flex w-full items-center gap-3 p-4 text-left"
              style={{ opacity: seg.is_active ? 1 : 0.55 }}
              onClick={() => setExpanded(expanded === seg.key ? null : seg.key)}
              aria-expanded={expanded === seg.key}
            >
              <LayoutGrid size={20} style={{ color: 'var(--nb-brand-600)' }} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="font-semibold" style={{ color: 'var(--nb-text-primary)' }}>
                    {seg.name}
                  </span>
                  <code className="rounded px-1.5 py-0.5 text-xs"
                    style={{ background: 'var(--nb-surface-secondary)', color: 'var(--nb-text-tertiary)' }}>
                    {seg.key}
                  </code>
                  <NBStatusPill tone={seg.is_active ? 'success' : 'pending'}>
                    {seg.is_active ? 'Active' : 'Inactive'}
                  </NBStatusPill>
                </span>
                <span className="block truncate text-sm" style={{ color: 'var(--nb-text-secondary)' }}>
                  {seg.description}
                </span>
              </span>
              <span className="flex items-center gap-1 text-sm" style={{ color: 'var(--nb-text-tertiary)' }}>
                <Users size={14} aria-hidden="true" /> {seg.member_count}
              </span>
              <span
                role="switch"
                aria-checked={seg.is_active}
                aria-label={`${seg.name} ${seg.is_active ? 'active' : 'inactive'} — click to ${seg.is_active ? 'deactivate' : 'activate'}`}
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); toggleSegment(seg); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleSegment(seg); } }}
                style={{
                  width: 44, height: 24, borderRadius: 999, flexShrink: 0, cursor: 'pointer',
                  background: seg.is_active ? 'var(--nb-action-primary-bg)' : 'var(--nb-neutral-300, #cbd5e1)',
                  display: 'inline-flex', alignItems: 'center', padding: 2,
                  transition: 'background 150ms ease',
                }}
              >
                <span style={{
                  width: 20, height: 20, borderRadius: '50%', background: '#fff',
                  transform: seg.is_active ? 'translateX(20px)' : 'translateX(0)',
                  transition: 'transform 150ms ease', boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                }} />
              </span>
              {expanded === seg.key ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>

            {expanded === seg.key && (
              <div className="border-t p-4" style={{ borderColor: 'var(--nb-border-subtle)' }}>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--nb-text-primary)' }}>
                    Apps ({seg.apps?.length ?? 0})
                  </h3>
                  <div className="flex gap-2">
                    <NBButton variant="secondary" size="sm"
                      onClick={() => setEditingSeg({ ...seg })}>
                      <Pencil size={14} className="mr-1 inline" /> Edit segment
                    </NBButton>
                    <NBButton variant="secondary" size="sm"
                      onClick={() => setEditingApp({ segmentKey: seg.key })}>
                      <Plus size={14} className="mr-1 inline" /> Add app
                    </NBButton>
                  </div>
                </div>

                {editingApp?.segmentKey === seg.key && (
                  <AppForm
                    initial={editingApp.app || {}}
                    onCancel={() => setEditingApp(null)}
                    onSave={saveApp}
                  />
                )}

                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ color: 'var(--nb-text-tertiary)' }}>
                      <th className="py-2 text-left font-medium">App</th>
                      <th className="text-left font-medium">Route</th>
                      <th className="text-left font-medium">Status</th>
                      <th className="text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(seg.apps ?? []).map((app) => (
                      <tr key={app.key} className="border-t" style={{ borderColor: 'var(--nb-border-subtle)' }}>
                        <td className="py-2">
                          <span className="font-medium" style={{ color: 'var(--nb-text-primary)' }}>{app.name}</span>
                          <span className="block text-xs" style={{ color: 'var(--nb-text-tertiary)' }}>{app.tagline}</span>
                        </td>
                        <td><code className="text-xs" style={{ color: 'var(--nb-text-secondary)' }}>{app.route}</code></td>
                        <td>
                          <NBStatusPill tone={app.is_enabled ? 'success' : 'pending'}>
                            {app.is_enabled ? 'Enabled' : 'Disabled'}
                          </NBStatusPill>
                        </td>
                        <td className="text-right">
                          <NBButton variant="ghost" size="sm"
                            onClick={() => toggleApp(seg.key, app)}
                            aria-label={`${app.is_enabled ? 'Disable' : 'Enable'} ${app.name}`}>
                            {app.is_enabled ? 'Disable' : 'Enable'}
                          </NBButton>
                          <NBButton variant="ghost" size="sm"
                            onClick={() => setEditingApp({ segmentKey: seg.key, app })}>
                            Edit
                          </NBButton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </NBCard>
        ))}
      </div>
    </div>
  );
};

const SegmentForm = ({ initial, onSave, onCancel }) => {
  const [form, setForm] = useState({
    key: '', name: '', description: '', icon: '', is_active: true, sort_order: 0, ...initial,
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target ? e.target.value : e });
  return (
    <NBCard>
      <h2 className="mb-4 font-semibold" style={{ color: 'var(--nb-text-primary)' }}>
        {initial.key ? 'Edit segment' : 'New segment'}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <NBInput label="Key (unique, e.g. students)" value={form.key} onChange={set('key')} disabled={!!initial.key} />
        <NBInput label="Name" value={form.name} onChange={set('name')} />
        <NBInput label="Icon (lucide name)" value={form.icon || ''} onChange={set('icon')} />
        <NBInput label="Sort order" type="number" value={form.sort_order} onChange={set('sort_order')} />
        <div className="sm:col-span-2">
          <NBInput label="Description" value={form.description || ''} onChange={set('description')} />
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <NBButton onClick={() => onSave(form)} disabled={!form.key || !form.name}>
          <Check size={16} className="mr-1 inline" /> Save
        </NBButton>
        <NBButton variant="ghost" onClick={onCancel}><X size={16} className="mr-1 inline" /> Cancel</NBButton>
      </div>
    </NBCard>
  );
};

const AppForm = ({ initial, onSave, onCancel }) => {
  const [form, setForm] = useState({
    key: '', name: '', tagline: '', route: '', icon: '', is_enabled: true, sort_order: 0, ...initial,
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <div className="mb-4 rounded-lg border p-4" style={{ borderColor: 'var(--nb-border-default)', background: 'var(--nb-surface-secondary)' }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <NBInput label="App key" value={form.key} onChange={set('key')} disabled={!!initial.key} />
        <NBInput label="Name" value={form.name} onChange={set('name')} />
        <NBInput label="Route (e.g. /savings?preset=payday)" value={form.route} onChange={set('route')} />
        <NBInput label="Icon" value={form.icon || ''} onChange={set('icon')} />
        <NBInput label="Tagline" value={form.tagline || ''} onChange={set('tagline')} />
        <NBInput label="Sort order" type="number" value={form.sort_order} onChange={set('sort_order')} />
      </div>
      <div className="mt-3 flex gap-2">
        <NBButton size="sm" onClick={() => onSave(form)} disabled={!form.key || !form.name || !form.route}>
          Save app
        </NBButton>
        <NBButton size="sm" variant="ghost" onClick={onCancel}>Cancel</NBButton>
      </div>
    </div>
  );
};

export default SegmentsAdminPage;
