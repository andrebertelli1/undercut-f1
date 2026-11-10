import { memo } from 'react';
import { t as i18n } from '../../i18n/index.ts';
import { driverColor, formatLapTime } from '../../lib/race.ts';
import type { RaceData, RaceEvent } from '../../lib/raceTypes.ts';
import { lastIndexAtOrBefore, type FrameRow } from '../../lib/replay.ts';
import type { SectorColor, SectorView } from '../../lib/sectors.ts';
import type { Round, SeasonData } from '../../lib/types.ts';
import { TeamBadge } from '../TeamBadge.tsx';
import { gapText, Tyre } from './Tower.tsx';

/** Detalhes do piloto seguido, só com o que já aconteceu até o instante atual. */
export const DriverCard = memo(function DriverCard({
  race,
  frame,
  driver,
  sec,
  sectors,
  onClose,
}: {
  race: RaceData;
  frame: FrameRow[];
  driver: number;
  sec: number;
  /** Setores da volta em andamento e da última volta; null se a corrida não tem esse dado. */
  sectors: SectorView | null;
  onClose: () => void;
}) {
  const index = frame.findIndex((r) => r.driver.number === driver);
  const row = frame[index];
  if (!row) return null;
  const ahead = frame[index - 1];
  const behind = frame[index + 1];
  const between = (a?: FrameRow, b?: FrameRow) =>
    a && b && a.gap !== null && b.gap !== null && a.gap >= 0 && b.gap >= 0 && !a.retired && !b.retired
      ? `${(b.gap - a.gap).toFixed(1)} s`
      : '—';

  const key = String(driver);
  const done = (race.laps[key] ?? []).filter(([, start, dur]) => dur !== null && start + dur <= sec);
  const best = done.reduce<number | null>((m, l) => (m === null || l[2]! < m ? l[2]! : m), null);
  const stints = (race.stints[key] ?? []).filter(([from]) => from <= Math.max(1, row.lap));

  return (
    <section className="panel driver-card" style={{ borderTopColor: driverColor(row.driver) }}>
      <div className="driver-head">
        <div>
          <h2>{row.driver.name}</h2>
          <span className="muted">
            {row.driver.teamName} · #{row.driver.number}
          </span>
        </div>
        <button className="ghost" onClick={onClose} aria-label={i18n.stopFollowing}>
          ×
        </button>
      </div>

      <dl className="driver-stats">
        <div>
          <dt>{i18n.position}</dt>
          <dd className="num">{row.retired ? i18n.out : `${row.pos}º`}</dd>
        </div>
        <div>
          <dt>{i18n.gapToLeader}</dt>
          <dd className="num">{gapText(row, sec >= 0) || '—'}</dd>
        </div>
        <div>
          <dt>{i18n.carAhead}</dt>
          <dd className="num">{ahead ? `${ahead.driver.code} ${between(ahead, row)}` : '—'}</dd>
        </div>
        <div>
          <dt>{i18n.carBehind}</dt>
          <dd className="num">{behind ? `${behind.driver.code} ${between(row, behind)}` : '—'}</dd>
        </div>
      </dl>

      {sectors && (
        <>
          <h3>{i18n.currentLap(sectors.lap)}</h3>
          <div className="sector-chips">
            {sectors.current.map((s, i) => (
              <SectorChip key={i} label={i18n.sectorShort(i + 1)} state={s.state} color={s.color} time={s.time} />
            ))}
          </div>
          {sectors.last && (
            <>
              <h3>{i18n.lastLapN(sectors.last.lap)}</h3>
              <div className="sector-chips">
                {[0, 1, 2].map((i) => (
                  <SectorChip
                    key={i}
                    label={i18n.sectorShort(i + 1)}
                    state={sectors.last!.sectors ? 'done' : 'pending'}
                    color={sectors.last!.sectors?.colors[i] ?? null}
                    time={sectors.last!.sectors?.times[i] ?? null}
                  />
                ))}
                <div className={`sector-chip is-total is-${sectors.last.color ?? 'unknown'}`}>
                  <span>{i18n.lapTotal}</span>
                  <strong className="num">{formatLapTime(sectors.last.time)}</strong>
                </div>
              </div>
            </>
          )}
          <p className="muted sector-legend">
            <i className="is-purple" /> {i18n.legendPurple} <i className="is-green" /> {i18n.legendGreen}{' '}
            <i className="is-yellow" /> {i18n.legendYellow}
          </p>
        </>
      )}

      <h3>{i18n.tyres}</h3>
      <ul className="stints">
        {stints.map(([from, to, compound, age], i) => {
          const current = i === stints.length - 1;
          const until = current ? Math.max(from, row.lap) : to;
          return (
            <li key={from}>
              <Tyre compound={compound} age={age + until - from} />
              <span className="muted">{i18n.lapRange(from, until)}</span>
              {current && row.inPit && <span className="tag tag-pit">{i18n.pit}</span>}
            </li>
          );
        })}
      </ul>

      <h3>{i18n.lastLaps}</h3>
      {done.length === 0 ? (
        <p className="muted">—</p>
      ) : (
        <ul className="lap-list num">
          {done
            .slice(-4)
            .reverse()
            .map(([n, , dur]) => (
              <li key={n} className={dur === best ? 'is-best' : ''}>
                <span className="muted">{i18n.lapN(n)}</span>
                <span>{formatLapTime(dur!)}</span>
              </li>
            ))}
        </ul>
      )}
      {best !== null && (
        <p className="muted best-lap">
          {i18n.bestLap}: <span className="num">{formatLapTime(best)}</span>
        </p>
      )}
    </section>
  );
});

