// Gera web/public/data/race/<session_key>.json com o replay de uma corrida,
// a partir da OpenF1. Precisa do arquivo da temporada (ingest/season.ts).
//
// Uso: node ingest/race.ts <ano> <etapa>...   ex.: node ingest/race.ts 2026 20
//      node ingest/race.ts <ano> all          todas as disputadas que ainda faltam

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  EventKind,
  Pt,
  RaceData,
  RaceDriver,
  RaceEvent,
  RaceTelemetry,
  TrackPeriod,
} from '../web/src/lib/raceTypes.ts';
import {
  encodeDeltas,
  makeProjector,
  resampleClosed,
  resampleSeries,
  smoothClosed,
  unwrap,
  anchorToLaps,
} from '../web/src/lib/replay.ts';
import type { Round, SeasonData } from '../web/src/lib/types.ts';

const OPENF1 = 'https://api.openf1.org/v1';
const DATA = resolve(dirname(fileURLToPath(import.meta.url)), '../web/public/data');
/** Limite gratuito da OpenF1: 30 pedidos por minuto. */
const REQUEST_GAP_MS = 2100;

const TRACK_POINTS = 1000;
const TRACK_BOX = 1000;
const HZ = 1;
const SCALE = 4000;
const LEAD_IN = 10;
const LEAD_OUT = 30;
const MAX_PIT_LANE = 300;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let lastRequest = 0;

