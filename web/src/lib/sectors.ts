// Setores: onde ficam na pista e como cada piloto foi em cada um, com as
// cores da transmissão (roxo = melhor de todos até ali, verde = melhor do
// próprio piloto, amarelo = mais lento que o próprio melhor).

import type { RaceData, RaceSectors } from './raceTypes.ts';
import { sampleU } from './replay.ts';

export type SectorColor = 'purple' | 'green' | 'yellow';

interface LapSectors {
  times: [number, number, number];
  colors: [SectorColor, SectorColor, SectorColor];
}

export interface SectorModel {
  /** Fração da volta onde terminam o setor 1 e o setor 2. */
  bounds: [number, number];
  /** Por piloto, os setores de cada volta que tem os três tempos. */
  laps: Record<string, Map<number, LapSectors>>;
  /** Por piloto, a cor do tempo de cada volta completa. */
  lapColors: Record<string, Map<number, SectorColor>>;
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const frac = (u: number) => ((u % 1) + 1) % 1;

/**
 * Dá as cores na ordem em que os tempos aconteceram: cada tempo é comparado
 * só com o que já tinha sido feito antes dele.
 */
function colourInOrder<T extends { driver: string; time: number; doneAt: number }>(
  entries: T[],
): Map<T, SectorColor> {
  const out = new Map<T, SectorColor>();
  let overall = Infinity;
  const personal = new Map<string, number>();
  for (const e of [...entries].sort((a, b) => a.doneAt - b.doneAt)) {
    const mine = personal.get(e.driver) ?? Infinity;
    out.set(e, e.time <= overall ? 'purple' : e.time <= mine ? 'green' : 'yellow');
    overall = Math.min(overall, e.time);
    personal.set(e.driver, Math.min(mine, e.time));
  }
  return out;
}

/**
 * Monta o modelo de setores da corrida. `u` é a distância acumulada de cada
 * piloto (a mesma do replay), usada para achar onde os setores terminam.
 */
export function buildSectorModel(
  race: RaceData,
  u: Record<string, Float32Array>,
  sectors: RaceSectors,
): SectorModel | null {
  const lapStart = (driver: string, lap: number) =>
    race.laps[driver]?.find((l) => l[0] === lap)?.[1];
  const estimated = (t: number) => race.estimated?.some(([from, to]) => t >= from && t < to) ?? false;

  // --- Cores dos setores ---
  type Entry = { driver: string; lap: number; index: number; time: number; doneAt: number };
  const bySector: Entry[][] = [[], [], []];
  for (const [driver, rows] of Object.entries(sectors)) {
    for (const [lap, s1, s2, s3] of rows) {
      const start = lapStart(driver, lap);
      if (start === undefined) continue;
      const times = [s1, s2, s3];
      let done = start;
      times.forEach((time, index) => {
        done += time;
        bySector[index].push({ driver, lap, index, time, doneAt: done });
      });
    }
  }
  const laps: SectorModel['laps'] = {};
  bySector.forEach((entries, index) => {
    for (const [e, color] of colourInOrder(entries)) {
      const map = (laps[e.driver] ??= new Map());
      let row = map.get(e.lap);
      if (!row) {
        row = { times: [0, 0, 0], colors: ['yellow', 'yellow', 'yellow'] };
        map.set(e.lap, row);
      }
      row.times[index] = e.time;
      row.colors[index] = color;
    }
  });

  // --- Cores das voltas ---
  const lapEntries: { driver: string; lap: number; time: number; doneAt: number }[] = [];
  for (const [driver, list] of Object.entries(race.laps)) {
    for (const [lap, start, duration] of list) {
      if (duration !== null) lapEntries.push({ driver, lap, time: duration, doneAt: start + duration });
    }
  }
  const lapColors: SectorModel['lapColors'] = {};
  for (const [e, color] of colourInOrder(lapEntries)) {
    (lapColors[e.driver] ??= new Map()).set(e.lap, color);
  }

  // --- Limites na pista: onde o carro estava ao fim dos setores 1 e 2 ---
  const typical = median(lapEntries.map((e) => e.time));
  const ends1: number[] = [];
  const ends2: number[] = [];
  for (const [driver, rows] of Object.entries(sectors)) {
    const series = u[driver];
    if (!series) continue;
    for (const [lap, s1, s2, s3] of rows) {
      const start = lapStart(driver, lap);
      // Só voltas em ritmo normal e com sinal de posição de verdade.
      if (start === undefined || lap < 2 || s1 + s2 + s3 > typical * 1.1 || estimated(start)) continue;
      const at = (t: number) => frac(sampleU(series, race.replay.start, race.replay.hz, t));
      ends1.push(at(start + s1));
      ends2.push(at(start + s1 + s2));
      if (ends1.length >= 400) break;
    }
  }
  if (ends1.length < 5) return null;
  const bounds: [number, number] = [median(ends1), median(ends2)];
  if (!(bounds[0] > 0.03 && bounds[1] > bounds[0] + 0.03 && bounds[1] < 0.97)) return null;

  return { bounds, laps, lapColors };
}

export interface SectorState {
  state: 'done' | 'running' | 'pending';
  time: number | null;
  color: SectorColor | null;
}

export interface SectorView {
  lap: number;
  /** Os três setores da volta em andamento. */
  current: [SectorState, SectorState, SectorState];
  /** A última volta completa, se houver. */
  last: {
    lap: number;
    time: number;
    color: SectorColor | null;
    sectors: LapSectors | null;
  } | null;
}

/** Como o piloto está nos setores no instante t, sem adiantar o que ainda não aconteceu. */
export function sectorViewAt(
  race: RaceData,
  model: SectorModel,
  driver: number,
  t: number,
): SectorView | null {
  const key = String(driver);
  const list = race.laps[key] ?? [];
  let index = -1;
  for (let i = 0; i < list.length && list[i][1] <= t; i++) index = i;
  if (index < 0) return null;
  const [lap, start, duration] = list[index];
  // Depois da bandeirada (ou do abandono) a última volta já acabou.
  const finished = index === list.length - 1 && duration !== null && t >= start + duration;

  const row = model.laps[key]?.get(lap);
  const elapsed = t - start;
  // Onde o carro está na volta, para saber qual setor está em andamento
  // mesmo quando a volta não tem os tempos de setor.
  let acc = 0;
  let runningAssigned = false;
  const current = [0, 1, 2].map((i): SectorState => {
    if (finished) {
      return row ? { state: 'done', time: row.times[i], color: row.colors[i] } : { state: 'pending', time: null, color: null };
    }
    if (row) {
      acc += row.times[i];
      if (elapsed >= acc) return { state: 'done', time: row.times[i], color: row.colors[i] };
    }
    if (!runningAssigned) {
      runningAssigned = true;
      return { state: 'running', time: null, color: null };
    }
    return { state: 'pending', time: null, color: null };
  }) as SectorView['current'];

  const previous = finished ? list[index] : list[index - 1];
  const last =
    previous && previous[2] !== null
      ? {
          lap: previous[0],
          time: previous[2],
          color: model.lapColors[key]?.get(previous[0]) ?? null,
          sectors: model.laps[key]?.get(previous[0]) ?? null,
        }
      : null;

  return { lap, current, last };
}
