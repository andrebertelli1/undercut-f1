import type { DriverStanding, ResultRow, Round, TeamStanding } from './types.ts';

export const RACE_WIN_POINTS = 25;
export const SPRINT_WIN_POINTS = 8;
/** Melhor resultado de uma equipe em uma corrida (1º + 2º) e em uma sprint. */
export const TEAM_RACE_MAX = 25 + 18;
export const TEAM_SPRINT_MAX = 8 + 7;

interface Tally {
  points: number;
  /** finishes[0] = vitórias, finishes[1] = segundos lugares... só corridas, para o desempate. */
  finishes: number[];
  teamId: string;
}

function bump(map: Map<string, Tally>, key: string, row: ResultRow, countFinish: boolean) {
  let t = map.get(key);
  if (!t) {
    t = { points: 0, finishes: [], teamId: row.teamId };
    map.set(key, t);
  }
  t.points += row.points;
  t.teamId = row.teamId;
  if (countFinish && row.pos !== null) {
    t.finishes[row.pos - 1] = (t.finishes[row.pos - 1] ?? 0) + 1;
  }
}

/** Ordena por pontos e desempata pela contagem de melhores resultados (regra da FIA). */
function compare(a: Tally, b: Tally): number {
  if (b.points !== a.points) return b.points - a.points;
  const n = Math.max(a.finishes.length, b.finishes.length);
  for (let i = 0; i < n; i++) {
    const d = (b.finishes[i] ?? 0) - (a.finishes[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export interface RoundInput {
  results: ResultRow[];
  sprintResults: ResultRow[];
}

/**
 * Calcula as classificações acumuladas depois de cada etapa.
 * Devolve uma entrada por etapa, na mesma ordem recebida.
 */
export function cumulativeStandings(
  rounds: RoundInput[],
): { drivers: DriverStanding[]; teams: TeamStanding[] }[] {
  const drivers = new Map<string, Tally>();
  const teams = new Map<string, Tally>();
  return rounds.map((r) => {
    for (const row of r.sprintResults) {
      bump(drivers, row.driverId, row, false);
      bump(teams, row.teamId, row, false);
    }
    for (const row of r.results) {
      bump(drivers, row.driverId, row, true);
      bump(teams, row.teamId, row, true);
    }
    const d = [...drivers.entries()]
      .sort((a, b) => compare(a[1], b[1]))
      .map(([driverId, t], i) => ({
        pos: i + 1,
        driverId,
        teamId: t.teamId,
        points: t.points,
        wins: t.finishes[0] ?? 0,
      }));
    const c = [...teams.entries()]
      .sort((a, b) => compare(a[1], b[1]))
      .map(([teamId, t], i) => ({
        pos: i + 1,
        teamId,
        points: t.points,
        wins: t.finishes[0] ?? 0,
      }));
    return { drivers: d, teams: c };
  });
}

type RoundStatus = Pick<Round, 'round' | 'hasSprint' | 'raceDone' | 'sprintDone'>;

/**
 * Máximo de pontos que um piloto ainda pode somar, olhando o campeonato
 * como ele estava depois da etapa `afterRound`.
 */
/**
 * `fastestLapPoint`: até 2024 a volta mais rápida valia um ponto extra por corrida.
 */
export function driverPointsRemaining(
  rounds: RoundStatus[],
  afterRound: number,
  fastestLapPoint = false,
): number {
  return remaining(rounds, afterRound, RACE_WIN_POINTS + (fastestLapPoint ? 1 : 0), SPRINT_WIN_POINTS);
}

export function teamPointsRemaining(
  rounds: RoundStatus[],
  afterRound: number,
  fastestLapPoint = false,
): number {
  return remaining(rounds, afterRound, TEAM_RACE_MAX + (fastestLapPoint ? 1 : 0), TEAM_SPRINT_MAX);
}

function remaining(rounds: RoundStatus[], afterRound: number, race: number, sprint: number) {
  let total = 0;
  for (const r of rounds) {
    const future = r.round > afterRound;
    if (future || !r.raceDone) total += race;
    if (r.hasSprint && (future || !r.sprintDone)) total += sprint;
  }
  return total;
}

export interface Contention<T> {
  entry: T;
  /** Pontos atrás do líder. */
  gap: number;
  /** Ainda pode ao menos empatar com o líder em pontos. */
  alive: boolean;
}

/**
 * Marca quem ainda pode ser campeão. Empate em pontos conta como "vivo",
 * porque o desempate depende de resultados futuros.
 */
export function contention<T extends { points: number }>(
  standings: T[],
  pointsRemaining: number,
): { rows: Contention<T>[]; clinched: boolean } {
  if (standings.length === 0) return { rows: [], clinched: false };
  const lead = standings[0].points;
  const rows = standings.map((entry) => ({
    entry,
    gap: lead - entry.points,
    alive: entry.points + pointsRemaining >= lead,
  }));
  const clinched = rows.filter((r) => r.alive).length === 1;
  return { rows, clinched };
}
