// Geometria e leitura do replay. Usado pela ingestão (para transformar x/y em
// distância ao longo do traçado) e pelo site (para ler essa distância de volta).

import type { Pt, RaceData, RaceDriver } from './raceTypes.ts';

// ---------- Traçado ----------

/** Reamostra uma linha fechada em `n` pontos igualmente espaçados. */
export function resampleClosed(points: Pt[], n: number): Pt[] {
  const pts = points.filter((p, i) => i === 0 || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1]);
  const m = pts.length;
  const cum = [0];
  for (let i = 0; i < m; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % m];
    cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = cum[m];
  const out: Pt[] = [];
  let seg = 0;
  for (let k = 0; k < n; k++) {
    const target = (total * k) / n;
    while (seg < m - 1 && cum[seg + 1] <= target) seg++;
    const a = pts[seg];
    const b = pts[(seg + 1) % m];
    const len = cum[seg + 1] - cum[seg] || 1;
    const f = (target - cum[seg]) / len;
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return out;
}

/** Média móvel circular, para tirar o serrilhado das amostras de GPS. */
export function smoothClosed(line: Pt[], radius: number): Pt[] {
  const n = line.length;
  return line.map((_, i) => {
    let x = 0;
    let y = 0;
    for (let k = -radius; k <= radius; k++) {
      const p = line[(i + k + n) % n];
      x += p[0];
      y += p[1];
    }
    const w = 2 * radius + 1;
    return [x / w, y / w] as Pt;
  });
}

/**
 * Devolve uma função que projeta (x, y) no traçado e responde a fração da
 * volta (0 a 1). Guarda a última posição e procura primeiro perto dela, para
 * não saltar entre trechos que passam lado a lado.
 */
export function makeProjector(line: Pt[]): (x: number, y: number) => number {
  const n = line.length;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of line) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const far = 0.04 * Math.hypot(maxX - minX, maxY - minY);
  const farSq = far * far;
  const back = Math.ceil(n * 0.02);
  const span = Math.ceil(n * 0.15);
  let last = -1;

  const nearest = (x: number, y: number, from: number, count: number): [number, number] => {
    let best = from;
    let bestD = Infinity;
    for (let k = 0; k < count; k++) {
      const i = (from + k) % n;
      const dx = line[i][0] - x;
      const dy = line[i][1] - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return [best, bestD];
  };

  return (x, y) => {
    let i: number;
    let d: number;
    if (last < 0) {
      [i, d] = nearest(x, y, 0, n);
    } else {
      [i, d] = nearest(x, y, (last - back + n) % n, back + span);
      if (d > farSq) [i, d] = nearest(x, y, 0, n);
    }
    last = i;

    // Refina dentro do segmento vizinho mais próximo.
    const prev = line[(i - 1 + n) % n];
    const cur = line[i];
    const next = line[(i + 1) % n];
    const along = (a: Pt, b: Pt) => {
      const vx = b[0] - a[0];
      const vy = b[1] - a[1];
      const len = vx * vx + vy * vy || 1;
      return ((x - a[0]) * vx + (y - a[1]) * vy) / len;
    };
    const fNext = along(cur, next);
    const fPrev = along(prev, cur);
    let pos = i;
    if (fNext > 0) pos = i + Math.min(1, fNext);
    else if (fPrev < 1) pos = i - 1 + Math.max(0, fPrev);
    return (((pos / n) % 1) + 1) % 1;
  };
}

/**
 * Transforma frações de volta sucessivas em distância acumulada. Quem começa
 * logo atrás da linha (fração perto de 1) começa com valor negativo, de modo
 * que a parte inteira seja o número de voltas completadas.
 */
export function unwrap(fracs: number[]): number[] {
  if (fracs.length === 0) return [];
  let u = fracs[0] > 0.5 ? fracs[0] - 1 : fracs[0];
  const out = [u];
  for (let i = 1; i < fracs.length; i++) {
    let d = fracs[i] - fracs[i - 1];
    if (d < -0.5) d += 1;
    else if (d > 0.5) d -= 1;
    u += d;
    out.push(u);
  }
  return out;
}

/**
 * Como `unwrap`, mas tira o número de voltas da cronometragem em vez de
 * contar passagens pela linha. Assim uma falha de sinal no meio da corrida
 * não faz o carro "perder" voltas: a fração vem da posição na pista e a parte
 * inteira vem de qual volta o piloto estava fazendo naquele instante.
 *
 * `laps` são [volta, início, duração] em ordem; `typicalLap` cobre as voltas
 * sem duração conhecida.
 */
export function anchorToLaps(
  times: number[],
  fracs: number[],
  laps: [number, number, number | null][],
  typicalLap: number,
): number[] {
  if (laps.length === 0) return unwrap(fracs);
  let j = -1;
  let inLastLap = false;
  const out: number[] = [];
  times.forEach((t, i) => {
    while (j + 1 < laps.length && laps[j + 1][1] <= t) j++;
    const isLast = j === laps.length - 1;
    if (isLast && inLastLap) {
      // Da última volta em diante não há mais cronometragem para ancorar
      // (o carro pode ter parado, ou estar na volta de desaceleração):
      // segue contando pela própria posição.
      let d = fracs[i] - fracs[i - 1];
      if (d < -0.5) d += 1;
      else if (d > 0.5) d -= 1;
      out.push(out[i - 1] + d);
      return;
    }
    let estimate: number;
    if (j < 0) {
      // Antes da largada: parado no grid, logo atrás da linha.
      estimate = Math.max(-0.5, (t - laps[0][1]) / typicalLap);
    } else {
      const [n, start, duration] = laps[j];
      const length = (isLast ? duration : laps[j + 1][1] - start) || typicalLap;
      estimate = n - 1 + Math.min(0.999, (t - start) / length);
      inLastLap = isLast;
    }
    out.push(fracs[i] + Math.round(estimate - fracs[i]));
  });
  return out;
}

