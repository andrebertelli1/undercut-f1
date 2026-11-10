import { raceName, t } from '../i18n/index.ts';
import type { Snapshot } from '../lib/season.ts';
import { teamStyle } from '../lib/teams.ts';
import type { SeasonData } from '../lib/types.ts';
import { TeamBadge } from './TeamBadge.tsx';

const MAX_CONTENDERS = 8;

/** Quem ainda tem chance matemática de título, ou quando ele foi decidido. */
export function Contenders({ data, snap }: { data: SeasonData; snap: Snapshot }) {
  if (snap.drivers.length === 0) return null;
  const alive = snap.drivers.filter((r) => r.alive);
  const leader = data.drivers[snap.drivers[0].entry.driverId];
  const teamLeader = snap.teams[0] && data.teams[snap.teams[0].entry.teamId];

  return (
    <section className="panel">
      <h2>{t.whoCanWin}</h2>
      {snap.driverClinched && snap.clinchRound ? (
        <p className="note">{t.clinchedAt(leader.name, raceName(snap.clinchRound.raceName))}</p>
      ) : (
        <>
          <p className="note">
            {t.stillAlive(alive.length)} · {t.pointsInPlay(snap.driverPointsLeft)}
          </p>
          <ul className="rows">
            {alive.slice(0, MAX_CONTENDERS).map((r) => (
              <li className="row" key={r.entry.driverId}>
                <TeamBadge teamId={r.entry.teamId} />
                <span className="row-main">{data.drivers[r.entry.driverId].name}</span>
                <span className="num muted">{r.gap === 0 ? t.leader : t.behind(r.gap)}</span>
              </li>
            ))}
          </ul>
          {alive.length > MAX_CONTENDERS && (
            <p className="note muted">{t.andMore(alive.length - MAX_CONTENDERS)}</p>
          )}
        </>
      )}
      {teamLeader && (
        <p className="note">
          <span className="muted">{t.constructorsTitle}: </span>
          {snap.teamClinched
            ? t.teamChampion(teamLeader.name)
            : t.teamOpen(snap.teams.filter((r) => r.alive).length)}
        </p>
      )}
    </section>
  );
}

export function DriverTable({ data, snap }: { data: SeasonData; snap: Snapshot }) {
  return (
    <section className="panel">
      <h2>{t.drivers}</h2>
      <ol className="rows">
        {snap.drivers.map(({ entry, alive }) => {
          const d = data.drivers[entry.driverId];
          return (
            <li className={`row ${alive ? '' : 'row-out'}`} key={entry.driverId}>
              <span className="pos">{entry.pos}</span>
              <TeamBadge teamId={entry.teamId} />
              <span className="row-main">
                {d.name}
                <span className="muted row-sub">{data.teams[entry.teamId]?.name}</span>
              </span>
              <span className="num">{entry.points}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Construtores, com a divisão dos pontos entre os pilotos de cada equipe. */
export function TeamTable({ data, snap }: { data: SeasonData; snap: Snapshot }) {
  return (
    <section className="panel">
      <h2>{t.constructors}</h2>
      <ol className="rows">
        {snap.teams.map(({ entry }) => {
          const color = teamStyle(entry.teamId).color;
          const mates = snap.drivers
            .filter((d) => d.entry.teamId === entry.teamId)
            .map((d) => d.entry);
          const sum = mates.reduce((n, m) => n + m.points, 0) || 1;
          return (
            <li className="team-row" key={entry.teamId}>
              <div className="row">
                <span className="pos">{entry.pos}</span>
                <TeamBadge teamId={entry.teamId} name={data.teams[entry.teamId]?.name} />
                <span className="row-main" />
                <span className="num">{entry.points}</span>
              </div>
              <div className="duel" title={t.teammates}>
                {mates.map((m, i) => (
                  <div
                    key={m.driverId}
                    className="duel-part"
                    style={{
                      flexGrow: m.points / sum || 0.02,
                      background: color,
                      opacity: i === 0 ? 1 : 0.45,
                    }}
                  />
                ))}
              </div>
              <div className="duel-labels muted">
                {mates.map((m) => (
                  <span key={m.driverId}>
                    {data.drivers[m.driverId]?.code} {m.points}
                  </span>
                ))}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Corridas já disputadas, da mais recente para a mais antiga. Clicar leva ao globo. */
export function RecentRaces({
  data,
  asOf,
  focus,
  onFocus,
}: {
  data: SeasonData;
  asOf: number;
  focus: number | null;
  onFocus: (round: number | null) => void;
}) {
  const done = data.rounds.filter((r) => r.raceDone && r.round <= asOf).reverse();
  if (done.length === 0) return null;
  return (
    <section className="panel">
      <h2>{t.recentRaces}</h2>
      <ul className="rows">
        {done.map((r) => {
          const win = r.results.find((row) => row.pos === 1);
          return (
            <li key={r.round}>
              <button
                className="row row-button"
                onClick={() => onFocus(focus === r.round ? null : r.round)}
                aria-pressed={focus === r.round}
              >
                <span className="pos">{r.round}</span>
                {win && <TeamBadge teamId={win.teamId} />}
                <span className="row-main">
                  {raceName(r.raceName)}
                  {r.hasSprint && <span className="tag row-sub">{t.sprint}</span>}
                </span>
                <span className="muted">{win && data.drivers[win.driverId]?.familyName}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
