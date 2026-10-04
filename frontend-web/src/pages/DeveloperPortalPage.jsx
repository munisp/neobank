import React, { useCallback, useEffect, useState } from 'react';
import { Code2, Plus, Send, KeyRound, Check, X, Rocket } from 'lucide-react';
import api from '../services/api';
import { NBButton, NBInput, NBCard, NBStatusPill, NBSkeletonCard } from '../components/ui/nb';

const STATUS_TONE = {
  draft: 'pending', submitted: 'info', approved: 'success',
  rejected: 'error', suspended: 'warning',
};

/**
 * Developer portal — register, build apps, submit for vetting, receive API
 * keys; admins review and publish to segment storefronts from the same page.
 */
const DeveloperPortalPage = () => {
  const [profile, setProfile] = useState(null);
  const [needsRegister, setNeedsRegister] = useState(false);
  const [queue, setQueue] = useState([]);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [newApp, setNewApp] = useState(null);
  const [company, setCompany] = useState('');
  const [issuedKey, setIssuedKey] = useState(null);

  const flash = (m) => { setNotice(m); setTimeout(() => setNotice(null), 4000); };

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.get('/developers/me');
      setProfile(res);
      setNeedsRegister(false);
    } catch (err) {
      if (err?.response?.status === 404) setNeedsRegister(true);
      else setError('Failed to load developer profile.');
    }
    try {
      const q = await api.get('/admin/developer-apps');
      setQueue(q.apps || []);
    } catch { /* not an admin — fine */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const register = async () => {
    await api.post('/developers/register', { company_name: company });
    flash('Developer account created.');
    await load();
  };

  const createApp = async (form) => {
    await api.post('/developers/apps', {
      name: form.name, tagline: form.tagline, description: form.description,
      scopes: form.scopes.split(',').map((s) => s.trim()).filter(Boolean),
      target_segments: form.target_segments.split(',').map((s) => s.trim()).filter(Boolean),
    });
    setNewApp(null);
    flash('App created as draft.');
    await load();
  };

  const submit = async (id) => {
    await api.post(`/developers/apps/${id}/submit`);
    flash('Submitted for review.');
    await load();
  };

  const review = async (id, approve) => {
    const res = await api.post(`/admin/developer-apps/${id}/review`, { approve });
    if (approve && res.api_key) setIssuedKey({ app: res.app.name, key: res.api_key });
    flash(approve ? 'Approved — API key issued.' : 'Rejected.');
    await load();
  };

  const publish = async (id) => {
    const res = await api.post(`/admin/developer-apps/${id}/publish`);
    flash(`Published to: ${(res.published_to || []).join(', ') || 'no target segments'}`);
    await load();
  };

  const AppRow = ({ app, admin }) => (
    <NBCard padding={16}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold" style={{ color: 'var(--nb-text-primary)' }}>{app.name}</span>
            <NBStatusPill tone={STATUS_TONE[app.status] || 'info'}>{app.status}</NBStatusPill>
          </div>
          <p className="text-sm" style={{ color: 'var(--nb-text-secondary)' }}>{app.tagline}</p>
          <p className="mt-1 text-xs" style={{ color: 'var(--nb-text-tertiary)' }}>
            scopes: {(app.scopes || []).join(', ') || '—'} · segments: {(app.target_segments || []).join(', ') || '—'}
            {app.api_key_prefix && <> · key: <code>{app.api_key_prefix}…</code></>}
          </p>
        </div>
        <div className="flex gap-2">
          {!admin && app.status === 'draft' && (
            <NBButton size="sm" variant="secondary" onClick={() => submit(app.id)}>
              <Send size={14} className="mr-1 inline" /> Submit for review
            </NBButton>
          )}
          {admin && app.status === 'submitted' && (
            <>
              <NBButton size="sm" onClick={() => review(app.id, true)}>
                <Check size={14} className="mr-1 inline" /> Approve
              </NBButton>
              <NBButton size="sm" variant="destructive" onClick={() => review(app.id, false)}>
                <X size={14} className="mr-1 inline" /> Reject
              </NBButton>
            </>
          )}
          {admin && app.status === 'approved' && (
            <NBButton size="sm" variant="secondary" onClick={() => publish(app.id)}>
              <Rocket size={14} className="mr-1 inline" /> Publish to store
            </NBButton>
          )}
        </div>
      </div>
    </NBCard>
  );

  if (needsRegister) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6">
        <NBCard>
          <h1 className="mb-2 text-xl font-bold" style={{ color: 'var(--nb-text-primary)' }}>
            <Code2 size={20} className="mr-2 inline" /> Become a developer
          </h1>
          <p className="mb-4 text-sm" style={{ color: 'var(--nb-text-secondary)' }}>
            Build vetted third-party apps for the NeoBank segment app store.
          </p>
          <NBInput label="Company / team name" value={company} onChange={(e) => setCompany(e.target.value)} />
          <NBButton className="mt-4" onClick={register} disabled={!company}>Register</NBButton>
        </NBCard>
      </div>
    );
  }

  if (!profile) {
    return <div className="mx-auto max-w-4xl space-y-4 p-6" aria-busy="true"><NBSkeletonCard /><NBSkeletonCard /></div>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--nb-text-primary)' }}>Developer portal</h1>
          <p className="text-sm" style={{ color: 'var(--nb-text-secondary)' }}>
            {profile.company_name} · {profile.status}
          </p>
        </div>
        <NBButton onClick={() => setNewApp({})}><Plus size={16} className="mr-1 inline" /> New app</NBButton>
      </header>

      {notice && <p role="status" className="rounded-lg px-4 py-2 text-sm font-medium"
        style={{ background: 'var(--nb-feedback-success-bg)', color: 'var(--nb-feedback-success)' }}>{notice}</p>}
      {error && <p role="alert" className="rounded-lg px-4 py-2 text-sm font-medium"
        style={{ background: 'var(--nb-feedback-error-bg)', color: 'var(--nb-feedback-error)' }}>{error}</p>}

      {issuedKey && (
        <NBCard style={{ outline: '2px solid var(--nb-feedback-warning)' }}>
          <h2 className="mb-2 flex items-center gap-2 font-semibold" style={{ color: 'var(--nb-text-primary)' }}>
            <KeyRound size={18} aria-hidden="true" /> API key for {issuedKey.app} — shown once
          </h2>
          <code className="block break-all rounded-lg p-3 text-sm"
            style={{ background: 'var(--nb-surface-secondary)', color: 'var(--nb-text-primary)' }}>
            {issuedKey.key}
          </code>
          <p className="mt-2 text-xs" style={{ color: 'var(--nb-text-tertiary)' }}>
            Store it now. Send it as the X-NB-Api-Key header. We keep only a hash.
          </p>
        </NBCard>
      )}

      {newApp && (
        <NBCard>
          <h2 className="mb-4 font-semibold" style={{ color: 'var(--nb-text-primary)' }}>New app</h2>
          <NewAppForm scopes={profile.available_scopes}
            onCancel={() => setNewApp(null)} onSave={createApp} />
        </NBCard>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--nb-text-primary)' }}>Your apps</h2>
        {profile.apps.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--nb-text-secondary)' }}>
            No apps yet — create one, submit for vetting, and once approved it can be
            published into segment storefronts.
          </p>
        )}
        {profile.apps.map((a) => <AppRow key={a.id} app={a} admin={false} />)}
      </section>

      {queue.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--nb-text-primary)' }}>
            Review queue <span className="text-sm font-normal" style={{ color: 'var(--nb-text-tertiary)' }}>(admin)</span>
          </h2>
          {queue.map((a) => <AppRow key={a.id} app={a} admin />)}
        </section>
      )}
    </div>
  );
};

const NewAppForm = ({ scopes, onSave, onCancel }) => {
  const [form, setForm] = useState({ name: '', tagline: '', description: '', scopes: '', target_segments: '' });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <NBInput label="App name" value={form.name} onChange={set('name')} />
      <NBInput label="Tagline" value={form.tagline} onChange={set('tagline')} />
      <div className="sm:col-span-2">
        <NBInput label="Description" value={form.description} onChange={set('description')} />
      </div>
      <NBInput label={`Scopes (comma-sep; available: ${(scopes || []).join(', ')})`}
        value={form.scopes} onChange={set('scopes')} />
      <NBInput label="Target segments (e.g. students, sme-traders)"
        value={form.target_segments} onChange={set('target_segments')} />
      <div className="flex gap-2 sm:col-span-2">
        <NBButton onClick={() => onSave(form)} disabled={!form.name}>Create draft</NBButton>
        <NBButton variant="ghost" onClick={onCancel}>Cancel</NBButton>
      </div>
    </div>
  );
};

export default DeveloperPortalPage;
