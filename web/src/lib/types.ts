// Formato de season/<ano>.json, gerado por ingest/season.ts e lido pelo site.

export interface Driver {
  id: string;
  code: string;
  name: string;
  familyName: string;
  number: string;
  nationality: string;
}

export interface Team {
  id: string;
  name: string;
}

export interface ResultRow {
  driverId: string;
  teamId: string;
  /** Posição final; null quando não classificado. */
  pos: number | null;
  grid: number | null;
  points: number;
  status: string;
}

export interface DriverStanding {
  pos: number;
  driverId: string;
  teamId: string;
  points: number;
  wins: number;
}

export interface TeamStanding {
  pos: number;
  teamId: string;
  points: number;
  wins: number;
}

/** Uma sessão do fim de semana (treino, classificação, sprint ou corrida). */
export interface SessionRef {
  /** session_key na OpenF1. */
  key: number;
  /** Nome como vem da OpenF1: "Practice 1", "Qualifying", "Sprint", "Race"... */
  name: string;
  /** Início, ISO 8601 em UTC. */
  start: string;
}

export interface Round {
  round: number;
  raceName: string;
  circuitId: string;
  circuitName: string;
  locality: string;
  country: string;
  lat: number;
  lng: number;
  /** Largada da corrida, ISO 8601 em UTC. */
  date: string;
  hasSprint: boolean;
  sprintDate: string | null;
  raceDone: boolean;
  sprintDone: boolean;
  /** session_key da corrida na OpenF1, usado pela Visão Corrida. */
  sessionKey: number | null;
  /** Todas as sessões do fim de semana, em ordem. Vazio se a OpenF1 não tem a etapa. */
  sessions: SessionRef[];
  results: ResultRow[];
  sprintResults: ResultRow[];
  fastestLap: { driverId: string; time: string; lap: number } | null;
  /** Classificações acumuladas depois desta etapa (vazias se nada foi disputado). */
  driverStandings: DriverStanding[];
  teamStandings: TeamStanding[];
}

export interface SeasonData {
  season: number;
  generatedAt: string;
  drivers: Record<string, Driver>;
  teams: Record<string, Team>;
  rounds: Round[];
}
