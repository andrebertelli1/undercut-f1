import { useCallback, useEffect, useRef, useState } from 'react';

export const SPEEDS = [1, 2, 5, 10, 30];

export interface Player {
  t: number;
  playing: boolean;
  speed: number;
  seek: (t: number) => void;
  toggle: () => void;
  setSpeed: (speed: number) => void;
}

/** Relógio do replay: avança `speed` segundos de corrida por segundo real. */
export function usePlayer(tStart: number, tEnd: number, initial: number): Player {
  const [t, setT] = useState(initial);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(10);
  const tRef = useRef(initial);

  const seek = useCallback(
    (next: number) => {
      tRef.current = Math.max(tStart, Math.min(tEnd, next));
      setT(tRef.current);
    },
    [tStart, tEnd],
  );

  const toggle = useCallback(() => {
    // Tocar de novo no fim recomeça da largada.
    if (tRef.current >= tEnd) seek(tStart);
    setPlaying((p) => !p);
  }, [seek, tStart, tEnd]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      // Limita o salto depois de a aba ficar em segundo plano.
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      tRef.current = Math.min(tEnd, tRef.current + dt * speed);
      setT(tRef.current);
      if (tRef.current >= tEnd) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, tEnd]);

  return { t, playing, speed, seek, toggle, setSpeed };
}
