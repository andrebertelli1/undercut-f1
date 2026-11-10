import { useEffect, useMemo, useState } from 'react';
import { raceName, t as i18n } from '../../i18n/index.ts';
import { loadRace, loadSectors, readWatchState, writeWatchState, type LoadedRace } from '../../lib/race.ts';
import type { RaceSectors } from '../../lib/raceTypes.ts';
import { buildSectorModel, sectorViewAt } from '../../lib/sectors.ts';
import { frameAt, lapAt } from '../../lib/replay.ts';
import type { Round, SeasonData } from '../../lib/types.ts';
import { PlayerBar, type TrackStatus } from './PlayerBar.tsx';
import { DriverCard, RaceFeed, ResultPanel } from './RacePanels.tsx';
import { Analytics } from './Analytics.tsx';
import { Compare } from './Compare.tsx';
import type { TabProps } from './shared.tsx';
import { Story } from './Story.tsx';
import { Strategy } from './Strategy.tsx';
import { WhatIf } from './WhatIf.tsx';
import { Tower } from './Tower.tsx';
import { TrackMap } from './TrackMap.tsx';
import { usePlayer } from './usePlayer.ts';

const SEEK_STEP = 10;
const TABS = ['track', 'story', 'compare', 'strategy', 'whatif', 'analytics'] as const;
type TabId = (typeof TABS)[number];

interface Props {
  data: SeasonData;
  round: Round;
  /** Volta pedida no link (?volta=23). */
  initialLap: number | null;
  onBack: () => void;
  onLapChange: (lap: number) => void;
}

/** Carrega o replay e mostra a tela da corrida. */
export function RaceView(props: Props) {
  const key = props.round.sessionKey;
  const [race, setRace] = useState<LoadedRace | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setRace(null);
    setFailed(false);
    if (!key) {
      setFailed(true);
      return;
    }
    loadRace(key)
      .then((r) => !cancelled && setRace(r))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [key]);

  if (failed) {
    return (
      <main className="state">
        <p>{i18n.raceLoadError}</p>
        <button className="primary" onClick={props.onBack}>
          {i18n.backToSeason}
        </button>
      </main>
    );
  }
  if (!race) return <main className="state muted">{i18n.loadingRace}…</main>;
  return <RaceScreen key={race.data.sessionKey} race={race} {...props} />;
}

