// Análises derivadas do arquivo da corrida: história, pit stops, undercut,
// consistência, comparação e simulação "e se". Tudo calculado no navegador,
// sem depender do replay (o relógio do player não entra aqui).

import type { EventKind, RaceData, RaceEvent, RaceTelemetry } from './raceTypes.ts';

type TelemetryLap = RaceTelemetry['laps'][string];

// ---------- Consultas básicas ----------

export function positionAt(race: RaceData, driver: number, t: number): number {
  let pos = 99;
  for (const [at, p] of race.positions[driver] ?? []) {
    if (at > t) break;
    pos = p;
  }
  return pos;
}

function pitWindowAt(race: RaceData, driver: number, from: number, to: number): boolean {
  return (race.pits[driver] ?? []).some(([tIn, lane]) => tIn <= to && tIn + lane >= from);
}

function neutralisedAt(race: RaceData, from: number, to: number): boolean {
  return race.periods.some((p) => p.from <= to && p.to >= from);
}

function lapOfLeaderAt(race: RaceData, t: number): number {
  let lap = 0;
  for (let i = 0; i < race.lapStarts.length && race.lapStarts[i] <= t; i++) lap = i + 1;
  return lap;
}

const retiredBy = (race: RaceData, driver: number, t: number) => {
  const d = race.drivers.find((x) => x.number === driver);
  return d !== undefined && d.retiredAt !== null && d.retiredAt <= t;
};

// ---------- História da corrida ----------

/**
 * De onde vem o evento: mensagem do controle de prova, dado de cronometragem
 * (pit, líder, abandono) ou dedução nossa a partir das trocas de posição.
 */
export type StorySource = 'official' | 'timing' | 'inferred';

export interface StoryEvent extends RaceEvent {
  /** 3 = momento decisivo, 2 = relevante, 1 = detalhe. */
  importance: 1 | 2 | 3;
  source: StorySource;
}

const OFFICIAL_IMPORTANCE: Partial<Record<EventKind, 1 | 2 | 3>> = {
  start: 3,
  sc: 3,
  vsc: 3,
  red: 3,
  scEnding: 2,
  vscEnding: 2,
  green: 2,
  penalty: 2,
  yellow: 1,
  doubleYellow: 1,
  investigation: 1,
  noAction: 1,
  warning: 1,
};

