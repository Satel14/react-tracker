import { RANK_LADDER } from "./rankLadder.js";
import { snapshotSeasonNumber, UNRANKED, usableSnapshot } from "./censusSnapshot.js";

export const CENSUS_CHART_WIDTH = 1600;
export const CENSUS_CHART_HEIGHT = 1080;
const TIERS = [...RANK_LADDER.map(({ key }) => key), UNRANKED];
const COLOURS = ["#cc936b", "#b9c7d8", "#f4ce72", "#70d7c5", "#acbcff", "#74c9ff", "#d39dff", "#ffac93", "#8995a9"];
const escapeXml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
})[char]);

const validDate = (value) => typeof value === "string"
  && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString().slice(0, 10) === value;

// A downloadable chart must carry a valid window and drawable intervals.
// Unpublished rows deliberately need no numeric values: none leave the chart.
export const canExportCensusChart = (data) => Boolean(
  usableSnapshot(data)
  && data.shard === "steam"
  && snapshotSeasonNumber(data)
  && Number.isSafeInteger(data.accounts) && data.accounts > 0
  && Number.isSafeInteger(data.matches) && data.matches > 0
  && validDate(data.firstDate) && validDate(data.lastDate)
  && data.firstDate <= data.lastDate
  && data.tiers.every((row) => TIERS.includes(row.tier))
  && new Set(data.tiers.map((row) => row.tier)).size === data.tiers.length
  && data.tiers.filter((row) => row.publishable).every((row) =>
    [row.low, row.share, row.high].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)
    && row.low <= row.share && row.share <= row.high && row.high > 0),
);

export const censusChartFilename = (data, language, format) =>
  `pubg-rank-distribution-s${snapshotSeasonNumber(data)}-${data.firstDate}-${data.lastDate}-${language === "ua" ? "uk" : "en"}.${format}`;

