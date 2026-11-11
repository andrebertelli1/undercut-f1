import { useMemo } from 'react';
import { t as i18n } from '../../i18n/index.ts';
import { consistency, lapChart, stintPace } from '../../lib/insights.ts';
import { driverColor, formatLapTime } from '../../lib/race.ts';
import { codeOf, findDriver, SpoilerNote, TYRE_COLORS, type TabProps } from './shared.tsx';

/**
 * Aba Análise: evolução das posições, melhores voltas, consistência do
 * pelotão e o ritmo por stint do piloto selecionado.
 */
export function Analytics(props: TabProps) {
  const { race, frame, limitLap, unlocked, onReveal, selected, onSelect } = props;
  const code = codeOf(race);
  const stats = useMemo(() => consistency(race, limitLap), [race, limitLap]);
  const focus = selected ?? frame[0]?.driver.number;
  const stints = useMemo(() => stintPace(race, focus, limitLap), [race, focus, limitLap]);

  // Melhor volta de cada piloto até aqui.
  const best = race.drivers
    .map((d) => {
      const laps = (race.laps[d.number] ?? []).filter(([n, , dur]) => dur !== null && n <= limitLap);
      const top = laps.sort((a, b) => a[2]! - b[2]!)[0];
      return top ? { driver: d.number, lap: top[0], time: top[2]! } : null;
    })
    .filter((b): b is { driver: number; lap: number; time: number } => b !== null)
    .sort((a, b) => a.time - b.time)
    .slice(0, 8);

  return (
    <div className="strategy">
      {!unlocked && (
        <SpoilerNote onReveal={onReveal}>{i18n.strategyLimited(Math.max(1, limitLap))}</SpoilerNote>
      )}

      {race.kind !== 'timed' && (
        <section>
          <h2>{i18n.lapChartTitle}</h2>
          <LapChart {...props} />
        </section>
      )}

      <div className="two-up">
        <section>
          <h2>{i18n.bestLapsTitle}</h2>
          {best.length === 0 ? (
            <p className="note muted">{i18n.paceEmpty}</p>
          ) : (
            <table className="table num">
              <tbody>
                {best.map((b, i) => (
                  <tr key={b.driver} className="is-clickable" onClick={() => onSelect(b.driver)}>
                    <td className="muted">{i + 1}</td>
                    <th>
                      <i className="dot" style={{ background: driverColor(findDriver(race, b.driver)!) }} />
                      {code(b.driver)}
                    </th>
                    <td>{formatLapTime(b.time)}</td>
                    <td className="muted">{i18n.lapN(b.lap)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section>
          <h2>{i18n.stintPaceTitle(code(focus))}</h2>
          {stints.length === 0 ? (
            <p className="note muted">{i18n.paceEmpty}</p>
          ) : (
            <table className="table num">
              <thead>
                <tr>
                  <th>{i18n.tyres}</th>
                  <th>{i18n.lapsHeader}</th>
                  <th>{i18n.averageLap}</th>
                  <th title={i18n.degradationHelp}>{i18n.degradation}</th>
                </tr>
              </thead>
              <tbody>
                {stints.map((s) => (
                  <tr key={s.stint}>
                    <th style={{ color: TYRE_COLORS[s.compound] }}>{i18n.compound(s.compound)}</th>
                    <td>
                      {s.from}–{s.to}
                    </td>
                    <td>{formatLapTime(s.average)}</td>
                    <td>{s.degradation === null ? '—' : i18n.perLap(s.degradation)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="muted small">{i18n.cleanLapsNote}</p>
        </section>
      </div>

      <section>
        <h2>{i18n.consistencyTitle}</h2>
        <p className="sub">{i18n.consistencyHelp}</p>
        {stats.length === 0 ? (
          <p className="note muted">{i18n.paceEmpty}</p>
        ) : (
          <table className="table num">
            <thead>
              <tr>
                <th />
                <th>{i18n.driverHeader}</th>
                <th>{i18n.medianLap}</th>
                <th>{i18n.bestLap}</th>
                <th>{i18n.spread}</th>
                <th>{i18n.cleanLapsHeader}</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s, i) => (
                <tr
                  key={s.driver}
                  className={`is-clickable ${s.driver === selected ? 'is-selected' : ''}`}
                  onClick={() => onSelect(s.driver === selected ? null : s.driver)}
                >
                  <td className="muted">{i + 1}</td>
                  <th>
                    <i className="dot" style={{ background: driverColor(findDriver(race, s.driver)!) }} />
                    {code(s.driver)}
                  </th>
                  <td>{formatLapTime(s.median)}</td>
                  <td>{formatLapTime(s.best)}</td>
                  <td>±{s.spread.toFixed(3)}</td>
                  <td className="muted">{s.laps}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

/** Posição de cada piloto volta a volta; o selecionado fica em destaque. */
function LapChart({ race, limitLap, lap, selected, onSelect }: TabProps) {
  const chart = useMemo(() => lapChart(race), [race]);
  const W = 1000;
  const LEFT = 30;
  const RIGHT = 46;
  const TOP = 8;
  const ROW = 15;
  const n = race.drivers.length;
  const H = TOP + n * ROW + 20;
  const x = (l: number) => LEFT + ((l - 1) / Math.max(1, race.totalLaps - 1)) * (W - LEFT - RIGHT);
  const y = (p: number) => TOP + (p - 0.5) * ROW;
  const ticks: number[] = [];
  for (let l = 1; l <= race.totalLaps; l++) if (l === 1 || l % 10 === 0) ticks.push(l);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart lap-chart" role="img" aria-label={i18n.lapChartTitle}>
      {Array.from({ length: n }, (_, i) => i + 1)
        .filter((p) => p === 1 || p % 5 === 0)
        .map((p) => (
          <g key={p}>
            <line x1={LEFT} x2={W - RIGHT} y1={y(p)} y2={y(p)} className="chart-grid" />
            <text x={LEFT - 6} y={y(p) + 4} textAnchor="end" className="chart-axis">
              {p}
            </text>
          </g>
        ))}
      {ticks.map((l) => (
        <text key={l} x={x(l)} y={H - 4} textAnchor="middle" className="chart-axis">
          {l}
        </text>
      ))}
      {chart.map(({ driver, positions }) => {
        const d = findDriver(race, driver)!;
        let path = '';
        let pen = false;
        let lastIndex = -1;
        positions.forEach((p, i) => {
          if (p === null || p > n || i + 1 > limitLap) {
            pen = false;
            return;
          }
          path += `${pen ? 'L' : 'M'}${x(i + 1).toFixed(1)},${y(p).toFixed(1)}`;
          pen = true;
          lastIndex = i;
        });
        if (!path) return null;
        const active = driver === selected;
        return (
          <g
            key={driver}
            className={`lap-line ${active ? 'is-selected' : ''} ${selected !== null && !active ? 'is-dim' : ''}`}
            onClick={() => onSelect(active ? null : driver)}
          >
            <path d={path} fill="none" stroke="transparent" strokeWidth={10} />
            <path d={path} fill="none" stroke={driverColor(d)} strokeWidth={active ? 3 : 1.6} strokeLinejoin="round" />
            <text x={x(lastIndex + 1) + 6} y={y(positions[lastIndex]!) + 4} className="chart-label" fill={driverColor(d)}>
              {d.code}
            </text>
          </g>
        );
      })}
      {lap >= 1 && lap <= limitLap && <line x1={x(lap)} x2={x(lap)} y1={TOP} y2={H - 18} className="chart-cursor" />}
    </svg>
  );
}
