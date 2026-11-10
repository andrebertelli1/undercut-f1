import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { RaceData, RaceSectors } from './raceTypes.ts';
import { decodeDeltas } from './replay.ts';
import { buildSectorModel, sectorViewAt } from './sectors.ts';

const close = (a: number, b: number, eps = 1e-3) =>
  assert.ok(Math.abs(a - b) < eps, `${a} deveria ser ~${b}`);

/**
 * Dois pilotos, 8 voltas de 100 s. Os setores terminam em 30% e 70% da volta.
 * O carro anda em velocidade constante dentro de cada setor.
 */
function fake(sectorTimes: Record<string, [number, number, number][]>) {
  const laps: RaceData['laps'] = {};
  const sectors: RaceSectors = {};
  const u: Record<string, Float32Array> = {};
  const START = -10;
  for (const [driver, rows] of Object.entries(sectorTimes)) {
    let t = 0;
    const marks: [number, number][] = [[START, 0], [0, 0]]; // [tempo, distância]
    laps[driver] = [];
    sectors[driver] = [];
    rows.forEach(([s1, s2, s3], i) => {
      laps[driver].push([i + 1, t, s1 + s2 + s3]);
      sectors[driver].push([i + 1, s1, s2, s3]);
      marks.push([t + s1, i + 0.3], [t + s1 + s2, i + 0.7], [t + s1 + s2 + s3, i + 1]);
      t += s1 + s2 + s3;
    });
    const series = new Float32Array(Math.ceil(t - START) + 20);
    for (let k = 0; k < series.length; k++) {
      const time = START + k;
      let j = 0;
      while (j < marks.length - 2 && marks[j + 1][0] <= time) j++;
      const [t0, u0] = marks[j];
      const [t1, u1] = marks[j + 1];
      series[k] = time >= t1 ? u1 : u0 + ((u1 - u0) * (time - t0)) / (t1 - t0 || 1);
    }
    u[driver] = series;
  }
  const race = {
    laps,
    replay: { hz: 1, scale: 1, start: START, u: {} },
  } as unknown as RaceData;
  return { race, sectors, u };
}

const steady: [number, number, number] = [30, 40, 30];

test('limites dos setores saem de onde o carro estava ao fim de cada um', () => {
  const { race, sectors, u } = fake({ '1': Array(8).fill(steady), '2': Array(8).fill(steady) });
  const model = buildSectorModel(race, u, sectors)!;
  close(model.bounds[0], 0.3, 0.01);
  close(model.bounds[1], 0.7, 0.01);
});

test('cores: roxo para o melhor de todos, verde para o melhor pessoal, amarelo para o resto', () => {
  const { race, sectors, u } = fake({
    // Piloto 1: volta 2 melhora o S1; volta 3 piora.
    '1': [[30, 40, 30], [29, 40, 30], [31, 40, 30], ...Array(5).fill(steady)],
    // Piloto 2: sempre mais lento no S1 que o piloto 1, mas melhora o próprio na volta 2.
    '2': [[33, 40, 30], [32, 40, 30], [34, 40, 30], ...Array(5).fill(steady)],
  });
  const model = buildSectorModel(race, u, sectors)!;
  const s1 = (driver: string, lap: number) => model.laps[driver].get(lap)!.colors[0];
  assert.equal(s1('1', 1), 'purple'); // primeiro tempo registrado
  assert.equal(s1('1', 2), 'purple'); // bateu o melhor de todos
  assert.equal(s1('1', 3), 'yellow'); // pior que o próprio melhor
  assert.equal(s1('2', 1), 'green'); // não é o melhor de todos, mas é o primeiro dele
  assert.equal(s1('2', 2), 'green'); // melhor pessoal, ainda atrás do piloto 1
  assert.equal(s1('2', 3), 'yellow');
});

