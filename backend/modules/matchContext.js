// Two facts about a match that live only in its telemetry: the server region and
// the weather. The /matches record carries neither.

const YEAR = /^(19|20)\d{2}$/;
const REGION = /^[a-z]{2,6}$/i;

// LogMatchDefinition.MatchId reads
// match.bro.<type>.<season>.<platform>.<gameMode>.<region>.<Y>.<M>.<D>.<H>.<uuid>.
// The region is read by position -- the token before the date -- because the
// segments around it vary by match type and the region list is KRAFTON's to
// change, not ours to enumerate.
function parseMatchRegion(matchId) {
  if (typeof matchId !== "string") return null;

  const parts = matchId.split(".");
  const dateAt = parts.findIndex((part) => YEAR.test(part));
  if (dateAt < 1) return null;

  const region = parts[dateAt - 1];
  return REGION.test(region) ? region.toLowerCase() : null;
}

// A ranged read stops mid-array, so the body cannot be parsed -- but the region
// only needs the one string, and LogMatchDefinition sits at the top of the file.
const MATCH_ID_IN_TEXT = /"MatchId"\s*:\s*"([^"]+)"/;

function readRegionFromTelemetryHead(body) {
  if (typeof body !== "string") return null;
  const found = body.match(MATCH_ID_IN_TEXT);
  return found ? parseMatchRegion(found[1]) : null;
}

function normalizeWeather(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readMatchContext(telemetry) {
  let region = null;
  let weather = null;

  for (const event of Array.isArray(telemetry) ? telemetry : []) {
    const type = event?._T;
    if (type === "LogMatchDefinition") region = parseMatchRegion(event.MatchId);
    else if (type === "LogMatchStart") weather = normalizeWeather(event.weatherId);
    if (region && weather) break;
  }

  return { region, weather };
}

module.exports = { parseMatchRegion, readMatchContext, readRegionFromTelemetryHead };
