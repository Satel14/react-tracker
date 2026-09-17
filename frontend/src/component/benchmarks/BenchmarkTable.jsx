import React from "react";

// One row per published tier, in ladder order. Each numeric cell is the tier's
// MEDIAN with its middle 50% under it, and the average keeps its old place in
// the cell title.
//
// Median rather than average because the question the page is read with is "is
// this normal for Gold", and an average of per-match damage is dragged up by
// the few enormous games. The quartile range answers the other half of it: the
// published interval is the uncertainty of the average and narrows as the
// sample grows, so it never said how far apart two players of one tier are.
//
// Nothing essential lives in the title. A phone cannot hover, and this page has
// already shipped copy that told a phone user to -- so the average is the
// secondary reading and the sentence under the table explains the visible pair.
//
// One formatter per column, applied to every number in it. Formatting the range
// separately is how a cell reading "55%" ends up with "0.5 - 0.6" beneath it.
const whole = (value) => Math.round(value).toLocaleString();
const oneDecimal = (value) => value.toFixed(1);
const percent = (value) => `${Math.round(value * 100)}%`;

const COLUMNS = [
  { key: "damage", format: whole },
  { key: "kills", format: oneDecimal },
  { key: "minutesAlive", format: oneDecimal },
  { key: "placement", format: percent },
];

const NO_KILLS = { key: "noKillShare", read: (m) => m.share, format: percent };

const finite = (value) => typeof value === "number" && Number.isFinite(value);

const interval = (cell, format) =>
  cell && finite(cell.low) && finite(cell.high)
    ? `${format(cell.low)} – ${format(cell.high)}`
    : undefined;

// The average and its interval, which the cell no longer prints.
const averageTitle = (cell, format, t) =>
  cell && finite(cell.mean) && finite(cell.low) && finite(cell.high)
    ? t("pages.statsByRank.table.cellTitle", {
      mean: format(cell.mean),
      low: format(cell.low),
      high: format(cell.high),
    })
    : undefined;

// A share has no quartiles: each sampled account contributes one match, so its
// value is 0 or 1 and the cuts would read the same on every tier. It keeps the
// single number and the interval it always had.
const ShareCell = ({ cell, format }) => (
  <td title={interval(cell, format)}>{format(cell.share)}</td>
);

const MetricCell = ({ cell, format, t }) => (
  <td title={averageTitle(cell, format, t)}>
    <span className="stats-by-rank__median">{format(cell.p50)}</span>
    <span className="stats-by-rank__spread">
      {`${format(cell.p25)} – ${format(cell.p75)}`}
    </span>
  </td>
);

const BenchmarkTable = ({ rows, t }) => {
  if (!rows?.length) return null;

  return (
    <table className="stats-by-rank__table">
      <thead>
        <tr>
          <th scope="col">{t("pages.statsByRank.table.tier")}</th>
          {[...COLUMNS, NO_KILLS].map(({ key }) => (
            <th scope="col" key={key}>{t(`pages.statsByRank.table.${key}`)}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.tier}>
            <th scope="row">{t(`pages.statsByRank.tier.${row.tier}`)}</th>
            {COLUMNS.map(({ key, format }) => (
              <MetricCell key={key} cell={row.metrics[key]} format={format} t={t} />
            ))}
            <ShareCell cell={row.metrics[NO_KILLS.key]} format={NO_KILLS.format} />
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default BenchmarkTable;
