// The floating numbers that come off a marker when a player loses health.
//
// Only what a player RECEIVED. Who dealt it is already on the map -- the
// tracer runs from the shooter to them -- so a second number on the attacker
// says the same thing twice, and in a firefight it doubles the text on screen
// for nothing. The payload still carries the attacker; the roster's
// damage-dealt figure is a different feature on a different surface.
//
// A function of the playhead, holding no cursor -- the same reason feedAt and
// phaseAt are. The viewer scrubs, and a swept cursor would have to notice it
// went backwards and reset; this cannot be wrong about that because it has
// nothing to reset. It also means a PAUSED replay holds its numbers still
// rather than blinking them out, because age is measured in replay seconds
// and not against the wall clock.

export const DAMAGE = Object.freeze({
  // Replay seconds a number stays up. Long enough to read a two-digit number
  // while the eye is elsewhere, short enough that a firefight does not leave a
  // wall of text standing over it.
  lifetime: 1.6,
  // Numbers on screen at once. A squad wipe puts a dozen up inside a second
  // and past this they are stacking faster than anyone reads them.
  cap: 24,
});

const asArray = (value) => (Array.isArray(value) ? value : []);

export const damageAt = (events, t, options = {}) => {
  const list = asArray(events);
  if (!Number.isFinite(t)) return [];
  const lifetime = Number.isFinite(options.lifetime) ? options.lifetime : DAMAGE.lifetime;
  const cap = Number.isFinite(options.cap) ? options.cap : DAMAGE.cap;

  // Walked from the newest end and stopped at the first one too old, rather
  // than filtered over the whole match: the list is sorted by t and a frame
  // only ever needs its tail.
  const out = [];
  // How many numbers each marker is already carrying, so a burst stacks up the
  // screen instead of printing five numbers on one pixel.
  const seen = new Map();

  for (let i = list.length - 1; i >= 0; i -= 1) {
    const e = list[i];
    if (!e) continue;
    if (!Number.isFinite(e.t) || e.t > t) continue;
    const age = (t - e.t) / lifetime;
    if (age >= 1) break;
    if (!Number.isFinite(e.d) || e.d <= 0) continue;

    const player = e.v;
    if (!Number.isFinite(player) || player < 0) continue;
    if (out.length >= cap) return out;
    const stack = seen.get(player) || 0;
    seen.set(player, stack + 1);
    out.push({
      // Stable across re-renders while the number is alive: the same hit asked
      // for at two playhead positions is the same number, moved.
      id: `${e.t}:${player}`,
      player,
      amount: e.d,
      age,
      stack,
    });
  }
  return out;
};

export default damageAt;
