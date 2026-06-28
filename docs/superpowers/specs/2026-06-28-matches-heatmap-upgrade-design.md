# Matches Heatmap Upgrade — Design

- **Date:** 2026-06-28
- **Status:** Approved (design); pending spec review
- **Author:** Satel14 + Claude
- **Scope:** Sub-project 1 of a larger "match map" effort. A later sub-project (Kill Map & Replay) is intentionally out of scope here but shares the foundation built below.

## 1. Summary

Bring the Matches heatmap up to the quality of pubglooker.com. The single load-bearing requirement: **the heatmap must render on the real PUBG map image**, not the current abstract SVG grid. On top of that, support two modes:

- **Single-match** — interactive markers (drop / kill / death) with tooltips, like today, but drawn over the real map.
- **Aggregate** — a true density heatmap ("where do I always land / die / get kills") that **accumulates gradually** across matches.

Both live in a new **"Maps"** tab on the player profile, with a map selector and a single↔aggregate toggle.

## 2. Current state (what already exists)

- **Frontend:** `frontend/src/component/charts/MatchHeatmap.jsx` (438 lines, pure SVG). Opens from a per-match "Heatmap" button into an Antd `Modal` (620px). Renders `drop`/`kill`/`death` markers with clustering (80m radius), tooltips, a grid+compass, a "match story" insights block, and a fake movement polyline. Coordinates plotted directly (top-left origin, no Y-flip). i18n keys under `pages.matchHeatmap.*`.
- **Backend:** `backend/modules/getMatchHeatmap.js`. Fetches the match (`/shards/{shard}/matches/{id}`, API-keyed), finds the telemetry asset URL, downloads the telemetry JSON (CDN, no key), and parses:
  - `LogParachuteLanding` → the focal player's first landing (`drop`).
  - `LogPlayerKillV2` → `kill` (focal player is killer/finisher, plots victim location) and `death` (focal player is victim). Captures weapon + distance.
  - Coordinates scaled `cm / 100`. Map metadata via `MAP_META` (rawMapName → `{ name, size }`). Cache: in-memory `Map`, 200 entries, in-flight coalescing. **No persistence.**
- **API wrapper:** `frontend/src/api/player.js` → `getMatchHeatmap(matchId, shard, accountId, playerName)` → `GET /match/:id/heatmap?...`.
- **Stack:** React 18 (CRA), Antd 5.15.3, recharts 3.8.1, framer-motion. **No map/canvas library** (no Leaflet/Konva/Pixi). i18n via `react-switch-lang` (`en.json`/`ua.json`). Routes declared in `src/router/routes.js`.

### Key findings that shape this design

1. The current "movement path" is **not real** — it just connects drop→kills→death. Real movement (a density layer, and the future replay) needs `LogPlayerPosition` (logged per alive player ~every 10s → must be interpolated for replay).
2. The single-match parser already produces exactly the `drop`/`kill`/`death` points the aggregate view needs → **the aggregate store can reuse the existing parse output** with minimal new parsing.
3. Telemetry files are large (~8–25 MB uncompressed) but immutable and CDN-served (not rate-limited); only the `/matches/{id}` call is rate-limited (~10/min). PUBG retains matches ~14 days.

## 3. Goals / non-goals

**Goals**
- Real map background image per map, with correct world→pixel scaling.
- Single-match mode: existing markers/tooltips/insights, re-skinned onto the real map.
- Aggregate mode: density heatmap with toggleable layers (landings / kills / deaths), accumulating over time per `(player, map)`.
- New "Maps" tab hosting both modes with a map selector + mode toggle. Zoom/pan.
- i18n (en/ua), theme-consistent.

**Non-goals (this sub-project)**
- Full Kill Map & Replay (player movement playback, kill tracers, zones, timeline). Separate sub-project.
- Real movement-density layer and zone overlays — deferred to Phase 3 (optional).
- Deep season-wide background ingestion of matches.

## 4. Decisions (from brainstorming)

| Question | Decision |
| --- | --- |
| Order | Heatmap first; replay later. |
| Heatmap type | **Both** single-match and aggregate, with a toggle. |
| Aggregate data source | **Accumulate gradually** — persist parsed points per `(player, map)`; seed from last ~8 matches on first request; grows over time. |
| Placement | **New "Maps" tab** in the player profile (map selector + single/aggregate toggle). |
| Rendering | **Approach A** — real `<img>` map background + canvas heat layer (hand-rolled, no new dependency) + SVG markers. |

## 5. Rendering approach (A)

- Background: the real downscaled PUBG map PNG as an `<img>` / canvas base layer.
- Aggregate: a hand-rolled canvas density renderer (~60 lines, simpleheat-style — accumulate radial alpha gradients per point, then colorize through an intensity ramp). **No new runtime dependency.**
- Single-match: interactive SVG (or absolutely-positioned) markers + tooltips over the map, preserving current hover/cluster/insights behavior.
- Zoom (mouse wheel, cursor-centered, clamped) and pan (drag, bounds-clamped) implemented with CSS transforms / local handlers — no external lib.

Alternatives considered and rejected: **B** `heatmap.js` (extra dated dependency, weaker theming/zoom integration); **C** pure-SVG faux density (poor performance at thousands of points, worse visuals — essentially the status quo).

## 6. Coordinate system & map scale table

