import { geoNaturalEarth1, geoPath } from 'd3-geo';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { feature, mesh } from 'topojson-client';
import world from 'world-atlas/countries-110m.json';
import { raceName, t } from '../i18n/index.ts';
import { readableOn, teamStyle } from '../lib/teams.ts';
import type { SeasonData } from '../lib/types.ts';

const MIN_ZOOM = 1;
const MAX_ZOOM = 10;
const ZOOM_STEP = 1.6;
/** Zoom aplicado ao focar uma etapa, para separar corridas vizinhas. */
const FOCUS_ZOOM = 2.6;
/** Faixa de latitudes mostrada: corta a Antártida e o extremo norte. */
const FRAME = {
  type: 'MultiPoint' as const,
  coordinates: [
    [-180, 0],
    [180, 0],
    [0, 80],
    [0, -56],
  ],
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const topology = world as any;
const LAND = feature(topology, topology.objects.land);
const BORDERS = mesh(topology, topology.objects.countries, (a: unknown, b: unknown) => a !== b);

interface View {
  k: number;
  x: number;
  y: number;
}

/**
 * Mapa-múndi plano que ocupa o centro da tela, com um marcador numerado por
 * etapa. A roda do mouse aproxima no ponto do cursor; arrastar move o mapa.
 */
export function WorldMap({
  data,
  asOf,
  focus,
  onFocus,
  pill,
  children,
}: {
  data: SeasonData;
  asOf: number;
  focus: number | null;
  onFocus: (round: number | null) => void;
  /** Texto do rótulo no alto do mapa. */
  pill: string;
  children?: ReactNode;
}) {
  const [size, setSize] = useState({ w: 900, h: 560 });
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 });
  const [hover, setHover] = useState<number | null>(null);
  const area = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; start: View; moved: boolean } | null>(null);
  const sizeRef = useRef(size);
  sizeRef.current = size;

  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      removeEventListener('resize', measure);
    };
  }, []);

  const { w, h } = size;
  const clamp = (v: View): View => {
    const { w: cw, h: ch } = sizeRef.current;
    const k = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.k));
    return {
      k,
      x: Math.max(cw - cw * k, Math.min(0, v.x)),
      y: Math.max(ch - ch * k, Math.min(0, v.y)),
    };
  };
  /** Muda o zoom mantendo fixo o ponto (px, py) da tela. */
  const zoomAt = (v: View, k: number, px: number, py: number): View => {
    const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, k));
    const f = next / v.k;
    return clamp({ k: next, x: px - (px - v.x) * f, y: py - (py - v.y) * f });
  };

  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      setView((v) =>
        zoomAt(v, v.k * Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top),
      );
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { landPath, borderPath, project } = useMemo(() => {
    const projection = geoNaturalEarth1().fitExtent(
      [
        [8, 44],
        [w - 8, h - 8],
      ],
      FRAME,
    );
    const path = geoPath(projection);
    return {
      landPath: path(LAND) ?? '',
      borderPath: path(BORDERS) ?? '',
      project: (lng: number, lat: number) => projection([lng, lat]) as [number, number],
    };
  }, [w, h]);

  // Ao focar uma etapa, aproxima e centraliza nela (deixando espaço para o card).
  useEffect(() => {
    if (focus === null) return;
    const r = data.rounds.find((x) => x.round === focus);
    if (!r) return;
    const [px, py] = project(r.lng, r.lat);
    setView((v) => {
      const k = Math.max(v.k, FOCUS_ZOOM);
      const targetX = w >= 700 ? w * 0.36 : w / 2;
      return clamp({ k, x: targetX - px * k, y: h / 2 - py * k });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, w, h]);

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    drag.current = { x: e.clientX, y: e.clientY, start: view, moved: false };
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) {
      d.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    setView(clamp({ k: d.start.k, x: d.start.x + dx, y: d.start.y + dy }));
  };
  const endDrag = () => {
    const d = drag.current;
    setTimeout(() => {
      if (drag.current === d) drag.current = null;
    }, 0);
  };
  const select = (round: number) => {
    if (drag.current?.moved) return;
    onFocus(focus === round ? null : round);
  };

  const rank = (round: number) => (round === focus ? 2 : round === hover ? 1 : 0);
  const markers = [...data.rounds].sort((a, b) => rank(a.round) - rank(b.round));
  const nextRound = data.rounds.find((r) => !r.raceDone)?.round;

  return (
    <div className="map-area" ref={area}>
      <svg
        ref={svg}
        viewBox={`0 0 ${w} ${h}`}
        className="map"
        role="group"
        aria-label={t.mapLabel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <g
          className={drag.current?.moved ? '' : 'map-layer'}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}
        >
          <path d={landPath} className="map-land" />
          <path d={borderPath} className="map-borders" />
        </g>

        {markers.map((r) => {
          const [px, py] = project(r.lng, r.lat);
          const x = px * view.k + view.x;
          const y = py * view.k + view.y;
          const done = r.raceDone && r.round <= asOf;
          const winner = done ? r.results.find((row) => row.pos === 1) : undefined;
          const color = winner ? teamStyle(winner.teamId).color : undefined;
          const active = r.round === focus || r.round === hover;
          return (
            <g
              key={r.round}
              className={`map-marker ${done ? 'is-done' : ''} ${active ? 'is-active' : ''}`}
              style={{ transform: `translate(${x}px, ${y}px)` }}
              role="button"
              tabIndex={0}
              aria-label={`${t.round(r.round)} · ${raceName(r.raceName)}`}
              aria-pressed={r.round === focus}
              onClick={() => select(r.round)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onFocus(focus === r.round ? null : r.round);
                }
              }}
              onPointerEnter={() => setHover(r.round)}
              onPointerLeave={() => setHover((v) => (v === r.round ? null : v))}
            >
              {r.round === nextRound && <circle r={15} className="map-next" />}
              {r.round === focus && <circle r={16} className="map-ring" />}
              <circle r={active ? 12 : 10} className="map-dot" style={color ? { fill: color } : undefined} />
              <text className="map-num" dy="0.35em" textAnchor="middle" style={color ? { fill: readableOn(color) } : undefined}>
                {r.round}
              </text>
              {active && (
                <text y={-20} textAnchor="middle" className="map-label">
                  {raceName(r.raceName)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="map-pill">{pill}</div>

      <div className="map-zoom">
        <button
          className="ghost"
          onClick={() => setView((v) => zoomAt(v, v.k * ZOOM_STEP, w / 2, h / 2))}
          disabled={view.k >= MAX_ZOOM}
          aria-label={t.zoomIn}
        >
          +
        </button>
        <button
          className="ghost"
          onClick={() => setView((v) => zoomAt(v, v.k / ZOOM_STEP, w / 2, h / 2))}
          disabled={view.k <= MIN_ZOOM}
          aria-label={t.zoomOut}
        >
          −
        </button>
        {view.k > 1 && (
          <button
            className="ghost"
            onClick={() => setView({ k: 1, x: 0, y: 0 })}
            aria-label={t.resetMap}
            title={t.resetMap}
          >
            ⤢
          </button>
        )}
      </div>

      <div className="map-legend muted">
        <span>
          <i className="legend-dot is-done" /> {t.legendDone}
        </span>
        <span>
          <i className="legend-dot" /> {t.upcoming}
        </span>
        <span>
          <i className="legend-dot is-next" /> {t.nextRace}
        </span>
        <span>{t.mapHint}</span>
      </div>

      {children}
    </div>
  );
}
