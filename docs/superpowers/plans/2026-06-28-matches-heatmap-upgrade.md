# Matches Heatmap Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the Matches heatmap on the real PUBG map image, in both a single-match marker mode and an aggregate density mode that accumulates across matches, surfaced in a new "Maps" tab.

**Architecture:** A reusable `<MapField>` renders the real map image with zoom/pan and hosts overlay layers. Single-match uses an SVG marker overlay (`viewBox = 0 0 mapMax mapMax`, world coords plotted directly). Aggregate uses a hand-rolled canvas density renderer fed by points the backend accumulates per `(player, map)` — reusing the existing single-match telemetry parser, persisted via the same mutation-queue pattern as recent searches.

**Tech Stack:** React 18 (Vite), Ant Design 5.15.3, SVG + Canvas 2D (no new rendering dependency), Express (CommonJS), Node built-in `node:test` for backend units, **Vitest** + React Testing Library for frontend.

## Global Constraints

- **Commits:** Do NOT auto-commit. After each task, stop and let the user review; commit only on explicit go-ahead. The `git commit` steps below mark logical checkpoints, not license to commit automatically.
- **Commit messages:** Conventional Commits (`feat:`/`fix:`/`chore:`/`test:`). NO `Co-Authored-By` trailer in this repo.
- **Frontend style:** 2-space indent, semicolons, ESM. Components `PascalCase`, helpers `camelCase`. Ant Design + SCSS in `frontend/src/style/style.scss`.
- **Backend style:** 2-space indent, semicolons, CommonJS (`require`/`module.exports`).
- **Build tool is Vite** (not CRA — `CLAUDE.md` is stale on this). Frontend tests run on **Vitest** (jsdom env, `globals: true`, `@testing-library/jest-dom`), invoked as `npm test -- <pathSubstring>`. Backend tests use the built-in `node:test` runner. **No new runtime dependencies** for rendering (heat layer is hand-rolled); the only new dependencies are dev-only test tooling (`vitest`, `jsdom`), set up in Task 0.
- **Mirrored logic:** map metadata exists in both `backend/modules/mapMeta.js` and `frontend/src/helpers/mapMeta.js` (same `displayName`/`mapMax` table). Changes must be made in both, like `playerIdentity.js`.
- **Coordinates:** telemetry units kept as `cm / 100`. Origin is top-left; **Y axis points down — do NOT flip Y**. `pixel = (world / mapMax) * imageSize`.
- **Comments:** keep minimal; no explanatory paragraphs above lint-disable directives.
- Don't rename top-level folders (`component/`, `Language/`, etc.).

## File Structure

**Create**
- `backend/modules/mapMeta.js` — `getMapMeta(rawMapName)` → `{ displayName, mapMax }`; precise `mapMax` table.
- `backend/modules/mapMeta.test.js` — unit tests (node:test).
- `backend/modules/heatmapAggregate.js` — persistent accumulator: `addMatchPoints`, `getAggregate`, `aggregateKey`.
- `backend/modules/heatmapAggregate.test.js` — unit tests (node:test).
- `frontend/src/helpers/mapMeta.js` — mirror of the table + `worldToPercent`, plus the imported map image per map.
- `frontend/src/helpers/mapMeta.test.js` — unit tests (Jest).
- `frontend/src/img/maps/*.webp` — downscaled official map images.
- `frontend/src/component/charts/MapField.jsx` — reusable map image + zoom/pan + overlay host.
- `frontend/src/component/charts/MapField.test.jsx` — unit tests (Jest/RTL).
- `frontend/src/component/charts/heatLayer.js` — pure canvas density helpers (`buildGradient`, `drawHeat`).
- `frontend/src/component/charts/heatLayer.test.js` — unit tests (Jest).
- `frontend/src/component/charts/AggregateHeatmap.jsx` — aggregate density view on `MapField`.
- `frontend/src/pages/MapsTab.jsx` — the "Maps" tab content (map selector, single/aggregate toggle).

**Modify**
- `backend/package.json` — add `"test": "node --test"`.
- `backend/modules/getMatchHeatmap.js` — use `mapMeta`; accumulate points after build.
- `backend/controllers/player.js` — add `getPlayerHeatmapAggregate`.
- `backend/routes/player.js` — register `POST /api/player/heatmap/aggregate`.
- `frontend/src/component/charts/MatchHeatmap.jsx` — render markers over `<MapField>` (real map) instead of the abstract SVG grid.
- `frontend/src/api/player.js` — add `getAggregateHeatmap`.
- `frontend/src/pages/PlayerPage.jsx` — add the "Maps" tab to `tabItems` (near line 1198–1252).
- `frontend/src/Language/en.json` + `frontend/src/Language/ua.json` — new keys under `pages.maps.*` (+ reuse `pages.matchHeatmap.*`).
- `frontend/src/style/style.scss` — `.map-field`, `.aggregate-heatmap`, `.maps-tab` styles.

---

## Phase 0 — Foundation

### Task 1: Map metadata module (backend + frontend mirror)

**Files:**
- Create: `backend/modules/mapMeta.js`
- Test: `backend/modules/mapMeta.test.js`
- Create: `frontend/src/helpers/mapMeta.js`
- Test: `frontend/src/helpers/mapMeta.test.js`
- Modify: `backend/package.json` (add test script)

**Interfaces:**
- Produces (backend): `getMapMeta(rawMapName) -> { displayName: string, mapMax: number }`. Unknown map → `{ displayName: <name minus _Main>, mapMax: 8160 }`.
- Produces (frontend): `getMapMeta(rawMapName) -> { displayName, mapMax, image }` where `image` is an imported asset URL (string); plus `worldToPercent(coord, mapMax) -> number` (0–100), and `MAP_LIST` (array of `{ rawMapName, displayName }` for selectors).

- [ ] **Step 1: Add the backend test script**

In `backend/package.json`, add to `"scripts"`:

```json
"test": "node --test"
```

- [ ] **Step 2: Write the failing backend test**

Create `backend/modules/mapMeta.test.js`:

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getMapMeta } = require("./mapMeta");

test("returns precise mapMax for Erangel variants", () => {
  assert.equal(getMapMeta("Baltic_Main").mapMax, 8160);
  assert.equal(getMapMeta("Erangel_Main").mapMax, 8160);
  assert.equal(getMapMeta("Baltic_Main").displayName, "Erangel");
});

test("returns precise mapMax for smaller maps", () => {
  assert.equal(getMapMeta("Savage_Main").mapMax, 4080);
  assert.equal(getMapMeta("Summerland_Main").mapMax, 2040);
  assert.equal(getMapMeta("Heaven_Main").mapMax, 1020);
});

