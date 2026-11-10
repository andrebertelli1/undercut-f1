import { useMemo, useState } from 'react';
import { t as i18n } from '../../i18n/index.ts';
import { simulate, whatIfRange } from '../../lib/insights.ts';
import { DriverPicker, findDriver, SpoilerNote, TYRE_COLORS, type TabProps } from './shared.tsx';

/**
 * Aba "E se?": move uma parada do piloto (e, se quiser, troca o composto do
 * stint seguinte) e estima o efeito. É uma estimativa por modelo simples, com
 * as premissas à vista — nunca um resultado oficial.
 */
export function WhatIf({ race, frame, unlocked, onReveal, selected }: TabProps) {
  const [driver, setDriver] = useState<number>(selected ?? frame[0]?.driver.number);
  const [stop, setStop] = useState(0);
  const [lap, setLap] = useState<number | null>(null);
  const [compound, setCompound] = useState<string>('');

  const stints = race.stints[driver] ?? [];
  const stops = Math.max(0, stints.length - 1);
  const stopIndex = Math.min(stop, Math.max(0, stops - 1));
  const range = whatIfRange(race, driver, stopIndex);
  const realLap = stints[stopIndex]?.[1] ?? 0;
  const chosenLap = lap !== null && range && lap >= range[0] && lap <= range[1] ? lap : realLap;

  // Compostos que alguém usou nesta corrida: só para eles há dados de ritmo.
  const compounds = useMemo(() => {
    const set = new Set<string>();
    for (const list of Object.values(race.stints)) for (const s of list) set.add(s[2]);
    return [...set].filter((c) => c === 'SOFT' || c === 'MEDIUM' || c === 'HARD');
  }, [race]);

  const result = useMemo(
    () =>
      unlocked && range
        ? simulate(race, { driver, stop: stopIndex, lap: chosenLap, compound: compound || undefined })
        : null,
    [race, driver, stopIndex, chosenLap, compound, unlocked, range],
  );

  if (!unlocked) {
    return (
      <div className="strategy">
        <section>
          <h2>{i18n.whatIfTitle}</h2>
          <SpoilerNote onReveal={onReveal}>{i18n.whatIfLocked}</SpoilerNote>
        </section>
      </div>
    );
  }

  const d = findDriver(race, driver);
  const nextCompound = compound || stints[stopIndex + 1]?.[2];
  const pickDriver = (n: number) => {
    setDriver(n);
    setStop(0);
    setLap(null);
    setCompound('');
  };

  return (
    <div className="strategy">
      <section>
        <h2>{i18n.whatIfTitle}</h2>
        <p className="sub">{i18n.whatIfIntro}</p>

        <div className="whatif-form">
          <label className="field">
            <span className="muted">{i18n.driverHeader}</span>
            <DriverPicker frame={frame} value={driver} onChange={pickDriver} label={i18n.driverHeader} />
          </label>
          {stops > 1 && (
            <label className="field">
              <span className="muted">{i18n.whichStop}</span>
              <select
                value={stopIndex}
                onChange={(e) => {
                  setStop(Number(e.target.value));
                  setLap(null);
                  setCompound('');
                }}
              >
                {Array.from({ length: stops }, (_, i) => (
                  <option key={i} value={i}>
                    {i18n.stopN(i + 1, stints[i][1])}
                  </option>
                ))}
              </select>
            </label>
          )}
          {range && (
            <label className="field grow">
              <span className="muted">
                {i18n.stopAtLap}: <strong className="num">{chosenLap}</strong>{' '}
                {chosenLap !== realLap && `(${i18n.realWas(realLap)})`}
              </span>
              <input
                type="range"
                min={range[0]}
                max={range[1]}
                value={chosenLap}
                onChange={(e) => setLap(Number(e.target.value))}
              />
            </label>
          )}
          {range && (
            <label className="field">
              <span className="muted">{i18n.nextTyre}</span>
              <select value={compound} onChange={(e) => setCompound(e.target.value)}>
                <option value="">{i18n.sameTyre(i18n.compound(stints[stopIndex + 1][2]))}</option>
                {compounds
                  .filter((c) => c !== stints[stopIndex + 1][2])
                  .map((c) => (
                    <option key={c} value={c}>
                      {i18n.compound(c)}
                    </option>
                  ))}
              </select>
            </label>
          )}
        </div>

        {stops === 0 && <p className="note muted">{i18n.whatIfNoStop(d?.code ?? '')}</p>}
        {result && !result.ok && <p className="note muted">{i18n.whatIfError[result.reason]}</p>}
      </section>

      {result?.ok && range && (
        <>
          <section>
            <div className="estimate-flag">{i18n.estimateFlag}</div>
            <div className="whatif-result">
              <div>
                <div className="label">{i18n.timeEffect}</div>
                <div className={`value serif ${result.delta < -0.05 ? 'is-good' : result.delta > 0.05 ? 'is-bad' : ''}`}>
                  {Math.abs(result.delta) < 0.05
                    ? i18n.noChange
                    : i18n.timeDelta(Math.abs(result.delta), result.delta < 0)}
                </div>
              </div>
              <div>
                <div className="label">{i18n.finishPosition}</div>
                <div className="value serif">
                  {result.realPosition}º
                  {result.estimatedPosition !== result.realPosition && (
                    <>
                      {' '}
                      → <span className={result.estimatedPosition < result.realPosition ? 'is-good' : 'is-bad'}>{result.estimatedPosition}º</span>
                    </>
                  )}
                </div>
                <div className="muted small">
                  {result.estimatedPosition === result.realPosition ? i18n.samePosition : i18n.realVsEstimated}
                </div>
              </div>
            </div>

            <StrategyBars
              total={race.totalLaps}
              real={stints.map(([from, to, c]) => ({ from, to, compound: c }))}
              simulated={stints.map(([from, to, c], i) => ({
                from: i === stopIndex + 1 ? chosenLap + 1 : from,
                to: i === stopIndex ? chosenLap : to,
                compound: i === stopIndex + 1 ? nextCompound : c,
              }))}
            />
          </section>

          <section>
            <h2>{i18n.assumptionsTitle}</h2>
            <ul className="assumptions">
              {result.models.map((m) => (
                <li key={m.compound}>
                  <strong style={{ color: TYRE_COLORS[m.compound] }}>{i18n.compound(m.compound)}</strong>:{' '}
                  {i18n.modelLine(m.degradation, m.laps)}
                </li>
              ))}
              <li>{i18n.assumeAffected(result.affected[0], result.affected[1])}</li>
              <li>{i18n.assumeEvolution(result.evolution)}</li>
              <li>{i18n.assumePace(d?.code ?? '')}</li>
              <li>{i18n.assumeIgnored}</li>
              {result.warnings.map((w) => (
                <li key={w} className="is-warning">
                  {i18n.whatIfWarning[w]}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

interface Bar {
  from: number;
  to: number;
  compound: string;
}

/** Duas linhas de stints, a real e a simulada, na mesma escala de voltas. */
function StrategyBars({ total, real, simulated }: { total: number; real: Bar[]; simulated: Bar[] }) {
  const W = 1000;
  const LEFT = 92;
  const x = (n: number) => LEFT + ((n - 1) / total) * (W - LEFT - 8);
  const row = (bars: Bar[], y: number, label: string) => (
    <g>
      <text x={0} y={y + 15} className="stint-code">
        {label}
      </text>
      {bars.map((b) => (
        <g key={b.from}>
          <rect x={x(b.from) + 1} y={y} width={Math.max(2, x(b.to + 1) - x(b.from) - 2)} height={22} rx={3} fill={TYRE_COLORS[b.compound] ?? '#8d8d99'} />
          <text x={(x(b.from) + x(b.to + 1)) / 2} y={y + 15} textAnchor="middle" className="bar-text">
            {b.to - b.from + 1}
          </text>
        </g>
      ))}
    </g>
  );
  return (
    <svg viewBox={`0 0 ${W} 70`} className="chart" role="img" aria-label={i18n.realVsEstimated}>
      {row(real, 4, i18n.realLabel)}
      {row(simulated, 38, i18n.simulatedLabel)}
    </svg>
  );
}
