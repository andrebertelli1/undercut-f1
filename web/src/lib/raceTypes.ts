// Formato de race/<session_key>.json, gerado por ingest/race.ts.
// Todos os tempos são segundos a partir da largada (t = 0 é o apagar das luzes).

export type Pt = [number, number];

export interface RaceDriver {
  number: number;
  code: string;
  name: string;
  teamName: string;
  /** Id da equipe no padrão da Jolpica, quando reconhecida. */
  teamId: string | null;
  /** Cor da equipe segundo a OpenF1, usada se a equipe não for reconhecida. */
  colour: string;
  /** Momento em que o carro parou de vez, se abandonou. */
  retiredAt: number | null;
  /** Momento em que recebeu a bandeirada, se terminou. */
  finishAt: number | null;
}

export type EventKind =
  | 'start'
  | 'yellow'
  | 'doubleYellow'
  | 'sc'
  | 'scEnding'
  | 'vsc'
  | 'vscEnding'
  | 'red'
  | 'green'
  | 'chequered'
  | 'penalty'
  | 'investigation'
  | 'noAction'
  | 'warning'
  | 'pit'
  | 'lead'
  | 'retired'
  // Só na aba História (calculados no site, não vêm no arquivo):
  | 'overtake'
  | 'finalLaps'
  | 'finish'
  /** Início de uma fase da classificação; o nome vem em `reason`. */
  | 'phase';

export interface RaceEvent {
  t: number;
  lap: number;
  kind: EventKind;
  drivers?: number[];
  /** Setor (bandeiras), segundos (punição), duração no pit lane (pit), posição conquistada (ultrapassagem) ou voltas restantes. */
  n?: number;
  /** Motivo em inglês, como veio do controle de prova. */
  reason?: string;
}

export interface TrackPeriod {
  kind: 'sc' | 'vsc' | 'red';
  from: number;
  to: number;
}

/**
 * race/<session_key>-tel.json: telemetria da melhor volta de cada piloto,
 * reamostrada em `points` + 1 posições igualmente espaçadas ao longo da volta.
 */
export interface RaceTelemetry {
  points: number;
  laps: Record<
    string,
    {
      lap: number;
      time: number;
      /** km/h */
      speed: number[];
      /** 0 a 100 */
      throttle: number[];
      /** 0 ou 1 */
      brake: number[];
    }
  >;
}

/** race/<session_key>-sectors.json: por piloto, [volta, setor 1, setor 2, setor 3]. */
export type RaceSectors = Record<string, [number, number, number, number][]>;

export interface RaceData {
  version: 1;
  /**
   * "race": corrida ou sprint, com largada, voltas do líder e distâncias.
   * "timed": treino ou classificação, onde vale a melhor volta de cada um.
   * Nas sessões "timed", lapStarts marca minutos em vez de voltas.
   */
  kind?: 'race' | 'timed';
  /** Nome da sessão na OpenF1 ("Sprint", "Qualifying", "Practice 1"...). */
  sessionName?: string;
  /** Fases da classificação (Q1, Q2, Q3), quando houver. */
  phases?: { name: string; from: number; to: number }[];
  season: number;
  round: number;
  sessionKey: number;
  raceName: string;
  circuitName: string;
  startISO: string;
  totalLaps: number;
  /** Intervalo coberto pelo replay. */
  tStart: number;
  tEnd: number;
  /** lapStarts[i] = instante em que o primeiro carro abriu a volta i + 1. */
  lapStarts: number[];
  /** Traçado fechado; o ponto 0 fica na linha de chegada. */
  track: { points: Pt[]; width: number; height: number };
  drivers: RaceDriver[];
  /**
   * Distância percorrida por carro, em voltas, amostrada a `hz` a partir de
   * `start`. Guardada como inteiros (valor × scale) em diferenças sucessivas.
   */
  replay: { hz: number; scale: number; start: number; u: Record<string, number[]> };
  /** [t, posição] a cada mudança. */
  positions: Record<string, [number, number][]>;
  /** Distância para o líder: segundos, ou −n para n voltas atrás. */
  gaps: Record<string, { t: number[]; g: (number | null)[] }>;
  /** [volta, início, duração]. */
  laps: Record<string, [number, number, number | null][]>;
  /** [volta inicial, volta final, composto, idade do pneu no início]. */
  stints: Record<string, [number, number, string, number][]>;
  /** [entrada no pit lane, tempo no pit lane, volta]. */
  pits: Record<string, [number, number, number][]>;
  periods: TrackPeriod[];
  /**
   * Intervalos em que a fonte não tem sinal de posição: a posição na pista
   * foi estimada pela cronometragem das voltas.
   */
  estimated?: [number, number][];
  events: RaceEvent[];
  /** [t, temperatura do ar, temperatura da pista, chovendo (0/1)]. */
  weather: [number, number, number, number][];
}