/** Trocas de posição na pista, deduzidas dos dados de posição. */
export function inferOvertakes(race: RaceData): StoryEvent[] {
  const lap2 = race.lapStarts[1] ?? 0;
  const winnerFinish = Math.min(...race.drivers.map((d) => d.finishAt ?? Infinity));
  // Todas as mudanças: quem, quando, de onde para onde.
  const changes: { driver: number; t: number; from: number; to: number }[] = [];
  for (const d of race.drivers) {
    const list = race.positions[d.number] ?? [];
    for (let i = 1; i < list.length; i++) {
      changes.push({ driver: d.number, t: list[i][0], from: list[i - 1][1], to: list[i][1] });
    }
  }
  const out: StoryEvent[] = [];
  const seen = new Set<string>();
  for (const gain of changes) {
    // Só ganhos de posição depois da primeira volta e antes da bandeirada.
    if (gain.to >= gain.from || gain.t < lap2 || gain.t > winnerFinish) continue;
    for (const loss of changes) {
      if (loss.driver === gain.driver || Math.abs(loss.t - gain.t) > 3) continue;
      // O ultrapassado é quem ocupava a posição conquistada e caiu logo atrás.
      if (loss.from !== gain.to || loss.to !== gain.to + 1) continue;
      // Posição ganha porque o outro parou (ou abandonou) não é ultrapassagem.
      if (pitWindowAt(race, loss.driver, gain.t - 40, gain.t + 5)) continue;
      if (pitWindowAt(race, gain.driver, gain.t - 5, gain.t + 5)) continue;
      if (retiredBy(race, loss.driver, gain.t + 90)) continue;
      // Com a corrida neutralizada não se ultrapassa: são paradas e reordenações.
      if (neutralisedAt(race, gain.t - 10, gain.t + 10)) continue;
      const key = `${gain.driver}-${loss.driver}-${Math.round(gain.t / 5)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        t: gain.t,
        lap: lapOfLeaderAt(race, gain.t),
        kind: 'overtake',
        drivers: [gain.driver, loss.driver],
        n: gain.to,
        importance: gain.to <= 3 ? 3 : gain.to <= 10 ? 2 : 1,
        source: 'inferred',
      });
    }
  }
  // Troca desfeita em seguida (A passa B, B devolve) costuma ser oscilação da
  // cronometragem ou uma disputa sem resultado: fica de fora.
  const undone = (e: StoryEvent) =>
    out.some(
      (o) =>
        o !== e &&
        o.drivers?.[0] === e.drivers?.[1] &&
        o.drivers?.[1] === e.drivers?.[0] &&
        Math.abs(o.t - e.t) <= 45,
    );
  return out.filter((e) => !undone(e));
}

/** Todos os acontecimentos da corrida em ordem, com importância e origem. */
export function buildStory(race: RaceData): StoryEvent[] {
  if (race.kind === 'timed') return timedStory(race);
  const overtakes = inferOvertakes(race);
  const out: StoryEvent[] = [...overtakes];

  for (const e of race.events) {
    if (e.kind === 'chequered') continue; // vira o evento de chegada, abaixo
    if (e.kind === 'pit') {
      const front = e.drivers ? positionAt(race, e.drivers[0], e.t - 2) <= 3 : false;
      out.push({ ...e, importance: front ? 2 : 1, source: 'timing' });
    } else if (e.kind === 'lead') {
      // Se a liderança mudou por uma ultrapassagem já listada, não repete.
      const dup = overtakes.some(
        (o) => o.n === 1 && o.drivers?.[0] === e.drivers?.[0] && Math.abs(o.t - e.t) <= 5,
      );
      if (!dup) out.push({ ...e, importance: 3, source: 'timing' });
    } else if (e.kind === 'retired') {
      out.push({ ...e, importance: 2, source: 'timing' });
    } else {
      out.push({ ...e, importance: OFFICIAL_IMPORTANCE[e.kind] ?? 1, source: 'official' });
    }
  }

  const FINAL = 5;
  if (race.totalLaps > 2 * FINAL) {
    const lap = race.totalLaps - FINAL + 1;
    out.push({
      t: race.lapStarts[lap - 1],
      lap,
      kind: 'finalLaps',
      n: FINAL,
      importance: 2,
      source: 'timing',
    });
  }

  const finishers = race.drivers
    .filter((d) => d.finishAt !== null)
    .sort((a, b) => a.finishAt! - b.finishAt!);
  if (finishers.length) {
    const t = finishers[0].finishAt!;
    const winner =
      race.drivers.find((d) => positionAt(race, d.number, t + 1) === 1) ?? finishers[0];
    out.push({
      t: Math.round(t),
      lap: race.totalLaps,
      kind: 'finish',
      drivers: [winner.number],
      importance: 3,
      source: 'timing',
    });
  }

  return out.sort((a, b) => a.t - b.t);
}

/** Treinos e classificação: bandeiras, trocas na ponta da tabela e início das fases. */
function timedStory(race: RaceData): StoryEvent[] {
  const out: StoryEvent[] = [];
  for (const e of race.events) {
    if (e.kind === 'chequered') continue;
    if (e.kind === 'lead') out.push({ ...e, importance: 2, source: 'timing' });
    else out.push({ ...e, importance: OFFICIAL_IMPORTANCE[e.kind] ?? 1, source: 'official' });
  }
  for (const p of race.phases ?? []) {
    out.push({ t: p.from, lap: 0, kind: 'phase', reason: p.name, importance: 3, source: 'official' });
  }
  return out.sort((a, b) => a.t - b.t);
}

// ---------- Estratégia ----------

export interface PitStop {
  driver: number;
  lap: number;
  /** Entrada no pit lane. */
  t: number;
  lane: number;
  posBefore: number;
  posAfter: number;
  from: string | null;
  to: string | null;
  /** Parada feita com a corrida neutralizada. */
  neutralised: boolean;
}

/** Tempo depois da saída do pit para a classificação assentar. */
const SETTLE = 20;

export function pitStops(race: RaceData): PitStop[] {
  const out: PitStop[] = [];
  for (const d of race.drivers) {
    const stints = race.stints[d.number] ?? [];
    for (const [t, lane, lap] of race.pits[d.number] ?? []) {
      // "Paradas" de vários minutos são a espera de uma bandeira vermelha.
      if (t < 0 || lane > 300) continue;
      const before = [...stints].reverse().find(([from]) => from <= lap);
      const after = stints.find(([from]) => from > lap);
      out.push({
        driver: d.number,
        lap,
        t,
        lane,
        posBefore: positionAt(race, d.number, t - 2),
        posAfter: positionAt(race, d.number, t + lane + SETTLE),
        from: before?.[2] ?? null,
        to: after?.[2] ?? null,
        neutralised: neutralisedAt(race, t, t + lane),
      });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

export interface PitBattle {
  kind: 'undercut' | 'overcut';
  /** Quem ganhou a posição. */
  winner: number;
  loser: number;
  winnerLap: number;
  loserLap: number;
  /** Momento em que a troca ficou consolidada. */
  t: number;
}

/**
 * Posições trocadas pela ordem das paradas: undercut (quem para antes sai na
 * frente) e overcut (quem fica na pista e para depois sai na frente).
 */
export function findPitBattles(race: RaceData, maxLapsApart = 6): PitBattle[] {
  const stops = pitStops(race).filter((s) => !s.neutralised);
  const out: PitBattle[] = [];
  const seen = new Set<string>();
  for (const first of stops) {
    for (const second of stops) {
      if (second.driver === first.driver) continue;
      const apart = second.lap - first.lap;
      if (apart < 1 || apart > maxLapsApart || second.t <= first.t) continue;
      const before = first.t - 3;
      const after = second.t + second.lane + SETTLE;
      if (retiredBy(race, first.driver, after + 60) || retiredBy(race, second.driver, after + 60)) continue;
      // Outra parada de qualquer um dos dois no meio invalida a comparação.
      const extra = stops.some(
        (s) =>
          s !== first &&
          s !== second &&
          (s.driver === first.driver || s.driver === second.driver) &&
          s.t > first.t &&
          s.t < after,
      );
      if (extra) continue;
      const p1Before = positionAt(race, first.driver, before);
      const p2Before = positionAt(race, second.driver, before);
      // Só disputas diretas: os dois andavam em posições vizinhas.
      if (Math.abs(p1Before - p2Before) > 2) continue;
      const p1After = positionAt(race, first.driver, after);
      const p2After = positionAt(race, second.driver, after);
      let battle: PitBattle | null = null;
      if (p1Before > p2Before && p1After < p2After) {
        battle = { kind: 'undercut', winner: first.driver, loser: second.driver, winnerLap: first.lap, loserLap: second.lap, t: after };
      } else if (p1Before < p2Before && p1After > p2After) {
        battle = { kind: 'overcut', winner: second.driver, loser: first.driver, winnerLap: second.lap, loserLap: first.lap, t: after };
      }
      if (!battle) continue;
      const key = `${battle.winner}-${battle.loser}-${battle.winnerLap}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(battle);
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

// ---------- Voltas limpas, consistência e ritmo ----------

export interface CleanLap {
  lap: number;
  time: number;
  compound: string;
  /** Idade do pneu nesta volta. */
  age: number;
  stint: number;
}

const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};

/**
 * Voltas representativas do ritmo: fora a primeira volta, as de entrada e
 * saída de pit, as feitas com a corrida neutralizada e as muito lentas.
 */
export function cleanLaps(race: RaceData, driver: number, upToLap = Infinity): CleanLap[] {
  const stints = race.stints[driver] ?? [];
  const candidates: CleanLap[] = [];
  for (const [lap, start, duration] of race.laps[driver] ?? []) {
    if (duration === null || lap <= 1 || lap > upToLap) continue;
    const end = start + duration;
    if (pitWindowAt(race, driver, start - 1, end + 1)) continue;
    if (neutralisedAt(race, start, end)) continue;
    const index = stints.findIndex(([from, to]) => lap >= from && lap <= to);
    if (index < 0) continue;
    const [from, , compound, age0] = stints[index];
    if (lap === from && from > 1) continue; // volta de saída
    candidates.push({ lap, time: duration, compound, age: age0 + lap - from, stint: index });
  }
  const limit = median(candidates.map((c) => c.time)) * 1.08;
  return candidates.filter((c) => c.time <= limit);
}

export interface Consistency {
  driver: number;
  laps: number;
  best: number;
  median: number;
  /** Desvio padrão das voltas limpas: quanto menor, mais constante. */
  spread: number;
}

export function consistency(race: RaceData, upToLap = Infinity): Consistency[] {
  const out: Consistency[] = [];
  for (const d of race.drivers) {
    const times = cleanLaps(race, d.number, upToLap).map((l) => l.time);
    if (times.length < 5) continue;
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const variance = times.reduce((a, b) => a + (b - mean) ** 2, 0) / times.length;
    out.push({
      driver: d.number,
      laps: times.length,
      best: Math.min(...times),
      median: median(times),
      spread: Math.sqrt(variance),
    });
  }
  return out.sort((a, b) => a.median - b.median);
}

export interface StintPace {
  stint: number;
  compound: string;
  from: number;
  to: number;
  laps: number;
  average: number;
  /** Quanto a volta piora a cada volta de uso do pneu (s/volta). */
  degradation: number | null;
}

/** Ajuste linear y = a + b·x. */
function fitLine(xs: number[], ys: number[]): { a: number; b: number } {
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  const b = sxx > 0 ? sxy / sxx : 0;
  return { a: my - b * mx, b };
}

export function stintPace(race: RaceData, driver: number, upToLap = Infinity): StintPace[] {
  const clean = cleanLaps(race, driver, upToLap);
  // Desconta a evolução da corrida para sobrar só o efeito do pneu.
  const evolution = evolutionOf(race);
  return (race.stints[driver] ?? [])
    .map(([from, to, compound], stint): StintPace | null => {
      if (from > upToLap) return null;
      const laps = clean.filter((l) => l.stint === stint);
      if (laps.length === 0) return null;
      const times = laps.map((l) => l.time);
      return {
        stint,
        compound,
        from,
        to: Math.min(to, upToLap),
        laps: laps.length,
        average: times.reduce((a, b) => a + b, 0) / times.length,
        degradation:
          laps.length >= 5
            ? fitLine(laps.map((l) => l.age), laps.map((l) => l.time + evolution * l.lap)).b
            : null,
      };
    })
    .filter((s): s is StintPace => s !== null);
}

/** Posição de cada piloto ao fim de cada volta dele (null se não completou). */
export function lapChart(race: RaceData): { driver: number; positions: (number | null)[] }[] {
  return race.drivers.map((d) => {
    const laps = race.laps[d.number] ?? [];
    const positions: (number | null)[] = [];
    for (let n = 1; n <= race.totalLaps; n++) {
      const lap = laps.find((l) => l[0] === n);
      const next = laps.find((l) => l[0] === n + 1);
      const end = next ? next[1] : lap && lap[2] !== null ? lap[1] + lap[2] : null;
      const retired = d.retiredAt !== null && end !== null && end > d.retiredAt;
      positions.push(end === null || retired ? null : positionAt(race, d.number, end + 1));
    }
    return { driver: d.number, positions };
  });
}

// ---------- Comparação entre dois pilotos ----------

/** Distância de B para A (segundos; positivo = B atrás) ao início de cada volta. */
export function gapBetween(race: RaceData, a: number, b: number): (number | null)[] {
  const gapAt = (driver: number, t: number): number | null => {
    const g = race.gaps[driver];
    if (!g) return null;
    let value: number | null = null;
    for (let i = 0; i < g.t.length && g.t[i] <= t; i++) if (g.g[i] !== null) value = g.g[i];
    return value;
  };
  return race.lapStarts.map((t, i) => {
    if (i === 0) return null;
    const ga = gapAt(a, t + 2);
    const gb = gapAt(b, t + 2);
    // Valores negativos são "voltas atrás": não dá para subtrair em segundos.
    if (ga === null || gb === null || ga < 0 || gb < 0) return null;
    if (retiredBy(race, a, t) || retiredBy(race, b, t)) return null;
    return gb - ga;
  });
}

/**
 * Tempo acumulado ao longo da volta a partir do traço de velocidade.
 * O comprimento da volta é ajustado para o total bater com o tempo da volta.
 */
function elapsed(lap: TelemetryLap): number[] {
  const n = lap.speed.length - 1;
  const inv = lap.speed.map((v) => 1 / Math.max(v, 30));
  const cum = [0];
  for (let i = 1; i <= n; i++) cum.push(cum[i - 1] + (inv[i - 1] + inv[i]) / 2);
  const scale = lap.time / cum[n];
  return cum.map((v) => v * scale);
}

/** Diferença de tempo acumulada de B para A ao longo da volta (positivo = B perde). */
export function lapDelta(a: TelemetryLap, b: TelemetryLap): number[] {
  const ta = elapsed(a);
  const tb = elapsed(b);
  return ta.map((v, i) => tb[i] - v);
}

export interface DeltaSegment {
  /** Fração da volta onde o trecho começa e termina. */
  from: number;
  to: number;
  /** Tempo que B perdeu para A no trecho (negativo = B ganhou). */
  loss: number;
}

/** Divide a volta em trechos iguais e devolve os de maior diferença. */
export function biggestSegments(delta: number[], parts = 12, top = 3): DeltaSegment[] {
  const n = delta.length - 1;
  const segments: DeltaSegment[] = [];
  for (let p = 0; p < parts; p++) {
    const i0 = Math.round((p * n) / parts);
    const i1 = Math.round(((p + 1) * n) / parts);
    segments.push({ from: i0 / n, to: i1 / n, loss: delta[i1] - delta[i0] });
  }
  return segments.sort((x, y) => Math.abs(y.loss) - Math.abs(x.loss)).slice(0, top);
}

// ---------- E se? ----------

const MIN_COMPOUND_LAPS = 15;
const MAX_DEGRADATION = 0.35;
const MAX_EVOLUTION = 0.2;
/** Usado só quando a corrida não permite medir a evolução. */
const DEFAULT_EVOLUTION = 0.05;

/**
 * Ritmo do pelotão ajustado de uma vez só, com todas as voltas limpas em pneus
 * de pista seca:
 *
 *   tempo = ritmo do piloto + diferença do composto
 *           + desgaste do composto × idade do pneu − evolução × volta
 *
 * Ajustar tudo junto é o que separa o desgaste do pneu da evolução da corrida
 * (carro mais leve, pista mais emborrachada): dentro de um stint os dois andam
 * juntos, mas pilotos que param em voltas diferentes desfazem a ambiguidade.
 */
export interface FieldModel {
  /** Quanto a volta melhora a cada volta de corrida (s/volta). */
  evolution: number;
  degradation: Record<string, number>;
  /** Diferença de ritmo de cada composto, novo, para o de referência. */
  offset: Record<string, number>;
  driver: Record<string, number>;
  /** Voltas limpas usadas por composto. */
  laps: Record<string, number>;
}

const fieldModels = new WeakMap<RaceData, FieldModel | null>();

/** Resolve A·x = b por eliminação de Gauss com pivô parcial. */
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    if (Math.abs(M[pivot][col]) < 1e-12) return null;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

export function fieldModel(race: RaceData): FieldModel | null {
  if (fieldModels.has(race)) return fieldModels.get(race)!;
  const rows: { driver: number; lap: CleanLap }[] = [];
  for (const d of race.drivers) {
    const laps = cleanLaps(race, d.number).filter(
      (l) => l.compound === 'SOFT' || l.compound === 'MEDIUM' || l.compound === 'HARD',
    );
    if (laps.length >= 3) for (const lap of laps) rows.push({ driver: d.number, lap });
  }
  const drivers = [...new Set(rows.map((r) => r.driver))];
  const compounds = [...new Set(rows.map((r) => r.lap.compound))].sort();
  // Incógnitas: um ritmo por piloto, uma diferença por composto (menos o de
  // referência), um desgaste por composto e a evolução.
  const iOffset = drivers.length;
  const iDeg = iOffset + compounds.length - 1;
  const iEvo = iDeg + compounds.length;
  const n = iEvo + 1;
  let model: FieldModel | null = null;
  if (rows.length >= 3 * n && compounds.length > 0) {
    const A = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    const b = new Array<number>(n).fill(0);
    for (const { driver, lap } of rows) {
      const c = compounds.indexOf(lap.compound);
      const terms: [number, number][] = [
        [drivers.indexOf(driver), 1],
        [iDeg + c, lap.age],
        [iEvo, -lap.lap],
      ];
      if (c > 0) terms.push([iOffset + c - 1, 1]);
      for (const [i, vi] of terms) {
        b[i] += vi * lap.time;
        for (const [j, vj] of terms) A[i][j] += vi * vj;
      }
    }
    // Uma regularização mínima evita sistema sem solução quando todos fizeram
    // a mesma estratégia.
    for (let i = 0; i < n; i++) A[i][i] += 1e-9;
    const x = solve(A, b);
    if (x) {
      const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));
      model = {
        evolution: clamp(x[iEvo], MAX_EVOLUTION),
        degradation: Object.fromEntries(compounds.map((c, i) => [c, clamp(x[iDeg + i], MAX_DEGRADATION)])),
        offset: Object.fromEntries(compounds.map((c, i) => [c, i === 0 ? 0 : x[iOffset + i - 1]])),
        driver: Object.fromEntries(drivers.map((d, i) => [d, x[i]])),
        laps: Object.fromEntries(compounds.map((c) => [c, rows.filter((r) => r.lap.compound === c).length])),
      };
    }
  }
  fieldModels.set(race, model);
  return model;
}