async function openf1(path: string, attempt = 1): Promise<any[]> {
  const wait = lastRequest + REQUEST_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequest = Date.now();
  const res = await fetch(`${OPENF1}/${path}`, { headers: { 'User-Agent': 'undercut-ingest' } });
  if ((res.status === 429 || res.status >= 500) && attempt <= 5) {
    await sleep(5000 * attempt);
    return openf1(path, attempt + 1);
  }
  // A OpenF1 responde 404 quando o filtro não encontra nada.
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} em ${path}`);
  return res.json();
}

/** Nome da equipe na OpenF1 -> id da equipe na Jolpica. */
function teamIdFor(name: string): string | null {
  const n = name.toLowerCase();
  const table: [string, string][] = [
    ['red bull', 'red_bull'],
    ['racing bulls', 'rb'],
    ['mercedes', 'mercedes'],
    ['ferrari', 'ferrari'],
    ['mclaren', 'mclaren'],
    ['aston', 'aston_martin'],
    ['alpine', 'alpine'],
    ['williams', 'williams'],
    ['haas', 'haas'],
    ['audi', 'audi'],
    ['sauber', 'sauber'],
    ['cadillac', 'cadillac'],
  ];
  return table.find(([needle]) => n.includes(needle))?.[1] ?? null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
/** Data no formato que a OpenF1 aceita em filtros (UTC, sem fuso). */
const filterDate = (ms: number) => new Date(ms).toISOString().slice(0, 23);

async function ingestRace(season: number, round: Round): Promise<void> {
  const S = round.sessionKey;
  if (!S) throw new Error(`Etapa ${round.round} sem session_key`);
  console.log(`\nEtapa ${round.round} · ${round.raceName} (sessão ${S})`);

  const [driversRaw, lapsRaw, stintsRaw, pitsRaw, controlRaw, positionsRaw, intervalsRaw, weatherRaw] = [
    await openf1(`drivers?session_key=${S}`),
    await openf1(`laps?session_key=${S}`),
    await openf1(`stints?session_key=${S}`),
    await openf1(`pit?session_key=${S}`),
    await openf1(`race_control?session_key=${S}`),
    await openf1(`position?session_key=${S}`),
    await openf1(`intervals?session_key=${S}`),
    await openf1(`weather?session_key=${S}`),
  ];
  if (lapsRaw.length === 0) throw new Error('Sem voltas: a corrida ainda não está disponível.');

  // --- Tempo: t = 0 na largada ---
  const firstLaps = lapsRaw.filter((l) => l.lap_number === 1 && l.date_start);
  const t0 = Math.min(...firstLaps.map((l) => Date.parse(l.date_start)));
  const T = (date: string) => (Date.parse(date) - t0) / 1000;

  // --- Voltas por piloto ---
  const laps: RaceData['laps'] = {};
  for (const l of [...lapsRaw].sort((a, b) => a.lap_number - b.lap_number)) {
    const list = (laps[l.driver_number] ??= []);
    const prev = list[list.length - 1];
    // Algumas voltas vêm sem horário de início: estima pela volta anterior.
    const start = l.date_start
      ? T(l.date_start)
      : prev && prev[2] !== null
        ? prev[1] + prev[2]
        : l.lap_number === 1
          ? 0 // a primeira volta começa na largada
          : null;
    if (start === null) continue;
    list.push([l.lap_number, round3(start), l.lap_duration ?? null]);
  }

  // A volta de desaceleração às vezes vem numerada como mais uma volta: o
  // total é a volta em que caiu a bandeira quadriculada.
  const chequered = controlRaw.find((m) => m.flag === 'CHEQUERED');
  const maxLap = Math.max(...lapsRaw.map((l) => l.lap_number));
  const totalLaps =
    typeof chequered?.lap_number === 'number' && chequered.lap_number >= maxLap - 1 && chequered.lap_number <= maxLap
      ? chequered.lap_number
      : maxLap;
  for (const num of Object.keys(laps)) laps[num] = laps[num].filter((l) => l[0] <= totalLaps);
  const lapStarts: number[] = [];
  for (let n = 1; n <= totalLaps; n++) {
    const starts = Object.values(laps).flatMap((list) => list.filter((l) => l[0] === n).map((l) => l[1]));
    lapStarts.push(starts.length ? Math.min(...starts) : (lapStarts[lapStarts.length - 1] ?? 0));
  }
  for (const num of Object.keys(laps)) if (laps[num].length === 0) delete laps[num];

  // Bandeirada: fim da última volta de quem completou todas. Quando a última
  // volta vem sem duração, vale o horário da bandeira quadriculada.
  const finishTimes = Object.values(laps)
    .map((list) => list[list.length - 1])
    .filter((l) => l[0] === totalLaps && l[2] !== null)
    .map((l) => l[1] + l[2]!);
  const durations = lapsRaw
    .map((l) => l.lap_duration)
    .filter((v) => typeof v === 'number')
    .sort((a, b) => a - b);
  const medianLap = durations[Math.floor(durations.length / 2)] ?? 90;
  const winnerFinish = finishTimes.length
    ? Math.min(...finishTimes)
    : chequered
      ? T(chequered.date)
      : lapStarts[totalLaps - 1] + medianLap;
  const typicalLap = winnerFinish / totalLaps;

  const finishAt: Record<string, number | null> = {};
  const running: Record<string, boolean> = {};
  for (const [num, list] of Object.entries(laps)) {
    const last = list[list.length - 1];
    // Quem abriu a última volta muito antes da bandeirada não chegou ao fim.
    running[num] = last[1] > winnerFinish - 2.5 * typicalLap;
    finishAt[num] = running[num] ? Math.max(winnerFinish, last[1] + (last[2] ?? typicalLap)) : null;
  }
  const lastFinish = Math.max(winnerFinish, ...Object.values(finishAt).filter((v) => v !== null));
  const tStart = -LEAD_IN;
  const tEnd = Math.ceil(lastFinish + LEAD_OUT);
  const samples = Math.floor((tEnd - tStart) * HZ) + 1;

  // --- Posição na pista ---
  const from = filterDate(t0 + (tStart - 5) * 1000);
  const to = filterDate(t0 + (tEnd + 5) * 1000);
  const location: Record<string, { t: number[]; x: number[]; y: number[] }> = {};
  for (const d of driversRaw) {
    const rows = await openf1(
      `location?session_key=${S}&driver_number=${d.driver_number}&date>=${from}&date<=${to}`,
    );
    const loc = { t: [] as number[], x: [] as number[], y: [] as number[] };
    for (const r of rows) {
      if (r.x === 0 && r.y === 0) continue;
      loc.t.push(T(r.date));
      loc.x.push(r.x);
      loc.y.push(r.y);
    }
    location[d.driver_number] = loc;
    process.stdout.write(`  posições ${d.name_acronym}: ${loc.t.length}\r`);
  }
  process.stdout.write('\n');

  // --- Traçado: a volta mais rápida da corrida ---
  // (a primeira das mais rápidas que tenha sinal de posição do começo ao fim)
  const samplesIn = (l: any): Pt[] => {
    const loc = location[l.driver_number];
    const a = T(l.date_start);
    const b = a + l.lap_duration;
    const pts: Pt[] = [];
    loc?.t.forEach((t, i) => {
      if (t >= a && t < b) pts.push([loc.x[i], loc.y[i]]);
    });
    return pts;
  };
  let rawLine: Pt[] = [];
  let fastest: any = null;
  for (const l of lapsRaw
    .filter((l) => l.lap_duration && l.date_start && !l.is_pit_out_lap && l.lap_number > 1)
    .sort((a, b) => a.lap_duration - b.lap_duration)) {
    const pts = samplesIn(l);
    // A OpenF1 amostra a ~3,7 Hz: exige pelo menos 2,5 amostras por segundo.
    if (pts.length >= l.lap_duration * 2.5) {
      rawLine = pts;
      fastest = l;
      break;
    }
  }
  if (!fastest) throw new Error('Não achei uma volta com sinal completo para desenhar o traçado.');
  const line = smoothClosed(resampleClosed(rawLine, TRACK_POINTS), 2);

  // Normaliza para uma caixa de TRACK_BOX, com o eixo y para baixo (SVG).
  const xs = line.map((p) => p[0]);
  const ys = line.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxY = Math.max(...ys);
  const k = TRACK_BOX / Math.max(Math.max(...xs) - minX, maxY - Math.min(...ys));
  const track = {
    points: line.map(([x, y]) => [Math.round((x - minX) * k), Math.round((maxY - y) * k)] as Pt),
    width: Math.round((Math.max(...xs) - minX) * k),
    height: Math.round((maxY - Math.min(...ys)) * k),
  };

  // --- Distância ao longo do traçado, por piloto ---
  const u: RaceData['replay']['u'] = {};
  const retiredAt: Record<string, number | null> = {};
  const estimatedBy: Record<string, [number, number][]> = {};
  for (const d of driversRaw) {
    const loc = location[d.driver_number];
    const lapsOf = laps[d.driver_number] ?? [];
    if (loc.t.length === 0 && lapsOf.length === 0) continue;
    const project = makeProjector(line);
    const fracs = loc.t.map((_, i) => project(loc.x[i], loc.y[i]));
    const dist = anchorToLaps(loc.t, fracs, lapsOf, typicalLap);
    const filled = fillSignalGaps(loc.t, dist, lapsOf, typicalLap, tEnd);
    estimatedBy[d.driver_number] = filled.estimated;
    const series = resampleSeries(filled.t, filled.u, tStart, HZ, samples);
    u[d.driver_number] = encodeDeltas(series, SCALE);

    retiredAt[d.driver_number] = null;
    if (running[d.driver_number] === false || !(d.driver_number in laps)) {
      // Último instante em que o carro ainda andava.
      let stop = 0;
      for (let i = 1; i < series.length; i++) if (series[i] - series[i - 1] > 0.0005) stop = i;
      retiredAt[d.driver_number] = Math.round(tStart + stop / HZ);
    }
  }

  const drivers: RaceDriver[] = driversRaw
    .filter((d) => u[d.driver_number])
    .map((d) => ({
      number: d.driver_number,
      code: d.name_acronym,
      name: `${d.first_name ?? ''} ${d.last_name ?? ''}`.trim() || d.full_name,
      teamName: d.team_name,
      teamId: teamIdFor(d.team_name ?? ''),
      colour: `#${d.team_colour ?? '888888'}`,
      retiredAt: retiredAt[d.driver_number] ?? null,
      finishAt: finishAt[d.driver_number] ?? null,
    }));

  // --- Posições, gaps, pneus, pits ---
  const positions: RaceData['positions'] = {};
  for (const p of positionsRaw) {
    (positions[p.driver_number] ??= []).push([Math.round(T(p.date)), p.position]);
  }

  const gaps: RaceData['gaps'] = {};
  for (const i of intervalsRaw) {
    const g = (gaps[i.driver_number] ??= { t: [], g: [] });
    const t = Math.round(T(i.date));
    const raw = i.gap_to_leader;
    const value =
      typeof raw === 'number'
        ? round1(raw)
        : typeof raw === 'string' && /LAP/i.test(raw)
          ? -(parseInt(raw.replace(/\D/g, ''), 10) || 1)
          : null;
    if (g.t[g.t.length - 1] === t) g.g[g.g.length - 1] = value;
    else {
      g.t.push(t);
      g.g.push(value);
    }
  }

  const stints: RaceData['stints'] = {};
  for (const s of [...stintsRaw].sort((a, b) => a.stint_number - b.stint_number)) {
    (stints[s.driver_number] ??= []).push([
      s.lap_start ?? 1,
      s.lap_end ?? totalLaps,
      s.compound ?? 'UNKNOWN',
      s.tyre_age_at_start ?? 0,
    ]);
  }

  const pits: RaceData['pits'] = {};
  for (const p of pitsRaw) {
    const lane = p.lane_duration ?? p.pit_duration;
    if (!p.date || !lane) continue;
    // O horário do registro é o da saída do pit lane: a entrada é ele menos o tempo no pit lane.
    (pits[p.driver_number] ??= []).push([round1(T(p.date) - lane), round1(lane), p.lap_number]);
  }

  // --- Eventos ---
  const { events, periods } = buildEvents(controlRaw, T, tEnd, lapStarts);
  for (const [num, list] of Object.entries(pits)) {
    for (const [t, lane, lap] of list) {
      // "Paradas" de vários minutos são a espera de uma bandeira vermelha.
      if (t >= 0 && lane < MAX_PIT_LANE) events.push({ t, lap, kind: 'pit', drivers: [Number(num)], n: lane });
    }
  }
  for (const [num, list] of Object.entries(positions)) {
    list.forEach(([t, pos], i) => {
      if (pos === 1 && t > 5 && i > 0 && t < winnerFinish) {
        events.push({ t, lap: lapNumberAt(lapStarts, t), kind: 'lead', drivers: [Number(num)] });
      }
    });
  }
  for (const d of drivers) {
    if (d.retiredAt !== null && d.retiredAt < winnerFinish) {
      events.push({
        t: Math.max(0, d.retiredAt),
        lap: lapNumberAt(lapStarts, Math.max(0, d.retiredAt)),
        kind: 'retired',
        drivers: [d.number],
      });
    }
  }
  events.sort((a, b) => a.t - b.t);

  const weather: RaceData['weather'] = weatherRaw
    .map((w) => [Math.round(T(w.date)), w.air_temperature, w.track_temperature, w.rainfall ? 1 : 0] as [number, number, number, number])
    .filter((w) => w[0] >= tStart - 120 && w[0] <= tEnd);

  await writeTelemetry(S, drivers, lapsRaw, location, line, t0);

  const race: RaceData = {
    version: 1,
    season,
    round: round.round,
    sessionKey: S,
    raceName: round.raceName,
    circuitName: round.circuitName,
    startISO: new Date(t0).toISOString(),
    totalLaps,
    tStart,
    tEnd,
    lapStarts: lapStarts.map(round3),
    track,
    drivers,
    replay: { hz: HZ, scale: SCALE, start: tStart, u },
    positions,
    gaps,
    laps,
    stints,
    pits,
    periods,
    events,
    weather,
  };
  // Trechos sem sinal de posição, tomando o vencedor como referência.
  const winnerKey = Object.entries(finishAt).find(([, t]) => t === winnerFinish)?.[0];
  const estimated = (winnerKey && estimatedBy[winnerKey]) || [];
  if (estimated.length) race.estimated = estimated;

  const out = `${DATA}/race/${S}.json`;
  await mkdir(dirname(out), { recursive: true });
  const json = JSON.stringify(race);
  await writeFile(out, json);

  // Conferência: o vencedor deve ter percorrido o número de voltas da corrida.
  const winner = Object.entries(finishAt).find(([, t]) => t === winnerFinish)?.[0];
  if (winner && u[winner]) {
    let q = 0;
    const idx = Math.round((winnerFinish - tStart) * HZ);
    for (let i = 0; i <= idx && i < u[winner].length; i++) q += u[winner][i];
    const done = q / SCALE;
    const ok = Math.abs(done - totalLaps) < 0.05;
    console.log(
      `  vencedor (#${winner}) percorreu ${done.toFixed(3)} voltas de ${totalLaps} ${ok ? '— confere' : '— DIVERGE'}`,
    );
    if (!ok) process.exitCode = 1;
  }
  console.log(
    `  ${drivers.length} pilotos, ${totalLaps} voltas, ${events.length} eventos, ${(json.length / 1024).toFixed(0)} KB`,
  );
}

