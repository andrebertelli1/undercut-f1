import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Pt, RaceData } from './raceTypes.ts';
import {
  anchorToLaps,
  barAtTime,
  decodeDeltas,
  encodeDeltas,
  frameAt,
  lapAt,
  makeProjector,
  pointAt,
  resampleClosed,
  resampleSeries,
  sampleU,
  timeAtBar,
  unwrap,
} from './replay.ts';

const close = (a: number, b: number, eps = 1e-3) =>
  assert.ok(Math.abs(a - b) < eps, `${a} deveria ser ~${b}`);

/** Circuito circular de raio 1000, percorrido no sentido anti-horário a partir de (1000, 0). */
const circle = (n: number): Pt[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return [1000 * Math.cos(a), 1000 * Math.sin(a)];
  });
const onCircle = (frac: number, r = 1000): Pt => [
  r * Math.cos(2 * Math.PI * frac),
  r * Math.sin(2 * Math.PI * frac),
];

test('resampleClosed devolve pontos igualmente espaçados', () => {
  const square: Pt[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
  const out = resampleClosed(square, 8);
  assert.deepEqual(out, [[0, 0], [5, 0], [10, 0], [10, 5], [10, 10], [5, 10], [0, 10], [0, 5]]);
});

test('projeção acerta a fração da volta, mesmo fora da linha ideal', () => {
  const project = makeProjector(circle(400));
  for (const f of [0, 0.1, 0.37, 0.5, 0.93]) {
    const [x, y] = onCircle(f, 1015);
    close(project(x, y), f, 2e-3);
  }
});

test('projeção e unwrap contam voltas completas', () => {
  const project = makeProjector(circle(400));
  const fracs: number[] = [];
  // Larga um pouco atrás da linha e dá 3 voltas e meia.
  for (let u = -0.02; u <= 3.5; u += 0.013) {
    const [x, y] = onCircle(u);
    fracs.push(project(x, y));
  }
  const u = unwrap(fracs);
  close(u[0], -0.02, 2e-3);
  close(u[u.length - 1], 3.5, 0.02);
  for (let i = 1; i < u.length; i++) assert.ok(u[i] >= u[i - 1] - 1e-6, 'não pode andar para trás');
});

test('projeção não salta para um trecho paralelo próximo', () => {
  // Pista em "U" estreito: ida e volta separadas por 40 unidades.
  const raw: Pt[] = [[0, 0], [2000, 0], [2000, 40], [0, 40]];
  const line = resampleClosed(raw, 400);
  const project = makeProjector(line);
  // Começa longe das pontas do "U", onde a ida é de fato o trecho mais próximo.
  let prev = project(100, 5);
  for (let x = 130; x <= 1900; x += 30) {
    // Anda pela ida, mas deslocado na direção da volta.
    const f = project(x, 17);
    assert.ok(f >= prev && f < 0.5, `fração ${f} deveria continuar na ida`);
    prev = f;
  }
});

test('anchorToLaps mantém a contagem de voltas mesmo com falha de sinal', () => {
  // 4 voltas de 100 s; o sinal some entre t = 120 e t = 330 (mais de duas voltas).
  const laps: [number, number, number | null][] = [
    [1, 0, 100],
    [2, 100, 100],
    [3, 200, 100],
    [4, 300, 100],
  ];
  const times: number[] = [];
  const fracs: number[] = [];
  for (let t = -5; t <= 430; t += 2.5) {
    if (t > 120 && t < 330) continue;
    times.push(t);
    const u = t < 0 ? -0.01 : t / 100;
    fracs.push(((u % 1) + 1) % 1);
  }
  const anchored = anchorToLaps(times, fracs, laps, 100);
  times.forEach((t, i) => close(anchored[i], t < 0 ? -0.01 : t / 100, 1e-6));
  // Sem a âncora, as duas voltas do buraco seriam perdidas.
  const naive = unwrap(fracs);
  close(naive[naive.length - 1], 2.3, 1e-6);
  close(anchored[anchored.length - 1], 4.3, 1e-6);
});

test('anchorToLaps não acumula voltas para um carro parado', () => {
  const laps: [number, number, number | null][] = [[1, 0, 100], [2, 100, null]];
  const times = [150, 400, 900, 2000];
  const out = anchorToLaps(times, times.map(() => 0.5), laps, 100);
  assert.deepEqual(out, [1.5, 1.5, 1.5, 1.5]);
});

test('resampleSeries interpola e segura as pontas', () => {
  const out = resampleSeries([0, 2, 4], [0, 10, 30], -1, 1, 7);
  assert.deepEqual(out, [0, 0, 5, 10, 20, 30, 30]);
});

test('codificação em diferenças é reversível', () => {
  const values = [-0.0123, 0, 0.5, 1.75, 1.75, 12.3456];
  const decoded = decodeDeltas(encodeDeltas(values, 4000), 4000);
  values.forEach((v, i) => close(decoded[i], v, 1 / 4000));
});

test('sampleU interpola entre amostras e pointAt segue o traçado', () => {
  const u = new Float32Array([0, 0.5, 1]);
  close(sampleU(u, -10, 1, -9.5), 0.25);
  close(sampleU(u, -10, 1, -100), 0);
  close(sampleU(u, -10, 1, 100), 1);
  const [x, y] = pointAt(circle(400), 1.25);
  close(x, 0, 1);
  close(y, 1000, 1);
});

test('barra por voltas: tempo e posição são inversos', () => {
  const lapStarts = [0, 90, 200, 290];
  const tEnd = 400;
  assert.equal(lapAt(lapStarts, -3), 0);
  assert.equal(lapAt(lapStarts, 95), 2);
  // A volta 2 é mais longa (110 s), mas ocupa o mesmo quarto da barra.
  close(timeAtBar(lapStarts, tEnd, 0.25), 90);
  close(timeAtBar(lapStarts, tEnd, 0.375), 145);
  close(timeAtBar(lapStarts, tEnd, 1), 400);
  for (const t of [0, 45, 145, 250, 399]) {
    close(timeAtBar(lapStarts, tEnd, barAtTime(lapStarts, tEnd, t)), t, 1e-6);
  }
});

test('frameAt monta a classificação do instante', () => {
  const driver = (number: number, code: string) => ({
    number,
    code,
    name: code,
    teamName: '',
    teamId: null,
    colour: '#fff',
    retiredAt: number === 3 ? 150 : null,
    finishAt: null,
  });
  const race = {
    drivers: [driver(1, 'AAA'), driver(2, 'BBB'), driver(3, 'CCC')],
    positions: {
      '1': [[-600, 2], [100, 1]],
      '2': [[-600, 1], [100, 2]],
      '3': [[-600, 3]],
    },
    gaps: {
      '1': { t: [0, 100], g: [1.2, 0] },
      '2': { t: [0, 100], g: [0, 0.8] },
      '3': { t: [0], g: [-1] },
    },
    laps: {
      '1': [[1, 0, 90], [2, 90, 91]],
      '2': [[1, 0, 90], [2, 90.5, 92]],
      '3': [[1, 0, 95]],
    },
    stints: {
      '1': [[1, 1, 'SOFT', 2], [2, 30, 'HARD', 0]],
      '2': [[1, 30, 'MEDIUM', 0]],
      '3': [[1, 30, 'HARD', 0]],
    },
    pits: { '1': [[85, 22, 1]], '2': [], '3': [] },
  } as unknown as RaceData;

  const early = frameAt(race, 50);
  assert.deepEqual(early.map((r) => r.driver.code), ['BBB', 'AAA', 'CCC']);
  assert.equal(early[1].compound, 'SOFT');
  assert.equal(early[1].tyreAge, 2);
  assert.equal(early[1].inPit, false);
  assert.equal(early[2].gap, -1);

  const later = frameAt(race, 100);
  assert.deepEqual(later.map((r) => r.driver.code), ['AAA', 'BBB', 'CCC']);
  assert.equal(later[0].inPit, true);
  assert.equal(later[0].compound, 'HARD');
  assert.equal(later[0].lap, 2);
  assert.equal(later[2].retired, false);
  assert.equal(frameAt(race, 160)[2].retired, true);
});
