import type { Job } from '../run-job';
import { ingestBoxscores } from './boxscores';
import { gradeSlips } from './grade-slips';
import { ingestInjuries } from './injuries';
import { ingestOdds } from './odds';
import { precompute } from './precompute';
import { ingestSchedule } from './schedule';
import { seed } from './seed';

export const JOB_REGISTRY = {
  'ingest:schedule': ingestSchedule,
  'ingest:boxscores': ingestBoxscores,
  'ingest:injuries': ingestInjuries,
  'ingest:odds': ingestOdds,
  precompute,
  'grade-slips': gradeSlips,
  seed,
} as const satisfies Record<string, Job>;

export type JobName = keyof typeof JOB_REGISTRY;
