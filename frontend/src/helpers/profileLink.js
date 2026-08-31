import { isAccountIdentifier, normalizePlatform } from "./playerIdentity";

// Where a player's name should link, or null when it should not link at all.
//
// The guard that matters is the bot one. A PUBG lobby is mostly AI -- 92 of
// the 100 entrants in the match this was measured on -- and a bot's display
// name looks exactly like a person's, so a scoreboard that links every name
// links ninety-two dead profiles. Only an "account.*" id is a real player.
//
// The second guard is the mirror of it: the backend falls a player whose name
// never appeared in the telemetry back to their account id, and
// /player/steam/account.abc is not a profile anybody can open.
export const profilePath = (platform, name, accountId) => {
  if (!isAccountIdentifier(accountId)) return null;
  return profilePathByName(platform, name);
};

// The same path WITHOUT the bot guard, for the one surface that has no ids to
// check it against: pubg.report answers with names only, so the Reports tab
// cannot tell a bot from a person and a bot's name there links to a "not
// found" page. Named apart from profilePath on purpose -- reaching for this
// where an id IS available would quietly throw the guard away.
export const profilePathByName = (platform, name) => {
  if (typeof name !== "string" || !name.trim()) return null;
  if (isAccountIdentifier(name)) return null;
  // The backend's own word for a name it does not have; a profile page for it
  // would be a 404 with a straight face.
  if (name.trim().toLowerCase() === "unknown") return null;
  // normalizePlatform defaults to steam rather than failing, and this follows
  // it instead of inventing a stricter rule for one link.
  return `/player/${normalizePlatform(platform)}/${encodeURIComponent(name.trim())}`;
};

export default profilePath;
