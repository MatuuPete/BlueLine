// Shared helpers for /api route handlers: auth, input parsing, uniform JSON errors.
import type { Db } from '@blueline/db';
import { getDb } from './db';
import { getUserId } from './session';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;
const MAX_BODY_BYTES = 64 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Parser for a UUID string (ids of slips and presets). */
export const uuidParser: Parser<string> = {
  safeParse: (input) =>
    typeof input === 'string' && UUID_RE.test(input)
      ? { success: true, data: input }
      : { success: false, error: { issues: [{ path: [], message: 'Invalid UUID' }] } },
};

/**
 * If `err` is a Postgres foreign-key violation (SQLSTATE 23503), the 400 `fields` to return, else null.
 * Drizzle wraps driver errors (DrizzleQueryError.cause), so the chain is walked. The failing
 * column is named from the constraint when the driver reports it; otherwise the field is `_`.
 */
export function foreignKeyFields(err: unknown): Record<string, string[]> | null {
  type E = { code?: string; constraint?: string; cause?: unknown; message?: string };
  let fk: E | null = null;
  let cur: unknown = err;
  for (let depth = 0; depth < 4 && cur && typeof cur === 'object'; depth++) {
    const e = cur as E;
    if (e.code === '23503') {
      fk = e;
      break;
    }
    cur = e.cause;
  }
  if (!fk && /foreign key/i.test(String((err as E)?.cause ?? err))) fk = {}; // last resort
  if (!fk) return null;
  const c = fk.constraint ?? '';
  if (c.includes('player_id')) return { playerId: ['unknown player'] };
  if (c.includes('game_id')) return { gameId: ['unknown game'] };
  return { _: ['references an unknown player or game'] };
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: NO_STORE });
}

export function errorResponse(
  status: number,
  error: string,
  fields?: Record<string, string[]>,
): Response {
  return json(fields ? { error, fields } : { error }, status);
}

export const unauthorized = () => errorResponse(401, 'unauthorized');
export const notFound = () => errorResponse(404, 'not_found');

export interface IssueLike {
  path: PropertyKey[];
  message: string;
}
/** Structural slice of a Zod schema, so this app needs no direct zod dependency. */
export interface Parser<T> {
  safeParse(
    input: unknown,
  ): { success: true; data: T } | { success: false; error: { issues: IssueLike[] } };
}

export function fieldErrors(issues: IssueLike[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const i of issues) {
    const key = i.path.length > 0 ? i.path.map(String).join('.') : '_';
    (out[key] ??= []).push(i.message);
  }
  return out;
}

/** Validate `input`; failure is a ready-to-return 400 with per-field messages. */
export function parseInput<T>(schema: Parser<T>, input: unknown): { data: T } | { res: Response } {
  const r = schema.safeParse(input);
  if (r.success) return { data: r.data };
  return { res: errorResponse(400, 'invalid_request', fieldErrors(r.error.issues)) };
}

/** Read a bounded JSON body and validate it. */
export async function parseBody<T>(
  req: Request,
  schema: Parser<T>,
): Promise<{ data: T } | { res: Response }> {
  if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return { res: errorResponse(415, 'unsupported_media_type') };
  }
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return { res: errorResponse(413, 'payload_too_large') };
  }
  const text = await req.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return { res: errorResponse(413, 'payload_too_large') };
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { res: errorResponse(400, 'invalid_json') };
  }
  return parseInput(schema, body);
}

export interface Authed {
  db: Db;
  userId: string;
}

/**
 * Wrap a handler: resolves the session (401 without one), hands over db + userId,
 * and turns unexpected throws into a generic 500 (details go to the server log only).
 */
export function authed<A extends unknown[]>(
  handler: (auth: Authed, ...args: A) => Promise<Response>,
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    try {
      const userId = await getUserId();
      if (!userId) return unauthorized();
      return await handler({ db: await getDb(), userId }, ...args);
    } catch (err) {
      console.error('[api] unhandled error', err);
      return errorResponse(500, 'internal_error');
    }
  };
}
