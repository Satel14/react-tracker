// Who a player actually queues with. PUBG records no party id anywhere -- not in
// the match record, not in the roster, not in the telemetry -- so this measures
// the only thing that is visible: how much of a squad-mate's own recent history
// they spent in this player's matches.
//
// Measured on live accounts 2026-09-09: the two mates a player really queues
// with sat at 69% and 86% of their own history, while every one-off squad-mate
// landed between 0.9% and 4.8%. Random matchmaking puts two strangers in the
// same lobby once or twice per hundred matches, so the floor is noise and the
// threshold below sits in the empty band between the two.
const PARTY_MIN_SHARED = 2;
const PARTY_MIN_SHARE_PCT = 15;

function toIdSet(values) {
  const set = new Set();
  (Array.isArray(values) ? values : []).forEach((value) => {
    const id = typeof value === "string" ? value.trim() : "";
    if (id) set.add(id);
  });
  return set;
}

function buildPartyOverlap({ focalMatchIds = [], mates = [] } = {}) {
  const focal = toIdSet(focalMatchIds);

  return (Array.isArray(mates) ? mates : [])
    .filter(Boolean)
    .map((mate) => {
      const theirs = toIdSet(mate.matchIds);
      let sharedMatches = 0;
      theirs.forEach((id) => {
        if (focal.has(id)) sharedMatches += 1;
      });

      const theirMatches = theirs.size;
      const sharePct = theirMatches > 0
        ? Number(((sharedMatches / theirMatches) * 100).toFixed(1))
        : 0;

      return {
        accountId: mate.accountId || null,
        name: mate.name || null,
        sharedMatches,
        theirMatches,
        sharePct,
        isParty: sharedMatches >= PARTY_MIN_SHARED && sharePct >= PARTY_MIN_SHARE_PCT,
      };
    })
    .sort((a, b) =>
      b.sharedMatches - a.sharedMatches ||
      b.sharePct - a.sharePct ||
      String(a.name || "").localeCompare(String(b.name || ""))
    );
}

module.exports = { buildPartyOverlap, PARTY_MIN_SHARED, PARTY_MIN_SHARE_PCT };
