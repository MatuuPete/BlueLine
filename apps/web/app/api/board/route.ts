import { BoardFilterSchema, parseBoardFilter, type BoardFilter } from '@blueline/contracts';
import { queryBoard } from '@blueline/db/queries/board';
import { authed, errorResponse, fieldErrors, json, type IssueLike } from '../../../lib/api';

export const dynamic = 'force-dynamic';

const KNOWN = new Set(Object.keys(BoardFilterSchema.shape));

export const GET = authed(async ({ db }, req: Request) => {
  // R11: drop unknown keys (tracking params etc.); an invalid known value is a 400 here.
  const params = new URLSearchParams();
  new URL(req.url).searchParams.forEach((v, k) => {
    if (KNOWN.has(k)) params.append(k, v);
  });
  let filter: BoardFilter;
  try {
    filter = parseBoardFilter(params);
  } catch (err) {
    const issues = (err as { issues?: IssueLike[] }).issues;
    if (!issues) throw err;
    return errorResponse(400, 'invalid_request', fieldErrors(issues));
  }
  return json(await queryBoard(db, filter));
});
