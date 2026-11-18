import { getStatus } from '@blueline/db/queries/status';
import type { StatusResponse } from '@blueline/contracts';
import type { Db } from '@blueline/db';

/** Default monthly odds-unit budget; same as the worker's ODDS_MONTHLY_BUDGET default. */
export const DEFAULT_ODDS_MONTHLY_BUDGET = 2500;

export function oddsBudgetLimit(raw = process.env.ODDS_MONTHLY_BUDGET): number {
  const n = Number(raw?.trim());
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_ODDS_MONTHLY_BUDGET;
}

/** Shared by the /status page and GET /api/status. */
export function loadStatus(db: Db): Promise<StatusResponse> {
  return getStatus(db, {
    provider: process.env.ODDS_PROVIDER?.trim() || 'fixtures',
    limit: oddsBudgetLimit(),
  });
}