function SectorChip({
  label,
  state,
  color,
  time,
}: {
  label: string;
  state: 'done' | 'running' | 'pending';
  color: SectorColor | null;
  time: number | null;
}) {
  const tone = state === 'done' ? `is-${color ?? 'unknown'}` : `is-${state}`;
  return (
    <div className={`sector-chip ${tone}`}>
      <span>{label}</span>
      <strong className="num">
        {state === 'done' && time !== null ? time.toFixed(3) : state === 'running' ? i18n.sectorRunning : '—'}
      </strong>
    </div>
  );
}

const FEED_LIMIT = 40;

/** O que aconteceu até agora, do mais recente para o mais antigo. */
export const RaceFeed = memo(function RaceFeed({
  race,
  sec,
  onSeek,
}: {
  race: RaceData;
  sec: number;
  onSeek: (t: number) => void;
}) {
  const code = (n: number) => race.drivers.find((d) => d.number === n)?.code ?? String(n);
  const upTo = lastIndexAtOrBefore(race.events.map((e) => e.t), sec);
  const shown: RaceEvent[] = race.events.slice(Math.max(0, upTo + 1 - FEED_LIMIT), upTo + 1).reverse();

  const wi = lastIndexAtOrBefore(race.weather.map((w) => w[0]), sec);
  const weather = race.weather[Math.max(0, wi)];

  return (
    <section className="panel feed">
      <h2>{i18n.raceFeed}</h2>
      {weather && (
        <p className="weather muted">
          {i18n.weather(Math.round(weather[1]), Math.round(weather[2]), weather[3] === 1)}
        </p>
      )}
      {shown.length === 0 ? (
        <p className="muted">{i18n.feedEmpty}</p>
      ) : (
        <ul className="feed-list">
          {shown.map((e, i) => (
            <li key={`${e.t}${e.kind}${e.drivers?.join() ?? ''}${i}`}>
              <button className={`feed-item event-${e.kind}`} onClick={() => onSeek(e.t - 3)}>
                <span className="muted num feed-lap">{e.lap > 0 ? i18n.lapShort(e.lap) : ''}</span>
                <span>{i18n.eventText(e, code)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
});

/** Classificação oficial, mostrada só depois de "Ver resultado". */
export function ResultPanel({ data, round }: { data: SeasonData; round: Round }) {
  return (
    <section className="panel result">
      <h2>{i18n.officialResult}</h2>
      <ol className="rows">
        {round.results
          .filter((r) => r.pos !== null)
          .slice(0, 10)
          .map((r) => (
            <li className="row" key={r.driverId}>
              <span className="pos">{r.pos}</span>
              <TeamBadge teamId={r.teamId} />
              <span className="row-main">{data.drivers[r.driverId]?.name}</span>
              <span className="num muted">
                {r.points > 0 ? `${r.points} ${r.points === 1 ? i18n.point : i18n.points}` : ''}
              </span>
            </li>
          ))}
      </ol>
    </section>
  );
}
