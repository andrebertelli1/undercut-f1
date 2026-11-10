import { useEffect, useMemo, useState } from 'react';
import { t as i18n } from '../../i18n/index.ts';
import { biggestSegments, gapBetween, lapDelta } from '../../lib/insights.ts';
import { formatLapTime, loadSectors, loadTelemetry, type LoadedRace } from '../../lib/race.ts';
import type { RaceData, RaceDriver, RaceSectors, RaceTelemetry } from '../../lib/raceTypes.ts';
import { DriverPicker, findDriver, pairColors, signed, SpoilerNote, type TabProps } from './shared.tsx';
import { TrackMap } from './TrackMap.tsx';

interface Pair {
  a: RaceDriver;
  b: RaceDriver;
  colorA: string;
  colorB: string;
  dashedB: boolean;
}

/**
 * Aba Comparar: dois pilotos frente a frente — onde estão na pista, como a
 * distância entre eles evoluiu, ritmo, setores e a melhor volta de cada um.
 */
export function Compare(
  props: TabProps & {
    loaded: LoadedRace;
    t: number;
    a: number;
    b: number;
    onChangeA: (n: number) => void;
    onChangeB: (n: number) => void;
  },
) {
  const { race, frame, lap, limitLap, unlocked, onReveal, loaded, t } = props;
  const da = findDriver(race, props.a);
  const db = findDriver(race, props.b);
  if (!da || !db) return null;
  const pair: Pair = { a: da, b: db, ...pairColors(da, db) };
  const rowA = frame.find((r) => r.driver.number === da.number);
  const rowB = frame.find((r) => r.driver.number === db.number);
  const gapNow =
    rowA && rowB && rowA.gap !== null && rowB.gap !== null && rowA.gap >= 0 && rowB.gap >= 0
      ? rowB.gap - rowA.gap
      : null;

  return (
    <div className="strategy">
      <section>
        <div className="strategy-head">
          <h2>{i18n.compareTitle}</h2>
          <div className="pickers">
            <DriverPicker frame={frame} value={da.number} onChange={props.onChangeA} label={i18n.driverA} color={pair.colorA} />
            <DriverPicker frame={frame} value={db.number} onChange={props.onChangeB} label={i18n.driverB} color={pair.colorB} />
          </div>
        </div>
        <div className="compare-top">
          <TrackMap race={loaded} t={t} frame={frame} selected={null} onSelect={() => {}} only={[da.number, db.number]} />
          <dl className="driver-stats compare-stats">
            <div>
              <dt>{da.code}</dt>
              <dd className="num">{rowA ? (rowA.retired ? i18n.out : `${rowA.pos}º`) : '—'}</dd>
            </div>
            <div>
              <dt>{db.code}</dt>
              <dd className="num">{rowB ? (rowB.retired ? i18n.out : `${rowB.pos}º`) : '—'}</dd>
            </div>
            <div className="wide">
              <dt>{i18n.gapNow}</dt>
              <dd className="num">
                {gapNow === null
                  ? '—'
                  : gapNow >= 0
                    ? i18n.aheadBy(da.code, gapNow)
                    : i18n.aheadBy(db.code, -gapNow)}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section>
        <h2>{i18n.gapTitle(da.code, db.code)}</h2>
        <GapChart race={race} pair={pair} limitLap={limitLap} lap={lap} />
      </section>

      <section>
        <h2>{i18n.paceTitle}</h2>
        <PaceChart race={race} pair={pair} limitLap={limitLap} lap={lap} />
      </section>

      <section>
        <h2>{i18n.sectorsTitle}</h2>
        <Sectors race={race} pair={pair} limitLap={limitLap} lap={lap} />
      </section>

      <section>
        <h2>{i18n.telemetryTitle}</h2>
        {unlocked ? (
          <TelemetryCompare sessionKey={race.sessionKey} pair={pair} />
        ) : (
          <SpoilerNote onReveal={onReveal}>{i18n.telemetryLocked}</SpoilerNote>
        )}
      </section>
    </div>
  );
}

const W = 1000;
const LEFT = 62;
const RIGHT = 8;

function lapTicks(total: number): number[] {
  const out: number[] = [];
  for (let n = 1; n <= total; n++) if (n === 1 || n % 10 === 0) out.push(n);
  return out;
}

// ---------- Distância entre os dois ----------

