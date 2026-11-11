import { memo } from 'react';
import { t as i18n } from '../../i18n/index.ts';
import { driverColor, formatLapTime } from '../../lib/race.ts';
import type { TimedRow } from '../../lib/timed.ts';
import type { FrameRow } from '../../lib/replay.ts';

const COMPOUNDS: Record<string, { letter: string; className: string }> = {
  SOFT: { letter: 'S', className: 'tyre-soft' },
  MEDIUM: { letter: 'M', className: 'tyre-medium' },
  HARD: { letter: 'H', className: 'tyre-hard' },
  INTERMEDIATE: { letter: 'I', className: 'tyre-inter' },
  WET: { letter: 'W', className: 'tyre-wet' },
};

export function Tyre({ compound, age }: { compound: string | null; age: number | null }) {
  const c = compound ? COMPOUNDS[compound] : undefined;
  if (!c) return <span className="tyre tyre-unknown">?</span>;
  return (
    <span className="tyre-wrap" title={`${i18n.compound(compound!)} · ${i18n.tyreAge(age ?? 0)}`}>
      <span className={`tyre ${c.className}`}>{c.letter}</span>
      <span className="muted num tyre-age">{age ?? ''}</span>
    </span>
  );
}

export function gapText(row: FrameRow, started: boolean): string {
  if (row.retired) return i18n.out;
  if (!started) return '';
  if (row.pos === 1) return i18n.leaderShort;
  if (row.gap === null) return '';
  if (row.gap < 0) return i18n.lapsDown(-row.gap);
  return `+${row.gap.toFixed(1)}`;
}

/** Texto da coluna de tempo numa sessão cronometrada. */
export function timedText(row: TimedRow | undefined): string {
  if (!row || row.best === null) return '';
  if (!row.current || row.gap === null || row.gap === 0) return formatLapTime(row.best);
  return `+${row.gap.toFixed(3)}`;
}

/** Torre de posições no instante atual do player. */
export const Tower = memo(function Tower({
  frame,
  started,
  board,
  selected,
  onSelect,
}: {
  frame: FrameRow[];
  started: boolean;
  /** Em treino e classificação: melhor volta de cada piloto, no lugar da distância. */
  board?: Map<number, TimedRow> | null;
  selected: number | null;
  onSelect: (driver: number | null) => void;
}) {
  return (
    <section className="panel tower">
      <h2>{i18n.positions}</h2>
      <ol>
        {frame.map((row) => {
          const { driver } = row;
          const isSelected = driver.number === selected;
          return (
            <li key={driver.number}>
              <button
                className={`tower-row ${isSelected ? 'is-selected' : ''} ${row.retired ? 'is-retired' : ''}`}
                onClick={() => onSelect(isSelected ? null : driver.number)}
                aria-pressed={isSelected}
                title={driver.name}
              >
                <span className="pos">{row.retired ? '–' : row.pos}</span>
                <span className="team-stripe" style={{ background: driverColor(driver) }} />
                <span className="tower-code">{driver.code}</span>
                {row.inPit && <span className="tag tag-pit">{i18n.pit}</span>}
                <span
                  className={`tower-gap num ${board && board.get(driver.number)?.current ? '' : 'muted'}`}
                >
                  {board ? timedText(board.get(driver.number)) : gapText(row, started)}
                </span>
                <Tyre compound={row.compound} age={row.tyreAge} />
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
});