function RaceScreen({ race, data, round, initialLap, onBack, onLapChange }: Props & { race: LoadedRace }) {
  const r = race.data;
  const stored = useMemo(() => readWatchState(r.sessionKey), [r.sessionKey]);
  const startAt =
    initialLap && initialLap >= 1 && initialLap <= r.totalLaps ? r.lapStarts[initialLap - 1] : -3;
  const player = usePlayer(r.tStart, r.tEnd, startAt);
  const [selected, setSelected] = useState<number | null>(null);
  const [tab, setTab] = useState<TabId>('track');
  const [pair, setPair] = useState<[number, number] | null>(null);
  const [revealed, setRevealed] = useState(stored.revealed);
  const [seen, setSeen] = useState(Math.max(stored.seen, startAt));

  const sec = Math.floor(player.t);
  const lap = lapAt(r.lapStarts, player.t);
  const frame = useMemo(() => frameAt(r, sec), [r, sec]);

  // Setores: carregados à parte; sem o arquivo, a pista só não mostra os setores.
  const [sectorData, setSectorData] = useState<RaceSectors | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadSectors(r.sessionKey).then((v) => !cancelled && setSectorData(v));
    return () => {
      cancelled = true;
    };
  }, [r.sessionKey]);
  const sectorModel = useMemo(
    () => (sectorData ? buildSectorModel(r, race.u, sectorData) : null),
    [r, race.u, sectorData],
  );
  const sectorView = useMemo(
    () => (sectorModel && selected !== null ? sectorViewAt(r, sectorModel, selected, sec) : null),
    [r, sectorModel, selected, sec],
  );

  // Guarda até onde o visitante já viu, para os marcadores não entregarem o que vem depois.
  useEffect(() => {
    if (sec > seen) setSeen(sec);
  }, [sec, seen]);
  useEffect(() => {
    if (seen % 5 === 0 || !player.playing) writeWatchState(r.sessionKey, { revealed, seen });
  }, [r.sessionKey, revealed, seen, player.playing]);

  useEffect(() => {
    if (lap >= 1) onLapChange(lap);
  }, [lap, onLapChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.key === ' ') {
        // Num botão, o espaço já aciona o próprio botão.
        if (el.tagName === 'BUTTON') return;
        e.preventDefault();
        player.toggle();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const dir = e.key === 'ArrowRight' ? 1 : -1;
        if (e.shiftKey) {
          const target = Math.max(1, Math.min(r.totalLaps, lap + dir));
          player.seek(r.lapStarts[target - 1]);
        } else player.seek(player.t + dir * SEEK_STEP);
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [player, lap, r]);

  const winnerFinish = Math.min(...r.drivers.map((d) => d.finishAt ?? Infinity));
  const period = r.periods.find((p) => sec >= p.from && sec < p.to);
  const status: TrackStatus =
    sec < 0 ? 'grid' : sec >= winnerFinish ? 'chequered' : (period?.kind ?? 'green');

  const finished = sec >= winnerFinish;
  const showResult = revealed || finished;

  // Par da aba Comparar: por padrão o piloto seguido (ou o líder) e o seguinte.
  const first = frame[0]?.driver.number;
  const pairA = pair?.[0] ?? selected ?? first;
  const pairB =
    pair?.[1] ?? frame.find((row) => row.driver.number !== pairA)?.driver.number ?? first;

  const tabProps: TabProps = {
    race: r,
    frame,
    lap,
    limitLap: showResult ? r.totalLaps : lapAt(r.lapStarts, seen),
    limitT: showResult ? r.tEnd : seen,
    unlocked: showResult,
    onReveal: () => setRevealed(true),
    selected,
    onSelect: setSelected,
    onOpenAt: (time, driver) => {
      player.seek(time);
      if (driver !== undefined) setSelected(driver);
      setTab('track');
    },
  };

  return (
    <div className="app race">
      <header className="top">
        <div className="brand">
          <button className="ghost back" onClick={onBack}>
            ← {i18n.backToSeason}
          </button>
        </div>
        <h1 className="headline serif">
          {raceName(r.raceName)}
          <span className="muted">
            {i18n.round(r.round)} · {r.circuitName}
          </span>
        </h1>
        <div className="top-right">
          {!finished && (
            <button className="ghost" onClick={() => setRevealed((v) => !v)} aria-pressed={revealed}>
              {revealed ? i18n.hideResult : i18n.showResult}
            </button>
          )}
        </div>
      </header>

      <div className="race-columns">
        <aside className="col">
          <Tower frame={frame} started={sec >= 0} selected={selected} onSelect={setSelected} />
        </aside>

        <section className="stage">
          <div className="pills" role="tablist" aria-label={i18n.raceTabs}>
            {TABS.map((id) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                className={tab === id ? 'is-on' : ''}
                onClick={() => setTab(id)}
              >
                {i18n.tabs[id]}
              </button>
            ))}
          </div>
          {tab === 'track' && r.estimated?.some(([from, to]) => sec >= from && sec < to) && (
            <div className="estimate-flag stage-note" title={i18n.estimatedHelp}>
              {i18n.estimatedPositions}
            </div>
          )}
          {tab === 'track' && (
            <TrackMap
              race={race}
              t={player.t}
              frame={frame}
              selected={selected}
              onSelect={setSelected}
              sectors={sectorModel ? { bounds: sectorModel.bounds, view: sectorView } : null}
            />
          )}
          {tab === 'story' && <Story {...tabProps} />}
          {tab === 'compare' && (
            <Compare
              {...tabProps}
              loaded={race}
              t={player.t}
              a={pairA}
              b={pairB}
              onChangeA={(n) => setPair([n, pairB === n ? pairA : pairB])}
              onChangeB={(n) => setPair([pairA === n ? pairB : pairA, n])}
            />
          )}
          {tab === 'strategy' && <Strategy {...tabProps} />}
          {tab === 'whatif' && <WhatIf {...tabProps} />}
          {tab === 'analytics' && <Analytics {...tabProps} />}
        </section>

        <aside className="col">
          {selected !== null && (
            <DriverCard
              race={r}
              frame={frame}
              driver={selected}
              sec={sec}
              sectors={sectorView}
              onClose={() => setSelected(null)}
            />
          )}
          {showResult && <ResultPanel data={data} round={round} />}
          <RaceFeed race={r} sec={sec} onSeek={player.seek} />
        </aside>
      </div>

      <PlayerBar race={r} player={player} status={status} spoilerLimit={revealed ? r.tEnd : seen} />

      <footer className="foot muted">{i18n.disclaimer}</footer>
    </div>
  );
}