function GapChart({ race, pair, limitLap, lap }: { race: RaceData; pair: Pair; limitLap: number; lap: number }) {
  const gaps = useMemo(() => gapBetween(race, pair.a.number, pair.b.number), [race, pair.a.number, pair.b.number]);
  const shown = gaps.map((g, i) => (i + 1 <= limitLap ? g : null));
  const values = shown.filter((g): g is number => g !== null);
  if (values.length < 2) return <p className="note muted">{i18n.gapEmpty}</p>;

  const H = 200;
  const PAD = { top: 12, bottom: 22 };
  const max = Math.max(1, ...values.map(Math.abs));
  const x = (n: number) => LEFT + ((n - 1) / (race.totalLaps - 1)) * (W - LEFT - RIGHT);
  const y = (v: number) => PAD.top + ((max - v) / (2 * max)) * (H - PAD.top - PAD.bottom);
  let d = '';
  let pen = false;
  shown.forEach((g, i) => {
    if (g === null) {
      pen = false;
      return;
    }
    d += `${pen ? 'L' : 'M'}${x(i + 1).toFixed(1)},${y(g).toFixed(1)}`;
    pen = true;
  });

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={i18n.gapTitle(pair.a.code, pair.b.code)}>
        <rect x={LEFT} y={PAD.top} width={W - LEFT - RIGHT} height={y(0) - PAD.top} fill={pair.colorA} opacity={0.07} />
        <rect x={LEFT} y={y(0)} width={W - LEFT - RIGHT} height={H - PAD.bottom - y(0)} fill={pair.colorB} opacity={0.07} />
        {[max, 0, -max].map((v) => (
          <g key={v}>
            <line x1={LEFT} x2={W - RIGHT} y1={y(v)} y2={y(v)} className="chart-grid" />
            <text x={LEFT - 6} y={y(v) + 4} textAnchor="end" className="chart-axis">
              {Math.abs(v).toFixed(v === 0 ? 0 : 1)} s
            </text>
          </g>
        ))}
        <text x={LEFT + 6} y={PAD.top + 13} className="chart-axis">
          {i18n.aheadShort(pair.a.code)}
        </text>
        <text x={LEFT + 6} y={H - PAD.bottom - 6} className="chart-axis">
          {i18n.aheadShort(pair.b.code)}
        </text>
        {lapTicks(race.totalLaps).map((n) => (
          <text key={n} x={x(n)} y={H - 6} textAnchor="middle" className="chart-axis">
            {n}
          </text>
        ))}
        <path d={d} fill="none" stroke="var(--text)" strokeWidth={2} strokeLinejoin="round" />
        {lap >= 1 && lap <= limitLap && (
          <line x1={x(lap)} x2={x(lap)} y1={PAD.top} y2={H - PAD.bottom} className="chart-cursor" />
        )}
      </svg>
    </>
  );
}

// ---------- Ritmo ----------

function PaceChart({ race, pair, limitLap, lap }: { race: RaceData; pair: Pair; limitLap: number; lap: number }) {
  const H = 240;
  const PAD = { top: 10, bottom: 22 };
  const total = race.totalLaps;
  const lapsOf = (d: RaceDriver) =>
    (race.laps[d.number] ?? []).filter(([n, , dur]) => dur !== null && n <= limitLap && n > 1) as [
      number,
      number,
      number,
    ][];
  const la = lapsOf(pair.a);
  const lb = lapsOf(pair.b);
  const all = [...la, ...lb].map((l) => l[2]).sort((p, q) => p - q);
  if (all.length < 2) return <p className="note muted">{i18n.paceEmpty}</p>;

  // Voltas de pit e de neutralização são muito mais lentas: ficam fora da escala.
  const yMax = all[Math.floor(all.length / 2)] * 1.1;
  const yMin = all[0] * 0.995;
  const x = (n: number) => LEFT + ((n - 1) / (total - 1)) * (W - LEFT - RIGHT);
  const y = (v: number) => PAD.top + ((yMax - v) / (yMax - yMin)) * (H - PAD.top - PAD.bottom);
  const path = (laps: [number, number, number][]) => {
    let d = '';
    let prev = -1;
    for (const [n, , dur] of laps) {
      if (dur > yMax) continue;
      d += `${n === prev + 1 ? 'L' : 'M'}${x(n).toFixed(1)},${y(dur).toFixed(1)}`;
      prev = n;
    }
    return d;
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={i18n.paceTitle}>
      {[0, 1, 2, 3].map((i) => {
        const v = yMin + ((yMax - yMin) * i) / 3;
        return (
          <g key={i}>
            <line x1={LEFT} x2={W - RIGHT} y1={y(v)} y2={y(v)} className="chart-grid" />
            <text x={LEFT - 6} y={y(v) + 4} textAnchor="end" className="chart-axis">
              {formatLapTime(v).slice(0, -2)}
            </text>
          </g>
        );
      })}
      {lapTicks(total).map((n) => (
        <text key={n} x={x(n)} y={H - 6} textAnchor="middle" className="chart-axis">
          {n}
        </text>
      ))}
      <path d={path(la)} fill="none" stroke={pair.colorA} strokeWidth={2} strokeLinejoin="round" />
      <path d={path(lb)} fill="none" stroke={pair.colorB} strokeWidth={2} strokeLinejoin="round" strokeDasharray={pair.dashedB ? '6 4' : undefined} />
      {lap >= 1 && lap <= limitLap && (
        <line x1={x(lap)} x2={x(lap)} y1={PAD.top} y2={H - PAD.bottom} className="chart-cursor" />
      )}
    </svg>
  );
}