test("falls back gracefully for unknown maps", () => {
  const meta = getMapMeta("Future_Main");
  assert.equal(meta.mapMax, 8160);
  assert.equal(meta.displayName, "Future");
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd backend && npm test`
Expected: FAIL — `Cannot find module './mapMeta'`.

- [ ] **Step 4: Implement the backend module**

Create `backend/modules/mapMeta.js`:

```js
const MAP_META = {
  Baltic_Main: { displayName: "Erangel", mapMax: 8160 },
  Erangel_Main: { displayName: "Erangel", mapMax: 8160 },
  Desert_Main: { displayName: "Miramar", mapMax: 8160 },
  Tiger_Main: { displayName: "Taego", mapMax: 8160 },
  Kiki_Main: { displayName: "Deston", mapMax: 8160 },
  Neon_Main: { displayName: "Rondo", mapMax: 8160 },
  DihorOtok_Main: { displayName: "Vikendi", mapMax: 8160 },
  Savage_Main: { displayName: "Sanhok", mapMax: 4080 },
  Chimera_Main: { displayName: "Paramo", mapMax: 3060 },
  Summerland_Main: { displayName: "Karakin", mapMax: 2040 },
  Range_Main: { displayName: "Camp Jackal", mapMax: 2040 },
  Heaven_Main: { displayName: "Haven", mapMax: 1020 },
};

function getMapMeta(rawMapName) {
  const meta = MAP_META[rawMapName];
  if (meta) return meta;
  return {
    displayName: (rawMapName || "Unknown").replace(/_Main$/i, ""),
    mapMax: 8160,
  };
}

module.exports = { MAP_META, getMapMeta };
```

- [ ] **Step 5: Run the backend test to verify it passes**

Run: `cd backend && npm test`
Expected: PASS (3 mapMeta tests).

- [ ] **Step 6: Write the failing frontend test**

Create `frontend/src/helpers/mapMeta.test.js`:

```js
import { getMapMeta, worldToPercent, MAP_LIST } from "./mapMeta";

test("maps raw names to display names and mapMax", () => {
  expect(getMapMeta("Baltic_Main").displayName).toBe("Erangel");
  expect(getMapMeta("Savage_Main").mapMax).toBe(4080);
});

test("worldToPercent converts world coord to 0-100 along mapMax", () => {
  expect(worldToPercent(0, 8160)).toBe(0);
  expect(worldToPercent(8160, 8160)).toBe(100);
  expect(worldToPercent(4080, 8160)).toBe(50);
});

test("MAP_LIST contains Erangel once and excludes the legacy duplicate", () => {
  const erangel = MAP_LIST.filter((m) => m.displayName === "Erangel");
  expect(erangel).toHaveLength(1);
});
```

- [ ] **Step 7: Run the frontend test to verify it fails**

Run: `cd frontend && npm test -- mapMeta`
Expected: FAIL — cannot resolve `./mapMeta`.

- [ ] **Step 8: Implement the frontend module**

Create `frontend/src/helpers/mapMeta.js`. (Image imports are added in Task 2; until then `image: null` so this task's tests pass independently.)

```js
const MAP_META = {
  Baltic_Main: { displayName: "Erangel", mapMax: 8160, image: null },
  Erangel_Main: { displayName: "Erangel", mapMax: 8160, image: null },
  Desert_Main: { displayName: "Miramar", mapMax: 8160, image: null },
  Tiger_Main: { displayName: "Taego", mapMax: 8160, image: null },
  Kiki_Main: { displayName: "Deston", mapMax: 8160, image: null },
  Neon_Main: { displayName: "Rondo", mapMax: 8160, image: null },
  DihorOtok_Main: { displayName: "Vikendi", mapMax: 8160, image: null },
  Savage_Main: { displayName: "Sanhok", mapMax: 4080, image: null },
  Chimera_Main: { displayName: "Paramo", mapMax: 3060, image: null },
  Summerland_Main: { displayName: "Karakin", mapMax: 2040, image: null },
  Range_Main: { displayName: "Camp Jackal", mapMax: 2040, image: null },
  Heaven_Main: { displayName: "Haven", mapMax: 1020, image: null },
};

export const getMapMeta = (rawMapName) => {
  const meta = MAP_META[rawMapName];
  if (meta) return meta;
  return {
    displayName: (rawMapName || "Unknown").replace(/_Main$/i, ""),
    mapMax: 8160,
    image: null,
  };
};

export const worldToPercent = (coord, mapMax) => {
  if (!mapMax) return 0;
  return (coord / mapMax) * 100;
};

export const MAP_LIST = [
  { rawMapName: "Baltic_Main", displayName: "Erangel" },
  { rawMapName: "Desert_Main", displayName: "Miramar" },
  { rawMapName: "Tiger_Main", displayName: "Taego" },
  { rawMapName: "Kiki_Main", displayName: "Deston" },
  { rawMapName: "Neon_Main", displayName: "Rondo" },
  { rawMapName: "DihorOtok_Main", displayName: "Vikendi" },
  { rawMapName: "Savage_Main", displayName: "Sanhok" },
  { rawMapName: "Chimera_Main", displayName: "Paramo" },
  { rawMapName: "Summerland_Main", displayName: "Karakin" },
  { rawMapName: "Range_Main", displayName: "Camp Jackal" },
  { rawMapName: "Heaven_Main", displayName: "Haven" },
];

export default MAP_META;
```

- [ ] **Step 9: Run the frontend test to verify it passes**

Run: `cd frontend && npm test -- mapMeta`
Expected: PASS (3 mapMeta tests).

- [ ] **Step 10: Commit**

```bash
git add backend/package.json backend/modules/mapMeta.js backend/modules/mapMeta.test.js frontend/src/helpers/mapMeta.js frontend/src/helpers/mapMeta.test.js
git commit -m "feat: add shared map metadata with precise map scale"
```

---

### Task 2: Map background images

**Files:**
- Already present (downloaded by the controller): `frontend/src/img/maps/{erangel,miramar,taego,deston,rondo,vikendi,sanhok,paramo,karakin,camp_jackal,haven}.png`
- Modify: `frontend/src/helpers/mapMeta.js` (wire image imports)

**Interfaces:**
- Produces: each `MAP_META[*].image` resolves to a bundled image URL string consumed by `<MapField>`.

**Note:** The 11 map images are ALREADY downloaded into `frontend/src/img/maps/` (official `pubg/api-assets` `*_No_Text_Low_Res.png`, served directly from `raw.githubusercontent.com` — they are NOT Git-LFS). Each is a square **819×819 PNG**, ~1–1.6 MB, lazy-loaded one at a time by the browser. No resize/ImageMagick needed — ship the PNGs as-is. This task only wires the imports + adds the presence test + commits.

- [ ] **Step 1: Verify the 11 images are present**

Run: `cd frontend && node -e "const fs=require('fs');const d='src/img/maps';const got=fs.readdirSync(d).filter(f=>f.endsWith('.png')).sort();console.log(got.length, got.join(','))"`
Expected: `11 camp_jackal.png,deston.png,erangel.png,haven.png,karakin.png,miramar.png,paramo.png,rondo.png,sanhok.png,taego.png,vikendi.png`

- [ ] **Step 2: Wire image imports into the frontend map registry**

Edit `frontend/src/helpers/mapMeta.js`: add these imports at the top and replace each `image: null` with the imported URL. Both Erangel entries use the same import.

```js
import erangel from "../img/maps/erangel.png";
import miramar from "../img/maps/miramar.png";
import taego from "../img/maps/taego.png";
import deston from "../img/maps/deston.png";
import rondo from "../img/maps/rondo.png";
import vikendi from "../img/maps/vikendi.png";
import sanhok from "../img/maps/sanhok.png";
import paramo from "../img/maps/paramo.png";
import karakin from "../img/maps/karakin.png";
import campJackal from "../img/maps/camp_jackal.png";
import haven from "../img/maps/haven.png";
```

Then set the `image` field per entry: `Baltic_Main`/`Erangel_Main` → `erangel`, `Desert_Main` → `miramar`, `Tiger_Main` → `taego`, `Kiki_Main` → `deston`, `Neon_Main` → `rondo`, `DihorOtok_Main` → `vikendi`, `Savage_Main` → `sanhok`, `Chimera_Main` → `paramo`, `Summerland_Main` → `karakin`, `Range_Main` → `campJackal`, `Heaven_Main` → `haven`. (The fallback entry in `getMapMeta` keeps `image: null`.)

- [ ] **Step 3: Update the test for image presence**

Append to `frontend/src/helpers/mapMeta.test.js`:

```js
test("known maps resolve to an image asset", () => {
  expect(getMapMeta("Baltic_Main").image).toBeTruthy();
  expect(getMapMeta("Savage_Main").image).toBeTruthy();
});
```

- [ ] **Step 4: Run frontend tests**

Run: `cd frontend && npm test -- mapMeta`
Expected: PASS (4 tests). (Under Vitest, Vite resolves `.png` imports to a URL string, so `image` is truthy.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/img/maps frontend/src/helpers/mapMeta.js frontend/src/helpers/mapMeta.test.js
git commit -m "feat: add PUBG map images for heatmap backgrounds"
```

---

### Task 3: `<MapField>` component (image + zoom/pan + overlay host)

**Files:**
- Create: `frontend/src/component/charts/MapField.jsx`
- Test: `frontend/src/component/charts/MapField.test.jsx`
- Modify: `frontend/src/style/style.scss`

**Interfaces:**
- Consumes: `getMapMeta` (Task 1), image URLs (Task 2).
- Produces: `<MapField rawMapName={string} className={string}>{children}</MapField>`. Renders a square stage with the map `<img>` and any `children` overlaid (absolute, inset 0). Wheel zooms (clamped 1–6×, cursor-centered), drag pans. Also exports the pure helper `clampZoom(next, min=1, max=6) -> number`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/component/charts/MapField.test.jsx`:

```jsx
import React from "react";
import { render, screen } from "@testing-library/react";
import MapField, { clampZoom } from "./MapField";

test("clampZoom keeps zoom within bounds", () => {
  expect(clampZoom(0.2)).toBe(1);
  expect(clampZoom(99)).toBe(6);
  expect(clampZoom(2.5)).toBe(2.5);
});

test("renders the map image for the given map", () => {
  render(<MapField rawMapName="Baltic_Main" />);
  const img = screen.getByRole("img", { name: /erangel/i });
  expect(img).toBeInTheDocument();
});

test("renders overlay children", () => {
  render(
    <MapField rawMapName="Baltic_Main">
      <div data-testid="overlay">x</div>
    </MapField>
  );
  expect(screen.getByTestId("overlay")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm test -- MapField`
Expected: FAIL — cannot resolve `./MapField`.

- [ ] **Step 3: Implement `MapField.jsx`**

Create `frontend/src/component/charts/MapField.jsx`:

```jsx
import React, { useRef, useState, useCallback } from "react";
import { getMapMeta } from "../../helpers/mapMeta";

export const clampZoom = (next, min = 1, max = 6) =>
  Math.min(max, Math.max(min, next));

const MapField = ({ rawMapName, className = "", children }) => {
  const meta = getMapMeta(rawMapName);
  const stageRef = useRef(null);
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const drag = useRef(null);

  const onWheel = useCallback((e) => {
    e.preventDefault();
    setView((v) => {
      const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
      const zoom = clampZoom(v.zoom * factor);
      return { ...v, zoom };
    });
  }, []);

  const onMouseDown = (e) => {
    drag.current = { startX: e.clientX, startY: e.clientY, baseX: view.x, baseY: view.y };
  };
  const onMouseMove = (e) => {
    if (!drag.current) return;
    setView((v) => ({
      ...v,
      x: drag.current.baseX + (e.clientX - drag.current.startX),
      y: drag.current.baseY + (e.clientY - drag.current.startY),
    }));
  };
  const endDrag = () => {
    drag.current = null;
  };

  return (
    <div
      ref={stageRef}
      className={`map-field ${className}`}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
    >
      <div
        className="map-field__viewport"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
      >
        {meta.image ? (
          <img className="map-field__bg" src={meta.image} alt={meta.displayName} draggable={false} />
        ) : (
          <div className="map-field__bg map-field__bg--missing" />
        )}
        {children}
      </div>
    </div>
  );
};

export default MapField;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npm test -- MapField`
Expected: PASS (3 tests).

- [ ] **Step 5: Add styles**

Append to `frontend/src/style/style.scss`:

```scss
.map-field {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  border-radius: 12px;
  background: #080e18;
  cursor: grab;
  user-select: none;

  &:active { cursor: grabbing; }

  &__viewport {
    position: absolute;
    inset: 0;
    transform-origin: 0 0;
  }

  &__bg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    pointer-events: none;

    &--missing { background: #11182a; }
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/component/charts/MapField.jsx frontend/src/component/charts/MapField.test.jsx frontend/src/style/style.scss
git commit -m "feat: add MapField map image component with zoom and pan"
```

---

## Phase 1 — Single-match heatmap on the real map

### Task 4: Refactor `MatchHeatmap` to render markers over `MapField`

**Files:**
- Modify: `frontend/src/component/charts/MatchHeatmap.jsx`
- Test: `frontend/src/component/charts/MatchHeatmap.test.jsx` (create)

**Interfaces:**
- Consumes: `MapField` (Task 3), `getMapMeta` (Task 1), existing `getMatchHeatmap` API.
- Produces: unchanged props (`open, onClose, matchId, shard, accountId, playerName, mapNameHint, rawMapNameHint, t`). Internally, markers are an SVG overlay with `viewBox="0 0 mapMax mapMax"` over the map image, so existing world-coordinate marker code is reused.

- [ ] **Step 1: Write a failing render test**

Create `frontend/src/component/charts/MatchHeatmap.test.jsx`:

```jsx
import React from "react";
import { render, screen } from "@testing-library/react";
import MatchHeatmap from "./MatchHeatmap";

vi.mock("../../api/player", () => ({
  getMatchHeatmap: vi.fn(() =>
    Promise.resolve({
      data: {
        data: {
          matchId: "m1",
          rawMapName: "Baltic_Main",
          mapName: "Erangel",
          mapSize: 8160,
          events: [
            { type: "drop", x: 4000, y: 4000, time: 5 },
            { type: "kill", x: 4200, y: 4100, time: 60, victim: "Foe", weapon: "M416", distance: 50 },
          ],
        },
      },
    })
  ),
}));

test("renders the real map background once loaded", async () => {
  render(<MatchHeatmap open matchId="m1" shard="steam" accountId="account.1" playerName="Me" />);
  const img = await screen.findByRole("img", { name: /erangel/i });
  expect(img).toBeInTheDocument();
});
```

(Note: `MatchHeatmap` is wrapped by `translate(...)`; `react-switch-lang`'s `t` falls back to the key when no translations are set in tests, which is fine.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm test -- MatchHeatmap`
Expected: FAIL — no `img` with name "erangel" (current component renders an abstract SVG, no map image).

- [ ] **Step 3: Replace the SVG stage background with `MapField` + world-coordinate marker overlay**

In `frontend/src/component/charts/MatchHeatmap.jsx`:

1. Add imports:

```jsx
import MapField from "./MapField";
import { getMapMeta } from "../../helpers/mapMeta";
```

2. Replace the `HeatmapStage` component body so the loaded branch renders markers in a full-map SVG over `MapField`. Use `mapMax` (not the fitted viewBox) so markers sit on the real map:

```jsx
const HeatmapStage = ({ loading, error, rawMap, mapMax, events, clusters, hovered, setHovered, eventLabels, eventDotLabels, t }) => {
  if (loading) {
    return (
      <div className="match-heatmap__loading">
        <Spin indicator={<LoadingOutlined style={{ fontSize: 32, color: "#fde82b" }} spin />} />
        <span>{t("pages.matchHeatmap.loading")}</span>
      </div>
    );
  }
  if (error) return <Alert type="error" message={error} showIcon />;
  return (
    <MapField rawMapName={rawMap} className="match-heatmap__field">
      <svg className="match-heatmap__svg" viewBox={`0 0 ${mapMax} ${mapMax}`} preserveAspectRatio="none">
        <HeatmapTimeline events={events} scale={mapMax} />
        <HeatmapClusters clusters={clusters} scale={mapMax} eventDotLabels={eventDotLabels} setHovered={setHovered} />
      </svg>
      {hovered ? <HeatmapTooltip hovered={hovered} eventLabels={eventLabels} t={t} /> : null}
    </MapField>
  );
};
```

   Remove the now-unused `HeatmapGrid` component and its usage, the radial-gradient `<defs>`, the bounding `<rect>`, and the N/S/E/W compass `<text>` nodes (the real map provides orientation). Keep `HeatmapClusters`, `HeatmapTimeline`, `HeatmapTooltip` as-is.

3. In the `MatchHeatmap` function, replace the fitted `viewBox`/`scale` memo usage with `mapMax` from the loaded data:

```jsx
const rawMap = data?.rawMapName || rawMapNameHint || null;
const mapMax = getMapMeta(rawMap).mapMax;
```

   Delete the `viewBox` `useMemo` and the `const scale = viewBox.size;` line. Keep `clusters`, `insights`, `counts` exactly as they are (they use world coords already). Update the `HeatmapStage` call site to pass `mapMax={mapMax}` instead of `viewBox`/`scale`.

4. Since cluster radii and timeline dash widths were derived from `scale` (the fitted size ≈ a few thousand), and `mapMax` is similar in magnitude (8160 for big maps), they remain visually reasonable. Leave the `scale * 0.0xx` multipliers unchanged.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npm test -- MatchHeatmap`
Expected: PASS.

- [ ] **Step 5: Add overlay styles**

Append to `frontend/src/style/style.scss`:

```scss
.match-heatmap__field {
  .match-heatmap__svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;

    circle, text { pointer-events: auto; }
  }
}
```

- [ ] **Step 6: Manual smoke check**

Run frontend (`cd frontend && npm start`), open a player, click a match's Heatmap button. Confirm markers sit on the real map for that match's map. Note: the modal is 620px — markers should align with the map image.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/component/charts/MatchHeatmap.jsx frontend/src/component/charts/MatchHeatmap.test.jsx frontend/src/style/style.scss
git commit -m "feat: render single-match heatmap markers over the real map"
```

---

### Task 5: "Maps" tab (single-match mode) in the player profile

**Files:**
- Create: `frontend/src/pages/MapsTab.jsx`
- Modify: `frontend/src/pages/PlayerPage.jsx` (add tab near lines 1198–1252)
- Modify: `frontend/src/Language/en.json`, `frontend/src/Language/ua.json`

**Interfaces:**
- Consumes: `matchItems` (the same `data?.matches?.items` PlayerPage already computes), `shard`/`accountId`/`playerName`, `MatchHeatmap` or its inner stage.
- Produces: `<MapsTab matches={array} shard accountId playerName t />`. Phase 1: a match `Select` (default newest) that opens the chosen match's single heatmap inline. Aggregate mode is added in Phase 2.

- [ ] **Step 1: Write a failing test**

Create `frontend/src/pages/MapsTab.test.jsx`:

```jsx
import React from "react";
import { render, screen } from "@testing-library/react";
import MapsTab from "./MapsTab";

vi.mock("../api/player", () => ({
  getMatchHeatmap: vi.fn(() => Promise.resolve({ data: { data: { rawMapName: "Baltic_Main", mapName: "Erangel", events: [] } } })),
}));

const t = (k) => k;
const matches = [
  { id: "m1", mapName: "Erangel", rawMapName: "Baltic_Main", gameModeLabel: "SQUAD", createdAt: "2026-06-20T10:00:00Z" },
];

test("renders a match selector", () => {
  render(<MapsTab matches={matches} shard="steam" accountId="account.1" playerName="Me" t={t} />);
  expect(screen.getByText("pages.maps.selectMatch")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm test -- MapsTab`
Expected: FAIL — cannot resolve `./MapsTab`.

- [ ] **Step 3: Implement `MapsTab.jsx` (single mode)**

Create `frontend/src/pages/MapsTab.jsx`:

```jsx
import React, { useState } from "react";
import { Select } from "antd";
import { translate } from "react-switch-lang";
import MatchHeatmap from "../component/charts/MatchHeatmap";

const MapsTab = ({ matches = [], shard, accountId, playerName, t }) => {
  const options = matches
    .filter((m) => m && m.id)
    .map((m) => ({
      value: m.id,
      label: `${m.mapName || m.rawMapName || "?"} · ${m.gameModeLabel || ""}`.trim(),
      rawMapName: m.rawMapName,
      mapName: m.mapName,
    }));

  const [selectedId, setSelectedId] = useState(options[0]?.value || null);
  const selected = options.find((o) => o.value === selectedId) || null;

  return (
    <div className="maps-tab">
      <div className="maps-tab__controls">
        <span className="maps-tab__label">{t("pages.maps.selectMatch")}</span>
        <Select
          className="maps-tab__select"
          value={selectedId}
          onChange={setSelectedId}
          options={options}
          placeholder={t("pages.maps.selectMatch")}
        />
      </div>

      {selected ? (
        <MatchHeatmap
          open
          inline
          onClose={() => {}}
          matchId={selected.value}
          shard={shard}
          accountId={accountId}
          playerName={playerName}
          mapNameHint={selected.mapName}
          rawMapNameHint={selected.rawMapName}
        />
      ) : (
        <p className="maps-tab__empty">{t("pages.maps.noMatches")}</p>
      )}
    </div>
  );
};

export default translate(MapsTab);
```

- [ ] **Step 4: Add an `inline` mode to `MatchHeatmap`**

`MatchHeatmap` currently always renders an Antd `Modal`. Add an `inline` prop: when true, render the same content without the `Modal` wrapper (so it can live inside the tab). In `frontend/src/component/charts/MatchHeatmap.jsx`, extract the modal body into a `body` variable and return either `<Modal>{body}</Modal>` or `<div className="match-heatmap-inline">{body}</div>`:

```jsx
const body = (
  <>
    <div className="match-heatmap__legend">{/* ...unchanged legend... */}</div>
    <details className="match-heatmap__help">{/* ...unchanged help... */}</details>
    <div className="match-heatmap__stage">
      <HeatmapStage /* ...unchanged props... */ />
    </div>
    {insights.length ? <div className="match-heatmap__insights">{/* ...unchanged... */}</div> : null}
  </>
);

if (inline) return <div className="match-heatmap-inline">{body}</div>;

return (
  <Modal open={open} onCancel={onClose} footer={null} width={620} destroyOnHidden className="match-heatmap-modal" title={t("pages.matchHeatmap.modalTitle", { map: mapDisplayName })}>
    {body}
  </Modal>
);
```

   Add `inline = false` to the destructured props.

- [ ] **Step 5: Run the MapsTab + MatchHeatmap tests**

Run: `cd frontend && npm test -- MapsTab MatchHeatmap`
Expected: PASS.

- [ ] **Step 6: Add i18n keys**

In `frontend/src/Language/en.json`, under `pages`, add:

```json
"maps": {
  "tab": "Maps",
  "selectMatch": "Match",
  "selectMap": "Map",
  "modeSingle": "This match",
  "modeAggregate": "All matches",
  "noMatches": "No matches to show on the map yet.",
  "aggregateEmpty": "No accumulated data for this map yet — open a few matches to build it up.",
  "layerDrop": "Landings",
  "layerKill": "Kills",
  "layerDeath": "Deaths",
  "sampleCount": "{count} matches in sample"
}
```

In `frontend/src/Language/ua.json`, under `pages`, add the Ukrainian equivalents:

```json
"maps": {
  "tab": "Карти",
  "selectMatch": "Матч",
  "selectMap": "Карта",
  "modeSingle": "Цей матч",
  "modeAggregate": "Усі матчі",
  "noMatches": "Поки немає матчів для показу на карті.",
  "aggregateEmpty": "Поки немає накопичених даних для цієї карти — відкрий кілька матчів, щоб назбирати.",
  "layerDrop": "Висадки",
  "layerKill": "Вбивства",
  "layerDeath": "Смерті",
  "sampleCount": "{count} матчів у вибірці"
}
```

- [ ] **Step 7: Add the tab to `PlayerPage.jsx`**

In `frontend/src/pages/PlayerPage.jsx`, import at the top:

```jsx
import MapsTab from "./MapsTab";
```

Then in the `tabItems` array (the `matches`/`weapons`/`reports` block near line 1237), add a new entry (place it right after the `matches` entry):

```jsx
{
  key: "maps",
  label: t("pages.maps.tab"),
  children: (
    <MapsTab
      matches={matchItems}
      shard={platform}
      accountId={accountId}
      playerName={playerName}
    />
  ),
},
```

   Use the same `matchItems`, `platform`, `accountId`, `playerName` identifiers already in scope where the existing `matches` tab / heatmap modal are wired (confirm the exact local variable names at that line and match them — e.g. `shard`/`platform`, `accountId`).

- [ ] **Step 8: Run the full frontend test suite**

Run: `cd frontend && npm test`
Expected: PASS (no regressions).

- [ ] **Step 9: Manual smoke check**

`npm start`, open a player → "Maps" tab → pick a match → the single heatmap renders inline on the real map. Switching matches updates the map/markers.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/pages/MapsTab.jsx frontend/src/pages/MapsTab.test.jsx frontend/src/pages/PlayerPage.jsx frontend/src/component/charts/MatchHeatmap.jsx frontend/src/Language/en.json frontend/src/Language/ua.json
git commit -m "feat: add Maps tab with single-match heatmap on real map"
```

---

## Phase 2 — Aggregate heatmap

### Task 6: Canvas heat layer (pure helpers + draw)

**Files:**
- Create: `frontend/src/component/charts/heatLayer.js`
- Test: `frontend/src/component/charts/heatLayer.test.js`

**Interfaces:**
- Produces:
  - `buildGradient(stops) -> Uint8ClampedArray` of length 1024 (256 RGBA entries) — a color lookup ramp.
  - `intensityAlpha(count, max) -> number` (0–1) for a point given the layer's max density.
  - `drawHeat(ctx, points, opts)` — draws onto a 2D context (`opts`: `size`, `mapMax`, `radius`, `gradient`). Not unit-tested (canvas unavailable in jsdom); covered by manual check in Task 10.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/component/charts/heatLayer.test.js`:

```js
import { buildGradient, intensityAlpha } from "./heatLayer";

test("buildGradient returns a 256-entry RGBA ramp", () => {
  const ramp = buildGradient([
    [0.0, "#000000"],
    [1.0, "#ffffff"],
  ]);
  expect(ramp).toHaveLength(1024);
  expect(ramp[1020]).toBeGreaterThan(200); // near-white at the top
});

test("intensityAlpha scales with count and clamps to 1", () => {
  expect(intensityAlpha(0, 10)).toBe(0);
  expect(intensityAlpha(5, 10)).toBeCloseTo(0.5, 5);
  expect(intensityAlpha(20, 10)).toBe(1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm test -- heatLayer`
Expected: FAIL — cannot resolve `./heatLayer`.

- [ ] **Step 3: Implement `heatLayer.js`**

Create `frontend/src/component/charts/heatLayer.js`:

```js
export const buildGradient = (stops) => {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const ramp = new Uint8ClampedArray(1024);
    for (let i = 0; i < 256; i += 1) {
      ramp[i * 4] = i;
      ramp[i * 4 + 1] = i;
      ramp[i * 4 + 2] = i;
      ramp[i * 4 + 3] = 255;
    }
    return ramp;
  }
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  stops.forEach(([offset, color]) => grad.addColorStop(offset, color));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1, 256);
  return ctx.getImageData(0, 0, 1, 256).data;
};

export const intensityAlpha = (count, max) => {
  if (!max || count <= 0) return 0;
  return Math.min(1, count / max);
};

export const DEFAULT_STOPS = [
  [0.0, "rgba(0,0,255,0)"],
  [0.4, "#3b82f6"],
  [0.65, "#22d3a8"],
  [0.85, "#fde047"],
  [1.0, "#ef4444"],
];

export const drawHeat = (ctx, points, { size, mapMax, radius = 18, gradient } = {}) => {
  if (!ctx) return;
  ctx.clearRect(0, 0, size, size);
  ctx.globalCompositeOperation = "source-over";
  for (const p of points) {
    const px = (p.x / mapMax) * size;
    const py = (p.y / mapMax) * size;
    const g = ctx.createRadialGradient(px, py, 0, px, py, radius);
    g.addColorStop(0, "rgba(0,0,0,0.18)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  const img = ctx.getImageData(0, 0, size, size);
  const ramp = gradient || buildGradient(DEFAULT_STOPS);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha === 0) continue;
    const offset = alpha * 4;
    data[i] = ramp[offset];
    data[i + 1] = ramp[offset + 1];
    data[i + 2] = ramp[offset + 2];
    data[i + 3] = Math.min(255, alpha * 3);
  }
  ctx.putImageData(img, 0, 0);
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npm test -- heatLayer`
Expected: PASS (2 tests). (Under Vitest + jsdom, `canvas.getContext("2d")` returns null, so `buildGradient` takes its grayscale fallback path; the ramp test asserts `ramp[1020] > 200`, which the fallback satisfies.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/component/charts/heatLayer.js frontend/src/component/charts/heatLayer.test.js
git commit -m "feat: add canvas heat density helpers"
```

---

### Task 7: Backend accumulator module

**Files:**
- Create: `backend/modules/heatmapAggregate.js`
- Test: `backend/modules/heatmapAggregate.test.js`

**Interfaces:**
- Produces:
  - `aggregateKey({ shard, accountId, playerName, rawMapName }) -> string`.
  - `addMatchPoints({ key, matchId, points, filePath?, maxMatches? }) -> Promise<void>` — idempotent by `matchId`; keeps at most `maxMatches` (default 60) most-recent match point-sets per key. `points` is `{ drop:[{x,y}], kill:[{x,y}], death:[{x,y}] }`.
  - `getAggregate({ key, filePath? }) -> Promise<{ layers: { drop, kill, death }, matchesCount }>`.
  - `filePath` defaults to `backend/json/heatmap-points.json`; tests inject a temp path.

- [ ] **Step 1: Write the failing test**

Create `backend/modules/heatmapAggregate.test.js`:

```js
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { aggregateKey, addMatchPoints, getAggregate } = require("./heatmapAggregate");

const tmp = path.join(os.tmpdir(), `heatmap-test-${process.pid}.json`);

beforeEach(() => {
  if (fs.existsSync(tmp)) fs.rmSync(tmp);
});

test("aggregateKey is stable and shard/map specific", () => {
  const k = aggregateKey({ shard: "steam", accountId: "account.1", rawMapName: "Baltic_Main" });
  assert.equal(k, aggregateKey({ shard: "steam", accountId: "account.1", rawMapName: "Baltic_Main" }));
  assert.notEqual(k, aggregateKey({ shard: "steam", accountId: "account.1", rawMapName: "Desert_Main" }));
});

test("addMatchPoints is idempotent by matchId", async () => {
  const key = aggregateKey({ shard: "steam", accountId: "account.1", rawMapName: "Baltic_Main" });
  const points = { drop: [{ x: 1, y: 2 }], kill: [{ x: 3, y: 4 }], death: [] };
  await addMatchPoints({ key, matchId: "m1", points, filePath: tmp });
  await addMatchPoints({ key, matchId: "m1", points, filePath: tmp });
  const agg = await getAggregate({ key, filePath: tmp });
  assert.equal(agg.matchesCount, 1);
  assert.equal(agg.layers.drop.length, 1);
  assert.equal(agg.layers.kill.length, 1);
});

test("addMatchPoints merges multiple matches and caps count", async () => {
  const key = aggregateKey({ shard: "steam", accountId: "account.1", rawMapName: "Baltic_Main" });
  for (let i = 0; i < 65; i += 1) {
    await addMatchPoints({ key, matchId: `m${i}`, points: { drop: [{ x: i, y: i }], kill: [], death: [] }, filePath: tmp, maxMatches: 60 });
  }
  const agg = await getAggregate({ key, filePath: tmp });
  assert.equal(agg.matchesCount, 60);
  assert.equal(agg.layers.drop.length, 60);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npm test`
Expected: FAIL — `Cannot find module './heatmapAggregate'`.

- [ ] **Step 3: Implement `heatmapAggregate.js`**

Create `backend/modules/heatmapAggregate.js`:

```js
const fs = require("fs/promises");
const path = require("path");

const DEFAULT_FILE = path.join(__dirname, "..", "json", "heatmap-points.json");
const DEFAULT_MAX_MATCHES = 60;
let mutationQueue = Promise.resolve();

function enqueueMutation(task) {
  const run = mutationQueue.then(task, task);
  mutationQueue = run.catch(() => {});
  return run;
}

function aggregateKey({ shard, accountId, playerName, rawMapName }) {
  const who = accountId || playerName || "unknown";
  return `${shard || "steam"}:${who}:${rawMapName || "unknown"}`;
}

async function readStore(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    if (!raw || !raw.trim()) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    return {};
  }
}

async function writeStore(filePath, store) {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(store), "utf8");
  } catch (e) {
    console.log(`[HEATMAP] Failed to write store: ${e.message}`);
  }
}

function emptyPoints() {
  return { drop: [], kill: [], death: [] };
}

function addMatchPoints({ key, matchId, points, filePath = DEFAULT_FILE, maxMatches = DEFAULT_MAX_MATCHES }) {
  return enqueueMutation(async () => {
    if (!key || !matchId) return;
    const store = await readStore(filePath);
    const entry = store[key] && typeof store[key] === "object" ? store[key] : { matches: [] };
    const matches = Array.isArray(entry.matches) ? entry.matches : [];

    const without = matches.filter((m) => m && m.matchId !== matchId);
    const safe = { ...emptyPoints(), ...(points || {}) };
    without.push({
      matchId,
      drop: safe.drop || [],
      kill: safe.kill || [],
      death: safe.death || [],
    });

    while (without.length > maxMatches) without.shift();

    store[key] = { matches: without };
    await writeStore(filePath, store);
  });
}

async function getAggregate({ key, filePath = DEFAULT_FILE }) {
  const store = await readStore(filePath);
  const entry = store[key];
  const matches = entry && Array.isArray(entry.matches) ? entry.matches : [];
  const layers = emptyPoints();
  for (const m of matches) {
    if (!m) continue;
    if (Array.isArray(m.drop)) layers.drop.push(...m.drop);
    if (Array.isArray(m.kill)) layers.kill.push(...m.kill);
    if (Array.isArray(m.death)) layers.death.push(...m.death);
  }
  return { layers, matchesCount: matches.length };
}

module.exports = { aggregateKey, addMatchPoints, getAggregate };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npm test`
Expected: PASS (mapMeta + heatmapAggregate tests).

- [ ] **Step 5: Commit**

```bash
git add backend/modules/heatmapAggregate.js backend/modules/heatmapAggregate.test.js
git commit -m "feat: add persistent heatmap point accumulator"
```

---

### Task 8: Wire the accumulator into `getMatchHeatmap` + use `mapMeta`

**Files:**
- Modify: `backend/modules/getMatchHeatmap.js`

**Interfaces:**
- Consumes: `getMapMeta` (Task 1), `aggregateKey`/`addMatchPoints` (Task 7).
- Produces: every successful `buildHeatmap` writes that match's points into the accumulator. Response shape unchanged except `mapSize` now uses precise `mapMax`.

- [ ] **Step 1: Replace the local `MAP_META`/`getMapMeta` with the shared module**

In `backend/modules/getMatchHeatmap.js`:

1. Delete the local `MAP_META` object (lines ~3–15) and the local `getMapMeta` (lines ~27–31).
2. Add imports near the top:

```js
const { getMapMeta } = require("./mapMeta");
const { aggregateKey, addMatchPoints } = require("./heatmapAggregate");
```

3. In `buildHeatmap`, the existing `const mapMeta = getMapMeta(rawMapName);` now returns `{ displayName, mapMax }`. Update the returned object:

```js
return {
  matchId,
  rawMapName,
  mapName: mapMeta.displayName,
  mapSize: mapMeta.mapMax,
  duration: Number(matchAttributes.duration) || null,
  createdAt: matchStart,
  events,
};
```

- [ ] **Step 2: Accumulate points after building**

Still in `buildHeatmap`, before the `return`, build the per-layer point arrays from `events` and persist them (fire-and-forget; do not block the response):

```js
const points = { drop: [], kill: [], death: [] };
for (const ev of events) {
  if (points[ev.type]) points[ev.type].push({ x: ev.x, y: ev.y });
}
if (rawMapName && (accountId || playerName)) {
  const key = aggregateKey({ shard: shardForMatch(shard), accountId, playerName, rawMapName });
  addMatchPoints({ key, matchId, points }).catch(() => {});
}
```

- [ ] **Step 3: Manual verification**

Run backend (`cd backend && npx nodemon server.js`) with a valid `PUBG_API_KEY`. Hit the existing endpoint for a real match:

```bash
curl "http://localhost:3003/api/match/<MATCH_ID>/heatmap?shard=steam&accountId=<ACCOUNT_ID>"
```

Expected: 200 with `data.mapSize` equal to the precise `mapMax` (e.g. 8160 for Erangel). Then confirm `backend/json/heatmap-points.json` now contains an entry for that key with one match.

- [ ] **Step 4: Run backend tests (no regressions)**

Run: `cd backend && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/modules/getMatchHeatmap.js
git commit -m "feat: accumulate match heatmap points and use precise map scale"
```

---

### Task 9: Aggregate endpoint + seeding

**Files:**
- Modify: `backend/controllers/player.js`
- Modify: `backend/routes/player.js`

**Interfaces:**
- Consumes: `getMatchHeatmap` (builds + accumulates a match), `aggregateKey`/`getAggregate` (Task 7).
- Produces: `POST /api/player/heatmap/aggregate` body `{ shard, accountId, playerName, map, matchIds[] }` → `{ status: 200, data: { map, mapMax, layers, matchesCount } }`. Seeds by building any provided `matchIds` not yet stored, then returns the aggregate.

- [ ] **Step 1: Add the controller**

In `backend/controllers/player.js`, add imports near the existing `getMatchHeatmap` import (line ~10):

```js
const { getMapMeta } = require("../modules/mapMeta");
const { aggregateKey, getAggregate } = require("../modules/heatmapAggregate");
```

Then add the handler (after `getMatchHeatmap`, before `validate`):

```js
module.exports.getPlayerHeatmapAggregate = async (req, res) => {
  try {
    const { shard = "steam", accountId = null, playerName = null, map = null, matchIds = [] } = req.body || {};
    if (!accountId && !playerName) {
      return res.status(400).json({ status: 400, message: "accountId or playerName is required" });
    }
    if (!map) {
      return res.status(400).json({ status: 400, message: "map is required" });
    }

    const ids = Array.isArray(matchIds) ? matchIds.slice(0, 12) : [];
    for (const matchId of ids) {
      try {
        const built = await getMatchHeatmap({ shard, matchId, accountId, playerName });
        if (built && built.rawMapName !== map) continue;
      } catch (_e) {
        // skip matches that fail to build (404 after retention, rate limit, etc.)
      }
    }

    const key = aggregateKey({ shard, accountId, playerName, rawMapName: map });
    const aggregate = await getAggregate({ key });
    return res.status(200).json({
      status: 200,
      data: {
        map,
        mapMax: getMapMeta(map).mapMax,
        layers: aggregate.layers,
        matchesCount: aggregate.matchesCount,
      },
    });
  } catch (e) {
    return res.status(200).json({ status: 200, message: e.message });
  }
};
```

- [ ] **Step 2: Register the route**

In `backend/routes/player.js`, add (after the existing `/api/match/:matchId/heatmap` route):

```js
router.post(
  "/api/player/heatmap/aggregate",
  PlayerController.getPlayerHeatmapAggregate
);
```

- [ ] **Step 3: Manual verification**

With the backend running and a real player's recent match IDs:

```bash
curl -X POST "http://localhost:3003/api/player/heatmap/aggregate" \
  -H "Content-Type: application/json" \
  -d '{"shard":"steam","accountId":"<ACCOUNT_ID>","map":"Baltic_Main","matchIds":["<ID1>","<ID2>"]}'
```

Expected: 200 with `data.layers.{drop,kill,death}` arrays and `data.matchesCount` ≥ 1 (only matches whose `rawMapName` is `Baltic_Main` contribute). Re-running does not inflate `matchesCount` (idempotent).

- [ ] **Step 4: Commit**

```bash
git add backend/controllers/player.js backend/routes/player.js
git commit -m "feat: add aggregate heatmap endpoint with on-demand seeding"
```

---

### Task 10: Aggregate API wrapper + `AggregateHeatmap` component

**Files:**
- Modify: `frontend/src/api/player.js`
- Create: `frontend/src/component/charts/AggregateHeatmap.jsx`
- Test: `frontend/src/component/charts/AggregateHeatmap.test.jsx`
- Modify: `frontend/src/style/style.scss`

**Interfaces:**
- Consumes: `post` helper, `MapField` (Task 3), `drawHeat`/`DEFAULT_STOPS` (Task 6), `getMapMeta` (Task 1).
- Produces:
  - `getAggregateHeatmap({ shard, accountId, playerName, map, matchIds }) -> Promise<response>`.
  - `<AggregateHeatmap rawMapName matches shard accountId playerName t />` — fetches aggregate for `rawMapName`, draws the active layers as canvas heat over `MapField`, with layer toggles and a sample counter.

- [ ] **Step 1: Add the API wrapper**

Append to `frontend/src/api/player.js`:

```js
export const getAggregateHeatmap = ({ shard, accountId, playerName, map, matchIds }) =>
  post(
    "/player/heatmap/aggregate",
    { shard, accountId, playerName, map, matchIds },
    true
  );
```

- [ ] **Step 2: Write the failing test**

Create `frontend/src/component/charts/AggregateHeatmap.test.jsx`:

```jsx
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import AggregateHeatmap from "./AggregateHeatmap";

vi.mock("../../api/player", () => ({
  getAggregateHeatmap: vi.fn(() =>
    Promise.resolve({
      data: { map: "Baltic_Main", mapMax: 8160, matchesCount: 3, layers: { drop: [{ x: 1, y: 1 }], kill: [], death: [] } },
    })
  ),
}));

const t = (k, p) => (p ? `${k}:${p.count}` : k);

test("shows the sample count after loading", async () => {
  render(<AggregateHeatmap rawMapName="Baltic_Main" matches={[{ id: "m1", rawMapName: "Baltic_Main" }]} shard="steam" accountId="account.1" playerName="Me" t={t} />);
  await waitFor(() => expect(screen.getByText("pages.maps.sampleCount:3")).toBeInTheDocument());
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd frontend && npm test -- AggregateHeatmap`
Expected: FAIL — cannot resolve `./AggregateHeatmap`.

- [ ] **Step 4: Implement `AggregateHeatmap.jsx`**

Create `frontend/src/component/charts/AggregateHeatmap.jsx`:

```jsx
import React, { useEffect, useRef, useState } from "react";
import { Checkbox, Spin } from "antd";
import MapField from "./MapField";
import { drawHeat, buildGradient, DEFAULT_STOPS } from "./heatLayer";
import { getAggregateHeatmap } from "../../api/player";

const CANVAS_SIZE = 1000;
const LAYER_KEYS = ["drop", "kill", "death"];

const AggregateHeatmap = ({ rawMapName, matches = [], shard, accountId, playerName, t }) => {
  const canvasRef = useRef(null);
  const gradientRef = useRef(null);
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [active, setActive] = useState({ drop: true, kill: true, death: false });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, data: null, error: null });
    const matchIds = matches.filter((m) => m && m.rawMapName === rawMapName).map((m) => m.id);
    getAggregateHeatmap({ shard, accountId, playerName, map: rawMapName, matchIds })
      .then((res) => {
        if (cancelled) return;
        const payload = res?.data || null;
        if (payload && payload.layers) setState({ loading: false, data: payload, error: null });
        else setState({ loading: false, data: null, error: res?.message || "unavailable" });
      })
      .catch((err) => {
        if (!cancelled) setState({ loading: false, data: null, error: err?.message || "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [rawMapName, shard, accountId, playerName, matches]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !state.data) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (!gradientRef.current) gradientRef.current = buildGradient(DEFAULT_STOPS);
    const points = LAYER_KEYS.filter((k) => active[k]).flatMap((k) => state.data.layers[k] || []);
    drawHeat(ctx, points, {
      size: CANVAS_SIZE,
      mapMax: state.data.mapMax,
      radius: 16,
      gradient: gradientRef.current,
    });
  }, [state.data, active]);

  return (
    <div className="aggregate-heatmap">
      <div className="aggregate-heatmap__controls">
        {LAYER_KEYS.map((k) => (
          <Checkbox key={k} checked={active[k]} onChange={(e) => setActive((a) => ({ ...a, [k]: e.target.checked }))}>
            {t(`pages.maps.layer${k.charAt(0).toUpperCase() + k.slice(1)}`)}
          </Checkbox>
        ))}
        {state.data ? <span className="aggregate-heatmap__count">{t("pages.maps.sampleCount", { count: state.data.matchesCount })}</span> : null}
      </div>

      {state.loading ? (
        <div className="aggregate-heatmap__loading"><Spin /></div>
      ) : state.data && state.data.matchesCount > 0 ? (
        <MapField rawMapName={rawMapName} className="aggregate-heatmap__field">
          <canvas ref={canvasRef} width={CANVAS_SIZE} height={CANVAS_SIZE} className="aggregate-heatmap__canvas" />
        </MapField>
      ) : (
        <p className="aggregate-heatmap__empty">{t("pages.maps.aggregateEmpty")}</p>
      )}
    </div>
  );
};

export default AggregateHeatmap;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend && npm test -- AggregateHeatmap`
Expected: PASS.

- [ ] **Step 6: Add styles**

Append to `frontend/src/style/style.scss`:

```scss
.aggregate-heatmap {
  &__controls {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
    margin-bottom: 10px;
  }
  &__count { margin-left: auto; opacity: 0.8; }
  &__field .aggregate-heatmap__canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
  &__empty, &__loading { padding: 24px; text-align: center; opacity: 0.8; }
}
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/api/player.js frontend/src/component/charts/AggregateHeatmap.jsx frontend/src/component/charts/AggregateHeatmap.test.jsx frontend/src/style/style.scss
git commit -m "feat: add aggregate density heatmap component"
```

---

### Task 11: Add aggregate mode to the Maps tab

**Files:**
- Modify: `frontend/src/pages/MapsTab.jsx`
- Modify: `frontend/src/pages/MapsTab.test.jsx`

**Interfaces:**
- Consumes: `AggregateHeatmap` (Task 10), `getMapMeta`/`MAP_LIST` (Task 1).
- Produces: the tab now has an Antd `Segmented` single↔aggregate switch and (in aggregate mode) a map `Select` driving `AggregateHeatmap`.

- [ ] **Step 1: Extend the test**

Append to `frontend/src/pages/MapsTab.test.jsx`:

```jsx
import { fireEvent } from "@testing-library/react";

vi.mock("../component/charts/AggregateHeatmap", () => ({ default: () => <div data-testid="aggregate" /> }));

test("switches to aggregate mode", () => {
  render(<MapsTab matches={matches} shard="steam" accountId="account.1" playerName="Me" t={t} />);
  fireEvent.click(screen.getByText("pages.maps.modeAggregate"));
  expect(screen.getByTestId("aggregate")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm test -- MapsTab`
Expected: FAIL — no element with text "pages.maps.modeAggregate".

- [ ] **Step 3: Add the mode switch + map selector to `MapsTab.jsx`**

Update `frontend/src/pages/MapsTab.jsx`:

1. Add imports:

```jsx
import { Select, Segmented } from "antd";
import AggregateHeatmap from "../component/charts/AggregateHeatmap";
```

2. Add state and derive the map list from the player's matches (only maps they've played, deduped, fallback to the selected match's map):

```jsx
const [mode, setMode] = useState("single");

const playedMaps = Array.from(
  new Map(
    matches.filter((m) => m && m.rawMapName).map((m) => [m.rawMapName, { value: m.rawMapName, label: m.mapName || m.rawMapName }])
  ).values()
);
const [selectedMap, setSelectedMap] = useState(playedMaps[0]?.value || "Baltic_Main");
```

3. Render the `Segmented` switch in the controls row:

```jsx
<Segmented
  className="maps-tab__mode"
  value={mode}
  onChange={setMode}
  options={[
    { value: "single", label: t("pages.maps.modeSingle") },
    { value: "aggregate", label: t("pages.maps.modeAggregate") },
  ]}
/>
```

4. Branch the body on `mode`. In single mode keep the existing match `Select` + `MatchHeatmap`. In aggregate mode render a map `Select` + `AggregateHeatmap`:

```jsx
{mode === "aggregate" ? (
  <>
    <div className="maps-tab__controls">
      <span className="maps-tab__label">{t("pages.maps.selectMap")}</span>
      <Select className="maps-tab__select" value={selectedMap} onChange={setSelectedMap} options={playedMaps} />
    </div>
    <AggregateHeatmap
      rawMapName={selectedMap}
      matches={matches}
      shard={shard}
      accountId={accountId}
      playerName={playerName}
      t={t}
    />
  </>
) : (
  /* existing single-mode block (match Select + MatchHeatmap) */
)}
```

   Move the existing match-`Select` + `MatchHeatmap` JSX into the `single` branch. Render the `Segmented` switch above both branches so it always shows.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npm test -- MapsTab`
Expected: PASS (both MapsTab tests).

- [ ] **Step 5: Run the full frontend suite**

Run: `cd frontend && npm test`
Expected: PASS (no regressions).

- [ ] **Step 6: Manual smoke check**

`npm start` → player → Maps tab. Single mode: pick matches, markers on real map. Toggle to Aggregate: pick a map, density heat renders; toggling layers (Landings/Kills/Deaths) updates the heat; sample count shows; zoom/pan works.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/MapsTab.jsx frontend/src/pages/MapsTab.test.jsx
git commit -m "feat: add aggregate mode toggle to Maps tab"
```

---

## Self-Review

**Spec coverage:**
- Real map background → Tasks 2, 3, 4 (single) + 10 (aggregate). ✓
- Precise world→pixel scaling → Task 1 (`mapMax`), used in 3/4/6/8/10. ✓
- Single-match markers/tooltips/insights on real map → Task 4. ✓
- Aggregate density, accumulating, per (player, map) → Tasks 6, 7, 8, 9, 10. ✓
- Seeding from recent matches → Task 9 (client sends `matchIds`; backend builds+accumulates). ✓
- New "Maps" tab, map selector + single/aggregate toggle → Tasks 5, 11. ✓
- Zoom/pan → Task 3. ✓
- i18n en/ua → Task 5 (keys), reused in 10/11. ✓
- Theme-consistent styles → Tasks 3/4/10. ✓
- Reuse mutation-queue persistence pattern → Task 7. ✓
- No new runtime dependency; backend `node:test` → Tasks 1, 7. ✓

**Out of scope (deferred, per spec §3 non-goals):** real movement-density layer (`LogPlayerPosition`), zone overlays, two-player comparison, full Kill Map & Replay → Phase 3 (below).

**Placeholder scan:** No TBD/TODO; every code step shows full code; commands have expected output. ✓

**Type consistency:** `getMapMeta` returns `{ displayName, mapMax }` (backend) / `{ displayName, mapMax, image }` (frontend) consistently. Accumulator `points` shape `{ drop, kill, death }` matches between Task 7 (store), Task 8 (writer), Task 9 (reader), Task 10 (consumer). `aggregateKey` signature identical in Tasks 7/8/9. `MatchHeatmap` `inline` prop added in Task 5 and consumed there. ✓

**Open detail to confirm during execution:** the exact local variable names in `PlayerPage.jsx` at the tab block (`platform` vs `shard`, `accountId`, `playerName`, `matchItems`) — match them when wiring Task 5 Step 7.

---

## Phase 3 — Future (out of scope for this plan)

Not broken into tasks here; spec'd as non-goals. When picked up, each is its own plan:
- Real movement path/density via `LogPlayerPosition` (parse positions, store/bin, render as a 4th layer + replace the fake polyline).
- Safe/blue/red zone overlays from telemetry zone-state events.
- Two-player comparison (overlay two players' aggregate layers).
- Kill Map & Replay (the separate large sub-project — `MapField` and `mapMeta` were built to be reused by it).

## Execution

Recommended: subagent-driven (fresh subagent per task, review between tasks). Reminder per repo workflow: do not auto-commit — pause for the user's review before each commit.
