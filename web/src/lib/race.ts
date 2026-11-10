import type { Pt, RaceData, RaceDriver, RaceSectors, RaceTelemetry } from './raceTypes.ts';
import { decodeDeltas } from './replay.ts';
import { teamStyle } from './teams.ts';

export interface LoadedRace {
  data: RaceData;
  /** Distância acumulada por piloto, já decodificada. */
  u: Record<string, Float32Array>;
  /** Traçado pronto para desenhar (deitado, se a pista for mais alta que larga). */
  track: { points: Pt[]; width: number; height: number };
}

const base = () => `${import.meta.env.BASE_URL}data/race`;

/** session_keys das corridas que já têm replay. */
export async function loadRaceIndex(): Promise<number[]> {
  try {
    const res = await fetch(`${base()}/index.json`);
    return res.ok ? await res.json() : [];
  } catch {
    return [];
  }
}

export async function loadRace(sessionKey: number): Promise<LoadedRace> {
  const res = await fetch(`${base()}/${sessionKey}.json`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data: RaceData = await res.json();
  const u: LoadedRace['u'] = {};
  for (const [num, deltas] of Object.entries(data.replay.u)) {
    u[num] = decodeDeltas(deltas, data.replay.scale);
  }
  return { data, u, track: layTrackFlat(data.track) };
}

/** Telemetria das melhores voltas; null se a corrida não tiver esse arquivo. */
export async function loadTelemetry(sessionKey: number): Promise<RaceTelemetry | null> {
  try {
    const res = await fetch(`${base()}/${sessionKey}-tel.json`);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** Tempos de setor por volta; null se a corrida não tiver esse arquivo. */
export async function loadSectors(sessionKey: number): Promise<RaceSectors | null> {
  try {
    const res = await fetch(`${base()}/${sessionKey}-sectors.json`);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** O palco é mais largo que alto: pistas "em pé" são giradas 90 graus. */
function layTrackFlat(track: RaceData['track']): LoadedRace['track'] {
  if (track.height <= track.width * 1.1) return track;
  return {
    points: track.points.map(([x, y]) => [y, track.width - x]),
    width: track.height,
    height: track.width,
  };
}

export function driverColor(d: RaceDriver): string {
  return d.teamId ? teamStyle(d.teamId).color : d.colour;
}

// ---------- Progresso de quem assiste (para não dar spoiler) ----------

export interface WatchState {
  /** O visitante pediu para ver o resultado. */
  revealed: boolean;
  /** Ponto mais adiantado já assistido, em segundos de corrida. */
  seen: number;
}

const storageKey = (sessionKey: number) => `corrida:${sessionKey}`;

export function readWatchState(sessionKey: number): WatchState {
  try {
    const raw = localStorage.getItem(storageKey(sessionKey));
    if (raw) {
      const v = JSON.parse(raw);
      return { revealed: Boolean(v.revealed), seen: Number(v.seen) || 0 };
    }
  } catch {
    // sem armazenamento disponível: começa do zero
  }
  return { revealed: false, seen: 0 };
}

export function writeWatchState(sessionKey: number, state: WatchState): void {
  try {
    localStorage.setItem(storageKey(sessionKey), JSON.stringify(state));
  } catch {
    // idem
  }
}

// ---------- Formatação ----------

/** 3725 -> "1:02:05" */
export function formatClock(t: number): string {
  const s = Math.max(0, Math.floor(t));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** 92.347 -> "1:32.347" */
export function formatLapTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}
