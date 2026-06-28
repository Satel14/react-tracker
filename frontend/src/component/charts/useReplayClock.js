import { useCallback, useEffect, useRef, useState } from "react";
import { advanceClock } from "./replayEngine";

export const useReplayClock = (duration) => {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  const raf = useRef(null);
  const last = useRef(null);

  const stop = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    last.current = null;
  }, []);

  useEffect(() => {
    if (!playing) {
      stop();
      return undefined;
    }
    const tick = (now) => {
      if (last.current == null) last.current = now;
      const dtMs = now - last.current;
      last.current = now;
      setT((prev) => {
        const r = advanceClock(prev, dtMs, speed, duration || 0);
        if (!r.playing) setPlaying(false);
        return r.t;
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return stop;
  }, [playing, speed, duration, stop]);

  const play = useCallback(() => {
    setT((prev) => (prev >= (duration || 0) ? 0 : prev));
    setPlaying(true);
  }, [duration]);
  const pause = useCallback(() => setPlaying(false), []);
  const toggle = useCallback(() => (playing ? pause() : play()), [playing, pause, play]);
  const seek = useCallback((value) => { setPlaying(false); setT(Math.max(0, Math.min(duration || 0, value))); }, [duration]);

  return { t, playing, play, pause, toggle, seek, speed, setSpeed };
};
