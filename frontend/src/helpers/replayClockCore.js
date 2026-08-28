import { advanceClock } from "../component/charts/replayEngine";

const MAX_FRAME_MS = 100;

export const createClockCore = ({ duration = 0, publishIntervalMs = 100 } = {}) => {
  let t = 0;
  let playing = false;
  let speed = 4;
  let lastNow = null;
  let lastPublish = -Infinity;
  const seekListeners = new Set();

  const notifySeek = () => {
    for (const cb of seekListeners) cb(t);
  };

  return {
    get t() { return t; },
    get playing() { return playing; },
    get speed() { return speed; },
    get duration() { return duration; },

    setSpeed(v) { speed = v; },

    setDuration(d) {
      duration = d;
      t = Math.max(0, Math.min(duration, t));
    },

    play() {
      const restarted = t >= duration;
      if (restarted) t = 0;
      playing = true;
      lastNow = null;
      if (restarted) notifySeek();
    },
    pause() { playing = false; lastNow = null; },
    toggle() { if (playing) this.pause(); else this.play(); },

    seek(v) {
      playing = false;
      lastNow = null;
      t = Math.max(0, Math.min(duration, v));
      notifySeek();
    },

    advance(nowMs) {
      if (!playing) { lastNow = nowMs; return { t, playing }; }
      if (lastNow === null) { lastNow = nowMs; return { t, playing }; }
      const dtMs = Math.min(nowMs - lastNow, MAX_FRAME_MS);
      lastNow = nowMs;
      const r = advanceClock(t, dtMs, speed, duration);
      t = r.t;
      playing = r.playing;
      return { t, playing };
    },

    shouldPublish(nowMs) {
      if (nowMs - lastPublish < publishIntervalMs) return false;
      lastPublish = nowMs;
      return true;
    },

    onSeek(cb) { seekListeners.add(cb); },
    offSeek(cb) { seekListeners.delete(cb); },
  };
};
