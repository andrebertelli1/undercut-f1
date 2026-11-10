import {
  contention,
  driverPointsRemaining,
  teamPointsRemaining,
  type Contention,
} from './standings.ts';
import type { DriverStanding, Round, SeasonData, TeamStanding } from './types.ts';

/** Última temporada em que a volta mais rápida valeu ponto. */
const LAST_FASTEST_LAP_POINT_SEASON = 2024;

export async function loadSeason(year: number): Promise<SeasonData> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/season/${year}.json`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Última etapa com algum resultado; 0 se a temporada não começou. */
export function lastPlayedRound(data: SeasonData): number {
  let last = 0;
  for (const r of data.rounds) if (r.driverStandings.length > 0) last = r.round;
  return last;
}

export interface Snapshot {
  asOf: number;
  drivers: Contention<DriverStanding>[];
  teams: Contention<TeamStanding>[];
  driverClinched: boolean;
  teamClinched: boolean;
  driverPointsLeft: number;
  racesLeft: number;
  /** Etapa em que o título de pilotos ficou matematicamente decidido, se já ficou. */
  clinchRound: Round | null;
}

function standingsAt(data: SeasonData, asOf: number): Round | undefined {
  return [...data.rounds].reverse().find((r) => r.round <= asOf && r.driverStandings.length > 0);
}

/** O campeonato como estava depois da etapa `asOf`. */
export function snapshot(data: SeasonData, asOf: number): Snapshot {
  const at = standingsAt(data, asOf);
  const bonus = data.season <= LAST_FASTEST_LAP_POINT_SEASON;
  const driverPointsLeft = driverPointsRemaining(data.rounds, asOf, bonus);
  const d = contention(at?.driverStandings ?? [], driverPointsLeft);
  const c = contention(at?.teamStandings ?? [], teamPointsRemaining(data.rounds, asOf, bonus));

  let clinchRound: Round | null = null;
  if (d.clinched) {
    for (const r of data.rounds) {
      if (r.round > asOf) break;
      if (r.driverStandings.length === 0) continue;
      if (contention(r.driverStandings, driverPointsRemaining(data.rounds, r.round, bonus)).clinched) {
        clinchRound = r;
        break;
      }
    }
  }

  return {
    asOf,
    drivers: d.rows,
    teams: c.rows,
    driverClinched: d.clinched,
    teamClinched: c.clinched,
    driverPointsLeft,
    racesLeft: data.rounds.filter((r) => r.round > asOf || !r.raceDone).length,
    clinchRound,
  };
}

/** Pontos de cada piloto depois de cada etapa disputada, para o gráfico. */
export function pointsHistory(
  data: SeasonData,
  driverIds: string[],
  upTo: number,
): { driverId: string; points: { round: number; value: number }[] }[] {
  return driverIds.map((driverId) => ({
    driverId,
    points: data.rounds
      .filter((r) => r.round <= upTo && r.driverStandings.length > 0)
      .map((r) => ({
        round: r.round,
        value: r.driverStandings.find((s) => s.driverId === driverId)?.points ?? 0,
      })),
  }));
}
