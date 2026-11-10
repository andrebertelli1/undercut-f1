import { raceName, t } from '../i18n/index.ts';
import { teamStyle } from '../lib/teams.ts';
import type { SeasonData } from '../lib/types.ts';

/** Barra de etapas no rodapé: volta o campeonato para qualquer ponto do ano. */
export function SeasonTimeline({
  data,
  asOf,
  latest,
  onChange,
}: {
  data: SeasonData;
  asOf: number;
  latest: number;
  onChange: (round: number) => void;
}) {
  const current = data.rounds.find((r) => r.round === asOf);
  return (
    <section className="panel timeline" aria-label={t.timeline}>
      <div className="timeline-label">
        {current ? raceName(current.raceName) : t.beforeSeason}
        {current && <span className="muted">{t.afterRoundOf(current.round, data.rounds.length)}</span>}
      </div>
      <div className="timeline-bar" role="group">
        {data.rounds.map((r) => {
          const playable = r.round <= latest;
          const winner = r.round <= asOf ? r.results.find((row) => row.pos === 1) : undefined;
          const label = `${t.round(r.round)} · ${raceName(r.raceName)}`;
          return (
            <button
              key={r.round}
              className={`timeline-seg ${r.round <= asOf ? 'is-on' : ''} ${r.round === asOf ? 'is-current' : ''}`}
              style={winner ? { borderTopColor: teamStyle(winner.teamId).color } : undefined}
              disabled={!playable}
              onClick={() => onChange(r.round)}
              title={label}
              aria-label={label}
              aria-current={r.round === asOf}
            >
              <span>{r.round}</span>
            </button>
          );
        })}
      </div>
      <button
        className={`ghost live ${asOf === latest ? 'is-on' : ''}`}
        onClick={() => onChange(latest)}
        disabled={asOf === latest}
      >
        {t.now}
      </button>
    </section>
  );
}
