import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { RaceData } from './raceTypes.ts';
import { bestLapAt, phaseAt, timedBoard } from './timed.ts';

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} deveria ser ~${b}`);

/**
 * Classificação com Q1 (0 a 1000 s) e Q2 (1200 a 2000 s).
 * Piloto 3 é eliminado no Q1 e não anda no Q2.
 */
const race = {
  drivers: [{ number: 1 }, { number: 2 }, { number: 3 }],
  phases: [
    { name: 'Q1', from: 0, to: 1000 },
    { name: 'Q2', from: 1200, to: 2000 },
  ],
  laps: {
    // [volta, início, duração]
    '1': [[1, 100, null], [2, 200, 90], [3, 400, 88], [4, 1300, 87.5]],
    '2': [[1, 100, null], [2, 250, 89], [3, 1400, 86]],
    '3': [[1, 100, null], [2, 300, 91]],
  },
} as unknown as RaceData;

test('melhor volta só conta depois de completada', () => {
  assert.equal(bestLapAt(race, 1, 250), null); // a volta 2 termina em 290
  assert.deepEqual(bestLapAt(race, 1, 290), { time: 90, lap: 2 });
  assert.deepEqual(bestLapAt(race, 1, 500), { time: 88, lap: 3 });
});

test('fase atual é a última que já começou', () => {
  assert.equal(phaseAt(race, -5), undefined);
  assert.equal(phaseAt(race, 500)?.name, 'Q1');
  assert.equal(phaseAt(race, 1100)?.name, 'Q1'); // intervalo entre as fases
  assert.equal(phaseAt(race, 1500)?.name, 'Q2');
});

test('no Q1 a tabela mostra diferenças para o melhor tempo', () => {
  const board = timedBoard(race, 600);
  close(board.get(1)!.best!, 88);
  close(board.get(1)!.gap!, 0);
  close(board.get(2)!.gap!, 1);
  close(board.get(3)!.gap!, 3);
  assert.ok([...board.values()].every((r) => r.current));
});

test('no Q2 os tempos zeram: quem não andou fica com o tempo do Q1, marcado', () => {
  // Logo no começo do Q2 ninguém tem volta na fase.
  const early = timedBoard(race, 1250);
  assert.equal(early.get(1)!.current, false);
  close(early.get(1)!.best!, 88);
  assert.equal(early.get(1)!.gap, null);

  const late = timedBoard(race, 1600);
  close(late.get(2)!.best!, 86);
  close(late.get(2)!.gap!, 0);
  close(late.get(1)!.gap!, 1.5);
  // O eliminado continua com o tempo do Q1 e sem diferença.
  assert.equal(late.get(3)!.current, false);
  close(late.get(3)!.best!, 91);
  assert.equal(late.get(3)!.gap, null);
});

test('treino (sem fases) usa a melhor volta da sessão inteira', () => {
  const practice = { ...race, phases: undefined } as unknown as RaceData;
  const board = timedBoard(practice, 1600);
  close(board.get(2)!.best!, 86);
  close(board.get(1)!.gap!, 1.5);
  close(board.get(3)!.gap!, 5);
});
