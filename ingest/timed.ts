// Gera o replay de treinos e classificações (sessões em que vale a melhor
// volta, não a ordem de chegada). Grava no mesmo formato e na mesma pasta das
// corridas: web/public/data/race/<session_key>.json, com kind = "timed".
//
// Uso: node ingest/timed.ts <ano> <etapa>... [--sessions=Q,SQ,FP1,FP2,FP3]
//      node ingest/timed.ts <ano> all            todas as etapas disputadas
//
// Sem --sessions, baixa só as classificações (Q e SQ).

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { RaceData, RaceDriver } from '../web/src/lib/raceTypes.ts';
import { encodeDeltas, makeProjector, resampleSeries, unwrap } from '../web/src/lib/replay.ts';
import type { Round, SeasonData, SessionRef } from '../web/src/lib/types.ts';
import {
  addToIndex,
  buildEvents,
  buildTrack,
  DATA,
  fetchLocations,
  HZ,
  LEAD_IN,
  LEAD_OUT,
  openf1,
  round3,
  SCALE,
  teamIdFor,
  writeTelemetry,
} from './race.ts';

const CODES: Record<string, string> = {
  'Practice 1': 'FP1',
  'Practice 2': 'FP2',
  'Practice 3': 'FP3',
  Qualifying: 'Q',
  'Sprint Qualifying': 'SQ',
};

async function ingestTimed(season: number, round: Round, session: SessionRef): Promise<void> {
  const S = session.key;
  console.log(`\nEtapa ${round.round} · ${round.raceName} · ${session.name} (sessão ${S})`);

  const driversRaw = await openf1(`drivers?session_key=${S}`);
  const lapsRaw = await openf1(`laps?session_key=${S}`);
  const stintsRaw = await openf1(`stints?session_key=${S}`);
  const controlRaw = await openf1(`race_control?session_key=${S}`);
  const positionsRaw = await openf1(`position?session_key=${S}`);
  const weatherRaw = await openf1(`weather?session_key=${S}`);
  if (lapsRaw.length === 0) throw new Error('Sem voltas: a sessão ainda não está disponível.');

  // --- Tempo: t = 0 quando a sessão abre; termina no último "SESSION FINISHED" ---
  const status = controlRaw
    .filter((m) => m.category === 'SessionStatus')
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const opened = status.find((m) => /SESSION STARTED/.test(m.message));
  const closed = [...status].reverse().find((m) => /SESSION (FINISHED|ENDED)/.test(m.message));
  const t0 = Date.parse(opened?.date ?? session.start);
  const T = (date: string) => (Date.parse(date) - t0) / 1000;
  const lastLapEnd = Math.max(
    ...lapsRaw.filter((l) => l.date_start).map((l) => T(l.date_start) + (l.lap_duration ?? 0)),
  );
  const sessionEnd = Math.round(closed ? T(closed.date) : Math.max(3600, lastLapEnd));
  const tStart = -LEAD_IN;
  const tEnd = sessionEnd + LEAD_OUT;
  const samples = Math.floor((tEnd - tStart) * HZ) + 1;
  // Sem voltas do líder, a barra do player é dividida em minutos.
  const lapStarts = Array.from({ length: Math.max(1, Math.ceil(sessionEnd / 60)) }, (_, i) => i * 60);

  // --- Voltas por piloto ---
  const laps: RaceData['laps'] = {};
  for (const l of [...lapsRaw].sort((a, b) => a.lap_number - b.lap_number)) {
    if (!l.date_start) continue;
    (laps[l.driver_number] ??= []).push([l.lap_number, round3(T(l.date_start)), l.lap_duration ?? null]);
  }

  // --- Posição na pista ---
  const location = await fetchLocations(S, driversRaw, t0, tStart - 5, tEnd + 5);
  const { line, track } = buildTrack(lapsRaw, location, T);
  const u: RaceData['replay']['u'] = {};
  for (const d of driversRaw) {
    const loc = location[d.driver_number];
    if (loc.t.length === 0) continue;
    const project = makeProjector(line);
    // Aqui o número de voltas não importa (ninguém é classificado por ele):
    // basta onde o carro está na pista.
    const dist = unwrap(loc.t.map((_, i) => project(loc.x[i], loc.y[i])));
    u[d.driver_number] = encodeDeltas(resampleSeries(loc.t, dist, tStart, HZ, samples), SCALE);
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
      retiredAt: null,
      finishAt: sessionEnd,
    }));

  const positions: RaceData['positions'] = {};
  for (const p of positionsRaw) {
    (positions[p.driver_number] ??= []).push([Math.round(T(p.date)), p.position]);
  }

  const stints: RaceData['stints'] = {};
  for (const s of [...stintsRaw].sort((a, b) => a.stint_number - b.stint_number)) {
    (stints[s.driver_number] ??= []).push([
      s.lap_start ?? 1,
      s.lap_end ?? 999,
      s.compound ?? 'UNKNOWN',
      s.tyre_age_at_start ?? 0,
    ]);
  }

  // --- Eventos: bandeiras do controle de prova e trocas na ponta da tabela ---
  const { events, periods } = buildEvents(controlRaw, T, tEnd, lapStarts);
  for (const [num, list] of Object.entries(positions)) {
    list.forEach(([t, pos], i) => {
      if (pos === 1 && i > 0 && t > 60 && t < sessionEnd) {
        events.push({ t, lap: 0, kind: 'lead', drivers: [Number(num)] });
      }
    });
  }
  // Numa sessão cronometrada "volta" não situa ninguém: os eventos ficam só com o horário.
  for (const e of events) e.lap = 0;
  events.sort((a, b) => a.t - b.t);

  // --- Fases da classificação (Q1, Q2, Q3) ---
  const phases: NonNullable<RaceData['phases']> = [];
  for (const n of [1, 2, 3]) {
    const mine = status.filter((m) => m.qualifying_phase === n);
    const from = mine.find((m) => /SESSION STARTED/.test(m.message));
    const to = [...mine].reverse().find((m) => /SESSION (FINISHED|ENDED)/.test(m.message));
    if (from) {
      const prefix = session.name === 'Sprint Qualifying' ? 'SQ' : 'Q';
      phases.push({
        name: `${prefix}${n}`,
        from: Math.round(T(from.date)),
        to: Math.round(to ? T(to.date) : sessionEnd),
      });
    }
  }

  // Às vezes a fonte não marca a fase nas mensagens do Q1: ele é o que vem antes do Q2.
  if (phases.length && !phases.some((p) => p.name.endsWith('1'))) {
    phases.unshift({ name: phases[0].name.replace(/\d$/, '1'), from: 0, to: phases[0].from });
  }

  const weather: RaceData['weather'] = weatherRaw
    .map(
      (w) =>
        [Math.round(T(w.date)), w.air_temperature, w.track_temperature, w.rainfall ? 1 : 0] as [
          number,
          number,
          number,
          number,
        ],
    )
    .filter((w) => w[0] >= tStart - 120 && w[0] <= tEnd);

  await writeTelemetry(S, drivers, lapsRaw, location, line, t0);

  const data: RaceData = {
    version: 1,
    kind: 'timed',
    sessionName: session.name,
    season,
    round: round.round,
    sessionKey: S,
    raceName: round.raceName,
    circuitName: round.circuitName,
    startISO: new Date(t0).toISOString(),
    totalLaps: lapStarts.length,
    tStart,
    tEnd,
    lapStarts,
    track,
    drivers,
    replay: { hz: HZ, scale: SCALE, start: tStart, u },
    positions,
    gaps: {},
    laps,
    stints,
    pits: {},
    periods,
    events,
    weather,
  };
  if (phases.length) data.phases = phases;

  const out = `${DATA}/race/${S}.json`;
  await mkdir(dirname(out), { recursive: true });
  const json = JSON.stringify(data);
  await writeFile(out, json);

  // Conferência: o primeiro da tabela no fim deve ter a melhor volta da sessão
  // (pode não bater quando a melhor volta de alguém foi anulada).
  const finalP1 = drivers.find((d) => positions[d.number]?.at(-1)?.[1] === 1);
  const best = (n: number) =>
    Math.min(...(laps[n] ?? []).map((l) => l[2] ?? Infinity).filter((v) => v > 0));
  const fastest = [...drivers].sort((a, b) => best(a.number) - best(b.number))[0];
  console.log(
    `  P1 no fim: ${finalP1?.code} (${best(finalP1?.number ?? 0).toFixed(3)}); volta mais rápida: ${fastest.code} (${best(fastest.number).toFixed(3)})`,
  );
  console.log(
    `  ${drivers.length} pilotos, ${lapStarts.length} min${phases.length ? `, fases ${phases.map((p) => p.name).join('/')}` : ''}, ${events.length} eventos, ${(json.length / 1024).toFixed(0)} KB`,
  );
}

