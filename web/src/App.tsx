import { useCallback, useEffect, useMemo, useState } from 'react';
import { RoundCard } from './components/RoundCard.tsx';
import { WorldMap } from './components/WorldMap.tsx';
import { PointsChart } from './components/PointsChart.tsx';
import { SeasonTimeline } from './components/SeasonTimeline.tsx';
import { Contenders, DriverTable, RecentRaces, TeamTable } from './components/Standings.tsx';
import { TitleBar } from './components/TitleBar.tsx';
import { daysUntil, formatDateTime, raceName, t } from './i18n/index.ts';
import { RaceView } from './components/race/RaceView.tsx';
import { loadRaceIndex } from './lib/race.ts';
import { lastPlayedRound, loadSeason, snapshot } from './lib/season.ts';
import type { SeasonData } from './lib/types.ts';

/** Temporadas com dados, da mais recente para a mais antiga. */
const SEASONS = [2026, 2025, 2024, 2023];
const CURRENT_SEASON = SEASONS[0];

/**
 * A tela é escolhida pelo endereço: ?temporada=2025 troca o ano,
 * ?corrida=20 abre a corrida e ?volta=23 a volta.
 */
interface Route {
  season: number;
  race: number | null;
  lap: number | null;
}

function readRoute(): Route {
  const q = new URLSearchParams(location.search);
  const num = (key: string) => {
    const n = Number(q.get(key));
    return Number.isInteger(n) && n > 0 ? n : null;
  };
  const season = num('temporada');
  return {
    season: season && SEASONS.includes(season) ? season : CURRENT_SEASON,
    race: num('corrida'),
    lap: num('volta'),
  };
}

function writeRoute(route: Route, replace: boolean) {
  const q = new URLSearchParams();
  if (route.season !== CURRENT_SEASON) q.set('temporada', String(route.season));
  if (route.race) q.set('corrida', String(route.race));
  if (route.race && route.lap) q.set('volta', String(route.lap));
  const url = `${location.pathname}${q.size ? `?${q}` : ''}`;
  if (replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
}

export function App() {
  const [data, setData] = useState<SeasonData | null>(null);
  const [failed, setFailed] = useState(false);
  const [asOf, setAsOf] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [route, setRoute] = useState<Route>(readRoute);
  const [replays, setReplays] = useState<number[]>([]);
  const season = route.season;

  useEffect(() => {
    const onPop = () => setRoute(readRoute());
    addEventListener('popstate', onPop);
    loadRaceIndex().then(setReplays);
    return () => removeEventListener('popstate', onPop);
  }, []);

  const go = useCallback((next: Route) => {
    writeRoute(next, false);
    setRoute(next);
  }, []);
  const openRace = useCallback((race: number) => go({ season, race, lap: null }), [go, season]);
  const closeRace = useCallback(() => go({ season, race: null, lap: null }), [go, season]);
  const changeSeason = (year: number) => {
    setAsOf(null);
    setFocus(null);
    go({ season: year, race: null, lap: null });
  };
  // A volta atual vai para o endereço sem criar entradas no histórico.
  const raceRound = route.race;
  const onLapChange = useCallback(
    (lap: number) => writeRoute({ season, race: raceRound, lap }, true),
    [raceRound, season],
  );

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setData(null);
    loadSeason(season)
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [attempt, season]);

  // A etapa escolhida na linha do tempo e o foco no mapa são de uma temporada só.
  useEffect(() => {
    setAsOf(null);
    setFocus(null);
  }, [season]);

  const latest = useMemo(() => (data ? lastPlayedRound(data) : 0), [data]);
  const round = asOf ?? latest;
  const snap = useMemo(() => (data ? snapshot(data, round) : null), [data, round]);

  if (failed) {
    return (
      <main className="state">
        <p>{t.loadError}</p>
        <button className="primary" onClick={() => setAttempt((n) => n + 1)}>
          {t.retry}
        </button>
      </main>
    );
  }
  if (!data || !snap) return <main className="state muted">{t.loading}…</main>;

  const raceToShow = data.rounds.find((r) => r.round === route.race);
  if (raceToShow) {
    return (
      <RaceView
        data={data}
        round={raceToShow}
        initialLap={route.lap}
        onBack={closeRace}
        onLapChange={onLapChange}
      />
    );
  }

  const next = data.rounds.find((r) => !r.raceDone);
  const focused = data.rounds.find((r) => r.round === focus);
  const hasReplay = (key: number | null) => key !== null && replays.includes(key);

  const latestReplay = [...data.rounds].reverse().find((r) => hasReplay(r.sessionKey));
  const asOfRound = data.rounds.find((r) => r.round === round);

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          {t.appName}
        </div>
        <nav className="pills">
          <label className="season-pick is-on">
            <span className="sr-only">{t.pickSeason}</span>
            <select value={season} onChange={(e) => changeSeason(Number(e.target.value))}>
              {SEASONS.map((y) => (
                <option key={y} value={y}>
                  {t.season(y)}
                </option>
              ))}
            </select>
          </label>
          <button disabled={!latestReplay} onClick={() => latestReplay && openRace(latestReplay.round)}>
            {t.latestRace}
          </button>
        </nav>
        <div className="top-right">
          <span className="chip">
            {next ? (
              <>
                <span className="muted">{t.nextRace}</span>
                <strong>{raceName(next.raceName)}</strong>
                <span className="muted">
                  {formatDateTime(next.date)} · {t.inDays(daysUntil(next.date))}
                </span>
              </>
            ) : (
              t.seasonOver
            )}
          </span>
        </div>
      </header>

      <TitleBar data={data} snap={snap} />

      <div className="columns">
        <aside className="col">
          <PointsChart data={data} standings={snap.drivers.map((d) => d.entry)} asOf={round} />
          <Contenders data={data} snap={snap} />
          <DriverTable data={data} snap={snap} />
        </aside>

        <WorldMap
          data={data}
          asOf={round}
          focus={focus}
          onFocus={setFocus}
          pill={asOfRound ? t.afterRound(asOfRound.round, raceName(asOfRound.raceName)) : t.beforeSeason}
        >
          {focused && (
            <RoundCard
              data={data}
              round={focused}
              asOf={round}
              onClose={() => setFocus(null)}
              onWatch={hasReplay(focused.sessionKey) ? () => openRace(focused.round) : undefined}
            />
          )}
        </WorldMap>

        <aside className="col">
          <TeamTable data={data} snap={snap} />
          <RecentRaces data={data} asOf={round} focus={focus} onFocus={setFocus} />
        </aside>
      </div>

      <SeasonTimeline data={data} asOf={round} latest={latest} onChange={setAsOf} />

      <footer className="foot muted">
        {t.disclaimer} {t.updatedAt(formatDateTime(data.generatedAt))}
      </footer>
    </div>
  );
}
