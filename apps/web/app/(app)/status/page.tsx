import type { Metadata } from 'next';
import { getDb } from '../../../lib/db';
import { requireUserId } from '../../../lib/require-user';
import { loadStatus } from '../../../lib/status-data';
import { dateTime, TZ_LABEL } from '../../../lib/time';
import styles from '../_ui/page.module.css';
import own from './status.module.css';

export const metadata: Metadata = { title: 'Data status' };
export const dynamic = 'force-dynamic';

const when = (iso: string) => `${dateTime(iso)} ${TZ_LABEL}`;
const RESULT = { ok: 'OK', error: 'Error', running: 'Running' } as const;

/** Job health, odds budget and table sizes (read-only). */
export default async function StatusPage() {
  await requireUserId();
  const status = await loadStatus(await getDb());
  const { used, limit: cap, provider, month } = status.budget;
  const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;

  return (
    <div className={`${styles.page} ${styles.narrow}`}>
      <div className={styles.titleBlock}>
        <h1 className={styles.h1}>Data status</h1>
        <p className={styles.sub}>When each job last ran, the odds budget and what is stored.</p>
      </div>

      <section className={styles.card} aria-labelledby="st-jobs">
        <h2 id="st-jobs" className={styles.h2}>
          Jobs
        </h2>
        {status.jobs.length === 0 ? (
          <p className={styles.muted}>No job has run yet. Run the seed or ingest jobs.</p>
        ) : (
          <div className={styles.tableBox}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Job</th>
                  <th scope="col">Last run</th>
                  <th scope="col">Result</th>
                  <th scope="col">Units</th>
                </tr>
              </thead>
              <tbody>
                {status.jobs.map((j) => (
                  <tr key={j.job}>
                    <td className={styles.mono}>{j.job}</td>
                    <td>{j.lastRun ? when(j.lastRun.startedAt) : '—'}</td>
                    <td>
                      {j.lastRun ? (
                        <span className={own.result} data-status={j.lastRun.status}>
                          {RESULT[j.lastRun.status]}
                        </span>
                      ) : (
                        '—'
                      )}
                      {j.lastRun?.error ? <p className={styles.muted}>{j.lastRun.error}</p> : null}
                    </td>
                    <td className={styles.mono}>{j.lastRun?.units ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.card} aria-labelledby="st-budget">
        <h2 id="st-budget" className={styles.h2}>
          Odds budget
        </h2>
        <p>
          <span className={styles.mono}>
            {used} of {cap}
          </span>{' '}
          units used in {month} ({provider}).
        </p>
        <div
          className={own.meter}
          role="meter"
          aria-label="Odds budget used"
          aria-valuemin={0}
          aria-valuemax={cap}
          aria-valuenow={used}
          aria-valuetext={`${pct}% used`}
        >
          <span className={own.fill} style={{ width: `${pct}%` }} />
        </div>
      </section>

      <section className={styles.card} aria-labelledby="st-rows">
        <h2 id="st-rows" className={styles.h2}>
          Stored rows
        </h2>
        <dl className={own.counts}>
          {Object.entries(status.rowCounts).map(([table, n]) => (
            <div key={table} className={own.count}>
              <dt className={styles.muted}>{table.replace(/_/g, ' ')}</dt>
              <dd className={styles.mono}>{n.toLocaleString('en-US')}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