const evolutionOf = (race: RaceData) => fieldModel(race)?.evolution ?? DEFAULT_EVOLUTION;

export interface TyreModel {
  compound: string;
  /** Tempo de volta do piloto com este pneu novo, na volta zero da corrida. */
  base: number;
  /** Perda por volta de uso (s/volta), medida no pelotão. */
  degradation: number;
  /** Voltas limpas do pelotão com este composto. */
  laps: number;
}

/** Modelo de pneu para um piloto e composto, ou null se não há base suficiente. */
export function tyreModel(race: RaceData, driver: number, compound: string): TyreModel | null {
  const field = fieldModel(race);
  if (!field || !(driver in field.driver) || !(compound in field.degradation)) return null;
  if (field.laps[compound] < MIN_COMPOUND_LAPS) return null;
  return {
    compound,
    base: field.driver[driver] + field.offset[compound],
    degradation: field.degradation[compound],
    laps: field.laps[compound],
  };
}

export interface WhatIfInput {
  driver: number;
  /** Qual parada mover (0 = primeira). */
  stop: number;
  /** Volta ao fim da qual o piloto pararia. */
  lap: number;
  /** Composto do stint seguinte; ausente = o mesmo que ele usou. */
  compound?: string;
}

export type WhatIfWarning = 'fewLaps' | 'neutralised' | 'lapped';

