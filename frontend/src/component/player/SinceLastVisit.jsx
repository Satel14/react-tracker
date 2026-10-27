import React, { useEffect, useRef, useState } from "react";
import { getLanguage, translate } from "react-switch-lang";
import { readStoredItem, writeStoredItem } from "../../helpers/browserStorage";
import { trackEvent } from "../../helpers/analytics";
import { pluralUa } from "../../helpers/pluralUa";
import { changeSince, snapshotOf, timeAgo } from "../../helpers/sinceLastVisit";

export const SNAPSHOT_STORAGE_KEY = "profileSnapshots";
export const MAX_SNAPSHOTS = 30;
// Looks closer together than this are one visit. Within a visit the page may
// refresh, remount or be reloaded, and every one of those must keep comparing
// with the visit before -- otherwise the line vanishes the moment it is shown.
export const VISIT_GAP_MS = 30 * 60 * 1000;

const reported = new Set();

const readAll = () => {
  try {
    const parsed = JSON.parse(readStoredItem(SNAPSHOT_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const latestAt = (entry) => (typeof entry?.latest?.at === "number" ? entry.latest.at : -Infinity);

// Reads the look this one should be compared with, and records this one. Kept
// newest first and bounded, so a browser that looks up hundreds of players
// keeps the ones it is likely to come back to.
const lookAt = ({ key, ...reading }, at) => {
  const all = readAll();
  const entry = all[key] || {};
  const latest = entry.latest && typeof entry.latest.at === "number" ? entry.latest : null;
  const previous = latest && at - latest.at >= VISIT_GAP_MS ? latest : entry.previous || null;

  all[key] = { previous, latest: { ...reading, at } };
  const kept = Object.entries(all)
    .filter(([, value]) => value && typeof value === "object")
    .sort((a, b) => latestAt(b[1]) - latestAt(a[1]))
    .slice(0, MAX_SNAPSHOTS);
  writeStoredItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(Object.fromEntries(kept)));
  return previous;
};

const SinceLastVisit = ({ t, data, now = Date.now }) => {
  const snapshot = snapshotOf(data);
  const signature = snapshot ? JSON.stringify(snapshot) : null;
  const clock = useRef(now);
  clock.current = now;
  const [change, setChange] = useState(null);

  useEffect(() => {
    const current = signature ? JSON.parse(signature) : null;
    if (!current) {
      setChange(null);
      return;
    }
    const found = changeSince(lookAt(current, clock.current()), current);
    setChange(found);
    if (found && !reported.has(current.key)) {
      reported.add(current.key);
      trackEvent("since_last_visit", { platform: current.key.split(":")[0] });
    }
  }, [signature]);

  if (!change) return null;

  const language = getLanguage();
  const label = (key, values) => t(`pages.player.sinceLast.${key}`, values);
  const counted = (key, n) => {
    const forms = label(`${key}Words`).split("|");
    const word = language === "ua" ? pluralUa(n, forms) : forms[n === 1 ? 0 : 1];
    return label("count", { n, word });
  };

  const parts = [
    change.rankPoint ? label(change.rankPoint > 0 ? "rpUp" : "rpDown", { n: Math.abs(change.rankPoint) }) : null,
    change.tier ? label("tier", { tier: change.tier }) : null,
    change.matches > 0 ? counted("matches", change.matches) : null,
    change.wins > 0 ? counted("wins", change.wins) : null,
    change.kills > 0 ? counted("kills", change.kills) : null,
  ].filter(Boolean);

  return (
    <p className="since-last-visit" role="status">
      {label("lead", { when: timeAgo(clock.current() - change.since, language) })} {parts.join(" · ")}
    </p>
  );
};

export default translate(SinceLastVisit);
