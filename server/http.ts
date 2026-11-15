import { lookup } from 'node:dns/promises';
import https from 'node:https';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
import { limits } from './config';
import { CheckError } from './errors';
export type Target = { address: string; family: 4 | 6 };
export type HttpResult = { status: number; body: string; cookies: string[] };
export type Transport = (
  url: URL,
  method: string,
  headers: Record<string, string>,
  body: string | undefined,
  signal: AbortSignal,
) => Promise<HttpResult>;
export function publicAddress(address: string): boolean {
  try {
    const parsed = ipaddr.parse(address);
    // IPv4-mapped IPv6, NAT64, Teredo, private, link-local and reserved ranges fail closed.
    return parsed.range() === 'unicast';
  } catch {
    return false;
  }
}
export async function resolvePublic(
  url: URL,
  resolve: (host: string) => Promise<{ address: string; family: number }[]> = (host) =>
    lookup(host, { all: true, verbatim: true }),
): Promise<Target> {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    host.endsWith('.') ||
    host === 'localhost' ||
    /\.(localhost|local|internal)$/i.test(host)
  )
    throw new CheckError('Only public HTTPS destinations on port 443 are allowed.');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const records = await Promise.race([
      isIP(host) ? Promise.resolve([{ address: host, family: isIP(host) }]) : resolve(host),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new CheckError('DNS lookup timed out.')), 2500);
      }),
    ]);
    if (!records.length || records.some((r) => !publicAddress(r.address)))
      throw new CheckError('Destination resolves to a private or reserved network address.');
    return { address: records[0].address, family: records[0].family as 4 | 6 };
  } finally {
    clearTimeout(timer);
  }
}
export const transport: Transport = async (url, method, headers, body, signal) => {
  const target = await resolvePublic(url);
  if (signal.aborted) throw new CheckError('Check timed out.');
  return new Promise((resolve, reject) => {
    // Pin the verified address in the actual connection, retaining TLS hostname verification and SNI.
    const req = https.request(
      url,
      {
        method,
        headers,
        signal,
        agent: false,
        lookup: (_hostname, options, callback) => {
          if (typeof options === 'object' && options.all) callback(null, [target]);
          else callback(null, target.address, target.family);
        },
      },
      (res) => {
        let size = 0;
        const parts: Buffer[] = [];
        res.on('data', (part: Buffer) => {
          size += part.length;
          if (size > 65536) {
            req.destroy(new CheckError('Response exceeded the 64 KB limit.'));
          } else parts.push(part);
        });
        res.on('error', reject);
        res.on('end', () =>
          resolve({
            status: res.statusCode || 0,
            body: Buffer.concat(parts).toString('utf8'),
            cookies: res.headers['set-cookie'] || [],
          }),
        );
      },
    );
    req.setTimeout(limits.requestMs, () => req.destroy(new CheckError('HTTP request timed out.')));
    req.on('error', reject);
    req.end(body);
  });
};