export interface WhatIfResult {
  ok: true;
  /** Segundos em relação à corrida real (negativo = mais rápido). */
  delta: number;
  realLap: number;
  realPosition: number;
  estimatedPosition: number;
  /** Voltas cujo tempo muda na simulação. */
  affected: [number, number];
  models: TyreModel[];
  /** Quanto a volta melhora a cada volta de corrida, medido nesta corrida. */
  evolution: number;
  warnings: WhatIfWarning[];
}

export interface WhatIfError {
  ok: false;
  reason: 'noStop' | 'range' | 'noModel' | 'notFinished' | 'wet';
  /** Faixa de voltas válida para a parada, quando o problema é a volta. */
  range?: [number, number];
}

/** Classificação final pela pista: mais voltas primeiro, depois quem chegou antes. */
function finishOrder(race: RaceData, adjust: Record<number, number> = {}) {
  return race.drivers
    .filter((d) => d.finishAt !== null)
    .map((d) => ({
      driver: d.number,
      laps: (race.laps[d.number] ?? []).at(-1)?.[0] ?? 0,
      time: d.finishAt! + (adjust[d.number] ?? 0),
    }))
    .sort((x, y) => y.laps - x.laps || x.time - y.time);
}

/** Faixa de voltas em que a parada `stop` do piloto poderia acontecer. */
export function whatIfRange(race: RaceData, driver: number, stop: number): [number, number] | null {
  const stints = race.stints[driver] ?? [];
  const before = stints[stop];
  const after = stints[stop + 1];
  if (!before || !after) return null;
  return [before[0] + 1, after[1] - 1];
}

