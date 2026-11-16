import { CookieJar } from 'tough-cookie';
import { limits } from './config.js';
import { CheckError, safeCheckError } from './errors.js';
import { transport, type Transport } from './http.js';
import type { ProjectConfig, Secrets } from './validation.js';
export type CheckResult = { success: boolean; error: string | null; durationMs: number };
// Project Viagra: keep idle connections up.
export async function runCheck(
  config: ProjectConfig,
  secrets: Secrets,
  send: Transport = transport,
): Promise<CheckResult> {
  const started = Date.now();
  const signal = AbortSignal.timeout(limits.checkMs);
  const invoke = async (
    path: string,
    method: string,
    headers: Record<string, string>,
    data?: unknown,
  ) => {
    const url = new URL(path, config.baseUrl);
    if (url.origin !== new URL(config.baseUrl).origin)
      throw new CheckError('Endpoints must stay on the configured API origin.');
    const response = await send(
      url,
      method,
      {
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
        ...headers,
        ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      data === undefined ? undefined : JSON.stringify(data),
      signal,
    );
    // Never follow a redirect, even on the same origin; credentials are sent only to exact configured endpoints.
    if (response.status < 200 || response.status >= 300)
      throw new CheckError(
        `${path === config.authPath ? 'Authentication' : 'Keep-alive'} returned HTTP ${response.status}.`,
      );
    return response;
  };
  try {
    const response = await invoke(
      config.authPath,
      config.authMethod,
      {},
      {
        ...secrets.authBody,
        [config.usernameField]: secrets.username,
        [config.passwordField]: secrets.password,
      },
    );
    const headers: Record<string, string> = {};
    if (config.authMode === 'bearer') {
      let token: unknown;
      try {
        token = JSON.parse(response.body);
      } catch {
        throw new CheckError('Authentication returned invalid JSON.');
      }
      for (const key of config.tokenPath.split('.'))
        token =
          token && typeof token === 'object' && Object.hasOwn(token, key)
            ? (token as Record<string, unknown>)[key]
            : undefined;
      if (typeof token !== 'string' || !token || token.length > 8192 || /[\r\n]/.test(token))
        throw new CheckError('Authentication token was missing or invalid. Check the token path.');
      headers.Authorization = `Bearer ${token}`;
    } else {
      const jar = new CookieJar();
      for (const cookie of response.cookies) {
        try {
          await jar.setCookie(cookie, new URL(config.authPath, config.baseUrl).href);
        } catch {
          /* Ignore cookies the destination is not allowed to set. */
        }
      }
      const cookie = await jar.getCookieString(new URL(config.keepAlivePath, config.baseUrl).href);
      if (!cookie)
        throw new CheckError(
          'Authentication did not set a cookie valid for the keep-alive endpoint.',
        );
      headers.Cookie = cookie;
    }
    await invoke(
      config.keepAlivePath,
      config.keepAliveMethod,
      headers,
      config.keepAliveMethod === 'POST' ? (config.keepAliveBody ?? undefined) : undefined,
    );
    return { success: true, error: null, durationMs: Date.now() - started };
  } catch (error) {
    return {
      success: false,
      error: signal.aborted
        ? 'Check exceeded the 90-second deadline. The service may still be starting; try again.'
        : safeCheckError(error),
      durationMs: Date.now() - started,
    };
  }
}
