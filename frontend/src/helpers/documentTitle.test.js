import { describe, it, expect } from "vitest";
import { titleFor } from "./documentTitle";
import { routeMetaFor } from "./routeMeta";

// The same titles the server writes into the first page: the build's for fixed
// routes, the Pages Function's for the rest. A client-side visit must end up
// with the tab a fresh load of that URL would have.
describe("titleFor", () => {
  it("gives a fixed route the title its built page carries", () => {
    expect(titleFor("/")).toBe("PUBG Tracker - Player Stats & Leaderboards");
    expect(titleFor("/ranks")).toBe(routeMetaFor("/ranks").title);
    expect(titleFor("/ua/ranks")).toBe(routeMetaFor("/ua/ranks").title);
  });

  it("names the player from the address", () => {
    expect(titleFor("/player/steam/WhiteChaseSmoker")).toBe("WhiteChaseSmoker - PUBG stats, ranked RP and match history");
    expect(titleFor("/player/kakao/NPX_NeoBuLi")).toBe("NPX_NeoBuLi - PUBG stats, ranked RP and match history");
  });

  it("titles a match replay and the stream overlay", () => {
    expect(titleFor("/match/steam/abc/replay")).toBe("PUBG match replay - map, drops and the final circle");
    expect(titleFor("/overlay/steam/Someone")).toBe("PUBG stats overlay for OBS");
  });

  it("calls an unknown address what it is", () => {
    expect(titleFor("/no-such-page")).toBe("Page not found - PUBG Tracker");
  });

  it("ignores a query string", () => {
    expect(titleFor("/ranks?from=nav")).toBe(routeMetaFor("/ranks").title);
  });
});
