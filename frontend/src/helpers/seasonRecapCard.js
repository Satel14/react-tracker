import { TIER_COLOURS } from "./censusChart.js";

export const RECAP_CARD_WIDTH = 1200;
export const RECAP_CARD_HEIGHT = 630;

const escapeXml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
})[char]);

const DASH = "—";
const known = (value) => typeof value === "number" && Number.isFinite(value);

// The recap's figures as text, shared by the block on the page and the image so
// the two cannot disagree. An unknown number is a dash, never a zero.
export const recapFigures = (recap, { language = "en" } = {}) => {
  const locale = language === "ua" ? "uk-UA" : "en-US";
  const whole = (value) => (known(value) ? new Intl.NumberFormat(locale).format(Math.round(value)) : DASH);
  const fixed = (value, digits) => (known(value)
    ? new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
    : DASH);
  const { ranked, records } = recap;

  return {
    rankPoint: whole(recap.rankPoint),
    peakRankPoint: known(recap.peakRankPoint) ? whole(recap.peakRankPoint) : null,
    tiles: [
      ["matches", whole(ranked.matches)],
      ["wins", whole(ranked.wins)],
      ["top10", known(ranked.top10Rate) ? `${whole(ranked.top10Rate)}%` : DASH],
      ["kd", fixed(ranked.kd, 2)],
      ["damage", whole(ranked.avgDamage)],
      ["place", fixed(ranked.avgPlace, 1)],
    ],
    records: [
      known(records.mostKills) ? ["mostKills", whole(records.mostKills)] : null,
      known(records.longestKill) ? ["longestKill", `${whole(records.longestKill)} m`] : null,
    ].filter(Boolean),
  };
};

// Inline image data only; quotes cannot appear in base64, so the value cannot
// break out of its attribute.
const INLINE_ICON = /^data:image\/(webp|png);base64,[A-Za-z0-9+/]+=*$/;

// Self-contained like the census chart: no remote fonts, images or links, so a
// browser can rasterise it from a blob without tainting the canvas. The rank
// icon, when given, is inline data.
export const seasonRecapSvg = (recap, { t, language = "en", playerName = "", platform = "", percentile = null, rankIcon = null }) => {
  const label = (key, values) => t(`pages.player.recap.${key}`, values);
  const text = (x, y, value, attributes = "") =>
    `<text x="${x}" y="${y}" ${attributes}>${escapeXml(value)}</text>`;

  const title = label(recap.finished ? "titleFinal" : "titleSoFar", { season: recap.season });
  const tierColour = TIER_COLOURS[recap.tier] || "#e7edf7";
  const figures = recapFigures(recap, { language });

  // 180 apart: the widest label, "Рейтингових матчів", measures 172px in 19px Arial.
  const tiles = figures.tiles.map(([key, value], index) => {
    const x = 630 + (index % 3) * 180;
    const y = 250 + Math.floor(index / 3) * 120;
    return text(x, y, label(key), 'fill="#aab9cd" font-size="19"')
      + text(x, y + 44, value, 'fill="#ffffff" font-size="38" font-weight="700"');
  }).join("");

  const recordParts = figures.records.map(([key, value]) => `${label(key)} ${value}`);
  const icon = typeof rankIcon === "string" && INLINE_ICON.test(rankIcon) ? rankIcon : null;
  const rankX = icon ? 200 : 60;

  const lines = [
    text(60, 76, "PUBG TRACKER", 'fill="#77f6a7" font-size="26" font-weight="700" letter-spacing="3"'),
    platform ? text(1140, 76, String(platform).toUpperCase(), 'fill="#aab9cd" font-size="22" text-anchor="end"') : "",
    text(60, 140, title, 'fill="#e7edf7" font-size="30"'),
    text(60, 206, playerName, 'fill="#ffffff" font-size="56" font-weight="700"'),
    icon ? `<image href="${icon}" x="60" y="236" width="120" height="120" preserveAspectRatio="xMidYMid meet" />` : "",
    text(rankX, 282, recap.tierLabel || DASH, `fill="${tierColour}" font-size="42" font-weight="700"`),
    text(rankX, 336, `${figures.rankPoint} RP`, 'fill="#ffffff" font-size="36" font-weight="700"'),
    figures.peakRankPoint
      ? text(rankX, 376, label("peak", { rp: figures.peakRankPoint }), 'fill="#aab9cd" font-size="22"')
      : "",
    known(percentile)
      ? text(60, 428, t("pages.player.percentile.line", { n: percentile }), 'fill="#77f6a7" font-size="24"')
      : "",
    tiles,
    recordParts.length
      ? text(60, 510, `${label("records")}: ${recordParts.join(" · ")}`, 'fill="#d6d9ee" font-size="22"')
      : "",
    `<line x1="60" y1="548" x2="1140" y2="548" stroke="#283549" />`,
    text(60, 590, "pubgtracker.top", 'fill="#77f6a7" font-size="22" font-weight="700"'),
    text(1140, 590, label("source"), 'fill="#8995a9" font-size="18" text-anchor="end"'),
  ].join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${RECAP_CARD_WIDTH}" height="${RECAP_CARD_HEIGHT}" viewBox="0 0 ${RECAP_CARD_WIDTH} ${RECAP_CARD_HEIGHT}" role="img" aria-labelledby="title" lang="${language === "ua" ? "uk" : "en"}" font-family="Arial, Helvetica, sans-serif">
  <title id="title">${escapeXml(`${playerName} — ${title}`)}</title>
  <rect width="${RECAP_CARD_WIDTH}" height="${RECAP_CARD_HEIGHT}" fill="#0d0918" />
  <rect x="0" y="0" width="${RECAP_CARD_WIDTH}" height="8" fill="${tierColour}" />
  ${lines}
</svg>`;
};

export const seasonRecapFilename = (recap, playerName, language) => {
  const name = String(playerName || "").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "player";
  return `pubg-season-${recap.season}-${name}-${language === "ua" ? "uk" : "en"}.png`;
};
