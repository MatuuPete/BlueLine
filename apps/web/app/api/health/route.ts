// Public liveness check; the only /api route without a session.
export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
