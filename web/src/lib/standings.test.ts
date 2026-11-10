import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  contention,
  cumulativeStandings,
  driverPointsRemaining,
  teamPointsRemaining,
} from './standings.ts';
import type { ResultRow } from './types.ts';

const row = (driverId: string, teamId: string, pos: number | null, points: number): ResultRow => ({
  driverId,
  teamId,
  pos,
  grid: null,
  points,
  status: 'Finished',
});

test('soma corrida e sprint e acumula entre etapas', () => {
  const out = cumulativeStandings([
    {
      results: [row('a', 'x', 1, 25), row('b', 'y', 2, 18)],
      sprintResults: [row('b', 'y', 1, 8), row('a', 'x', 2, 7)],
    },
    { results: [row('b', 'y', 1, 25), row('a', 'x', 2, 18)], sprintResults: [] },
  ]);
  assert.deepEqual(
    out[0].drivers.map((d) => [d.driverId, d.points]),
    [['a', 32], ['b', 26]],
  );
  assert.deepEqual(
    out[1].drivers.map((d) => [d.driverId, d.points, d.wins]),
    [['b', 51, 1], ['a', 50, 1]],
  );
  assert.equal(out[1].teams[0].teamId, 'y');
});

test('vitória em sprint não conta como vitória nem no desempate', () => {
  const out = cumulativeStandings([
    {
      results: [row('a', 'x', 2, 18), row('b', 'y', 3, 15)],
      sprintResults: [row('b', 'y', 1, 8), row('a', 'x', 4, 5)],
    },
  ]);
  // Empate em 23 pontos: "a" tem um 2º lugar em corrida, "b" só um 3º.
  assert.deepEqual(out[0].drivers.map((d) => d.driverId), ['a', 'b']);
  assert.equal(out[0].drivers[1].wins, 0);
});

test('empate em pontos é decidido pela contagem de melhores resultados', () => {
  const out = cumulativeStandings([
    { results: [row('a', 'x', 1, 25), row('b', 'y', 2, 18)], sprintResults: [] },
    { results: [row('b', 'y', 3, 15), row('a', 'x', 6, 8)], sprintResults: [] },
  ]);
  assert.equal(out[1].drivers[0].points, out[1].drivers[1].points);
  assert.equal(out[1].drivers[0].driverId, 'a');
});

test('piloto que troca de equipe aparece na equipe mais recente', () => {
  const out = cumulativeStandings([
    { results: [row('a', 'x', 1, 25)], sprintResults: [] },
    { results: [row('a', 'y', 1, 25)], sprintResults: [] },
  ]);
  assert.equal(out[1].drivers[0].teamId, 'y');
  assert.deepEqual(out[1].teams.map((t) => t.points), [25, 25]);
});

const calendar = [
  { round: 1, hasSprint: false, raceDone: true, sprintDone: false },
  { round: 2, hasSprint: true, raceDone: true, sprintDone: true },
  { round: 3, hasSprint: true, raceDone: false, sprintDone: true },
  { round: 4, hasSprint: false, raceDone: false, sprintDone: false },
];

test('pontos em jogo consideram corridas e sprints que faltam', () => {
  // Etapa 3 só teve a sprint: falta a corrida (25) e a etapa 4 inteira (25).
  assert.equal(driverPointsRemaining(calendar, 3), 50);
  assert.equal(teamPointsRemaining(calendar, 3), 86);
});

test('ao voltar no tempo, etapas posteriores voltam a contar por inteiro', () => {
  assert.equal(driverPointsRemaining(calendar, 1), 25 + 8 + 25 + 8 + 25);
  // No estado atual, as corridas das etapas 3 e 4 ainda não aconteceram.
  assert.equal(driverPointsRemaining(calendar, 4), 50);
});

test('título decidido quando ninguém alcança o líder', () => {
  const s = [{ points: 390 }, { points: 279 }, { points: 262 }];
  const open = contention(s, 120);
  assert.equal(open.clinched, false);
  assert.deepEqual(open.rows.map((r) => r.alive), [true, true, false]);
  assert.equal(open.rows[1].gap, 111);

  assert.equal(contention(s, 75).clinched, true);
});

test('quem pode empatar em pontos ainda está vivo', () => {
  const { rows, clinched } = contention([{ points: 100 }, { points: 75 }], 25);
  assert.equal(rows[1].alive, true);
  assert.equal(clinched, false);
});
