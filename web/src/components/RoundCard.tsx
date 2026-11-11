import { formatDateTime, raceName, t } from '../i18n/index.ts';
import { teamStyle } from '../lib/teams.ts';
import type { ResultRow, Round, SeasonData } from '../lib/types.ts';
import { TeamBadge } from './TeamBadge.tsx';

const byPos = (rows: ResultRow[], pos: number) => rows.find((r) => r.pos === pos);

/** Card da etapa em foco no globo: pódio, pole e volta mais rápida. */
export function RoundCard({
  data,
  round,
  asOf,
  onClose,
  available,
  onOpen,
}: {
  data: SeasonData;
  round: Round;
  asOf: number;
  onClose: () => void;
  /** session_keys que têm replay baixado. */
  available: number[];
  onOpen: (sessionKey: number) => void;
}) {
  const shown = round.raceDone && round.round <= asOf;
  const hiddenByRewind = round.raceDone && !shown;
  const driver = (row?: ResultRow) =>
    row && (
      <span className="fact-value">
        <TeamBadge teamId={row.teamId} />
        {data.drivers[row.driverId]?.familyName}
      </span>
    );
  const pole = round.results.find((r) => r.grid === 1);
  const fl = round.fastestLap;
  const flRow = fl && round.results.find((r) => r.driverId === fl.driverId);
  // Etapas sem a lista da OpenF1 ainda oferecem a corrida, se houver.
  const sessions = round.sessions?.length
    ? round.sessions
    : round.sessionKey
      ? [{ key: round.sessionKey, name: 'Race', start: round.date }]
      : [];
  const sprintWin =
    round.sprintDone && round.round <= asOf ? byPos(round.sprintResults, 1) : undefined;

  return (
    <div className="round-card">
      <div className="round-card-head">
        <div>
          <div className="muted">
            {t.round(round.round)} · {round.circuitName}
          </div>
          <h3>{raceName(round.raceName)}</h3>
          <div className="muted">
            {round.locality} · {formatDateTime(round.date)}
          </div>
        </div>
        <button className="ghost" onClick={onClose} aria-label={t.close}>
          ×
        </button>
      </div>

      {hiddenByRewind && <p className="note">{t.hiddenWhileRewound}</p>}
      {!round.raceDone && <p className="note muted">{t.upcoming}</p>}

      {shown && (
        <>
          <ol className="podium">
            {[1, 2, 3].map((p) => {
              const row = byPos(round.results, p);
              if (!row) return null;
              return (
                <li key={p} style={{ borderLeftColor: teamStyle(row.teamId).color }}>
                  <span className="podium-pos">{p}</span>
                  <span>
                    <strong>{data.drivers[row.driverId]?.name}</strong>
                    <span className="muted row-sub">{data.teams[row.teamId]?.name}</span>
                  </span>
                </li>
              );
            })}
          </ol>
          <dl className="facts">
            {pole && (
              <div>
                <dt>{t.pole}</dt>
                <dd>{driver(pole)}</dd>
              </div>
            )}
            {fl && flRow && (
              <div>
                <dt>{t.fastestLap}</dt>
                <dd>
                  {driver(flRow)}
                  <span className="muted num">
                    {fl.time} · {t.lap(fl.lap)}
                  </span>
                </dd>
              </div>
            )}
            {sprintWin && (
              <div>
                <dt>{t.sprintWinner}</dt>
                <dd>{driver(sprintWin)}</dd>
              </div>
            )}
          </dl>
          <div className="muted session-title">{t.weekendReplays}</div>
          <div className="session-buttons">
            {sessions.map((s) => (
              <button
                key={s.key}
                className={s.name === 'Race' ? 'primary' : 'ghost'}
                disabled={!available.includes(s.key)}
                onClick={() => onOpen(s.key)}
              >
                {t.sessionName(s.name)}
              </button>
            ))}
          </div>
          {!sessions.some((s) => available.includes(s.key)) && (
            <span className="muted soon">{t.watchRaceSoon}</span>
          )}
        </>
      )}
    </div>
  );
}
