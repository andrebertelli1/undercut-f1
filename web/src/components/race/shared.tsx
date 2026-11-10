import type { ReactNode } from 'react';
import { t as i18n } from '../../i18n/index.ts';
import { driverColor } from '../../lib/race.ts';
import type { RaceData, RaceDriver } from '../../lib/raceTypes.ts';
import type { FrameRow } from '../../lib/replay.ts';

export const TYRE_COLORS: Record<string, string> = {
  SOFT: '#ff4d4d',
  MEDIUM: '#f5d03b',
  HARD: '#f2f2f4',
  INTERMEDIATE: '#43c463',
  WET: '#4d9bff',
};

const SECOND_COLOR = '#f2f2f4';

/** O que todas as abas de análise recebem da tela da corrida. */
export interface TabProps {
  race: RaceData;
  frame: FrameRow[];
  /** Volta atual do player. */
  lap: number;
  /** Até onde dá para mostrar sem entregar o que vem depois. */
  limitLap: number;
  limitT: number;
  /** Resultado revelado, ou corrida assistida até o fim. */
  unlocked: boolean;
  onReveal: () => void;
  selected: number | null;
  onSelect: (driver: number | null) => void;
  /** Leva o player a um instante e volta para a aba da pista. */
  onOpenAt: (t: number, driver?: number) => void;
}

export const findDriver = (race: RaceData, n: number): RaceDriver | undefined =>
  race.drivers.find((d) => d.number === n);

export const codeOf = (race: RaceData) => (n: number) => findDriver(race, n)?.code ?? String(n);

/** Cores de dois pilotos lado a lado; companheiros de equipe não podem ficar iguais. */
export function pairColors(a?: RaceDriver, b?: RaceDriver) {
  const colorA = a ? driverColor(a) : SECOND_COLOR;
  const same = b ? driverColor(b) === colorA : false;
  return { colorA, colorB: b && !same ? driverColor(b) : SECOND_COLOR, dashedB: same };
}

export function DriverPicker({
  frame,
  value,
  onChange,
  label,
  color,
}: {
  frame: FrameRow[];
  value: number;
  onChange: (n: number) => void;
  label: string;
  color?: string;
}) {
  return (
    <label className="picker">
      {color && <i style={{ background: color }} />}
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label}>
        {frame.map((r) => (
          <option key={r.driver.number} value={r.driver.number}>
            {r.driver.code} · {r.driver.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Aviso de conteúdo escondido para não dar spoiler, com o botão de revelar. */
export function SpoilerNote({ children, onReveal }: { children: ReactNode; onReveal: () => void }) {
  return (
    <p className="note muted">
      {children}{' '}
      <button className="link" onClick={onReveal}>
        {i18n.showResult}
      </button>
    </p>
  );
}

/** +0.123 / −0.123 */
export function signed(value: number, digits = 3): string {
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(digits)}`;
}
