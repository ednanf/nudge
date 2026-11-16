import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from './api';
import type { Project, ProjectConfig } from './types';
const defaults: ProjectConfig = {
  baseUrl: '',
  authPath: '/api/auth/login',
  authMethod: 'POST',
  usernameField: 'email',
  passwordField: 'password',
  authMode: 'bearer',
  tokenPath: 'token',
  keepAlivePath: '/api/me',
  keepAliveMethod: 'GET',
  keepAliveBody: null,
};
export function ProjectForm({
  project,
  onClose,
  onSaved,
}: {
  project?: Project;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [config, setConfig] = useState<ProjectConfig>(project?.config ?? defaults);
  const [name, setName] = useState(project?.name ?? '');
  const [enabled, setEnabled] = useState(project?.enabled ?? true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authBody, setAuthBody] = useState('');
  const [keepBody, setKeepBody] = useState(
    project?.config.keepAliveBody ? JSON.stringify(project.config.keepAliveBody, null, 2) : '',
  );
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [testResult, setTestResult] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  function change<K extends keyof ProjectConfig>(key: K, value: ProjectConfig[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
    setTestResult('');
  }
  function payload() {
    const object = (value: string, label: string) => {
      let result;
      try {
        result = JSON.parse(value);
      } catch {
        throw new Error(`${label} must be valid JSON.`);
      }
      if (!result || Array.isArray(result) || typeof result !== 'object')
        throw new Error(`${label} must be a JSON object.`);
      return result;
    };
    return {
      name,
      enabled,
      config: {
        ...config,
        keepAliveBody:
          config.keepAliveMethod === 'POST' && keepBody.trim()
            ? object(keepBody, 'Keep-alive body')
            : null,
      },
      ...(username ? { username } : {}),
      ...(password ? { password } : {}),
      ...(authBody.trim() ? { authBody: object(authBody, 'Authentication body') } : {}),
    };
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await perform('save');
  }
  async function perform(action: 'save' | 'test') {
    setError('');
    setTestResult('');
    setBusy(action);
    try {
      const body = payload();
      if (action === 'test') {
        const result = await api<{ success: boolean; error: string | null; durationMs: number }>(
          '/projects/test',
          'POST',
          { ...body, ...(project ? { id: project.id } : {}) },
        );
        if (!result.success) throw new Error(result.error || 'Check failed.');
        setTestResult(
          `Authentication and keep-alive passed in ${(result.durationMs / 1000).toFixed(2)}s. Configuration has not been saved.`,
        );
      } else {
        await api(
          project ? `/projects/${project.id}` : '/projects',
          project ? 'PATCH' : 'POST',
          body,
        );
        await onSaved();
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save project.');
    } finally {
      setBusy('');
    }
  }
  return (
    <dialog
      ref={dialog}
      className="project-dialog"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
      aria-labelledby="form-title"
    >
      <div className="dialog-heading">
        <div>
          <span className="eyebrow">CONNECTION SETUP</span>
          <h2 id="form-title">{project ? 'Edit project' : 'Add project'}</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Close configuration"
          onClick={onClose}
          disabled={!!busy}
        >
          <svg
            className="close-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      <form onSubmit={submit}>
        <fieldset disabled={!!busy}>
          <legend>01 / Project details</legend>
          <div className="form-grid">
            <label>
              Project name
              <input
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My portfolio API"
              />
            </label>
            <label>
              Base API URL
              <input
                type="url"
                required
                value={config.baseUrl}
                onChange={(e) => change('baseUrl', e.target.value)}
                placeholder="https://api.example.com"
              />
            </label>
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />{' '}
            Include in the weekly schedule
          </label>
        </fieldset>
        <fieldset disabled={!!busy}>
          <legend>02 / Authentication</legend>
          <div className="form-grid endpoint">
            <label>
              Method
              <select
                value={config.authMethod}
                onChange={(e) => change('authMethod', e.target.value as 'POST' | 'PUT')}
              >
                <option>POST</option>
                <option>PUT</option>
              </select>
            </label>
            <label>
              Login endpoint
              <input
                required
                value={config.authPath}
                onChange={(e) => change('authPath', e.target.value)}
              />
            </label>
          </div>
          <div className="form-grid">
            <label>
              Disposable username or email
              <input
                autoComplete="off"
                required={!project}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={project ? 'Saved · leave blank to keep' : 'nudge@example.com'}
              />
            </label>
            <label>
              Disposable password
              <input
                type="password"
                autoComplete="new-password"
                required={!project}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  project ? 'Encrypted · leave blank to keep' : 'Disposable account password'
                }
              />
            </label>
            <label>
              Username JSON field
              <input
                required
                value={config.usernameField}
                onChange={(e) => change('usernameField', e.target.value)}
              />
            </label>
            <label>
              Password JSON field
              <input
                required
                value={config.passwordField}
                onChange={(e) => change('passwordField', e.target.value)}
              />
            </label>
            <label>
              Authentication type
              <select
                value={config.authMode}
                onChange={(e) => change('authMode', e.target.value as 'bearer' | 'cookie')}
              >
                <option value="bearer">Bearer token</option>
                <option value="cookie">Session cookie</option>
              </select>
            </label>
            {config.authMode === 'bearer' && (
              <label>
                Token path in response
                <input
                  required
                  value={config.tokenPath}
                  onChange={(e) => change('tokenPath', e.target.value)}
                  placeholder="data.accessToken"
                />
              </label>
            )}
          </div>
          <details>
            <summary>Additional authentication JSON</summary>
            <label>
              Extra JSON fields (optional)
              <textarea
                spellCheck={false}
                rows={3}
                value={authBody}
                onChange={(e) => setAuthBody(e.target.value)}
                placeholder={
                  project
                    ? 'Encrypted · blank preserves saved fields; {} clears them'
                    : '{"remember": false}'
                }
              />
            </label>
            <p className="hint">
              Stored encrypted. Credential fields are added automatically and override matching
              keys.
            </p>
          </details>
        </fieldset>
        <fieldset disabled={!!busy}>
          <legend>03 / Keep-alive request</legend>
          <div className="form-grid endpoint">
            <label>
              Method
              <select
                value={config.keepAliveMethod}
                onChange={(e) => change('keepAliveMethod', e.target.value as 'GET' | 'POST')}
              >
                <option>GET</option>
                <option>POST</option>
              </select>
            </label>
            <label>
              Keep-alive endpoint
              <input
                required
                value={config.keepAlivePath}
                onChange={(e) => change('keepAlivePath', e.target.value)}
              />
            </label>
          </div>
          {config.keepAliveMethod === 'POST' && (
            <label>
              Request JSON (optional)
              <textarea
                rows={3}
                spellCheck={false}
                value={keepBody}
                onChange={(e) => setKeepBody(e.target.value)}
                placeholder="{}"
              />
            </label>
          )}
          <p className="inset-note">
            Choose a safe endpoint that actually reads or writes MongoDB. A successful HTTP response
            alone cannot confirm database activity. Keep secrets out of URLs and the keep-alive
            body.
          </p>
        </fieldset>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {testResult && (
          <p className="notice success" role="status">
            {testResult}
          </p>
        )}
        <div className="dialog-footer">
          <button
            className="button secondary"
            type="button"
            disabled={!!busy}
            onClick={() => {
              if (dialog.current?.querySelector('form')?.reportValidity()) void perform('test');
            }}
          >
            {busy === 'test' ? 'Testing connection…' : 'Test connection'}
          </button>
          <button type="submit" className="button primary" disabled={!!busy}>
            {busy === 'save' ? 'Saving…' : project ? 'Save changes' : 'Connect project'}
            <span aria-hidden="true"> ↗</span>
          </button>
        </div>
      </form>
    </dialog>
  );
}