const TELEMETRY_POINTS = 200;

/**
 * Grava a telemetria (velocidade, acelerador, freio) da melhor volta de cada
 * piloto, em função da distância na volta, para a comparação entre pilotos.
 */
async function writeTelemetry(
  S: number,
  drivers: RaceDriver[],
  lapsRaw: any[],
  location: Record<string, { t: number[]; x: number[]; y: number[] }>,
  line: Pt[],
  t0: number,
): Promise<void> {
  const T = (date: string) => (Date.parse(date) - t0) / 1000;
  const out: RaceTelemetry = { points: TELEMETRY_POINTS, laps: {} };

  for (const d of drivers) {
    const best = lapsRaw
      .filter(
        (l) =>
          l.driver_number === d.number &&
          l.lap_duration &&
          l.date_start &&
          !l.is_pit_out_lap &&
          l.lap_number > 1,
      )
      .sort((a, b) => a.lap_duration - b.lap_duration)[0];
    if (!best) continue;
    const from = T(best.date_start);
    const to = from + best.lap_duration;

    // Distância na volta em função do tempo, a partir das posições na pista.
    const loc = location[d.number];
    const project = makeProjector(line);
    const times: number[] = [];
    const fracs: number[] = [];
    loc.t.forEach((t, i) => {
      if (t >= from - 2 && t <= to + 2) {
        times.push(t);
        fracs.push(project(loc.x[i], loc.y[i]));
      }
    });
    if (times.length < 20) continue;
    const dist = unwrap(fracs);
    const distAt = (t: number) => resampleSeries(times, dist, t, 1, 1)[0];
    const d0 = distAt(from);
    const span = distAt(to) - d0;
    if (span < 0.9 || span > 1.1) continue; // volta incompleta ou projeção ruim

    const rows = await openf1(
      `car_data?session_key=${S}&driver_number=${d.number}` +
        `&date>=${filterDate(t0 + (from - 1) * 1000)}&date<=${filterDate(t0 + (to + 1) * 1000)}`,
    );
    const rel: number[] = [];
    const speed: number[] = [];
    const throttle: number[] = [];
    const brake: number[] = [];
    for (const r of rows) {
      const x = (distAt(T(r.date)) - d0) / span;
      if (x < 0 || x > 1 || (rel.length && x <= rel[rel.length - 1])) continue;
      rel.push(x);
      speed.push(r.speed ?? 0);
      throttle.push(Math.min(100, r.throttle ?? 0));
      brake.push(r.brake ? 1 : 0);
    }
    if (rel.length < 50) continue;

    const grid = (values: number[]) =>
      resampleSeries(rel, values, 0, TELEMETRY_POINTS, TELEMETRY_POINTS + 1);
    out.laps[d.number] = {
      lap: best.lap_number,
      time: best.lap_duration,
      speed: grid(speed).map(Math.round),
      throttle: grid(throttle).map(Math.round),
      brake: grid(brake).map((v) => (v >= 0.5 ? 1 : 0)),
    };
    process.stdout.write(`  telemetria ${d.code}: volta ${best.lap_number}        \r`);
  }
  process.stdout.write('\n');

  const json = JSON.stringify(out);
  await writeFile(`${DATA}/race/${S}-tel.json`, json);
  console.log(
    `  telemetria de ${Object.keys(out.laps).length} pilotos, ${(json.length / 1024).toFixed(0)} KB`,
  );
}