/**
 * Estima o efeito de mover uma parada (e, opcionalmente, trocar o composto do
 * stint seguinte). Modelo determinístico: tempo de volta = base do composto +
 * degradação × idade do pneu. Ignora tráfego, safety car e erros; o resultado
 * é uma estimativa, nunca um resultado oficial.
 */
export function simulate(race: RaceData, input: WhatIfInput): WhatIfResult | WhatIfError {
  const stints = race.stints[input.driver] ?? [];
  const before = stints[input.stop];
  const after = stints[input.stop + 1];
  if (!before || !after) return { ok: false, reason: 'noStop' };
  const range = whatIfRange(race, input.driver, input.stop)!;
  if (input.lap < range[0] || input.lap > range[1]) return { ok: false, reason: 'range', range };
  const me = race.drivers.find((d) => d.number === input.driver);
  if (!me || me.finishAt === null) return { ok: false, reason: 'notFinished' };

  const realLap = before[1];
  const newCompound = input.compound ?? after[2];
  // Com pneus de chuva a pista está mudando de volta para volta, e isso pesa
  // muito mais que o desgaste: o modelo não se aplica.
  if ([before[2], after[2], newCompound].some((c) => c === 'INTERMEDIATE' || c === 'WET')) {
    return { ok: false, reason: 'wet' };
  }
  const m1 = tyreModel(race, input.driver, before[2]);
  const m2Real = tyreModel(race, input.driver, after[2]);
  const m2Sim = tyreModel(race, input.driver, newCompound);
  if (!m1 || !m2Real || !m2Sim) return { ok: false, reason: 'noModel' };

  // Um jogo novo de outro composto entra zerado; o mesmo composto mantém a
  // idade com que o jogo real entrou.
  const age0Real = after[3];
  const age0Sim = newCompound === after[2] ? after[3] : 0;
  const time = (m: TyreModel, age: number) => m.base + m.degradation * age;
  const real = (lap: number) =>
    lap <= realLap ? time(m1, before[3] + lap - before[0]) : time(m2Real, age0Real + lap - (realLap + 1));
  const sim = (lap: number) =>
    lap <= input.lap ? time(m1, before[3] + lap - before[0]) : time(m2Sim, age0Sim + lap - (input.lap + 1));

  // Só mudam as voltas entre a parada mais cedo e o fim do stint seguinte.
  const first = Math.min(realLap, input.lap) + 1;
  const last = after[1];
  let delta = 0;
  for (let lap = first; lap <= last; lap++) delta += sim(lap) - real(lap);

  const realOrder = finishOrder(race);
  const simOrder = finishOrder(race, { [input.driver]: delta });
  const myLaps = realOrder.find((r) => r.driver === input.driver)?.laps ?? 0;

  const warnings: WhatIfWarning[] = [];
  const models = [m1, m2Sim].filter((m, i, list) => list.findIndex((x) => x.compound === m.compound) === i);
  if (models.some((m) => m.laps < 40)) warnings.push('fewLaps');
  const stop = (race.pits[input.driver] ?? []).find(([, , lap]) => lap === realLap);
  if (stop && neutralisedAt(race, stop[0], stop[0] + stop[1])) warnings.push('neutralised');
  if (myLaps < race.totalLaps) warnings.push('lapped');

  return {
    ok: true,
    delta,
    realLap,
    realPosition: realOrder.findIndex((r) => r.driver === input.driver) + 1,
    estimatedPosition: simOrder.findIndex((r) => r.driver === input.driver) + 1,
    affected: [first, last],
    models,
    evolution: evolutionOf(race),
    warnings,
  };
}
