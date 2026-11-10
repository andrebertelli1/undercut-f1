// Gera web/public/data/season/<ano>.json a partir da Jolpica (resultados) e da
// OpenF1 (session_key de cada corrida).
//
// Uso: node ingest/season.ts [ano]

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cumulativeStandings } from '../web/src/lib/standings.ts';
import type { Driver, ResultRow, Round, SeasonData, Team } from '../web/src/lib/types.ts';

const JOLPICA = 'https://api.jolpi.ca/ergast/f1';
const OPENF1 = 'https://api.openf1.org/v1';
const USER_AGENT = 'undercut-ingest';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson(url: string, attempt = 1): Promise<any> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (res.status === 429 && attempt <= 5) {
    await sleep(2000 * attempt);
    return getJson(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} em ${url}`);
  return res.json();
}

/** Percorre todas as páginas de um endpoint da Jolpica que devolve RaceTable. */
async function jolpicaRaces(path: string): Promise<any[]> {
  const byRound = new Map<string, any>();
  const limit = 100;
  for (let offset = 0; ; offset += limit) {
    const data = (await getJson(`${JOLPICA}/${path}/?limit=${limit}&offset=${offset}`)).MRData;
    for (const race of data.RaceTable.Races) {
      // Uma etapa pode vir partida entre duas páginas: junta as listas.
      const prev = byRound.get(race.round);
      if (!prev) {
        byRound.set(race.round, race);
        continue;
      }
      for (const key of ['Results', 'SprintResults']) {
        if (race[key]) prev[key] = [...(prev[key] ?? []), ...race[key]];
      }
    }
    if (offset + limit >= Number(data.total)) break;
    await sleep(300);
  }
  return [...byRound.values()];
}

function toRow(r: any): ResultRow {
  const classified = /^\d+$/.test(r.positionText);
  return {
    driverId: r.Driver.driverId,
    teamId: r.Constructor.constructorId,
    pos: classified ? Number(r.position) : null,
    grid: r.grid && r.grid !== '0' ? Number(r.grid) : null,
    points: Number(r.points),
    status: r.status,
  };
}

const iso = (s: { date: string; time?: string } | undefined) =>
  s ? `${s.date}T${s.time ?? '00:00:00Z'}` : null;

async function main() {
  const season = Number(process.argv[2] ?? new Date().getUTCFullYear());
  console.log(`Temporada ${season}`);

  const calendar = await jolpicaRaces(`${season}/races`);
  await sleep(300);
  const raceResults = await jolpicaRaces(`${season}/results`);
  await sleep(300);
  const sprintResults = await jolpicaRaces(`${season}/sprint`);
  const sessions: any[] = await getJson(`${OPENF1}/sessions?year=${season}&session_name=Race`);

  const drivers: Record<string, Driver> = {};
  const teams: Record<string, Team> = {};
  const remember = (r: any) => {
    const d = r.Driver;
    drivers[d.driverId] = {
      id: d.driverId,
      code: d.code ?? d.familyName.slice(0, 3).toUpperCase(),
      name: `${d.givenName} ${d.familyName}`,
      familyName: d.familyName,
      number: r.number ?? d.permanentNumber ?? '',
      nationality: d.nationality,
    };
    teams[r.Constructor.constructorId] = {
      id: r.Constructor.constructorId,
      name: r.Constructor.name,
    };
  };

  const resultsByRound = new Map(raceResults.map((r) => [r.round, r]));
  const sprintByRound = new Map(sprintResults.map((r) => [r.round, r]));

  const rounds: Round[] = calendar
    .sort((a, b) => Number(a.round) - Number(b.round))
    .map((race) => {
      const rr: any[] = resultsByRound.get(race.round)?.Results ?? [];
      const sr: any[] = sprintByRound.get(race.round)?.SprintResults ?? [];
      rr.forEach(remember);
      sr.forEach(remember);

      let fastestLap: Round['fastestLap'] = null;
      const fl = rr.find((r) => r.FastestLap?.rank === '1');
      if (fl) {
        fastestLap = {
          driverId: fl.Driver.driverId,
          time: fl.FastestLap.Time.time,
          lap: Number(fl.FastestLap.lap),
        };
      }

      const session = sessions.find(
        (s) => !s.is_cancelled && String(s.date_start).slice(0, 10) === race.date,
      );

      return {
        round: Number(race.round),
        raceName: race.raceName,
        circuitId: race.Circuit.circuitId,
        circuitName: race.Circuit.circuitName,
        locality: race.Circuit.Location.locality,
        country: race.Circuit.Location.country,
        lat: Number(race.Circuit.Location.lat),
        lng: Number(race.Circuit.Location.long),
        date: iso(race)!,
        hasSprint: Boolean(race.Sprint),
        sprintDate: iso(race.Sprint),
        raceDone: rr.length > 0,
        sprintDone: sr.length > 0,
        sessionKey: session?.session_key ?? null,
        results: rr.map(toRow),
        sprintResults: sr.map(toRow),
        fastestLap,
        driverStandings: [],
        teamStandings: [],
      };
    });

  const cumulative = cumulativeStandings(rounds);
  rounds.forEach((r, i) => {
    if (!r.raceDone && !r.sprintDone) return;
    r.driverStandings = cumulative[i].drivers;
    r.teamStandings = cumulative[i].teams;
  });

  const problems = await checkAgainstOfficial(season, rounds);

  const data: SeasonData = {
    season,
    generatedAt: new Date().toISOString(),
    drivers,
    teams,
    rounds,
  };
  const out = resolve(
    dirname(fileURLToPath(import.meta.url)),
    `../web/public/data/season/${season}.json`,
  );
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(data));

  const done = rounds.filter((r) => r.raceDone).length;
  console.log(`${rounds.length} etapas (${done} disputadas), ${Object.keys(drivers).length} pilotos`);
  console.log(`Gravado em ${out}`);
  if (problems.length) {
    console.error(`\n${problems.length} divergência(s) contra a classificação oficial:`);
    problems.forEach((p) => console.error(`  - ${p}`));
    process.exitCode = 1;
  } else {
    console.log('Classificações conferem com a Jolpica.');
  }
}

/** Compara a classificação calculada com a publicada pela Jolpica. */
async function checkAgainstOfficial(season: number, rounds: Round[]): Promise<string[]> {
  const last = [...rounds].reverse().find((r) => r.driverStandings.length > 0);
  if (!last) return [];
  const problems: string[] = [];

  await sleep(300);
  const ds = (await getJson(`${JOLPICA}/${season}/driverstandings/?limit=100`)).MRData
    .StandingsTable;
  const official = ds.StandingsLists[0];
  if (!official) return [];
  if (Number(official.round) !== last.round) {
    // Sprint já disputada com a corrida ainda por vir, ou a Jolpica ainda não atualizou.
    console.warn(
      `Aviso: classificação oficial é da etapa ${official.round}, a calculada é da ${last.round}; conferência pulada.`,
    );
    return [];
  }
  for (const o of official.DriverStandings) {
    const mine = last.driverStandings.find((d) => d.driverId === o.Driver.driverId);
    if (!mine) problems.push(`piloto ${o.Driver.driverId} ausente`);
    else if (mine.points !== Number(o.points))
      problems.push(`${o.Driver.driverId}: ${mine.points} pts calculados, ${o.points} oficiais`);
    else if (o.position && mine.pos !== Number(o.position))
      problems.push(`${o.Driver.driverId}: P${mine.pos} calculado, P${o.position} oficial`);
  }

  await sleep(300);
  const cs = (await getJson(`${JOLPICA}/${season}/constructorstandings/?limit=100`)).MRData
    .StandingsTable.StandingsLists[0];
  for (const o of cs?.ConstructorStandings ?? []) {
    const mine = last.teamStandings.find((t) => t.teamId === o.Constructor.constructorId);
    if (!mine) problems.push(`equipe ${o.Constructor.constructorId} ausente`);
    else if (mine.points !== Number(o.points))
      problems.push(
        `${o.Constructor.constructorId}: ${mine.points} pts calculados, ${o.points} oficiais`,
      );
  }
  return problems;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
