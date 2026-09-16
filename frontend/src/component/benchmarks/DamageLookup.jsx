import React, { useState } from "react";

// Where a per-match damage average sits among the published tier AVERAGES.
//
// Averages, not intervals, and the wording that consumes this says only that.
// The published interval is the uncertainty of a tier's mean -- it narrows as
// the sample grows and says nothing about the spread of players inside the
// tier, which is what "is this typical for Gold" actually asks. Answering that
// needs per-tier percentiles, which this package does not publish.
//
// Sorted by the measured mean rather than by ladder position: the caller hands
// over whatever the snapshot held, and a table that arrived out of order would
// otherwise produce a confidently wrong bracket.
export const bracketFor = (rows, value) => {
  const ladder = (rows ?? [])
    .filter((row) => typeof row?.metrics?.damage?.mean === "number" && Number.isFinite(row.metrics.damage.mean))
    .sort((a, b) => a.metrics.damage.mean - b.metrics.damage.mean);

  if (!ladder.length || !Number.isFinite(value)) return { kind: "none", tiers: [] };

  const exact = ladder.find(({ metrics }) => metrics.damage.mean === value);
  if (exact) return { kind: "at", tiers: [exact.tier] };

  const below = ladder.filter(({ metrics }) => metrics.damage.mean < value);
  const above = ladder.filter(({ metrics }) => metrics.damage.mean > value);
  if (!below.length) return { kind: "below", tiers: [ladder[0].tier] };
  if (!above.length) return { kind: "above", tiers: [ladder[ladder.length - 1].tier] };

  return { kind: "between", tiers: [below[below.length - 1].tier, above[0].tier] };
};

const DamageLookup = ({ rows, t }) => {
  const [raw, setRaw] = useState("");

  const value = raw.trim() === "" ? NaN : Number(raw);
  const answer = Number.isFinite(value) ? bracketFor(rows, value) : null;
  const names = answer ? answer.tiers.map((tier) => t(`pages.statsByRank.tier.${tier}`)).join(" — ") : "";

  return (
    <div className="stats-by-rank__lookup">
      <label className="stats-by-rank__lookup-label" htmlFor="damage-lookup">
        {t("pages.statsByRank.lookup.label")}
      </label>
      <input
        id="damage-lookup"
        className="stats-by-rank__lookup-input"
        type="number"
        min="0"
        inputMode="numeric"
        value={raw}
        onChange={(event) => setRaw(event.target.value)}
      />
      {answer && answer.kind !== "none" && (
        <p className="stats-by-rank__lookup-answer" data-testid="lookup-answer">
          {`${t(`pages.statsByRank.lookup.${answer.kind}`)} ${names}`}
        </p>
      )}
      {/* Always rendered, not only alongside an answer. It is the sentence that
          stops the control being read as "which tier am I" -- the reading it
          cannot support -- so it has to be on screen before anyone types. */}
      <p className="stats-by-rank__lookup-note">{t("pages.statsByRank.lookup.note")}</p>
    </div>
  );
};

export default DamageLookup;
