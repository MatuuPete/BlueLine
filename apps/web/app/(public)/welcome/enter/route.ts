import { NextResponse } from 'next/server';
import { ONE_YEAR_SECONDS, SEEN_INTRO_COOKIE } from '../../../../lib/intro';

export const dynamic = 'force-dynamic';

/** "Enter the board": remember the intro was seen (1 year), then go to the board. */
export function GET(req: Request) {
  const res = NextResponse.redirect(new URL('/', req.url), 303);
  res.cookies.set(SEEN_INTRO_COOKIE, '1', {
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  });
  return res;
}
