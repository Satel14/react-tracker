import { useCallback, useEffect, useRef, useState } from "react";
import { createClockCore } from "../../helpers/replayClockCore";

export const useReplayClock = (duration) => {
  const clockRef = useRef(null);
  if (clockRef.current === null) clockRef.current = createClockCore({ duration });

  const [displayT, setDisplayT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeedState] = useState(4);

  useEffect(() => {
    clockRef.current.setDuration(duration);
    setDisplayT(clockRef.current.t);
  }, [duration]);

  const publish = useCallback(() => {
    const core = clockRef.current;
    setDisplayT(core.t);
    setPlaying(core.playing);
  }, []);

  const toggle = useCallback(() => {
    const core = clockRef.current;
    core.toggle();
    setPlaying(core.playing);
    setDisplayT(core.t);
  }, []);

  const play = useCallback(() => {
    const core = clockRef.current;
    core.play();
    setPlaying(true);
    setDisplayT(core.t);
  }, []);

  const pause = useCallback(() => {
    clockRef.current.pause();
    setPlaying(false);
  }, []);

  const seek = useCallback((v) => {
    const core = clockRef.current;
    core.seek(v);
    setPlaying(false);
    setDisplayT(core.t);
  }, []);

  const setSpeed = useCallback((v) => {
    clockRef.current.setSpeed(v);
    setSpeedState(v);
  }, []);

  return { clockRef, displayT, playing, speed, play, pause, toggle, seek, setSpeed, publish };
};