function lapNumberAt(lapStarts: number[], t: number): number {
  let lap = 0;
  for (let i = 0; i < lapStarts.length && lapStarts[i] <= t; i++) lap = i + 1;
  return lap;
}

/** Buracos no sinal de posição maiores que isto são preenchidos pela cronometragem. */
const SIGNAL_GAP = 10;

/**
 * Onde não há sinal de posição, estima a distância percorrida pela
 * cronometragem: dentro de cada volta o carro avança em ritmo constante.
 * Devolve a série completa e os intervalos que foram estimados.
 */
function fillSignalGaps(
  times: number[],
  dist: number[],
  laps: [number, number, number | null][],
  typicalLap: number,
  tEnd: number,
): { t: number[]; u: number[]; estimated: [number, number][] } {
  const estimate = (t: number): number | null => {
    let j = -1;
    while (j + 1 < laps.length && laps[j + 1][1] <= t) j++;
    if (j < 0) return null;
    const [n, start, duration] = laps[j];
    const length = (j + 1 < laps.length ? laps[j + 1][1] - start : duration) || typicalLap;
    return n - 1 + Math.min(1, (t - start) / length);
  };
  const lastLap = laps[laps.length - 1];
  const raceEnd = lastLap ? Math.min(tEnd, lastLap[1] + (lastLap[2] ?? typicalLap)) : -Infinity;

  const t: number[] = [];
  const u: number[] = [];
  const estimated: [number, number][] = [];
  const fill = (from: number, to: number) => {
    let any = false;
    for (let x = Math.ceil(from) + 1; x < to - 1; x++) {
      const v = estimate(x);
      if (v === null) continue;
      t.push(x);
      u.push(v);
      any = true;
    }
    if (any) estimated.push([Math.round(from), Math.round(to)]);
  };

  if (times.length === 0) {
    fill(-1, raceEnd);
    return { t, u, estimated };
  }
  for (let i = 0; i < times.length; i++) {
    if (i > 0 && times[i] - times[i - 1] > SIGNAL_GAP) fill(times[i - 1], times[i]);
    t.push(times[i]);
    u.push(dist[i]);
  }
  const last = times[times.length - 1];
  if (raceEnd - last > SIGNAL_GAP) fill(last, raceEnd);
  return { t, u, estimated };
}

