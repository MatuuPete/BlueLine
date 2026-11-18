import { closeDb, desc, jobRuns } from '@blueline/db';
import { afterEach, describe, expect, it } from 'vitest';
import { runJob, type JobContext } from '../src/run-job';
import { makeCtx } from './helpers';

let ctx: JobContext;
afterEach(async () => {
  await closeDb(ctx.db);
});

const lastRun = async () =>
  (await ctx.db.select().from(jobRuns).orderBy(desc(jobRuns.id)).limit(1))[0]!;

describe('runJob', () => {
  it('writes a running row, then ok with units and meta', async () => {
    ctx = await makeCtx();
    let during: string | undefined;
    const res = await runJob(
      'demo',
      async () => {
        during = (await lastRun()).status;
        return { units: 7, meta: { rows: 3 } };
      },
      ctx,
    );
    expect(during).toBe('running');
    expect(res).toEqual({ units: 7, meta: { rows: 3 } });
    const run = await lastRun();
    expect(run).toMatchObject({
      job: 'demo',
      status: 'ok',
      units: 7,
      meta: { rows: 3 },
      error: null,
    });
    expect(run.finishedAt).toBeInstanceOf(Date);
  });

  it('marks the run as error and rethrows', async () => {
    ctx = await makeCtx();
    await expect(
      runJob(
        'boom',
        async () => {
          throw new Error('provider exploded');
        },
        ctx,
      ),
    ).rejects.toThrow('provider exploded');
    const run = await lastRun();
    expect(run.status).toBe('error');
    expect(run.error).toContain('provider exploded');
    expect(run.finishedAt).toBeInstanceOf(Date);
  });
});
