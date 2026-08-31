export const lowerBound = (events, t) => {
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

export const createSweep = (events = []) => {
  const list = Array.isArray(events) ? events : [];
  const state = { cursor: 0 };
  return {
    get cursor() {
      return state.cursor;
    },
    reset(t) {
      state.cursor = lowerBound(list, t);
    },
    sweepTo(t) {
      const out = [];
      while (state.cursor < list.length && list[state.cursor].t <= t) {
        out.push(list[state.cursor]);
        state.cursor += 1;
      }
      return out;
    },
  };
};

export const pruneFlashes = (flashes, nowMs, lifetimeMs, cap) => {
  let write = 0;
  for (let i = 0; i < flashes.length; i += 1) {
    if (nowMs - flashes[i].bornMs <= lifetimeMs) {
      flashes[write] = flashes[i];
      write += 1;
    }
  }
  flashes.length = write;
  if (flashes.length > cap) flashes.splice(0, flashes.length - cap);
  return flashes;
};