/** Interpola uma série (t crescente) em instantes regulares. */
export function resampleSeries(
  times: number[],
  values: number[],
  start: number,
  hz: number,
  count: number,
): number[] {
  const out: number[] = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const t = start + k / hz;
    while (j < times.length - 2 && times[j + 1] <= t) j++;
    if (times.length === 0) out.push(0);
    else if (t <= times[0]) out.push(values[0]);
    else if (t >= times[times.length - 1]) out.push(values[values.length - 1]);
    else {
      const span = times[j + 1] - times[j] || 1;
      out.push(values[j] + ((values[j + 1] - values[j]) * (t - times[j])) / span);
    }
  }
  return out;
}

export function encodeDeltas(values: number[], scale: number): number[] {
  let prev = 0;
  return values.map((v) => {
    const q = Math.round(v * scale);
    const d = q - prev;
    prev = q;
    return d;
  });
}

export function decodeDeltas(deltas: number[], scale: number): Float32Array {
  const out = new Float32Array(deltas.length);
  let q = 0;
  for (let i = 0; i < deltas.length; i++) {
    q += deltas[i];
    out[i] = q / scale;
  }
  return out;
}

// ---------- Leitura no site ----------

/** Distância acumulada (em voltas) no instante t. */
export function sampleU(u: Float32Array, start: number, hz: number, t: number): number {
  const x = (t - start) * hz;
  if (x <= 0) return u[0];
  const i = Math.floor(x);
  if (i >= u.length - 1) return u[u.length - 1];
  return u[i] + (u[i + 1] - u[i]) * (x - i);
}

/** Ponto do traçado para uma fração de volta. */
export function pointAt(line: Pt[], frac: number): Pt {
  const n = line.length;
  const x = ((((frac % 1) + 1) % 1) * n) % n;
  const i = Math.floor(x);
  const a = line[i];
  const b = line[(i + 1) % n];
  const f = x - i;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

/** Índice do último elemento com tempo <= t, ou -1. */
export function lastIndexAtOrBefore(times: ArrayLike<number>, t: number): number {
  let lo = 0;
  let hi = times.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/** Volta do líder no instante t (0 antes da largada). */
export function lapAt(lapStarts: number[], t: number): number {
  return lastIndexAtOrBefore(lapStarts, t) + 1;
}

/** Instante correspondente a uma posição na barra, onde cada volta tem a mesma largura. */
export function timeAtBar(lapStarts: number[], tEnd: number, x: number): number {
  const laps = lapStarts.length;
  const pos = Math.max(0, Math.min(laps, x * laps));
  const i = Math.min(laps - 1, Math.floor(pos));
  const from = lapStarts[i];
  const to = i + 1 < laps ? lapStarts[i + 1] : tEnd;
  return from + (to - from) * (pos - i);
}

/** Inverso de timeAtBar: posição (0 a 1) na barra para o instante t. */
export function barAtTime(lapStarts: number[], tEnd: number, t: number): number {
  const laps = lapStarts.length;
  const i = lastIndexAtOrBefore(lapStarts, t);
  if (i < 0) return 0;
  const from = lapStarts[i];
  const to = i + 1 < laps ? lapStarts[i + 1] : tEnd;
  return Math.min(1, (i + Math.min(1, (t - from) / (to - from || 1))) / laps);
}

export interface FrameRow {
  driver: RaceDriver;
  pos: number;
  /** Segundos atrás do líder, −n para n voltas atrás, null se desconhecido. */
  gap: number | null;
  lap: number;
  compound: string | null;
  tyreAge: number | null;
  inPit: boolean;
  retired: boolean;
  finished: boolean;
}

/** A classificação no instante t, em ordem de posição. */
export function frameAt(race: RaceData, t: number): FrameRow[] {
  const rows = race.drivers.map((driver): FrameRow => {
    const key = String(driver.number);

    const positions = race.positions[key] ?? [];
    let p = -1;
    for (let i = 0; i < positions.length && positions[i][0] <= t; i++) p = i;
    const pos = p >= 0 ? positions[p][1] : (positions[0]?.[1] ?? 99);

    const gaps = race.gaps[key];
    let gi = gaps ? lastIndexAtOrBefore(gaps.t, t) : -1;
    // A cronometragem às vezes manda um valor vazio (na bandeirada, por
    // exemplo): usa a última leitura válida recente.
    for (let back = 0; gi >= 0 && gaps.g[gi] === null && back < 6; back++) gi--;
    const gap = gi >= 0 ? gaps.g[gi] : null;

    const laps = race.laps[key] ?? [];
    let lap = 0;
    for (const [n, start] of laps) {
      if (start <= t) lap = n;
      else break;
    }

    // Fora de qualquer stint (antes da largada ou depois de abandonar),
    // vale o último stint já iniciado.
    const stintList = race.stints[key] ?? [];
    const stint =
      stintList.find(([from, to]) => lap >= from && lap <= to) ??
      [...stintList].reverse().find(([from]) => from <= lap) ??
      stintList[0];
    const inPit = (race.pits[key] ?? []).some(([from, lane]) => t >= from && t <= from + lane);

    return {
      driver,
      pos,
      gap,
      lap,
      compound: stint ? stint[2] : null,
      tyreAge: stint ? stint[3] + Math.max(0, Math.min(lap, stint[1]) - stint[0]) : null,
      inPit,
      retired: driver.retiredAt !== null && t >= driver.retiredAt,
      finished: driver.finishAt !== null && t >= driver.finishAt,
    };
  });
  return rows.sort((a, b) => a.pos - b.pos);
}
