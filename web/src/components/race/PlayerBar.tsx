import { useMemo, useRef, type PointerEvent } from 'react';
import { t as i18n } from '../../i18n/index.ts';
import { formatClock } from '../../lib/race.ts';
import type { RaceData } from '../../lib/raceTypes.ts';
import { barAtTime, lapAt, timeAtBar } from '../../lib/replay.ts';
import { SPEEDS, type Player } from './usePlayer.ts';

export type TrackStatus = 'grid' | 'green' | 'sc' | 'vsc' | 'red' | 'chequered';

interface Marker {
  t: number;
  kind: 'lead' | 'pit';
  label: string;
}

/**
 * Controles e barra de progresso. Cada volta ocupa a mesma largura na barra,
 * então voltas lentas (safety car) não esticam o desenho.
 */
export function PlayerBar({
  race,
  player,
  status,
  spoilerLimit,
}: {
  race: RaceData;
  player: Player;
  status: TrackStatus;
  /** Marcadores depois deste instante ficam escondidos. */
  spoilerLimit: number;
}) {
  const { lapStarts, tEnd, totalLaps } = race;
  const bar = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const lap = lapAt(lapStarts, player.t);
  const pct = (time: number) => `${barAtTime(lapStarts, tEnd, time) * 100}%`;

  const markers = useMemo(() => buildMarkers(race), [race]);

  const seekFromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const rect = bar.current!.getBoundingClientRect();
    player.seek(timeAtBar(lapStarts, tEnd, (e.clientX - rect.left) / rect.width));
  };

  const toLap = (n: number) => player.seek(lapStarts[Math.max(1, Math.min(totalLaps, n)) - 1]);
  // "Volta anterior" no meio de uma volta vai para o começo dela.
  const prevLap = () => {
    const sinceStart = lap > 0 ? player.t - lapStarts[lap - 1] : 0;
    if (lap <= 1 && sinceStart < 3) player.seek(race.tStart);
    else toLap(sinceStart > 3 ? lap : lap - 1);
  };

  const scale: number[] = [];
  for (let n = 1; n <= totalLaps; n++) if (n === 1 || n % 10 === 0) scale.push(n);

  return (
    <section className="panel player" aria-label={i18n.player}>
      <div className="player-row">
        <div className="player-buttons">
          <button className="ghost icon" onClick={prevLap} aria-label={i18n.prevLap} title={i18n.prevLap}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3h2v10H3zM14 3v10L6 8z" /></svg>
          </button>
          <button
            className="primary icon play"
            onClick={player.toggle}
            aria-label={player.playing ? i18n.pause : i18n.play}
            title={player.playing ? i18n.pause : i18n.play}
          >
            {player.playing ? (
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2h4v12H3zM9 2h4v12H9z" /></svg>
            ) : (
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2l10 6-10 6z" /></svg>
            )}
          </button>
          <button
            className="ghost icon"
            onClick={() => toLap(lap + 1)}
            disabled={lap >= totalLaps}
            aria-label={i18n.nextLap}
            title={i18n.nextLap}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M11 3h2v10h-2zM2 3v10l8-5z" /></svg>
          </button>
        </div>

        <div className="player-lap">
          <strong>{lap === 0 ? i18n.startingGrid : i18n.lapOf(lap, totalLaps)}</strong>
          <span className="muted num">
            {formatClock(player.t)}
            {lap >= 1 && ` · ${i18n.lapsLeft(totalLaps - lap)}`}
          </span>
        </div>
        <span className={`flag flag-${status}`}>{i18n.trackStatus[status]}</span>

        <div className="speeds" role="group" aria-label={i18n.speed}>
          {SPEEDS.map((s) => (
            <button
              key={s}
              className={`ghost ${s === player.speed ? 'is-on' : ''}`}
              onClick={() => player.setSpeed(s)}
              aria-pressed={s === player.speed}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      <div
        className="bar"
        ref={bar}
        role="slider"
        tabIndex={0}
        aria-label={i18n.raceProgress}
        aria-valuemin={1}
        aria-valuemax={totalLaps}
        aria-valuenow={Math.max(1, lap)}
        aria-valuetext={i18n.lapOf(Math.max(1, lap), totalLaps)}
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          seekFromPointer(e);
        }}
        onPointerMove={(e) => dragging.current && seekFromPointer(e)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
      >
        <div className="bar-fill" style={{ width: pct(player.t) }} />
        {race.periods
          .filter((p) => p.from <= spoilerLimit)
          .map((p) => (
            <div
              key={`${p.kind}${p.from}`}
              className={`bar-period period-${p.kind}`}
              style={{
                left: pct(p.from),
                width: `calc(${pct(Math.min(p.to, spoilerLimit))} - ${pct(p.from)})`,
              }}
              title={i18n.trackStatus[p.kind]}
            />
          ))}
        <div className="bar-laps" aria-hidden="true">
          {lapStarts.map((_, i) => (
            <span key={i} />
          ))}
        </div>
        {markers
          .filter((m) => m.t <= spoilerLimit)
          .map((m) => (
            <span
              key={`${m.kind}${m.t}${m.label}`}
              className={`bar-marker marker-${m.kind}`}
              style={{ left: pct(m.t) }}
              title={m.label}
            />
          ))}
        <div className="bar-head" style={{ left: pct(player.t) }} />
      </div>

      <div className="bar-scale muted num" aria-hidden="true">
        {scale.map((n) => (
          <span key={n} style={{ left: `${((n - 0.5) / totalLaps) * 100}%` }}>
            {n}
          </span>
        ))}
      </div>

      <div className="bar-legend muted">
        <span><i className="marker-lead" /> {i18n.legendLead}</span>
        <span><i className="marker-pit" /> {i18n.legendPit}</span>
        <span><i className="period-sc" /> {i18n.trackStatus.sc}</span>
        <span><i className="period-red" /> {i18n.trackStatus.red}</span>
        <span className="bar-keys">{i18n.keysHint}</span>
      </div>
    </section>
  );
}

/** Trocas de líder e pits de quem estava entre os três primeiros. */
function buildMarkers(race: RaceData): Marker[] {
  const code = (n: number) => race.drivers.find((d) => d.number === n)?.code ?? String(n);
  const positionAt = (driver: number, time: number) => {
    let pos = 99;
    for (const [at, p] of race.positions[driver] ?? []) {
      if (at > time) break;
      pos = p;
    }
    return pos;
  };
  const out: Marker[] = [];
  for (const e of race.events) {
    const driver = e.drivers?.[0];
    if (driver === undefined) continue;
    if (e.kind === 'lead') out.push({ t: e.t, kind: 'lead', label: i18n.eventText(e, code) });
    else if (e.kind === 'pit' && positionAt(driver, e.t - 1) <= 3) {
      out.push({ t: e.t, kind: 'pit', label: i18n.eventText(e, code) });
    }
  }
  return out;
}