test('a cor considera só o que já tinha acontecido naquele momento', () => {
  const { race, sectors, u } = fake({
    '1': [[30, 40, 30], [30, 40, 30], ...Array(6).fill(steady)],
    // O piloto 2 faz 28 no S1 da volta 2, mas termina esse setor depois do
    // piloto 1 terminar o dele: o 30 do piloto 1 ainda era o melhor quando foi feito.
    '2': [[35, 40, 30], [28, 40, 30], ...Array(6).fill(steady)],
  });
  const model = buildSectorModel(race, u, sectors)!;
  assert.equal(model.laps['1'].get(2)!.colors[0], 'purple');
  assert.equal(model.laps['2'].get(2)!.colors[0], 'purple');
  // Na volta 3 o piloto 1 repete os 30: já não é o melhor de todos (28),
  // mas iguala o próprio melhor, o que conta como verde.
  assert.equal(model.laps['1'].get(3)!.colors[0], 'green');
});

test('visão do instante: setores feitos, em andamento e por fazer', () => {
  const { race, sectors, u } = fake({ '1': Array(8).fill(steady), '2': Array(8).fill(steady) });
  const model = buildSectorModel(race, u, sectors)!;

  // Volta 3 começa em t = 200. Em t = 245 o S1 (30 s) acabou e o S2 está em andamento.
  const mid = sectorViewAt(race, model, 1, 245)!;
  assert.equal(mid.lap, 3);
  assert.deepEqual(mid.current.map((s) => s.state), ['done', 'running', 'pending']);
  assert.equal(mid.current[0].time, 30);
  assert.equal(mid.current[1].time, null, 'tempo de setor em andamento não pode aparecer');
  assert.equal(mid.last!.lap, 2);
  assert.equal(mid.last!.time, 100);

  const early = sectorViewAt(race, model, 1, 10)!;
  assert.deepEqual(early.current.map((s) => s.state), ['running', 'pending', 'pending']);
  assert.equal(early.last, null);

  assert.equal(sectorViewAt(race, model, 1, -5), null);

  // Depois da última volta, os três setores dela aparecem como feitos.
  const end = sectorViewAt(race, model, 1, 900)!;
  assert.deepEqual(end.current.map((s) => s.state), ['done', 'done', 'done']);
  assert.equal(end.last!.lap, 8);
});

test('volta mais rápida de todos fica roxa', () => {
  const { race, sectors, u } = fake({
    '1': [[30, 40, 30], [29, 39, 30], ...Array(6).fill(steady)],
    '2': Array(8).fill([31, 41, 31] as [number, number, number]),
  });
  const model = buildSectorModel(race, u, sectors)!;
  assert.equal(model.lapColors['1'].get(2), 'purple');
  assert.equal(model.lapColors['1'].get(3), 'yellow');
  assert.equal(model.lapColors['2'].get(1), 'green');
});

test('dados reais do GP do Brasil: limites plausíveis e melhor setor roxo', () => {
  const dir = new URL('../../public/data/race/', import.meta.url);
  if (!existsSync(new URL('11412-sectors.json', dir))) return;
  const race: RaceData = JSON.parse(readFileSync(new URL('11412.json', dir), 'utf8'));
  const sectors: RaceSectors = JSON.parse(readFileSync(new URL('11412-sectors.json', dir), 'utf8'));
  const u: Record<string, Float32Array> = {};
  for (const [k, d] of Object.entries(race.replay.u)) u[k] = decodeDeltas(d, race.replay.scale);
  const model = buildSectorModel(race, u, sectors)!;
  assert.ok(model, 'modelo deveria existir');
  // Em Interlagos os setores levam cerca de 25%, 52% e 23% do tempo da volta.
  assert.ok(model.bounds[0] > 0.1 && model.bounds[0] < 0.45, `S1 termina em ${model.bounds[0]}`);
  assert.ok(model.bounds[1] > 0.55 && model.bounds[1] < 0.95, `S2 termina em ${model.bounds[1]}`);
  // O menor S1 da corrida tem de estar roxo.
  let best = { time: Infinity, color: '' };
  for (const map of Object.values(model.laps)) {
    for (const row of map.values()) if (row.times[0] < best.time) best = { time: row.times[0], color: row.colors[0] };
  }
  assert.equal(best.color, 'purple');
});
