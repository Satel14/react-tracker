import { isAccountIdentifier, normalizePlatform } from "./playerIdentity";

/**
 * Groups Compare page slots ({ platform, id }) into batched name-resolve
 * requests, one per platform. Account ids need no resolve and are dropped;
 * ids are deduped by exact string (PUBG names are case-sensitive, so
 * differently-cased spellings may be different players and both survive).
 * A platform group is only returned when it has 2+ ids to resolve, since a
 * single-id batch costs the same as the normal per-slot lookup.
 */
export const buildCompareResolveBatches = (slots = []) => {
  const groups = new Map();

  slots.forEach((slot) => {
    if (!slot) return;
    const id = typeof slot.id === "string" ? slot.id.trim() : "";
    if (!id || isAccountIdentifier(id)) return;

    const platform = normalizePlatform(slot.platform);
    const ids = groups.get(platform) || [];
    if (!ids.includes(id)) ids.push(id);
    groups.set(platform, ids);
  });

  const batches = [];
  groups.forEach((gameIds, platform) => {
    if (gameIds.length >= 2) batches.push({ platform, gameIds });
  });
  return batches;
};
