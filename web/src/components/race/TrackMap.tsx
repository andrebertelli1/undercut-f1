import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { t as i18n } from '../../i18n/index.ts';
import { driverColor, type LoadedRace } from '../../lib/race.ts';
import { pointAt, sampleU, type FrameRow } from '../../lib/replay.ts';

const PAD = 70;
const MAX_ZOOM = 6;
/** Carros que abandonaram somem da pista depois deste tempo. */
const RETIRED_LINGER = 20;

interface View {
  k: number;
  /** Deslocamento do centro, em unidades do desenho. */
  x: number;
  y: number;
}

/** O traçado com os carros na posição do instante `t`. A roda do mouse aproxima. */
export function TrackMap({
  race,
  t,
  frame,
  selected,
  onSelect,
  only,
}: {
  race: LoadedRace;
  t: number;
  frame: FrameRow[];
  selected: number | null;
  onSelect: (driver: number | null) => void;
  /** Mostra só estes pilotos, em versão compacta (aba Comparar). */
  only?: number[];
}) {
  const { data, u, track } = race;
  const svg = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; start: View; moved: boolean } | null>(null);

  const fullW = track.width + 2 * PAD;
  const fullH = track.height + 2 * PAD;
  const clamp = (v: View): View => {
    const k = Math.max(1, Math.min(MAX_ZOOM, v.k));
    const maxX = (fullW - fullW / k) / 2;
    const maxY = (fullH - fullH / k) / 2;
    return { k, x: Math.max(-maxX, Math.min(maxX, v.x)), y: Math.max(-maxY, Math.min(maxY, v.y)) };
  };

  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setView((v) => clamp({ ...v, k: v.k * Math.exp(-e.deltaY * 0.0015) }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullW, fullH]);

  const vbW = fullW / view.k;
  const vbH = fullH / view.k;
  const viewBox = `${-PAD + (fullW - vbW) / 2 + view.x} ${-PAD + (fullH - vbH) / 2 + view.y} ${vbW} ${vbH}`;

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    drag.current = { x: e.clientX, y: e.clientY, start: view, moved: false };
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || view.k === 1) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) {
      d.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    const rect = e.currentTarget.getBoundingClientRect();
    // O desenho se ajusta inteiro ao palco: a escala é a do lado mais apertado.
    const unitsPerPx = Math.max(vbW / rect.width, vbH / rect.height);
    setView(clamp({ k: d.start.k, x: d.start.x - dx * unitsPerPx, y: d.start.y - dy * unitsPerPx }));
  };
  const endDrag = () => {
    const d = drag.current;
    setTimeout(() => {
      if (drag.current === d) drag.current = null;
    }, 0);
  };
  const wasDrag = () => Boolean(drag.current?.moved);

  const d = `M${track.points.map((p) => p.join(',')).join('L')}Z`;

  // Linha de chegada: um traço atravessado no ponto 0.
  const p0 = track.points[0];
  const p1 = track.points[1];
  const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1;
  const nx = (-(p1[1] - p0[1]) / len) * 18;
  const ny = ((p1[0] - p0[0]) / len) * 18;

  // Do último para o primeiro, para o líder ficar por cima; o selecionado por último.
  const cars = [...frame]
    .filter((row) => !only || only.includes(row.driver.number))
    .reverse()
    .sort((a, b) => Number(a.driver.number === selected) - Number(b.driver.number === selected));

  return (
    <>
      <svg
        ref={svg}
        className={only ? "track is-mini" : "track"}
        viewBox={viewBox}
        role="group"
        aria-label={i18n.trackLabel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={() => !wasDrag() && onSelect(null)}
      >
        <path d={d} className="track-edge" />
        <path d={d} className="track-road" />
        <line x1={p0[0] - nx} y1={p0[1] - ny} x2={p0[0] + nx} y2={p0[1] + ny} className="track-finish" />

        {cars.map((row) => {
          const { driver } = row;
          const series = u[driver.number];
          if (!series) return null;
          if (driver.retiredAt !== null && t > driver.retiredAt + RETIRED_LINGER) return null;
          const [x, y] = pointAt(track.points, sampleU(series, data.replay.start, data.replay.hz, t));
          const color = driverColor(driver);
          const isSelected = driver.number === selected;
          const labelled = Boolean(only) || isSelected || (row.pos <= 3 && !row.retired);
          return (
            <g
              key={driver.number}
              className={`car ${isSelected ? 'is-selected' : ''} ${row.retired ? 'is-retired' : ''}`}
              transform={`translate(${x.toFixed(1)},${y.toFixed(1)})`}
              onClick={(e) => {
                e.stopPropagation();
                if (!wasDrag()) onSelect(isSelected ? null : driver.number);
              }}
            >
              <title>{`${row.pos}. ${driver.name}`}</title>
              <circle r={26} className="car-hit" />
              {isSelected && <circle r={22} className="car-ring" />}
              <circle r={13} className="car-dot" style={row.inPit ? { stroke: color } : { fill: color }} />
              {labelled && (
                <text y={-22} textAnchor="middle" className="car-label">
                  {driver.code}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {!only && <div className="track-tools muted">
        {view.k > 1 ? (
          <button className="ghost" onClick={() => setView({ k: 1, x: 0, y: 0 })}>
            {i18n.resetZoom}
          </button>
        ) : (
          i18n.trackHint
        )}
      </div>}
    </>
  );
}
