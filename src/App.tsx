import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from './api';
import type { Check, Dashboard, Project } from './types';
import { ProjectForm } from './ProjectForm';
const time = (value: number | string | undefined | null) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Not yet';
function Mark() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}
function Status({ success, enabled = true }: { success?: boolean; enabled?: boolean }) {
  const label = success === undefined ? 'No checks yet' : success ? 'Healthy' : 'Needs attention';
  return (
    <span className={`status ${success === undefined ? 'neutral' : success ? 'good' : 'bad'}`}>
      <i />
      {!enabled && success === undefined ? 'Paused' : label}
    </span>
  );
}
export function App() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [data, setData] = useState<Dashboard | null>(null);
  const [checks, setChecks] = useState<Check[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Project | 'new' | null>(null);
  const [tab, setTab] = useState<'projects' | 'history'>('projects');
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [dashboard, history] = await Promise.all([
        api<Dashboard>('/projects'),
        api<{ checks: Check[] }>('/checks'),
      ]);
      setData(dashboard);
      setChecks(history.checks);
      setError('');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setSignedIn(false);
        setData(null);
        setChecks([]);
      }
      setError(e instanceof Error ? e.message : 'Unable to load your dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    let active = true;
    api<{ authenticated: boolean }>('/auth/session')
      .then((v) => {
        if (active) setSignedIn(v.authenticated);
      })
      .catch(() => {
        if (active) {
          setSignedIn(false);
          setError('Cannot reach the server. Check the local setup or try again.');
        }
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (signedIn) void refresh();
  }, [signedIn, refresh]);
  async function action(key: string, work: () => Promise<unknown>) {
    setBusy(key);
    setError('');
    try {
      await work();
      await refresh();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setSignedIn(false);
      setError(e instanceof Error ? e.message : 'Action failed.');
    } finally {
      setBusy('');
    }
  }
  async function signOut() {
    setBusy('logout');
    try {
      await api('/auth/logout', 'POST');
      setSignedIn(false);
      setData(null);
      setChecks([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign out.');
    } finally {
      setBusy('');
    }
  }
  if (signedIn === null)
    return (
      <main className="boot" role="status">
        <Mark />
        <p>Warming up the panel…</p>
      </main>
    );
  if (!signedIn)
    return (
      <Login
        initialError={error}
        onLogin={() => {
          setSignedIn(true);
          setError('');
        }}
      />
    );
  const projects = data?.projects ?? [];
  const enabled = projects.filter((p) => p.enabled).length;
  const healthy = projects.filter((p) => p.lastCheck?.success).length;
  const failed = projects.filter((p) => p.lastCheck && !p.lastCheck.success).length;
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Nudge dashboard">
          <Mark />
          <span>
            nudge<span className="brand-period">.</span>
          </span>
        </a>
        <div className="topbar-right">
          <span className="personal-label">
            <i className="led" />
            PERSONAL EDITION
          </span>
          <button className="small-button" disabled={!!busy} onClick={() => void signOut()}>
            {busy === 'logout' ? 'Signing out…' : 'Sign out'} <span aria-hidden="true">↗</span>
          </button>
        </div>
      </header>
      <main>
        <section className="intro">
          <div>
            <div className="eyebrow">A LITTLE ATTENTION. A LOT MORE UPTIME.</div>
            <h1>
              Keep the good
              <br className="mobile-break" /> things going.
            </h1>
            <p>Your projects deserve to stay awake. We give them a gentle nudge.</p>
          </div>
          <div className="schedule-stamp">
            <span className="stamp-pin" />
            <span className="eyebrow">YOUR WEEKLY DOSE</span>
            <strong>
              MON <span>/</span> 12:00 <small>UTC</small>
            </strong>
            <span>09:00 · São Paulo</span>
          </div>
        </section>
        {error && (
          <div className="notice error" role="alert">
            {error}
            <button className="text-button" onClick={() => void refresh()}>
              Try again
            </button>
          </div>
        )}
        <section className="instrument-panel" aria-label="Project overview">
          <span className="screw top-left" />
          <span className="screw top-right" />
          <span className="screw bottom-left" />
          <span className="screw bottom-right" />
          <div className="panel-caption">
            <span>
              <i className="led" />
              SYSTEM OVERVIEW
            </span>
            <span className="etched">NUDGE / CONTROL PANEL 01</span>
          </div>
          <div className="meters">
            {[
              ['Registered', projects.length, 'All your connections', ''],
              ['On schedule', enabled, 'Ready for a weekly lift', ''],
              ['Healthy', healthy, 'Latest check passed', 'good'],
              ['Need attention', failed, 'Latest check failed', 'bad'],
            ].map(([label, number, desc, tone]) => (
              <div className={`meter ${tone}`} key={String(label)}>
                <span className="meter-label">{label}</span>
                <div className="meter-display">
                  <span>{data ? String(number).padStart(2, '0') : '—'}</span>
                  <i className={`meter-light ${Number(number) ? 'lit' : ''}`} />
                </div>
                <span className="meter-desc">{desc}</span>
              </div>
            ))}
          </div>
          <div className="schedule-strip">
            <div>
              <span className="strip-icon" aria-hidden="true">
                ◷
              </span>
              <div>
                <span className="eyebrow">NEXT EXPECTED NUDGE</span>
                <strong>{data ? time(data.nextExecution) : 'Loading…'}</strong>
                <span className="hint">Weekly · shown in your local time</span>
              </div>
            </div>
            <div className="last-run">
              <span className="eyebrow">LAST SCHEDULED RUN</span>
              <strong>
                {time(data?.lastScheduled?.startedAt)}
                {data?.lastScheduled && !data.lastScheduled.finishedAt ? ' · incomplete' : ''}
              </strong>
            </div>
            <span className="schedule-badge">SET IT. FORGET IT.</span>
          </div>
        </section>
        <section className="workspace">
          <div className="workspace-toolbar">
            <nav className="tabs" aria-label="Dashboard views">
              <button
                className={tab === 'projects' ? 'active' : ''}
                onClick={() => setTab('projects')}
              >
                Projects <span>{projects.length}</span>
              </button>
              <button
                className={tab === 'history' ? 'active' : ''}
                onClick={() => setTab('history')}
              >
                Activity log <span>{checks.length}</span>
              </button>
            </nav>
            <div className="toolbar-actions">
              <button
                className="refresh-button"
                onClick={() => void refresh()}
                disabled={loading || !!busy}
                aria-label="Refresh dashboard"
              >
                ↻
              </button>
              <button
                className="button primary"
                onClick={() => setEditing('new')}
                disabled={!!busy || projects.length >= 10}
              >
                <span aria-hidden="true">＋</span> Add project
              </button>
            </div>
          </div>
          <div className="section-heading">
            <div>
              <h2>{tab === 'projects' ? 'Your little ecosystem' : 'The paper trail'}</h2>
              <p>
                {tab === 'projects'
                  ? 'Small requests. Happier databases.'
                  : 'The latest 100 checks. History is kept for 90 days.'}
              </p>
            </div>
            <span className="etched">
              {loading
                ? 'UPDATING…'
                : tab === 'projects'
                  ? `${enabled} CONNECTION${enabled === 1 ? '' : 'S'} ACTIVE`
                  : 'MOST RECENT FIRST'}
            </span>
          </div>
          {!data && loading ? (
            <div className="empty-state" role="status">
              <span className="empty-symbol">◌</span>
              <h3>Reading the instruments…</h3>
            </div>
          ) : tab === 'projects' ? (
            projects.length === 0 ? (
              <div className="empty-state">
                <div className="empty-symbol">↗</div>
                <span className="eyebrow">READY WHEN YOU ARE</span>
                <h3>Every project needs a little encouragement.</h3>
                <p>Connect your first API. Nudge will take it from here, once a week.</p>
                <button className="button secondary" onClick={() => setEditing('new')}>
                  Connect your first project <span aria-hidden="true">↗</span>
                </button>
              </div>
            ) : (
              <div className="project-list">
                {projects.map((p, index) => (
                  <article className={`project-card ${!p.enabled ? 'is-paused' : ''}`} key={p.id}>
                    <div className="project-identity">
                      <div className="project-monogram" aria-hidden="true">
                        {p.name.slice(0, 1).toUpperCase()}
                        <span>{String(index + 1).padStart(2, '0')}</span>
                      </div>
                      <div>
                        <h3>{p.name}</h3>
                        <span className="hostname">{new URL(p.config.baseUrl).hostname}</span>
                      </div>
                    </div>
                    <div className="project-health">
                      <Status success={p.lastCheck?.success} enabled={p.enabled} />
                      <span className="hint">
                        {p.lastCheck
                          ? `Checked ${time(p.lastCheck.startedAt)}`
                          : 'Waiting for its first nudge'}
                      </span>
                      {p.lastCheck?.error && (
                        <span className="check-error">{p.lastCheck.error}</span>
                      )}
                    </div>
                    <div className="project-controls">
                      <button
                        className={`toggle ${p.enabled ? 'on' : ''}`}
                        role="switch"
                        aria-checked={p.enabled}
                        aria-label={`Weekly schedule for ${p.name}`}
                        disabled={!!busy}
                        onClick={() =>
                          void action(`toggle-${p.id}`, () =>
                            api(`/projects/${p.id}`, 'PATCH', { enabled: !p.enabled }),
                          )
                        }
                      >
                        <span />
                      </button>
                      <span className="toggle-caption">{p.enabled ? 'ON' : 'OFF'}</span>
                      <button
                        className="button secondary check-button"
                        disabled={!!busy}
                        onClick={() =>
                          void action(`check-${p.id}`, () => api(`/projects/${p.id}/check`, 'POST'))
                        }
                      >
                        {busy === `check-${p.id}` ? 'Nudging…' : 'Nudge now'}
                        <span aria-hidden="true">↗</span>
                      </button>
                      <button
                        className="icon-button"
                        disabled={!!busy}
                        onClick={() => setEditing(p)}
                        aria-label={`Edit ${p.name}`}
                        title="Edit project"
                      >
                        ⚙
                      </button>
                      <button
                        className="icon-button delete-button"
                        disabled={!!busy}
                        aria-label={`Delete ${p.name}`}
                        title="Delete project"
                        onClick={() => {
                          if (window.confirm(`Remove ${p.name} and its check history?`))
                            void action(`delete-${p.id}`, () => api(`/projects/${p.id}`, 'DELETE'));
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )
          ) : checks.length === 0 ? (
            <div className="empty-state">
              <span className="empty-symbol">≡</span>
              <h3>A fresh sheet.</h3>
              <p>Run your first nudge to start the activity log.</p>
            </div>
          ) : (
            <div className="history-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Project / time</th>
                    <th>Trigger</th>
                    <th>Result</th>
                    <th>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {checks.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <strong>{c.projectName}</strong>
                        <span className="hint">{time(c.startedAt)}</span>
                      </td>
                      <td>
                        <span className="trigger-label">{c.trigger}</span>
                      </td>
                      <td>
                        <Status success={c.success} />
                        {c.error && <span className="check-error">{c.error}</span>}
                      </td>
                      <td className="duration">{(c.durationMs / 1000).toFixed(2)}s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <aside className="desk-note">
          <span aria-hidden="true">✳</span>
          <p>
            A nudge only works if it reaches your database. Pick an API endpoint that performs a
            real MongoDB operation.
          </p>
          <span className="note-tag">A FRIENDLY REMINDER</span>
        </aside>
      </main>
      <footer>
        <span>
          nudge. <span className="footer-divider">/</span> A little lift for your side projects.
        </span>
        <span className="etched">
          POWERED BY VIAGRA <span aria-hidden="true">↗</span>
        </span>
      </footer>
      {editing && (
        <ProjectForm
          project={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
function Login({ initialError, onLogin }: { initialError: string; onLogin: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/auth/login', 'POST', { password });
      setPassword('');
      onLogin();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <div className="login-panel">
        <span className="screw top-left" />
        <span className="screw top-right" />
        <div className="brand">
          <Mark />
          <span>nudge.</span>
        </div>
        <div className="eyebrow">YOUR PERSONAL CONTROL PANEL</div>
        <h1>
          A little lift.
          <br />
          Peace of mind.
        </h1>
        <p>Sign in to keep your side projects going.</p>
        <form onSubmit={submit}>
          <label>
            Administrator password
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              maxLength={1024}
              autoFocus
            />
          </label>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          <button className="button primary" disabled={busy}>
            {busy ? 'Signing in…' : 'Open dashboard'} <span aria-hidden="true">↗</span>
          </button>
        </form>
        <div className="login-bottom">
          <i className="led" />
          PRIVATE BY DESIGN <span>ONE ADMIN. ZERO FUSS.</span>
        </div>
      </div>
      <p className="login-footnote">Nudge · Personal edition</p>
    </main>
  );
}
