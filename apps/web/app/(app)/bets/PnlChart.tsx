'use client';

import { formatSignedMoney, type SeriesPoint } from '@blueline/contracts';
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { formatDay } from '../../../lib/bets';
import styles from './chart.module.css';

const MINUS = '−';
const PAD = { top: 14, right: 16, bottom: 28, left: 56 } as const;

const DAY = 86_400_000;
const t = (ymd: string) => Date.parse(`${ymd}T12:00:00Z`);

/** A round tick step so ~4 ticks span [lo, hi]. */
function niceStep(span: number): number {
  const raw = span / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
}

function compactMoney(n: number, currency: string): string {
  const s = new Intl.NumberFormat(currency === 'PHP' ? 'en-PH' : 'en-US', {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Math.abs(n));
  return n < 0 ? `${MINUS}${s}` : s;
}

const shortDay = (ymd: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(
    new Date(t(ymd)),
  );

/**
 * Cumulative PnL as a step line (PnL only changes when a bet settles), area tinted brand above
 * zero and signal below it, a drawn zero rule, hover/focus tooltip, hidden data table.
 */
export function PnlChart({ series, currency }: { series: SeriesPoint[]; currency: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  const [width, setWidth] = useState(720);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(280, Math.round(el.getBoundingClientRect().width)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const height = width < 520 ? 220 : 280;
  const n = series.length;
  const first = series[0];
  const last = series[n - 1];

  const cums = series.map((p) => p.cumulative);
  const lo = Math.min(0, ...cums);
  const hi = Math.max(0, ...cums);
  const step = niceStep(Math.max(hi - lo, 1));
  const yMin = Math.floor(lo / step) * step;
  const yMax = Math.max(Math.ceil(hi / step) * step, yMin + step);

  const t0 = first ? t(first.date) : 0;
  const t1 = last ? Math.max(t(last.date), t0 + DAY) : DAY;
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const x = useCallback(
    (ymd: string) => PAD.left + ((t(ymd) - t0) / (t1 - t0)) * innerW,
    [t0, t1, innerW],
  );
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * innerH;
  const y0 = y(0);

  const ticks: number[] = [];
  for (let v = yMin; v <= yMax + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);

  // Step-after path starting at 0 on the first date.
  const xs = series.map((p) => x(p.date));
  let line = first ? `M${x(first.date)},${y0}` : '';
  series.forEach((p, i) => {
    line += `V${y(p.cumulative)}`;
    const nx = xs[i + 1];
    if (nx !== undefined) line += `H${nx}`;
  });
  const area = first && last ? `${line}V${y0}H${x(first.date)}Z` : '';

  const pick = (clientX: number) => {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box || n === 0) return;
    const px = clientX - box.left;
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(xs[i]! - px) < Math.abs(xs[best]! - px)) best = i;
    setActive(best);
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (n === 0) return;
    const cur = active ?? n - 1;
    const next =
      e.key === 'ArrowRight'
        ? Math.min(n - 1, cur + 1)
        : e.key === 'ArrowLeft'
          ? Math.max(0, cur - 1)
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? n - 1
              : null;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
  };

  const a = active !== null ? series[active] : undefined;
  const label =
    n === 0 || !first || !last
      ? 'Cumulative profit and loss: no settled bets yet.'
      : `Cumulative profit and loss in ${currency}: ${n} settled ${n === 1 ? 'bet' : 'bets'} from ${formatDay(first.date)} to ${formatDay(last.date)}, now ${formatSignedMoney(last.cumulative, currency)}, low ${formatSignedMoney(lo, currency)}, high ${formatSignedMoney(hi, currency)}.`;

  const tipLeft = a ? Math.min(Math.max(x(a.date), 90), width - 90) : 0;
  const clipPos = `${uid}-pos`;
  const clipNeg = `${uid}-neg`;

  return (
    <figure className={styles.figure}>
      <div
        ref={wrapRef}
        className={styles.wrap}
        role="group"
        aria-label="PnL chart. Use the left and right arrow keys to inspect each settled bet."
        tabIndex={0}
        onKeyDown={onKey}
        onFocus={() => setActive((c) => c ?? (n > 0 ? n - 1 : null))}
        onBlur={() => setActive(null)}
        onPointerMove={(e) => pick(e.clientX)}
        onPointerLeave={() => setActive(null)}
      >
        <svg
          role="img"
          aria-label={label}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className={styles.svg}
        >
          <defs>
            <clipPath id={clipPos}>
              <rect x={PAD.left} y={PAD.top} width={innerW} height={Math.max(0, y0 - PAD.top)} />
            </clipPath>
            <clipPath id={clipNeg}>
              <rect
                x={PAD.left}
                y={y0}
                width={innerW}
                height={Math.max(0, height - PAD.bottom - y0)}
              />
            </clipPath>
          </defs>
          {ticks.map((v) => (
            <g key={v}>
              {v !== 0 ? (
                <line
                  className={styles.grid}
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={y(v)}
                  y2={y(v)}
                />
              ) : null}
              <text className={styles.tick} x={PAD.left - 8} y={y(v)} textAnchor="end" dy="0.32em">
                {compactMoney(v, currency)}
              </text>
            </g>
          ))}
          {first && last ? (
            <>
              <path d={area} className={styles.areaPos} clipPath={`url(#${clipPos})`} />
              <path d={area} className={styles.areaNeg} clipPath={`url(#${clipNeg})`} />
            </>
          ) : null}
          <line className={styles.zero} x1={PAD.left} x2={width - PAD.right} y1={y0} y2={y0} />
          {first && last ? <path d={line} className={styles.line} /> : null}
          {n > 0 && n <= 60
            ? series.map((p, i) => (
                <circle
                  key={`${p.id ?? i}`}
                  className={styles.dot}
                  cx={xs[i]}
                  cy={y(p.cumulative)}
                  r={3.5}
                />
              ))
            : null}
          {first && last ? (
            <>
              <text className={styles.tick} x={PAD.left} y={height - 8} textAnchor="start">
                {shortDay(first.date)}
              </text>
              {t(last.date) > t(first.date) ? (
                <text className={styles.tick} x={width - PAD.right} y={height - 8} textAnchor="end">
                  {shortDay(last.date)}
                </text>
              ) : null}
            </>
          ) : null}
          {a ? (
            <g>
              <line
                className={styles.cursor}
                x1={x(a.date)}
                x2={x(a.date)}
                y1={PAD.top}
                y2={height - PAD.bottom}
              />
              <circle className={styles.dotActive} cx={x(a.date)} cy={y(a.cumulative)} r={5} />
            </g>
          ) : null}
        </svg>
        {n === 0 ? <p className={styles.empty}>Settle a bet to start your PnL line.</p> : null}
        {a ? (
          <div
            className={styles.tip}
            style={{ left: tipLeft, top: Math.max(0, y(a.cumulative) - 76) }}
            aria-hidden="true"
          >
            <span className={styles.tipDate}>{formatDay(a.date)}</span>
            <span className={styles.tipRow}>
              Running PnL <strong>{formatSignedMoney(a.cumulative, currency)}</strong>
            </span>
            <span className={styles.tipRow}>
              This bet <strong>{formatSignedMoney(a.pnl, currency)}</strong>
            </span>
          </div>
        ) : null}
      </div>
      <p className="sr-only" aria-live="polite">
        {a
          ? `${formatDay(a.date)}: running PnL ${formatSignedMoney(a.cumulative, currency)}, this bet ${formatSignedMoney(a.pnl, currency)}`
          : ''}
      </p>
      <table className="sr-only">
        <caption>Cumulative profit and loss by settled bet, {currency}</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">This bet</th>
            <th scope="col">Running PnL</th>
          </tr>
        </thead>
        <tbody>
          {series.map((p, i) => (
            <tr key={`${p.id ?? i}`}>
              <th scope="row">{formatDay(p.date)}</th>
              <td>{formatSignedMoney(p.pnl, currency)}</td>
              <td>{formatSignedMoney(p.cumulative, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