/** Converte as mensagens do controle de prova em eventos e períodos de neutralização. */
function buildEvents(
  control: any[],
  T: (date: string) => number,
  tEnd: number,
  lapStarts: number[],
): { events: RaceEvent[]; periods: TrackPeriod[] } {
  const events: RaceEvent[] = [];
  const periods: TrackPeriod[] = [];
  let open: TrackPeriod | null = null;
  const close = (t: number) => {
    if (open) {
      open.to = Math.max(open.from, Math.min(open.to, t));
      periods.push(open);
      open = null;
    }
  };
  const start = (kind: TrackPeriod['kind'], t: number) => {
    close(t);
    open = { kind, from: t, to: tEnd };
  };
  const carNumbers = (msg: string) =>
    [...msg.matchAll(/CARS? (\d+)|AND (\d+) \(/g)].map((m) => Number(m[1] ?? m[2]));
  const reasonOf = (msg: string) =>
    msg
      .split(' - ')
      .slice(1)
      .join(' - ')
      .replace(/\s*\(?\d{1,2}:\d{2}:\d{2}\)?\s*$/, '')
      .trim() || undefined;

  for (const m of control) {
    const t = Math.round(T(m.date));
    if (t < -5 || t > tEnd) continue;
    const msg: string = m.message ?? '';
    const lap: number = m.lap_number ?? 0;
    const push = (kind: EventKind, extra: Partial<RaceEvent> = {}) =>
      events.push({ t, lap, kind, ...extra });
    const current = open as TrackPeriod | null;

    if (msg === 'RACE START') push('start');
    else if (/^RED FLAG/.test(msg) || /RACE SUSPENDED/.test(msg) || m.flag === 'RED') {
      if (current?.kind !== 'red') {
        start('red', t);
        push('red');
      }
    } else if (m.category === 'SessionStatus' && /SESSION STARTED/.test(msg)) {
      // Depois de uma bandeira vermelha, a sessão "começa" de novo: é a relargada.
      if (current?.kind === 'red') {
        close(t);
        push('green');
      }
    } else if (/(VIRTUAL SAFETY CAR|VSC) DEPLOYED/.test(msg)) {
      start('vsc', t);
      push('vsc');
    } else if (/(VIRTUAL SAFETY CAR|VSC) ENDING/.test(msg)) {
      push('vscEnding');
      // O VSC termina poucos segundos depois do aviso.
      if (current?.kind === 'vsc') close(t + 12);
    } else if (/^SAFETY CAR DEPLOYED/.test(msg)) {
      start('sc', t);
      push('sc');
    } else if (/SAFETY CAR IN THIS LAP/.test(msg)) {
      push('scEnding');
      // O safety car sai ao fim desta volta: a corrida volta na linha de chegada.
      if (current?.kind === 'sc') close(lapStarts.find((s) => s > t) ?? t + 100);
    } else if (m.flag === 'CHEQUERED') {
      close(t);
      push('chequered');
    } else if (m.flag === 'YELLOW' && m.scope === 'Sector') push('yellow', { n: m.sector });
    else if (m.flag === 'DOUBLE YELLOW' && m.scope === 'Sector') push('doubleYellow', { n: m.sector });
    else if (m.flag === 'BLACK AND WHITE' || /^BLACK AND WHITE FLAG/.test(msg)) {
      push('warning', { drivers: carNumbers(msg), reason: reasonOf(msg) });
    } else if (/PENALTY SERVED/.test(msg)) {
      // O anúncio da punição já entrou; o cumprimento não precisa de linha própria.
    } else if (/(\d+) SECOND (TIME|STOP)[A-Z /]*PENALTY FOR CAR/.test(msg)) {
      push('penalty', {
        drivers: carNumbers(msg),
        n: Number(msg.match(/(\d+) SECOND/)![1]),
        reason: reasonOf(msg),
      });
    } else if (/DRIVE THROUGH PENALTY FOR CAR/.test(msg)) {
      push('penalty', { drivers: carNumbers(msg), reason: reasonOf(msg) });
    } else if (/UNDER INVESTIGATION|WILL BE INVESTIGATED AFTER THE RACE/.test(msg)) {
      push('investigation', { drivers: carNumbers(msg), reason: reasonOf(msg) });
    } else if (/NO FURTHER (ACTION|INVESTIGATION)/.test(msg)) {
      push('noAction', { drivers: carNumbers(msg), reason: reasonOf(msg) });
    }
  }
  close(tEnd);
  return { events, periods: periods.filter((p) => p.to > p.from) };
}

async function main() {
  const season = Number(process.argv[2]);
  const wanted = process.argv.slice(3);
  if (!season || wanted.length === 0) {
    console.error('Uso: node ingest/race.ts <ano> <etapa>... | all');
    process.exit(1);
  }
  const data: SeasonData = JSON.parse(await readFile(`${DATA}/season/${season}.json`, 'utf8'));

  const indexPath = `${DATA}/race/index.json`;
  let index: number[] = [];
  try {
    index = JSON.parse(await readFile(indexPath, 'utf8'));
  } catch {
    // primeira corrida ingerida
  }

  const rounds =
    wanted[0] === 'all'
      ? data.rounds.filter((r) => r.raceDone && r.sessionKey && !index.includes(r.sessionKey))
      : wanted.map((w) => {
          const r = data.rounds.find((x) => x.round === Number(w));
          if (!r) throw new Error(`Etapa ${w} não existe em ${season}`);
          return r;
        });

  for (const round of rounds) {
    try {
      await ingestRace(season, round);
      if (!index.includes(round.sessionKey!)) index.push(round.sessionKey!);
      await mkdir(dirname(indexPath), { recursive: true });
      await writeFile(indexPath, JSON.stringify(index.sort((a, b) => a - b)));
    } catch (err) {
      console.error(`  falhou: ${(err as Error).message}`);
      process.exitCode = 1;
    }
  }
}

main();
