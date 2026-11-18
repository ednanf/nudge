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
  useEffect(() => {
    document.title = signedIn === false ? 'Nudge — Sign in' : 'Nudge — Dashboard';
  }, [signedIn]);
  const [data, setData] = useState<Dashboard | null>(null);
  const [checks, setChecks] = useState<Check[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Project | 'new' | null>(null);
  const [tab, setTab] = useState<'projects' | 'history'>('projects');
  const [now, setNow] = useState(Date.now);
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
  useEffect(() => {
    if (!signedIn) return;
    const update = () => {
      setNow(Date.now());
      if (document.visibilityState === 'visible' && !busy) void refresh();
    };
    const timer = window.setInterval(update, 30_000);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [signedIn, refresh, busy]);
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
        <p>Loading…</p>
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
          <span>nudge</span>
        </a>
        <div className="topbar-right">
          <button className="small-button" disabled={!!busy} onClick={() => void signOut()}>
            {busy === 'logout' ? 'Signing out…' : 'Sign out'} <span aria-hidden="true">↗</span>
          </button>
        </div>
      </header>
      <main>
        <section className="intro">
          <div>
            <h1>Projects</h1>
            <p>Manage API connections and review weekly database checks.</p>
          </div>
          <div className="schedule-stamp">
            <span className="stamp-pin" />
            <span className="eyebrow">WEEKLY SCHEDULE</span>
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
          <div className="panel-caption">SYSTEM OVERVIEW</div>
          <div className="meters">
            {[
              ['Registered', projects.length, 'All your connections', ''],
              ['On schedule', enabled, 'Enabled for weekly checks', ''],
              ['Healthy', healthy, 'Latest check passed', 'good'],
              ['Need attention', failed, 'Latest check failed', 'bad'],
            ].map(([label, number, desc, tone]) => (
              <div className={`meter ${tone}`} key={String(label)}>
                <span className="meter-label">{label}</span>
                <div className="meter-display">
                  <span>{data ? String(number).padStart(2, '0') : '—'}</span>
                </div>
                <span className="meter-desc">{desc}</span>
              </div>
            ))}
          </div>
          <div className="schedule-strip">
            <div>
              <span className="strip-icon" aria-hidden="true">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  focusable="false"
                >
                  <circle cx="8" cy="8" r="6.5" />
                  <path d="M8 1.5V8H14.5" />
                </svg>
              </span>
              <div>
                <span className="eyebrow">NEXT SCHEDULED CHECK</span>
                <strong aria-live="polite">
                  {data ? time(data.nextExecution) : 'Loading…'}
                  {data && Date.parse(data.nextExecution) <= now && (
                    <span className="schedule-pending">Pending</span>
                  )}
                </strong>
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
                className="button secondary refresh-button"
                onClick={() => void refresh()}
                disabled={loading || !!busy}
                aria-label="Refresh dashboard"
              >
                <svg
                  className="refresh-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M21 3v5h-5" />
                  <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                </svg>
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
              <h2>{tab === 'projects' ? 'Connections' : 'Execution history'}</h2>
              <p>
                {tab === 'projects'
                  ? 'Configured API connections.'
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
              <h3>Loading connections…</h3>
            </div>
          ) : tab === 'projects' ? (
            projects.length === 0 ? (
              <div className="empty-state">
                <div className="empty-symbol">↗</div>
                <h3>No projects yet.</h3>
                <p>Add an API connection to include it in weekly checks.</p>
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
                          : 'No checks recorded'}
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
                        {busy === `check-${p.id}` ? 'Checking…' : 'Run check'}
                        <span aria-hidden="true">↗</span>
                      </button>
                      <button
                        className="button secondary icon-button settings-button"
                        disabled={!!busy}
                        onClick={() => setEditing(p)}
                        aria-label={`Edit ${p.name}`}
                        title="Edit project"
                      >
                        <svg
                          className="settings-icon"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                          focusable="false"
                        >
                          <g fill="currentColor">
                            <path
                              fillRule="evenodd"
                              d="M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 5a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z"
                            />
                            {Array.from({ length: 8 }, (_, tooth) => (
                              <rect
                                key={tooth}
                                x="10"
                                y="1"
                                width="4"
                                height="5"
                                rx="0.5"
                                transform={`rotate(${tooth * 45} 12 12)`}
                              />
                            ))}
                          </g>
                        </svg>
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
              <h3>No checks yet.</h3>
              <p>Run a manual check or wait for the next scheduled execution.</p>
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
            Use an API endpoint that performs a real MongoDB operation. A successful HTTP response
            alone does not confirm database activity.
          </p>
        </aside>
      </main>
      <footer className="copyright">Copyright (c) 2026 Ednan Frizzera. All rights reserved.</footer>
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
  const [rememberMe, setRememberMe] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/auth/login', 'POST', { password, rememberMe });
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
          <span>nudge</span>
        </div>
        <h1>Sign in</h1>
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
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              disabled={busy}
            />
            Remember me for 30 days
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
      </div>
    </main>
  );
}
