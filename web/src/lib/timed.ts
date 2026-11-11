// Sessões cronometradas (treinos e classificação): a tabela é pela melhor
// volta de cada piloto, e na classificação cada fase (Q1, Q2, Q3) zera os tempos.

import type { RaceData } from './raceTypes.ts';

export type Phase = NonNullable<RaceData['phases']>[number];

/** Fase em andamento no instante t, ou a última que já começou. */
export function phaseAt(race: RaceData, t: number): Phase | undefined {
  let current: Phase | undefined;
  for (const p of race.phases ?? []) if (p.from <= t) current = p;
  return current;
}

/** Melhor volta do piloto completada entre `from` e `t`. */
export function bestLapAt(
  race: RaceData,
  driver: number,
  t: number,
  from = -Infinity,
): { time: number; lap: number } | null {
  let best: { time: number; lap: number } | null = null;
  for (const [lap, start, duration] of race.laps[driver] ?? []) {
    if (duration === null || start < from || start + duration > t) continue;
    if (!best || duration < best.time) best = { time: duration, lap };
  }
  return best;
}

export interface TimedRow {
  /** Melhor volta mostrada para o piloto. */
  best: number | null;
  /** Diferença para a melhor volta da sessão (ou da fase); 0 para quem a tem. */
  gap: number | null;
  /**
   * false quando o tempo é de uma fase anterior: o piloto ainda não marcou
   * volta na fase atual, ou foi eliminado antes dela.
   */
  current: boolean;
}

/**
 * Melhor volta e diferença de cada piloto no instante t. Na classificação,
 * vale a fase em andamento; quem não tem volta nela aparece com o tempo da
 * fase anterior, marcado como não atual.
 */
export function timedBoard(race: RaceData, t: number): Map<number, TimedRow> {
  const phase = phaseAt(race, t);
  const from = phase ? phase.from : -Infinity;
  const rows = new Map<number, TimedRow>();
  let leader = Infinity;
  for (const d of race.drivers) {
    const now = bestLapAt(race, d.number, t, from);
    if (now) {
      leader = Math.min(leader, now.time);
      rows.set(d.number, { best: now.time, gap: 0, current: true });
    } else {
      const before = phase ? bestLapAt(race, d.number, Math.min(t, phase.from)) : null;
      rows.set(d.number, { best: before?.time ?? null, gap: null, current: false });
    }
  }
  for (const row of rows.values()) {
    if (row.current && row.best !== null) row.gap = row.best - leader;
  }
  return rows;
}
