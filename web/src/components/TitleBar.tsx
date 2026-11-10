import { t } from '../i18n/index.ts';
import type { Snapshot } from '../lib/season.ts';
import { readableOn, teamStyle } from '../lib/teams.ts';
import type { SeasonData } from '../lib/types.ts';

/**
 * Faixa do topo: líder e vice frente a frente, com a barra dividida pela
 * proporção dos pontos dos dois, e o andamento da temporada logo abaixo.
 */
export function TitleBar({ data, snap }: { data: SeasonData; snap: Snapshot }) {
  const [first, second] = snap.drivers;
  const totalRaces = data.rounds.length;
  const racesDone = totalRaces - snap.racesLeft;

  const progress = (
    <div className="h2h-progress">
      <div className="line">
        <i style={{ width: `${(racesDone / totalRaces) * 100}%` }} />
      </div>
      <span className="muted">
        <strong>{t.racesDone(racesDone, totalRaces)}</strong>
        {snap.racesLeft > 0 && ` · ${t.pointsInPlay(snap.driverPointsLeft)}`}
      </span>
    </div>
  );

  if (!first) {
    return (
      <section className="panel h2h" aria-label={t.titleFight}>
        <h1 className="headline serif" style={{ gridColumn: '1 / -1' }}>
          {t.notStarted}
        </h1>
        {progress}
      </section>
    );
  }

  const side = (row: typeof first) => {
    const d = data.drivers[row.entry.driverId];
    const color = teamStyle(row.entry.teamId).color;
    return { d, color, on: readableOn(color), team: data.teams[row.entry.teamId]?.name, points: row.entry.points };
  };
  const a = side(first);
  const b = second ? side(second) : null;
  const share = b ? (a.points / (a.points + b.points || 1)) * 100 : 100;
  const headline = snap.driverClinched
    ? t.isChampion(a.d.familyName)
    : t.leadsBy(a.d.familyName, second?.gap ?? 0);

  return (
    <section className="panel h2h" aria-label={t.titleFight}>
      <div className="avatar" style={{ background: a.color, color: a.on }} aria-hidden="true">
        {a.d.code}
      </div>
      <div className="h2h-names">
        <div className="h2h-name">
          {a.d.familyName}
          <span className="muted">{a.team}</span>
        </div>
        <h1 className="headline serif">{headline}</h1>
        <div className="h2h-name right">
          {b && (
            <>
              <span className="muted">{b.team}</span> {b.d.familyName}
            </>
          )}
        </div>
      </div>
      {b ? (
        <div className="avatar right" style={{ background: b.color, color: b.on }} aria-hidden="true">
          {b.d.code}
        </div>
      ) : (
        <span />
      )}
      <div className="h2h-bar">
        <div className="h2h-part" style={{ width: `${share}%`, background: a.color, color: a.on }}>
          <strong>{a.points}</strong>
          <span>{t.points}</span>
        </div>
        {b && (
          <div className="h2h-part right" style={{ background: b.color, color: b.on }}>
            <span>{t.points}</span>
            <strong>{b.points}</strong>
          </div>
        )}
        {b && <div className="h2h-mid" data-label={t.tie} />}
      </div>
      {progress}
    </section>
  );
}
