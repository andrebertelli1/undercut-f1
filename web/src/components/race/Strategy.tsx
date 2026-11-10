import { useMemo } from 'react';
import { t as i18n } from '../../i18n/index.ts';
import { findPitBattles, pitStops } from '../../lib/insights.ts';
import { driverColor } from '../../lib/race.ts';
import { codeOf, findDriver, SpoilerNote, TYRE_COLORS, type TabProps } from './shared.tsx';

/**
 * Aba Estratégia: pneus de todos os pilotos, a tabela de pit stops e as
 * posições trocadas pela ordem das paradas (undercut e overcut).
 */
export function Strategy(props: TabProps) {
  const { race, limitLap, limitT, unlocked, onReveal, onOpenAt, selected } = props;
  const code = codeOf(race);
  const stops = useMemo(() => pitStops(race), [race]);
  const battles = useMemo(() => findPitBattles(race), [race]);
  const shownStops = stops.filter(
    (s) => (unlocked || s.t + s.lane <= limitT) && (selected === null || s.driver === selected),
  );
  const shownBattles = battles.filter((b) => unlocked || b.t <= limitT);

  return (
    <div className="strategy">
      {!unlocked && (
        <SpoilerNote onReveal={onReveal}>{i18n.strategyLimited(Math.max(1, limitLap))}</SpoilerNote>
      )}

      <section>
        <h2>{i18n.stintsTitle}</h2>
        <StintsChart {...props} />
      </section>

      <section>
        <h2>{i18n.battlesTitle}</h2>
        <p className="sub">{i18n.battlesHelp}</p>
        {shownBattles.length === 0 ? (
          <p className="note muted">{i18n.battlesEmpty}</p>
        ) : (
          <ul className="story">
            {shownBattles.map((b) => (
              <li key={`${b.winner}-${b.loser}-${b.winnerLap}`}>
                <button className="story-item" onClick={() => onOpenAt(b.t - 30, b.winner)} title={i18n.openInReplay}>
                  <span className="story-when num">
                    <strong>{i18n.lapShort(Math.max(b.winnerLap, b.loserLap))}</strong>
                  </span>
                  <span className="story-body">
                    <span className="story-kind">{i18n.battleKind[b.kind]}</span>
                    <span>{i18n.battleText(b.kind, code(b.winner), code(b.loser), b.winnerLap, b.loserLap)}</span>
                  </span>
                  <span className="tag source-inferred" title={i18n.sourceHelp.inferred}>
                    {i18n.source.inferred}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>
          {i18n.pitTableTitle}
          {selected !== null && <span className="muted"> · {code(selected)}</span>}
        </h2>
        {shownStops.length === 0 ? (
          <p className="note muted">{i18n.pitTableEmpty}</p>
        ) : (
          <table className="table num">
            <thead>
              <tr>
                <th>{i18n.lapHeader}</th>
                <th>{i18n.driverHeader}</th>
                <th>{i18n.tyreChange}</th>
                <th>{i18n.pitLaneTime}</th>
                <th>{i18n.positionChange}</th>
              </tr>
            </thead>
            <tbody>
              {shownStops.map((s) => {
                const d = findDriver(race, s.driver);
                const lost = s.posAfter - s.posBefore;
                return (
                  <tr key={`${s.driver}-${s.t}`} className="is-clickable" onClick={() => onOpenAt(s.t - 5, s.driver)}>
                    <td>{s.lap}</td>
                    <th>
                      <i className="dot" style={{ background: d ? driverColor(d) : undefined }} />
                      {d?.code}
                    </th>
                    <td>
                      <Compound value={s.from} /> → <Compound value={s.to} />
                    </td>
                    <td>
                      {s.lane.toFixed(1)} s{s.neutralised && <span className="tag row-sub">{i18n.underCaution}</span>}
                    </td>
                    <td>
                      {s.posBefore}º → {s.posAfter}º
                      <span className="muted"> ({lost === 0 ? '=' : lost > 0 ? `−${lost}` : `+${-lost}`})</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Compound({ value }: { value: string | null }) {
  if (!value) return <span className="muted">—</span>;
  return (
    <span style={{ color: TYRE_COLORS[value] ?? 'var(--muted)' }} title={i18n.compound(value)}>
      {i18n.compound(value)}
    </span>
  );
}

function StintsChart({ race, frame, lap, limitLap, selected, onSelect }: TabProps) {
  const W = 1000;
  const LEFT = 62;
  const RIGHT = 8;
  const TOP = 18;
  const ROW = 19;
  const total = race.totalLaps;
  const x = (n: number) => LEFT + ((n - 1) / total) * (W - LEFT - RIGHT);
  const H = TOP + frame.length * ROW + 4;
  const ticks: number[] = [];
  for (let n = 1; n <= total; n++) if (n === 1 || n % 10 === 0) ticks.push(n);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart stints-chart" role="img" aria-label={i18n.stintsTitle}>
      {ticks.map((n) => (
        <g key={n}>
          <line x1={x(n)} x2={x(n)} y1={TOP - 3} y2={H} className="chart-grid" />
          <text x={x(n) + 3} y={11} className="chart-axis">
            {n}
          </text>
        </g>
      ))}
      {frame.map((row, i) => {
        const y = TOP + i * ROW;
        const stints = (race.stints[row.driver.number] ?? []).filter(([from]) => from <= limitLap);
        const isSelected = row.driver.number === selected;
        return (
          <g
            key={row.driver.number}
            className={`stint-row ${isSelected ? 'is-selected' : ''}`}
            onClick={() => onSelect(isSelected ? null : row.driver.number)}
          >
            <rect x={0} y={y} width={W} height={ROW} className="stint-hit" />
            <rect x={0} y={y + 3} width={4} height={ROW - 6} fill={driverColor(row.driver)} />
            <text x={12} y={y + ROW - 5} className="stint-code">
              {row.driver.code}
            </text>
            {stints.map(([from, to, compound]) => {
              const end = Math.min(to, limitLap);
              return (
                <rect
                  key={from}
                  x={x(from) + 1}
                  y={y + 4}
                  width={Math.max(2, x(end + 1) - x(from) - 2)}
                  height={ROW - 8}
                  rx={2}
                  fill={TYRE_COLORS[compound] ?? '#8d8d99'}
                >
                  <title>{`${row.driver.code} · ${i18n.compound(compound)} · ${i18n.lapRange(from, end)} (${i18n.lapsCount(end - from + 1)})`}</title>
                </rect>
              );
            })}
          </g>
        );
      })}
      {lap >= 1 && <line x1={x(lap)} x2={x(lap)} y1={TOP - 3} y2={H} className="chart-cursor" />}
    </svg>
  );
}
