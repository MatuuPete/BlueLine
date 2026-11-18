import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';
import type { HttpDeps, RawRecorder } from '../src/types';

export const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

export function fixture(rel: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, rel), 'utf8'));
}

/** A fetch that fails the test if anything reaches the network. */
export const noNetwork = (() => {
  throw new Error('network access is not allowed in tests');
}) as unknown as typeof fetch;

export interface Route {
  /** Matches when the request URL contains this string. */
  match: string | RegExp;
  body: unknown;
  status?: number;
  headers?: Record<string, string>;
}

/** A stub fetch that serves canned JSON by URL and logs every request. */
export function stubFetch(routes: Route[], log: string[] = []) {
  const requests: { url: string; headers: Record<string, string> }[] = [];
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    log.push('fetch');
    const r = routes.find((x) =>
      typeof x.match === 'string' ? url.includes(x.match) : x.match.test(url),
    );
    if (!r) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify(r.body), {
      status: r.status ?? 200,
      headers: { 'content-type': 'application/json', ...r.headers },
    });
  });
  return { fetch: fn as unknown as typeof fetch, requests };
}

export function recorder(log: string[] = []) {
  const records: Parameters<RawRecorder>[0][] = [];
  const record: RawRecorder = vi.fn(async (rec) => {
    log.push('record');
    records.push(rec);
  });
  return { record, records };
}

export function deps(over: Partial<HttpDeps> = {}): HttpDeps {
  return { fetch: noNetwork, record: async () => {}, ...over };
}
