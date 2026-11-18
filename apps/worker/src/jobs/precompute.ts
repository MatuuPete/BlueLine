// Placeholder: Task 9 replaces this file with the real precompute job
// (analytics → prop_metrics / team_dvp). Keep the export name `precompute`.
import type { Job } from '../run-job';

export const precompute: Job = async (ctx) => {
  ctx.log('precompute not implemented yet');
  return { meta: { skipped: 'not implemented' } };
};