async function main() {
  const args = process.argv.slice(2);
  const sessionsArg = args.find((a) => a.startsWith('--sessions='))?.split('=')[1];
  const wantedCodes = (sessionsArg ?? 'Q,SQ').split(',').map((s) => s.trim().toUpperCase());
  const [seasonArg, ...wanted] = args.filter((a) => !a.startsWith('--'));
  const season = Number(seasonArg);
  if (!season || wanted.length === 0) {
    console.error('Uso: node ingest/timed.ts <ano> <etapa>... | all [--sessions=Q,SQ,FP1,FP2,FP3]');
    process.exit(1);
  }
  const data: SeasonData = JSON.parse(await readFile(`${DATA}/season/${season}.json`, 'utf8'));
  let index: number[] = [];
  try {
    index = JSON.parse(await readFile(`${DATA}/race/index.json`, 'utf8'));
  } catch {
    // nenhuma sessão ingerida ainda
  }
  const all = wanted[0] === 'all';
  const rounds = all
    ? data.rounds.filter((r) => r.raceDone)
    : wanted.map((w) => {
        const r = data.rounds.find((x) => x.round === Number(w));
        if (!r) throw new Error(`Etapa ${w} não existe em ${season}`);
        return r;
      });

  for (const round of rounds) {
    for (const session of round.sessions ?? []) {
      const code = CODES[session.name];
      if (!code || !wantedCodes.includes(code)) continue;
      // Com "all", pula o que já foi baixado; com a etapa nomeada, refaz.
      if (all && index.includes(session.key)) continue;
      try {
        await ingestTimed(season, round, session);
        await addToIndex(session.key);
      } catch (err) {
        console.error(`  falhou: ${(err as Error).message}`);
        process.exitCode = 1;
      }
    }
  }
}

main();
