# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

Two independent Node projects in one repo:

- `frontend/` — React 18 (Vite), Ant Design, SCSS, react-router-dom v6, react-switch-lang for i18n.
- `backend/` — Express API (CommonJS) that wraps the official PUBG API and a few third-party services.

Each project has its own `package.json` and `node_modules`. There is no root-level package manager.

## Common commands

Run all commands from the relevant subdirectory (`cd frontend` or `cd backend`):

| Task | Command |
| --- | --- |
| Install deps | `npm install` (run in both `frontend/` and `backend/`) |
| Frontend dev server | `npm start` (Vite dev server, proxies `/api` → `http://localhost:3003`) |
| Frontend prod build | `npm run build` (Vite) |
| Frontend tests | `npm test` (Vitest, single run); `npm run test:watch` for watch mode |
| Run a single frontend test | `npm test -- SomeFile` (Vitest filters test files by path substring) |
| Backend tests | `npm test` (= `node --test`) |
| Backend (one-shot) | `npm start` (= `node server.js`) |
| Backend (auto-reload) | `npx nodemon server.js` |

Frontend tests use Vitest + React Testing Library (jsdom env, `globals: true`), configured in the `test` block of `frontend/vite.config.js` with `frontend/src/setupTests.js` importing `@testing-library/jest-dom`. Backend tests use Node's built-in `node:test` runner; live PUBG API behavior still needs manual validation (e.g. `curl` against `http://localhost:3003/api/...`) since it requires a `PUBG_API_KEY`.

## Environment variables

`backend/.env` (loaded via `dotenv`):

- `PUBG_API_KEY` — required for all `/api/player/*` endpoints.
- `STEAM_API_KEY` (or `STEAM_WEB_API_KEY`) — used to enrich Steam avatars.
- `PORT` / `SERVER_PORT` — production port (dev hard-codes `3003` in `backend/config/serverConfig.js`).
- `PUBG_SEASON_END_AT` / `PUBG_SEASON_END_DATE` — optional override for the live-snapshot countdown.

Frontend:

- `REACT_APP_API_URL` — overrides the API base. In development it defaults to `/api` (relying on the Vite dev-server proxy); in production it defaults to `https://pubgtracker-api.onrender.com/api` (`frontend/src/api/config.js`).

## Architecture

### Backend request flow

`server.js` → `routes.js` (registers `routes/player.js` and `routes/articles.js`) → controllers (`controllers/player.js`, `controllers/articles.js`, `controllers/email.js`) → modules (`modules/*`).

Routes use `express-validator` via `Controller.validate(method)`; controllers always return HTTP 200 even on caught errors, embedding `{ status, message }` in the body.

Player endpoints:

- `POST /api/player/rank` — main stats endpoint, drives `parsePlayerRank`.
- `POST /api/player/steamid` — resolves a `steamcommunity.com` URL to a Steam vanity name.
- `POST /api/player/reports` — wraps `api.pubg.report` for kill/death encounters.
- `GET  /api/player/live` — live snapshot (Steam concurrent users + season countdown).
- `GET  /api/player/recent` — last N entries from `backend/json/last-searcheds.json`.

### PUBG ingestion (`backend/modules/playerRank/`)

The PUBG pipeline is the most non-obvious part of the codebase. It is built as a factory: `getPlayerRank.js` instantiates `createParsePlayerRank({ pubgApiKey, steamApiKey })` once at boot, wiring together services that share the in-memory caches in `state.js`.

Caches (all `Map`-based, in-process, with TTLs in `state.js`):

- `playerCache` — `playerName → accountId`
- `playerNameCache` — reverse lookup for account IDs (`account.*`)
- `statsCache` — full mapped response per `(shard, accountId, seasonId)`, 10 min TTL
- `lifetimeStatsCache`, `seasonCatalogCache`, `playerProfileCache`, `clanCache`, `masteryCache`, `matchSummaryCache`, `steamAvatarCache` — per-resource TTLs
- `inFlightRankRequests` — request-coalescing for concurrent identical lookups
- `stalePlayerDataCache` — last-known-good responses, served when the PUBG API returns 429

`parsePlayerRank.js` orchestrates the flow: resolve player → check stats cache → fetch lifetime + season + ranked-season + profile extras (clan, mastery, recent matches) → run through `statsMapper.js` → cache. `repairCachedPayload` and `enrichCachedPayload` upgrade older cached entries on the fly when the cached shape is missing fields the current code expects.

Rate-limit handling: when PUBG returns 429, `setRateLimited()` flips a 20s cooldown; during cooldown, lookups skip the network and serve from `stalePlayerDataCache` if available.

`recentSearches.js` serializes writes through `mutationQueue` so concurrent `addRecentSearch` calls don't corrupt `backend/json/last-searcheds.json`.

### Frontend routing and API

`src/index.js` mounts `RouterLayout` inside `BrowserRouter`. Routes are declared in `src/router/routes.js` and rendered by `src/router/RouterLayout.jsx`.

Note: `src/App.jsx` is a legacy wrapper duplicated by `RouterLayout.jsx` and is not mounted — edits to layout/theme should go in `RouterLayout.jsx`.

Theme switching uses a global handle: `RouterLayout` assigns `window.App.changeTheme(theme)` so the legacy `SetTheme` component can drive the theme without prop wiring.

API calls live in `src/api/`:

- `config.js` — resolves `API_URL` from `REACT_APP_API_URL` or environment defaults.
- `fetch.js` — `post`/`get` helpers; on non-OK responses they throw an `Error` with `status` and `payload` attached and (when the third arg is true) trigger an Ant Design notification via `component/Notification`.
- `player.js`, `all/articles.js` — typed wrappers used by pages.

### Persistence on the client

`src/cookie/store.js` (despite the name, uses `localStorage`) keeps:

- `history` — last 5 viewed players
- `favorites` — up to 50

It dispatches `history:updated` / `favorites:updated` `CustomEvent`s on `window` so other components stay in sync without a state library.

### Player identity helpers (mirrored)

`frontend/src/helpers/playerIdentity.js` (ESM) and `backend/modules/playerIdentity.js` (CommonJS) implement the same `normalizePlatform` / `isAccountIdentifier` / `stripPlatformPrefix` logic. Changes must be made in both. The frontend file additionally exports `normalizeDisplayName` and `resolvePreferredPlayerName` used by pages.

Account identifiers from PUBG look like `account.<32hex>`; user-facing handles are anything else. Most controllers and the cache key logic guard against accidentally storing `account.*` strings as nicknames.

### i18n

Translations are JSON dictionaries in `frontend/src/Language/{en,ua}.json`, wired through `react-switch-lang` in `SetLanguage.jsx`. Components consume via the `translate` HOC and call `t("key")`.

## Coding conventions

- Frontend: 2-space indent, semicolons, ESM. Components and page files in `PascalCase` (`PlayerPage.jsx`); helpers and modules in `camelCase` (`playerIdentity.js`).
- Backend: 2-space indent, semicolons, CommonJS (`require` / `module.exports`).
- Keep UI work consistent with existing Ant Design + SCSS patterns; the SCSS lives in `frontend/src/style/style.scss` with shared mixins in `mixins.scss`.
- Don't rename top-level folders such as `component/` or `Language/`.

## Commit style

Recent history uses Conventional Commits (`feat:`, `fix:`, `chore:`). Keep subjects short and imperative.
