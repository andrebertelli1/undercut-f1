import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { t as i18n } from '../../i18n/index.ts';
import { driverColor, type LoadedRace } from '../../lib/race.ts';
import type { Pt } from '../../lib/raceTypes.ts';
import { pointAt, sampleU, type FrameRow } from '../../lib/replay.ts';
import type { SectorView } from '../../lib/sectors.ts';

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
  sectors,
}: {
  race: LoadedRace;
  t: number;
  frame: FrameRow[];
  selected: number | null;
  onSelect: (driver: number | null) => void;
  /** Mostra só estes pilotos, em versão compacta (aba Comparar). */
  only?: number[];
  /** Limites dos setores e, com um piloto seguido, como ele está em cada um. */
  sectors?: { bounds: [number, number]; view: SectorView | null } | null;
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
        {sectors && !only && <SectorLayer points={track.points} bounds={sectors.bounds} view={sectors.view} />}

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

/**
 * Os três setores desenhados sobre a pista. Sem piloto seguido, só marca onde
 * cada setor fica; com um piloto, pinta cada trecho com a cor do setor dele
 * na volta em andamento.
 */
function SectorLayer({
  points,
  bounds,
  view,
}: {
  points: Pt[];
  bounds: [number, number];
  view: SectorView | null;
}) {
  const n = points.length;
  const cuts = [0, Math.round(bounds[0] * n), Math.round(bounds[1] * n), n];
  const at = (i: number) => points[((i % n) + n) % n];
  /** Vetor perpendicular à pista no ponto i, com o comprimento pedido. */
  const normal = (i: number, length: number): Pt => {
    const a = at(i - 1);
    const b = at(i + 1);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(-(b[1] - a[1]) / len) * length, ((b[0] - a[0]) / len) * length];
  };

  return (
    <g className="track-sectors">
      {[0, 1, 2].map((s) => {
        const pts: Pt[] = [];
        for (let i = cuts[s]; i <= cuts[s + 1]; i++) pts.push(at(i));
        const state = view?.current[s];
        const tone = !state
          ? 'is-idle'
          : state.state === 'done'
            ? `is-${state.color ?? 'unknown'}`
            : `is-${state.state}`;
        const mid = Math.round((cuts[s] + cuts[s + 1]) / 2);
        const [mx, my] = at(mid);
        const [ox, oy] = normal(mid, 46);
        return (
          <g key={s} className={`track-sector ${tone}`}>
            <path d={`M${pts.map((p) => p.join(',')).join('L')}`} />
            <text x={mx + ox} y={my + oy} dy="0.35em" textAnchor="middle">
              {i18n.sectorShort(s + 1)}
            </text>
          </g>
        );
      })}
      {[cuts[1], cuts[2]].map((i) => {
        const [x, y] = at(i);
        const [nx, ny] = normal(i, 20);
        return <line key={i} x1={x - nx} y1={y - ny} x2={x + nx} y2={y + ny} className="track-sector-tick" />;
      })}
    </g>
  );
}
