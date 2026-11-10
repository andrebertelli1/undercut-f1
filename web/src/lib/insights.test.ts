import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  biggestSegments,
  buildStory,
  cleanLaps,
  fieldModel,
  consistency,
  findPitBattles,
  gapBetween,
  inferOvertakes,
  lapChart,
  lapDelta,
  pitStops,
  simulate,
  stintPace,
  tyreModel,
  whatIfRange,
} from './insights.ts';
import type { RaceData } from './raceTypes.ts';

const close = (a: number, b: number, eps = 1e-6) =>
  assert.ok(Math.abs(a - b) < eps, `${a} deveria ser ~${b}`);

const LAP = 90;
const TOTAL = 40;

/**
 * Corrida sintética de 40 voltas de 90 s com três pilotos.
 * - #1 lidera; para na volta 20 (médio -> duro).
 * - #2 começa em 3º, ultrapassa #3 na pista na volta 5; para na volta 18.
 * - #3 para na volta 21 e perde a posição para... ninguém (fica em 3º).
 * O médio piora 0,10 s por volta; o duro, 0,02 s por volta.
 */
function fakeRace(): RaceData {
  const driver = (number: number, code: string, offset: number) => ({
    number,
    code,
    name: code,
    teamName: '',
    teamId: null,
    colour: '#fff',
    retiredAt: null,
    finishAt: TOTAL * LAP + offset,
  });
  const laps = (stopLap: number, pace: number) => {
    const out: [number, number, number | null][] = [];
    let t = 0;
    for (let n = 1; n <= TOTAL; n++) {
      const onMedium = n <= stopLap;
      const age = onMedium ? n - 1 : n - stopLap - 1;
      let time = pace + (onMedium ? 0.1 : 0.02) * age - 0.035 * n;
      if (n === stopLap || n === stopLap + 1) time += 12; // entrada e saída do pit
      out.push([n, Math.round(t * 1000) / 1000, time]);
      t += time;
    }
    return out;
  };
  const pitTime = (list: [number, number, number | null][], lap: number) => list[lap][1] - 10;
  const l1 = laps(20, 90);
  const l2 = laps(18, 90.3);
  const l3 = laps(21, 90.6);
  return {
    version: 1,
    season: 2026,
    round: 1,
    sessionKey: 1,
    raceName: 'Teste',
    circuitName: 'Teste',
    startISO: '2026-01-01T00:00:00Z',
    totalLaps: TOTAL,
    tStart: -10,
    tEnd: TOTAL * LAP + 60,
    lapStarts: l1.map((l) => l[1]),
    track: { points: [], width: 0, height: 0 },
    drivers: [driver(1, 'AAA', 0), driver(2, 'BBB', 8), driver(3, 'CCC', 20)],
    replay: { hz: 1, scale: 1, start: -10, u: {} },
    positions: {
      '1': [[-600, 1]],
      // #2 passa #3 na pista na volta 5.
      '2': [[-600, 3], [400, 2]],
      '3': [[-600, 2], [400, 3]],
    },
    gaps: {
      '1': { t: [0], g: [0] },
      '2': { t: [0, 900, 1800], g: [1, 4, 6] },
      '3': { t: [0, 900, 1800], g: [2, 9, 15] },
    },
    laps: { '1': l1, '2': l2, '3': l3 },
    stints: {
      '1': [[1, 20, 'MEDIUM', 0], [21, 40, 'HARD', 0]],
      '2': [[1, 18, 'MEDIUM', 0], [19, 40, 'HARD', 0]],
      '3': [[1, 21, 'MEDIUM', 0], [22, 40, 'HARD', 0]],
    },
    pits: {
      '1': [[pitTime(l1, 20), 22, 20]],
      '2': [[pitTime(l2, 18), 22, 18]],
      '3': [[pitTime(l3, 21), 22, 21]],
    },
    periods: [],
    events: [
      { t: 0, lap: 1, kind: 'start' },
      { t: pitTime(l2, 18), lap: 18, kind: 'pit', drivers: [2], n: 22 },
      { t: pitTime(l1, 20), lap: 20, kind: 'pit', drivers: [1], n: 22 },
      { t: TOTAL * LAP, lap: 40, kind: 'chequered' },
    ],
    weather: [],
  };
}