- Telemetry coords are centimeters, **top-left origin, Y axis points down (do NOT flip Y)**. Keep the existing `cm / 100` units.
- `pixelX = (x / mapMax) * imageWidth`, `pixelY = (y / mapMax) * imageHeight` (maps are square).
- Replace the approximate `MAP_META.size` with precise `mapMax` (in `cm/100` units):

  | rawMapName | Map | mapMax |
  | --- | --- | --- |
  | `Baltic_Main`, `Erangel_Main` | Erangel | 8160 |
  | `Desert_Main` | Miramar | 8160 |
  | `Tiger_Main` | Taego | 8160 |
  | `Kiki_Main` | Deston | 8160 |
  | `Neon_Main` | Rondo | 8160 |
  | `DihorOtok_Main` | Vikendi | 8160 *(verify vs rendered image; legacy code used 6000)* |
  | `Savage_Main` | Sanhok | 4080 |
  | `Chimera_Main` | Paramo | 3060 |
  | `Summerland_Main` | Karakin | 2040 |
  | `Range_Main` | Camp Jackal | 2040 |
  | `Heaven_Main` | Haven | 1020 |

  This table is the single source of truth, shared by backend (`getMatchHeatmap.js` MAP_META) and frontend (`<MapField>`).

## 7. Architecture

### 7.1 Shared foundation (Phase 0)

- **Map images:** take official `*_No_Text_Low_Res.png` from `pubg/api-assets`, downscale to ~2048px, store under `frontend/src/img/maps/<rawMapName>.png` (or `webp`). Lazy-load only the active map (dynamic import or on-demand `<img src>`). Standard fan use of Krafton assets.
- **Map registry:** a shared module mapping `rawMapName → { displayName, mapMax, image }`.
- **`<MapField>` component** (`frontend/src/component/charts/MapField.jsx`): renders the map image, exposes world→pixel scaling, handles zoom/pan, and accepts overlay children (markers layer or canvas heat layer). Reused by single-match, aggregate, and (later) replay.

### 7.2 Backend

- **Accumulation store:** persist `drop`/`kill`/`death` points per key `${shard}:${accountId||playerName}:${rawMapName}`. Reuse the existing mutation-queue pattern from `backend/modules/playerRank/recentSearches.js` to serialize writes to a JSON file (`backend/json/heatmap-points.json`). Bound size: cap stored matches per key (e.g. last 60 matches' point sets) and dedupe by `matchId` so re-views don't double-count.
- **Write path:** whenever `buildHeatmap` produces points for a `(player, match)`, append that match's points to the store (idempotent by `matchId`).
- **Seed:** on first aggregate request for a `(player, map)` with little/no data, parse telemetry for the last ~8 matches (reusing the single-match heatmap cache where possible) to populate the store. Sequential to respect the `/matches` rate limit; parse one telemetry file at a time to bound memory.
- **New endpoint:** `GET /api/player/heatmap/aggregate?shard=&accountId=&playerName=&map=<rawMapName>` → `{ map, displayName, mapMax, layers: { drop:[{x,y}], kill:[{x,y}], death:[{x,y}] }, matchesCount }`.
- Single-match endpoint unchanged.

### 7.3 Frontend

- **New "Maps" tab** added to `tabItems` in `frontend/src/pages/PlayerPage.jsx`. Contents: Antd `Select` (map) + `Segmented` (single ↔ aggregate) + `<MapField>`.
- **Single mode:** a match selector (default: most recent), then `getMatchHeatmap()` → markers/tooltips/insights migrated from `MatchHeatmap.jsx` onto `<MapField>`. The per-match modal entry stays as a quick action, also re-skinned onto the real map (shared component).
- **Aggregate mode:** new `getAggregateHeatmap()` API wrapper → canvas density layer on `<MapField>`, with layer toggles (landings/kills/deaths), an intensity legend, and a "N matches in sample" counter.
- **i18n:** new keys under `pages.matchHeatmap.*` and `pages.maps.*` in both `en.json` and `ua.json`. Theme accents (yellow/green) reused; the heat ramp is defined separately.

## 8. Data flow

- **Single:** Maps tab → `getMatchHeatmap()` (existing) → markers on `<MapField>`.
- **Aggregate:** Maps tab → `getAggregateHeatmap()` → backend reads store (seeds if sparse) → points → canvas heat on `<MapField>`.

## 9. Phasing

1. **Phase 0 — Foundation:** map images + precise `mapMax` table/registry + `<MapField>` (zoom/pan, world→pixel).
2. **Phase 1 — Single-match on real map:** refactor the existing heatmap onto `<MapField>`; add the "Maps" tab; re-skin the per-match modal.
3. **Phase 2 — Aggregate:** accumulation store + seed + aggregate endpoint + canvas density layer + layer toggles.
4. **Phase 3 — Optional:** real movement-density layer (`LogPlayerPosition`), zone overlays, two-player comparison.

## 10. Testing

- **Frontend (Jest + RTL, already configured):** `<MapField>` world→pixel math and zoom clamping; mode-toggle/map-selector logic; marker rendering from a fixture payload.
- **Backend:** unit tests for the telemetry parser and the accumulator (idempotent-by-matchId, size cap) against a small telemetry fixture; manual `curl` validation of the new aggregate endpoint.

## 11. Open details / risks

- **Exact `mapMax` for Vikendi/Deston/Rondo** — verify against the rendered image during Phase 0 (table above is the working assumption).
- **Real movement path** — deferred to Phase 3; Phase 1 keeps current marker behavior (the fake polyline is dropped rather than shipped as if real).
- **Store growth** — bounded by the per-key match cap + matchId dedupe; revisit if many players accumulate large samples.
- **Map image weight** — downscale + lazy-load to avoid shipping large PNGs; verify total bundle impact.
- **14-day retention** — seeding can only reach matches still served by the PUBG API; accumulation is what carries history forward.

## 12. References

- PUBG Telemetry docs: https://documentation.pubg.com/en/telemetry.html , telemetry-objects (coords/units), mapName dictionary.
- Map assets: `pubg/api-assets` (`Assets/Maps`, `*_No_Text_*`).
- Open-source reference for a fuller match viewer (future replay sub-project): `github.com/pubgsh/client`.
