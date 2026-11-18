// PLACEHOLDER (Task 11). The real implementation is written in parallel by another agent;
// the lead resolves the merge in favor of that file. Only the signature matters here.
import type { BoardFilter, BoardResponse } from '@blueline/contracts';
import type { Db } from '../index';

export async function queryBoard(
  _db: Db,
  _f: BoardFilter,
  _opts?: { pageSize?: number },
): Promise<BoardResponse> {
  throw new Error('queryBoard: not implemented');
}
