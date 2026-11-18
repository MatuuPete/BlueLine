import type { HttpDeps } from './types';

export interface FetchJsonArgs {
  provider: string;
  /** Endpoint template recorded with the payload, e.g. '/teams/{id}/roster'. */
  endpoint: string;
  /** Recorded with the payload. Never put API keys here. */
  params: Record<string, unknown>;
  /** Full request URL (may carry an API key; never recorded). */
  url: string;
  headers?: Record<string, string>;
}

export interface FetchJsonResult {
  body: unknown;
  headers: Headers;
}

/**
 * GET a JSON document, record it with `deps.record`, then return it for parsing.
 * Recording happens before any parsing (spec §3 rule 3). Non-2xx responses throw
 * and are not recorded.
 */
export async function fetchJson(deps: HttpDeps, args: FetchJsonArgs): Promise<FetchJsonResult> {
  const res = await deps.fetch(args.url, {
    headers: { accept: 'application/json', ...args.headers },
  });
  if (!res.ok) {
    throw new Error(`${args.provider} ${args.endpoint}: HTTP ${res.status}`);
  }
  const body: unknown = await res.json();
  await deps.record({
    provider: args.provider,
    endpoint: args.endpoint,
    params: args.params,
    body,
  });
  return { body, headers: res.headers };
}

/** Build a query string, skipping undefined values. */
export function query(params: Record<string, string | number | boolean | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
}