// ---------- Setores ----------

function Sectors({ race, pair, limitLap, lap }: { race: RaceData; pair: Pair; limitLap: number; lap: number }) {
  const [sectors, setSectors] = useState<RaceSectors | null | undefined>(undefined);
  const [chosen, setChosen] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadSectors(race.sessionKey).then((v) => !cancelled && setSectors(v));
    return () => {
      cancelled = true;
    };
  }, [race.sessionKey]);

  if (sectors === undefined) return <p className="note muted">{i18n.loading}…</p>;
  const sa = sectors?.[pair.a.number] ?? [];
  const sb = sectors?.[pair.b.number] ?? [];
  // Voltas em que os dois têm os três setores, até onde já foi assistido.
  const common = sa.map((s) => s[0]).filter((n) => n <= limitLap && sb.some((s) => s[0] === n));
  if (common.length === 0) return <p className="note muted">{i18n.sectorsEmpty}</p>;

  // Por padrão, a última volta completa em relação ao player.
  const fallback = [...common].reverse().find((n) => n < Math.max(2, lap)) ?? common[0];
  const n = chosen !== null && common.includes(chosen) ? chosen : fallback;
  const ra = sa.find((s) => s[0] === n)!;
  const rb = sb.find((s) => s[0] === n)!;
  const rows = [1, 2, 3].map((i) => ({ label: i18n.sector(i), a: ra[i], b: rb[i] }));
  rows.push({ label: i18n.lapTotal, a: ra[1] + ra[2] + ra[3], b: rb[1] + rb[2] + rb[3] });

  return (
    <>
      <label className="picker">
        <span className="muted">{i18n.lapPick}</span>
        <select value={n} onChange={(e) => setChosen(Number(e.target.value))}>
          {common.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <table className="table num">
        <thead>
          <tr>
            <th />
            <th style={{ color: pair.colorA }}>{pair.a.code}</th>
            <th style={{ color: pair.colorB }}>{pair.b.code}</th>
            <th>{i18n.difference}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const diff = r.b - r.a;
            return (
              <tr key={r.label} className={r.label === i18n.lapTotal ? 'is-total' : ''}>
                <th>{r.label}</th>
                <td className={diff > 0 ? 'is-better' : ''}>{formatLapTime(r.a)}</td>
                <td className={diff < 0 ? 'is-better' : ''}>{formatLapTime(r.b)}</td>
                <td>
                  {diff === 0 ? '0.000' : `${diff > 0 ? pair.a.code : pair.b.code} ${signed(-Math.abs(diff))}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

// ---------- Melhor volta: telemetria ----------

function TelemetryCompare({ sessionKey, pair }: { sessionKey: number; pair: Pair }) {
  const [tel, setTel] = useState<RaceTelemetry | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    loadTelemetry(sessionKey).then((v) => !cancelled && setTel(v));
    return () => {
      cancelled = true;
    };
  }, [sessionKey]);

  if (tel === undefined) return <p className="note muted">{i18n.loading}…</p>;
  const ta = tel?.laps[pair.a.number];
  const tb = tel?.laps[pair.b.number];
  if (!tel || !ta || !tb) return <p className="note muted">{i18n.telemetryMissing}</p>;

  const n = tel.points;
  const x = (i: number) => LEFT + (i / n) * (W - LEFT - RIGHT);
  const line = (values: number[], y: (v: number) => number) =>
    values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');

  const SPEED_H = 200;
  const vMax = Math.ceil(Math.max(...ta.speed, ...tb.speed) / 50) * 50;
  const ySpeed = (v: number) => 8 + (1 - v / vMax) * (SPEED_H - 16);
  const speedTicks: number[] = [];
  for (let v = 100; v <= vMax; v += 100) speedTicks.push(v);

  const delta = lapDelta(ta, tb);
  const DELTA_H = 110;
  const dMax = Math.max(0.1, ...delta.map(Math.abs));
  const yDelta = (v: number) => 8 + ((dMax - v) / (2 * dMax)) * (DELTA_H - 16);
  const segments = biggestSegments(delta);

  const THR_H = 60;
  const yThr = (v: number) => 4 + (1 - v / 100) * (THR_H - 8);
  const brakeRuns = (values: number[]) => {
    const runs: [number, number][] = [];
    let start = -1;
    values.forEach((v, i) => {
      if (v && start < 0) start = i;
      if ((!v || i === values.length - 1) && start >= 0) {
        runs.push([start, v ? i : i - 1]);
        start = -1;
      }
    });
    return runs;
  };
  const dash = pair.dashedB ? '6 4' : undefined;
  const diff = tb.time - ta.time;

  return (
    <div className="telemetry">
      <p className="tel-summary">
        <span>
          <i style={{ background: pair.colorA }} />
          <strong>{pair.a.code}</strong> {i18n.lapN(ta.lap)} · <span className="num">{formatLapTime(ta.time)}</span>
        </span>
        <span>
          <i style={{ background: pair.colorB }} />
          <strong>{pair.b.code}</strong> {i18n.lapN(tb.lap)} · <span className="num">{formatLapTime(tb.time)}</span>
          <span className="muted num"> ({signed(diff)})</span>
        </span>
      </p>

      <svg viewBox={`0 0 ${W} ${SPEED_H}`} className="chart" role="img" aria-label={i18n.speedKmh}>
        {speedTicks.map((v) => (
          <g key={v}>
            <line x1={LEFT} x2={W - RIGHT} y1={ySpeed(v)} y2={ySpeed(v)} className="chart-grid" />
            <text x={LEFT - 6} y={ySpeed(v) + 4} textAnchor="end" className="chart-axis">
              {v}
            </text>
          </g>
        ))}
        <text x={4} y={14} className="chart-axis">
          {i18n.speedKmh}
        </text>
        <path d={line(ta.speed, ySpeed)} fill="none" stroke={pair.colorA} strokeWidth={2} />
        <path d={line(tb.speed, ySpeed)} fill="none" stroke={pair.colorB} strokeWidth={2} strokeDasharray={dash} />
      </svg>

      <svg viewBox={`0 0 ${W} ${DELTA_H}`} className="chart" role="img" aria-label={i18n.deltaTitle}>
        <text x={4} y={14} className="chart-axis">
          {i18n.deltaTitle}
        </text>
        {segments.map((s) => (
          <rect
            key={s.from}
            x={x(s.from * n)}
            y={8}
            width={x(s.to * n) - x(s.from * n)}
            height={DELTA_H - 16}
            fill={s.loss > 0 ? pair.colorA : pair.colorB}
            opacity={0.12}
          />
        ))}
        {[dMax, 0, -dMax].map((v) => (
          <g key={v}>
            <line x1={LEFT} x2={W - RIGHT} y1={yDelta(v)} y2={yDelta(v)} className="chart-grid" />
            <text x={LEFT - 6} y={yDelta(v) + 4} textAnchor="end" className="chart-axis">
              {v === 0 ? '0' : signed(v, 2)}
            </text>
          </g>
        ))}
        <path d={line(delta, yDelta)} fill="none" stroke="var(--text)" strokeWidth={2} />
      </svg>
      <ul className="segments">
        {segments.map((s) => {
          const winner = s.loss > 0 ? pair.a : pair.b;
          return (
            <li key={s.from}>
              <i style={{ background: s.loss > 0 ? pair.colorA : pair.colorB }} />
              {i18n.segmentGain(winner.code, Math.abs(s.loss), Math.round(s.from * 100), Math.round(s.to * 100))}
            </li>
          );
        })}
      </ul>

      <svg viewBox={`0 0 ${W} ${THR_H}`} className="chart" role="img" aria-label={i18n.throttle}>
        <text x={4} y={14} className="chart-axis">
          {i18n.throttle}
        </text>
        <line x1={LEFT} x2={W - RIGHT} y1={yThr(0)} y2={yThr(0)} className="chart-grid" />
        <line x1={LEFT} x2={W - RIGHT} y1={yThr(100)} y2={yThr(100)} className="chart-grid" />
        <path d={line(ta.throttle, yThr)} fill="none" stroke={pair.colorA} strokeWidth={1.5} />
        <path d={line(tb.throttle, yThr)} fill="none" stroke={pair.colorB} strokeWidth={1.5} strokeDasharray={dash} />
      </svg>

      <svg viewBox={`0 0 ${W} 40`} className="chart" role="img" aria-label={i18n.brake}>
        <text x={4} y={24} className="chart-axis">
          {i18n.brake}
        </text>
        {[
          { values: ta.brake, color: pair.colorA, y: 6 },
          { values: tb.brake, color: pair.colorB, y: 22 },
        ].map((row) => (
          <g key={row.y}>
            <rect x={LEFT} y={row.y} width={W - LEFT - RIGHT} height={12} className="brake-track" />
            {brakeRuns(row.values).map(([from, to]) => (
              <rect key={from} x={x(from)} y={row.y} width={Math.max(2, x(to + 1) - x(from))} height={12} fill={row.color} />
            ))}
          </g>
        ))}
      </svg>
      <p className="muted tel-axis">{i18n.telemetryAxis}</p>
    </div>
  );
}
