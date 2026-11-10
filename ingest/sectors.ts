// Gera web/public/data/race/<session_key>-sectors.json com os tempos de setor
// de cada volta, para a comparação entre pilotos. É leve (um pedido por
// corrida) e independente de ingest/race.ts.
//
// Uso: node ingest/sectors.ts            todas as corridas que já têm replay
//      node ingest/sectors.ts 11412 ...  só as sessões indicadas

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RaceSectors } from '../web/src/lib/raceTypes.ts';

const OPENF1 = 'https://api.openf1.org/v1';
const DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../web/public/data/race');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const wanted = process.argv.slice(2).map(Number);
  const keys: number[] = wanted.length
    ? wanted
    : JSON.parse(await readFile(`${DIR}/index.json`, 'utf8'));

  for (const key of keys) {
    const res = await fetch(`${OPENF1}/laps?session_key=${key}`, {
      headers: { 'User-Agent': 'undercut-ingest' },
    });
    if (!res.ok) {
      console.error(`${key}: ${res.status} ${res.statusText}`);
      process.exitCode = 1;
      await sleep(2100);
      continue;
    }
    const laps: any[] = await res.json();
    const out: RaceSectors = {};
    for (const l of laps.sort((a, b) => a.lap_number - b.lap_number)) {
      const s = [l.duration_sector_1, l.duration_sector_2, l.duration_sector_3];
      if (s.some((v) => typeof v !== 'number')) continue;
      (out[l.driver_number] ??= []).push([l.lap_number, s[0], s[1], s[2]]);
    }
    await writeFile(`${DIR}/${key}-sectors.json`, JSON.stringify(out));
    console.log(`${key}: setores de ${Object.keys(out).length} pilotos`);
    await sleep(2100);
  }
}

main();