test('ultrapassagem na pista é deduzida das trocas de posição', () => {
  const overtakes = inferOvertakes(fakeRace());
  assert.equal(overtakes.length, 1);
  assert.deepEqual(overtakes[0].drivers, [2, 3]);
  assert.equal(overtakes[0].n, 2);
  assert.equal(overtakes[0].source, 'inferred');
  assert.equal(overtakes[0].importance, 3);
});

test('posição ganha porque o outro estava no pit não conta como ultrapassagem', () => {
  const race = fakeRace();
  const stop = race.pits['3'][0][0];
  // #2 sobe para 2º e #3 cai para 3º exatamente durante a parada de #3.
  race.positions['2'] = [[-600, 3], [stop + 10, 2]];
  race.positions['3'] = [[-600, 2], [stop + 10, 3]];
  assert.equal(inferOvertakes(race).length, 0);
});

test('história sai em ordem, com chegada e últimas voltas', () => {
  const story = buildStory(fakeRace());
  for (let i = 1; i < story.length; i++) assert.ok(story[i].t >= story[i - 1].t);
  const kinds = story.map((e) => e.kind);
  assert.ok(kinds.includes('overtake'));
  assert.ok(kinds.includes('finalLaps'));
  assert.ok(!kinds.includes('chequered'));
  const finish = story.at(-1)!;
  assert.equal(finish.kind, 'finish');
  assert.deepEqual(finish.drivers, [1]);
  assert.equal(story.find((e) => e.kind === 'start')?.source, 'official');
  assert.equal(story.find((e) => e.kind === 'pit')?.source, 'timing');
});

test('pit stops trazem posição antes e depois e a troca de composto', () => {
  const race = fakeRace();
  const stop = race.pits['2'][0][0];
  // #2 cai para 3º ao parar.
  race.positions['2'].push([stop + 5, 3]);
  race.positions['3'].push([stop + 5, 2]);
  const s = pitStops(race).find((p) => p.driver === 2)!;
  assert.equal(s.lap, 18);
  assert.equal(s.posBefore, 2);
  assert.equal(s.posAfter, 3);
  assert.equal(s.from, 'MEDIUM');
  assert.equal(s.to, 'HARD');
  assert.equal(s.neutralised, false);
});

test('undercut: quem para antes e sai na frente', () => {
  const race = fakeRace();
  // #2 (2º) para na 18; #1 (líder) para na 20 e volta atrás de #2.
  const out1 = race.pits['1'][0][0] + 22;
  race.positions['1'].push([out1 + 2, 2]);
  race.positions['2'].push([out1 + 2, 1]);
  const battles = findPitBattles(race);
  assert.equal(battles.length, 1);
  assert.deepEqual(
    { kind: battles[0].kind, winner: battles[0].winner, loser: battles[0].loser },
    { kind: 'undercut', winner: 2, loser: 1 },
  );
  assert.deepEqual([battles[0].winnerLap, battles[0].loserLap], [18, 20]);
});

test('sem troca de posição não há undercut', () => {
  assert.equal(findPitBattles(fakeRace()).length, 0);
});

test('voltas limpas excluem a primeira volta e as de pit', () => {
  const laps = cleanLaps(fakeRace(), 1).map((l) => l.lap);
  assert.ok(!laps.includes(1));
  assert.ok(!laps.includes(20));
  assert.ok(!laps.includes(21));
  assert.ok(laps.includes(19));
  assert.ok(laps.includes(22));
});

test('modelo de pneu recupera a degradação usada para gerar as voltas', () => {
  const race = fakeRace();
  const medium = tyreModel(race, 1, 'MEDIUM')!;
  const hard = tyreModel(race, 1, 'HARD')!;
  close(fieldModel(race)!.evolution, 0.035, 1e-3);
  close(medium.degradation, 0.1, 1e-3);
  close(hard.degradation, 0.02, 1e-3);
  close(medium.base, 90, 0.05);
  const pace = stintPace(race, 1);
  assert.equal(pace.length, 2);
  close(pace[0].degradation!, 0.1, 1e-3);
});

test('simulação: parar na mesma volta não muda nada', () => {
  const r = simulate(fakeRace(), { driver: 1, stop: 0, lap: 20 });
  assert.ok(r.ok);
  close(r.delta, 0);
  assert.equal(r.estimatedPosition, r.realPosition);
});

