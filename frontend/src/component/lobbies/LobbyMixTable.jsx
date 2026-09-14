import React from "react";
import { getLanguage } from "react-switch-lang";
import { RANK_LADDER } from "../../helpers/rankLadder";
import { lobbyMixRows, gatedMixRows, snapshotSeasonNumber, UNRANKED } from "../../helpers/censusSnapshot";

const groupDigits = (value) =>
  new Intl.NumberFormat(getLanguage() === "ua" ? "uk-UA" : "en-US").format(Number(value) || 0);

// Only the shard the census is drawn from has a label; the collector pins
// shard = "steam", so anything else prints its own name rather than a
// translation nobody wrote.
const platformLabel = (t, shard) =>
  shard === "steam" ? t("pages.rankedLobbies.platform") : shard || "";

// One decimal below ten percent or above ninety, none in between. A tier at
// 0.4% rounds to "0" at zero decimals, which reads as absent rather than
// rare; a tier at 99.6% rounds to "100" at zero decimals, which claims a
// tier fills the entire lobby. Both ends of the scale need the decimal for
// the same reason -- the middle does not, so it stays uncluttered.
const percent = (share) => {
  const value = (Number(share) || 0) * 100;
  const keepDecimal = value < 10 || value > 90;
  return new Intl.NumberFormat(getLanguage() === "ua" ? "uk-UA" : "en-US", {
    minimumFractionDigits: keepDecimal ? 1 : 0,
    maximumFractionDigits: keepDecimal ? 1 : 0,
  }).format(value);
};

// The tiers a fresh reading gated out, named with the lobby count each rests
// on -- built from the data rather than hardcoded, because which tiers clear
// ROW_MIN_LOBBIES shifts with the sample (a Master row appeared the very first
// week this shipped). Null when nothing was gated, so the caller renders no
// line rather than an empty sentence.
//
// A label-plus-list rather than a single sentence built around the tier
// names: "Master (12 lobbies) rest/rests on..." cannot agree with both one
// gated tier and several without a plural check no other copy in this file
// carries. The label sidesteps that, and the rule that follows names BOTH
// gate conditions (enough lobbies, and at least one other sampled player in
// them) rather than picking one -- a tier can fail either, and lobbyMix.js's
// own test "a row with no opponents at all is not publishable" pins the
// second as real, so a sentence that only ever blamed the lobby count would
// sometimes be false.
// English needs "1 lobby" against "12 lobbies"; Ukrainian's "лобі" is an
// indeclinable loanword and reads the same at every count, so its two keys
// hold the same word. Resolved from the dictionary rather than hardcoded
// here, same as every other word on this page.
const gatedUnit = (t, lobbies) =>
  Math.abs(Number(lobbies) || 0) === 1
    ? t("pages.rankedLobbies.limits.gatedUnitOne")
    : t("pages.rankedLobbies.limits.gatedUnitOther");

const gatedNote = (t, gated) => {
  if (!gated.length) return null;

  const entries = gated
    .map((row) =>
      t("pages.rankedLobbies.limits.gatedEntry", {
        tier: t(`pages.rankedLobbies.tier.${row.tier}`),
        lobbies: groupDigits(row.lobbies),
        unit: gatedUnit(t, row.lobbies),
      }),
    )
    .join(", ");

  return `${t("pages.rankedLobbies.limits.gatedLabel")} ${entries}. ${t("pages.rankedLobbies.limits.gatedRule")}`;
};

const LobbyMixTable = ({ t, data }) => {
  const payload = data ?? {};
  const rows = lobbyMixRows(payload);

  // The empty state is the launch state and the state after every season
  // rollover, so it is a first-class branch rather than a fallback: the prose
  // around this component still answers the question.
  if (!rows) {
    // No season number here on purpose: this snapshot is by definition the
    // last ARCHIVED season (the one with enough windows behind it), never the
    // one currently being collected, so there is no correct number to print.
    return <p className="ranked-lobbies__note">{t("pages.rankedLobbies.gathering")}</p>;
  }

  // Ladder order, and only the buckets some published row actually reports --
  // a column of nothing but blanks is a column about a tier we did not measure.
  const order = [...RANK_LADDER.map((tier) => tier.key), UNRANKED];
  const seen = new Set(rows.flatMap((row) => row.mix.map((cell) => cell.tier)));
  const columns = order.filter((tier) => seen.has(tier));

  // null, not 0: a real share is never 0 (a cell only exists when its count
  // is at least 1), so a tier this row never met is distinguishable from a
  // tier that measured a genuine near-zero share.
  const shareIn = (row, tier) => row.mix.find((cell) => cell.tier === tier)?.share ?? null;
  const gated = gatedNote(t, gatedMixRows(payload));

  return (
    <div className="ranked-lobbies__table-wrap">
      <p className="ranked-lobbies__lead">{t("pages.rankedLobbies.lead")}</p>

      <table className="ranked-lobbies__table">
        <caption className="ranked-lobbies__table-caption">
          {t("pages.rankedLobbies.table.heading")}
        </caption>
        <thead>
          <tr>
            <th scope="col">{t("pages.rankedLobbies.table.tierHeader")}</th>
            {columns.map((tier) => (
              <th scope="col" key={tier}>
                {t(`pages.rankedLobbies.tier.${tier}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.tier}>
              <th scope="row">{t(`pages.rankedLobbies.tier.${row.tier}`)}</th>
              {columns.map((tier) => {
                const share = shareIn(row, tier);
                return (
                  <td key={tier}>
                    {share === null ? "—" : t("pages.rankedLobbies.table.cell", { percent: percent(share) })}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {gated && <p className="ranked-lobbies__gated-note">{gated}</p>}

      {payload.current === false && (
        <p className="ranked-lobbies__stale">
          {t("pages.rankedLobbies.finished", { season: snapshotSeasonNumber(payload) })}
        </p>
      )}

      <p className="ranked-lobbies__note">
        {t("pages.rankedLobbies.sample", {
          accounts: groupDigits(payload.accounts),
          matches: groupDigits(payload.matches),
          platform: platformLabel(t, payload.shard),
          from: payload.firstDate,
          to: payload.lastDate,
        })}
      </p>
    </div>
  );
};

export default LobbyMixTable;
