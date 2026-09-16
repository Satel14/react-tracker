import React from "react";

// One row per published tier, in ladder order. The intervals ride in the cell
// titles rather than in the cells: five columns of "204 ±21" is a wall of
// arithmetic, and the number people came for is the point estimate.
//
// One formatter per column, applied to the bounds as well as to the estimate.
// Formatting the interval separately is how a cell reading "55%" ends up with a
// tooltip reading "0.5 - 0.6".
const whole = (value) => Math.round(value).toLocaleString();
const oneDecimal = (value) => value.toFixed(1);
const percent = (value) => `${Math.round(value * 100)}%`;

const COLUMNS = [
  { key: "damage", read: (m) => m.mean, format: whole },
  { key: "kills", read: (m) => m.mean, format: oneDecimal },
  { key: "minutesAlive", read: (m) => m.mean, format: oneDecimal },
  { key: "placement", read: (m) => m.mean, format: percent },
];

const NO_KILLS = { key: "noKillShare", read: (m) => m.share, format: percent };

const interval = (cell, format) =>
  cell && typeof cell.low === "number" && typeof cell.high === "number"
    ? `${format(cell.low)} – ${format(cell.high)}`
    : undefined;

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
            {[...COLUMNS, NO_KILLS].map(({ key, read, format }) => (
              <td key={key} title={interval(row.metrics[key], format)}>
                {format(read(row.metrics[key]))}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default BenchmarkTable;