test('simulação: antecipar a parada bate com a conta feita à mão', () => {
  // Parar na 15 em vez da 20. Voltas 16 a 20 trocam médio usado por duro novo;
  // voltas 21 a 40 ficam com o duro 5 voltas mais velho.
  let expected = 0;
  for (let lap = 16; lap <= 20; lap++) expected += 0.02 * (lap - 16) - 0.1 * (lap - 1);
  for (let lap = 21; lap <= 40; lap++) expected += 0.02 * (lap - 16) - 0.02 * (lap - 21);
  const r = simulate(fakeRace(), { driver: 1, stop: 0, lap: 15 });
  assert.ok(r.ok);
  close(r.delta, expected, 0.05);
  assert.ok(r.delta < 0, 'sair antes do médio gasto deveria ser mais rápido');
  assert.deepEqual(r.affected, [16, 40]);
});

test('simulação: ganho suficiente muda a posição estimada', () => {
  const race = fakeRace();
  // #2 terminou 8 s atrás de #1. Parar bem mais cedo rende mais do que isso?
  const r = simulate(race, { driver: 2, stop: 0, lap: 10 });
  assert.ok(r.ok);
  assert.equal(r.realPosition, 2);
  assert.equal(r.estimatedPosition, r.delta < -8 ? 1 : 2);
});

test('simulação recusa volta fora da faixa e informa a faixa', () => {
  const race = fakeRace();
  assert.deepEqual(whatIfRange(race, 1, 0), [2, 39]);
  const r = simulate(race, { driver: 1, stop: 0, lap: 40 });
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.reason === 'range');
  const none = simulate(race, { driver: 1, stop: 3, lap: 10 });
  assert.ok(!none.ok && none.reason === 'noStop');
});

test('distância entre dois pilotos, volta a volta', () => {
  const gaps = gapBetween(fakeRace(), 2, 3);
  assert.equal(gaps[0], null);
  close(gaps[1]!, 1);
  close(gaps[15]!, 5);
  close(gaps[30]!, 9);
});

test('lapChart dá a posição ao fim de cada volta', () => {
  const chart = lapChart(fakeRace());
  const p2 = chart.find((c) => c.driver === 2)!.positions;
  assert.equal(p2.length, TOTAL);
  assert.equal(p2[0], 3);
  assert.equal(p2[10], 2);
});

test('consistência ordena pelo ritmo mediano', () => {
  const c = consistency(fakeRace());
  assert.deepEqual(c.map((x) => x.driver), [1, 2, 3]);
  assert.ok(c[0].spread > 0);
});

test('delta de volta termina na diferença dos tempos e acha o trecho decisivo', () => {
  const n = 200;
  const flat = Array.from({ length: n + 1 }, () => 200);
  // B é mais lento só no terceiro quarto da volta.
  const slow = flat.map((v, i) => (i >= 100 && i < 150 ? 150 : v));
  const a = { lap: 10, time: 80, speed: flat, throttle: flat, brake: flat };
  const b = { lap: 12, time: 86, speed: slow, throttle: flat, brake: flat };
  const delta = lapDelta(a, b);
  close(delta[0], 0);
  close(delta[n], 6, 1e-9);
  const [worst] = biggestSegments(delta, 4, 1);
  assert.deepEqual([worst.from, worst.to], [0.5, 0.75]);
  assert.ok(worst.loss > 0);
});

test('dados reais do GP do Brasil: análises rodam e fazem sentido', () => {
  const file = new URL('../../public/data/race/11412.json', import.meta.url);
  if (!existsSync(file)) return; // corrida não baixada nesta máquina
  const race: RaceData = JSON.parse(readFileSync(file, 'utf8'));
  const story = buildStory(race);
  assert.ok(story.length > 20);
  assert.equal(story.at(-1)!.kind, 'finish');
  const stops = pitStops(race);
  assert.ok(stops.length > 20);
  assert.ok(stops.every((s) => s.posBefore >= 1 && s.posBefore <= 22));
  assert.ok(consistency(race).length >= 15);
  assert.equal(lapChart(race).length, race.drivers.length);
});
