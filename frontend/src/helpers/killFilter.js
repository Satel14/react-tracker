// The kill map and the kill feed are two views of one list, so they have to
// narrow together. They did not: the time range was the map's own state and the
// All/Mine switch was the feed's, so each control moved one view and left the
// other showing a different set of kills under the same heading.
//
// `range` is null rather than [0, duration] until the slider is touched: the
// match duration is not always known when the pane mounts, and a [0, 0] window
// would filter every kill away.
export const filterKills = (kills = [], { range = null, focalOnly = false } = {}) =>
  (Array.isArray(kills) ? kills : []).filter((k) => {
    if (focalOnly && !k.isFocalKill && !k.isFocalDeath) return false;
    if (!range) return true;
    const at = k.t ?? 0;
    return at >= range[0] && at <= range[1];
  });

export default filterKills;