// Self-contained SVG: no remote fonts, images or scripts. It can be shared as
// a file or rasterised in a browser without tainting the canvas.
export const censusChartSvg = (data, { t, language = "en" }) => {
  if (!canExportCensusChart(data)) throw new Error("No exportable census sample");
  const label = (key, values) => t(`pages.ranks.distribution.chart.${key}`, values);
  const locale = language === "ua" ? "uk-UA" : "en-US";
  const number = (value) => new Intl.NumberFormat(locale).format(value);
  const percent = (value) => `${new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value * 100)}%`;
  const source = `https://www.pubgtracker.top/${language === "ua" ? "ua/" : ""}ranks#distribution`;
  const text = (x, y, value, attributes = "") =>
    `<text x="${x}" y="${y}" ${attributes}>${escapeXml(value)}</text>`;
  const measured = new Map(data.tiers.map((row) => [row.tier, row]));
  const published = data.tiers.filter((row) => row.publishable);
  // Round up to a readable axis limit, including the widest interval.
  const axisMax = Math.min(1, Math.ceil(Math.max(...published.map((row) => row.high)) * 10) / 10);
  const plotX = 280;
  const plotWidth = 830;
  const plotY = 396;
  const rowHeight = 48;
  const plotBottom = plotY + TIERS.length * rowHeight - 16;
  const x = (value) => plotX + value / axisMax * plotWidth;
  const grid = Array.from({ length: 5 }, (_, index) => {
    const value = axisMax * index / 4;
    return `<line x1="${x(value)}" y1="${plotY - 24}" x2="${x(value)}" y2="${plotBottom}" stroke="#283549" />`
      + text(x(value), plotBottom + 33, `${number(Math.round(value * 1000) / 10)}%`, 'fill="#aab9cd" font-size="19" text-anchor="middle"');
  }).join("");
  const rows = TIERS.map((key, index) => {
    const row = measured.get(key);
    const y = plotY + index * rowHeight;
    const name = key === UNRANKED ? t("pages.ranks.distribution.unranked") : key.charAt(0).toUpperCase() + key.slice(1);
    const nameText = text(80, y + 7, name, 'fill="#e7edf7" font-size="23"');
    if (!row?.publishable) {
      return `<g data-tier="${key}">${nameText}${text(plotX, y + 7, label("tooFew"), 'fill="#aab9cd" font-size="21"')}</g>`;
    }
    return `<g data-tier="${key}">${nameText}
      <rect x="${plotX}" y="${y - 14}" width="${x(row.share) - plotX}" height="28" rx="3" fill="${COLOURS[index]}" opacity="0.85" />
      <path d="M ${x(row.low)} ${y} H ${x(row.high)} M ${x(row.low)} ${y - 9} V ${y + 9} M ${x(row.high)} ${y - 9} V ${y + 9}" fill="none" stroke="#ffffff" stroke-width="3" />
      ${text(1220, y + 7, percent(row.share), 'fill="#ffffff" font-size="24" font-weight="700" text-anchor="end"')}
      ${text(1518, y + 7, `${percent(row.low)} – ${percent(row.high)}`, 'fill="#b7c5d8" font-size="21" text-anchor="end"')}
    </g>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CENSUS_CHART_WIDTH}" height="${CENSUS_CHART_HEIGHT}" viewBox="0 0 1600 1080" role="img" aria-labelledby="title description" lang="${language === "ua" ? "uk" : "en"}">
  <title id="title">${escapeXml(label("title"))} — ${escapeXml(label("season", { season: snapshotSeasonNumber(data) }))}</title>
  <desc id="description">${escapeXml(label("subtitle"))} ${escapeXml(data.firstDate)} – ${escapeXml(data.lastDate)}. ${escapeXml(label("method"))} ${escapeXml(source)}</desc>
  <rect width="1600" height="1080" fill="#0b1220" />
  <rect x="0" y="0" width="1600" height="8" fill="#70d7c5" />
  <g font-family="Arial, Helvetica, sans-serif">
    ${text(80, 65, "PUBG TRACKER / DATA", 'fill="#70d7c5" font-size="21" font-weight="700" letter-spacing="3"')}
    ${text(1520, 65, label(data.current === false ? "historical" : "dated"), 'fill="#aab9cd" font-size="20" text-anchor="end"')}
    ${text(80, 132, label("title"), 'fill="#ffffff" font-size="48" font-weight="700"')}
    ${text(80, 176, label("subtitle"), 'fill="#b7c5d8" font-size="23"')}
    <rect x="80" y="211" width="1440" height="104" rx="12" fill="#131f31" />
    ${text(106, 250, label("season", { season: snapshotSeasonNumber(data) }), 'fill="#ffffff" font-size="29" font-weight="700"')}
    ${text(106, 286, "PC (Steam)", 'fill="#aab9cd" font-size="21"')}
    ${text(385, 250, number(data.accounts), 'fill="#ffffff" font-size="29" font-weight="700"')}
    ${text(385, 286, label("accounts"), 'fill="#aab9cd" font-size="21"')}
    ${text(730, 250, number(data.matches), 'fill="#ffffff" font-size="29" font-weight="700"')}
    ${text(730, 286, label("matches"), 'fill="#aab9cd" font-size="21"')}
    ${text(1025, 250, `${data.firstDate} – ${data.lastDate}`, 'fill="#ffffff" font-size="25" font-weight="700"')}
    ${text(1025, 286, label("window"), 'fill="#aab9cd" font-size="21"')}
    ${text(80, 351, label("tier"), 'fill="#aab9cd" font-size="19"')}
    ${text(plotX, 351, label("share"), 'fill="#aab9cd" font-size="19"')}
    ${text(1518, 351, label("interval"), 'fill="#aab9cd" font-size="19" text-anchor="end"')}
    ${grid}${rows}
    <line x1="80" y1="878" x2="1520" y2="878" stroke="#283549" />
    ${text(80, 920, label("method"), 'fill="#b7c5d8" font-size="21"')}
    ${text(80, 953, label("limits"), 'fill="#b7c5d8" font-size="21"')}
    ${text(80, 986, label("uncertainty"), 'fill="#b7c5d8" font-size="21"')}
    <a href="${escapeXml(source)}">${text(80, 1040, source, 'fill="#70d7c5" font-size="23" font-weight="700"')}</a>
  </g>
</svg>\n`;
};
