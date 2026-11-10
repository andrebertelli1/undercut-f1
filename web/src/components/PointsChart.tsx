import { t } from '../i18n/index.ts';
import { pointsHistory } from '../lib/season.ts';
import { teamStyle } from '../lib/teams.ts';
import type { DriverStanding, SeasonData } from '../lib/types.ts';

const W = 300;
const H = 190;
const PAD = { top: 10, right: 34, bottom: 20, left: 28 };

/** Linhas com os pontos acumulados dos primeiros colocados, etapa a etapa. */
export function PointsChart({
  data,
  standings,
  asOf,
}: {
  data: SeasonData;
  standings: DriverStanding[];
  asOf: number;
}) {
  const top = standings.slice(0, 6);
  const series = pointsHistory(
    data,
    top.map((s) => s.driverId),
    asOf,
  );
  const totalRounds = data.rounds.length;
  const max = Math.max(25, ...top.map((s) => s.points));
  const x = (round: number) =>
    PAD.left + ((round - 1) / Math.max(1, totalRounds - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => H - PAD.bottom - (v / max) * (H - PAD.top - PAD.bottom);

  const step = max > 300 ? 100 : max > 120 ? 50 : 25;
  const grid: number[] = [];
  for (let v = 0; v <= max; v += step) grid.push(v);

  // Companheiros de equipe têm a mesma cor: o segundo da equipe vai tracejado.
  const seenTeams = new Set<string>();
  // Evita rótulos sobrepostos no fim das linhas.
  let lastLabelY = -Infinity;
  const labels = top
    .map((s) => ({ s, y: y(s.points) }))
    .sort((a, b) => a.y - b.y)
    .map((l) => {
      const ly = Math.max(l.y, lastLabelY + 11);
      lastLabelY = ly;
      return { ...l, ly };
    });

  return (
    <section className="panel">
      <h2>{t.evolution}</h2>
      {top.length >= 2 && (
        <div className="big-numbers">
          {top.slice(0, 2).map((s) => (
            <div key={s.driverId}>
              <div className="label">{data.drivers[s.driverId]?.familyName}</div>
              <div className="value" style={{ color: teamStyle(s.teamId).color }}>
                {s.points}
              </div>
            </div>
          ))}
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={t.evolution}>
        {grid.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="chart-grid" />
            <text x={PAD.left - 5} y={y(v) + 3} textAnchor="end" className="chart-axis">
              {v}
            </text>
          </g>
        ))}
        {[1, Math.ceil(totalRounds / 2), totalRounds].map((r) => (
          <text key={r} x={x(r)} y={H - 5} textAnchor="middle" className="chart-axis">
            {r}
          </text>
        ))}
        {series.map((line, i) => {
          const teamId = top[i].teamId;
          const dashed = seenTeams.has(teamId);
          seenTeams.add(teamId);
          return (
            <polyline
              key={line.driverId}
              points={line.points.map((p) => `${x(p.round)},${y(p.value)}`).join(' ')}
              fill="none"
              stroke={teamStyle(teamId).color}
              strokeWidth={1.75}
              strokeDasharray={dashed ? '4 3' : undefined}
              strokeLinejoin="round"
            />
          );
        })}
        {labels.map(({ s, ly }) => (
          <text
            key={s.driverId}
            x={x(Math.min(asOf, totalRounds)) + 5}
            y={ly + 3}
            className="chart-label"
            fill={teamStyle(s.teamId).color}
          >
            {data.drivers[s.driverId]?.code}
          </text>
        ))}
      </svg>
    </section>
  );
}
