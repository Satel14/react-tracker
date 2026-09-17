import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { METRIC_KEYS } from "./censusSnapshot";

// The census snapshot the page renders is not written by this codebase: the
// nightly workflow fetches /api/census/distribution and projects it field by
// field through a jq program, so a field the backend computes reaches the file
// only if that program names it.
//
// That is a silent failure by construction. Add a key to the API, forget the jq
// program, and every test here stays green while the page renders the old
// numbers for ever -- which is exactly what the tier-benchmarks package warned
// about and had no guard for. This is the guard.
const WORKFLOW = fileURLToPath(new URL("../../../.github/workflows/tier-census.yml", import.meta.url));

const jqProgram = () => {
  const yaml = readFileSync(WORKFLOW, "utf8");
  const body = yaml.split("<<'JQ'")[1];
  if (!body) throw new Error("the reading.jq heredoc is gone -- this guard is reading the wrong file");
  return body.split("\n          JQ")[0];
};

describe("the nightly projection carries everything the page reads", () => {
  const program = jqProgram();

  // Every numeric metric's mean and its interval, plus the quartiles that say
  // how wide the tier itself is. The interval is the uncertainty of the mean;
  // the quartiles are the spread of players. The page shows both.
  it.each(METRIC_KEYS)("projects %s with its mean, interval and quartiles", (key) => {
    for (const field of ["mean", "low", "high", "p25", "p50", "p75"]) {
      expect(program, `${key}.${field}`).toContain(`.metrics.${key}.${field}`);
    }
  });

  // A proportion has no quartiles: each sampled account contributes one match,
  // so its value is 0 or 1 and the cuts would read 0 / 0 / 1 on every tier.
  it("projects the no-kill share without quartiles", () => {
    for (const field of ["share", "low", "high"]) {
      expect(program).toContain(`.metrics.noKillShare.${field}`);
    }
    expect(program).not.toContain(".metrics.noKillShare.p50");
  });

  // StatsByRank quotes it to say how many accounts the published table rests on.
  it("projects the damage sample size the page quotes", () => {
    expect(program).toContain(".metrics.damage.n");
  });

  it("projects the row's own gate, which decides whether it is drawn at all", () => {
    for (const field of ["tier", "accounts", "publishable"]) {
      expect(program).toContain(field);
    }
  });
});
