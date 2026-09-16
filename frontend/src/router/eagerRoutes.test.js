import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(fileURLToPath(new URL("./routes.js", import.meta.url)), "utf8");

// A prerendered route ships its whole article in the static HTML. Loading its
// component with React.lazy throws that away and renders a spinner for one
// frame -- measured at 0.145 CLS on /stats-by-rank and 0.164 on /ranks --
// because React suspends on first render whether or not the chunk is cached.
const EAGER = ["Help", "Ranks", "RankPoints", "RankedLobbies", "StatsByRank"];

// Leaderboard stays lazy on purpose: its chunk is 176 KB, half the main bundle,
// and loading it eagerly would not help anyway -- its shell is only the intro
// while the route renders the whole table, so the two differ by design and the
// shift has a different cause. Measured separately at CLS 0.351; a known,
// pre-existing defect that is not this work to fix.
const STAYS_LAZY = ["Leaderboard", "PlayerPage", "Player", "FavoritesPage",
  "BugReportPage", "Compare", "Overlay", "MatchReplayPage"];

describe("prerendered routes load eagerly", () => {
  it.each(EAGER)("%s is a static import", (name) => {
    expect(source, `${name} is still lazy`).toContain(`import ${name} from "../pages/${name}"`);
    expect(source).not.toContain(`const ${name} = lazy(`);
  });

  it.each(STAYS_LAZY)("%s stays lazy", (name) => {
    expect(source, `${name} should not have been made eager`).toContain(`const ${name} = lazy(`);
  });
});
