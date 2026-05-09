# PUBG Tracker

Web app that surfaces PUBG player stats, match history, and leaderboards on top of the official PUBG Developer API. Live at [pubgtracker.top](https://www.pubgtracker.top).

This repo holds two independent Node projects:

| Folder | Stack | Purpose |
| --- | --- | --- |
| [`frontend/`](./frontend) | React 18 + Vite 8, Ant Design 5, SCSS, react-router-dom v6, Recharts, Framer Motion, react-switch-lang (en/ua) | Single-page app served as static assets |
| [`backend/`](./backend) | Node + Express (CommonJS) | API that wraps PUBG, Steam, and a few third-party services |

There is no root-level `package.json`. Each project manages its own deps and lockfile.

## Prerequisites

- **Node.js 22.12+** (Vite 8 requires `^20.19.0 || >=22.12.0`)
- **npm 10+**

## Quick start

```bash
# 1. Install (in two folders separately)
cd frontend && npm install
cd ../backend && npm install

# 2. Backend env (see "Environment variables" below)
cp backend/.env.example backend/.env   # if you have an example, otherwise create
$EDITOR backend/.env

# 3. Run
# Terminal A:
cd backend && npx nodemon server.js    # or: node server.js

# Terminal B:
cd frontend && npm start               # Vite dev server, picks first free port from 3000+
```

The Vite dev server proxies `/api/*` → `http://localhost:3003`, so the frontend talks to the backend via same-origin during development.

## Environment variables

### Backend (`backend/.env`, loaded via `dotenv`)

| Variable | Required | Purpose |
| --- | --- | --- |
| `PUBG_API_KEY` | yes | All `/api/player/*` endpoints |
| `STEAM_API_KEY` (or `STEAM_WEB_API_KEY`) | optional | Enriches Steam avatars |
| `PORT` / `SERVER_PORT` | optional | Production port (dev hardcodes `3003` in `backend/config/serverConfig.js`) |
| `PUBG_SEASON_END_AT` / `PUBG_SEASON_END_DATE` | optional | Override for the live-snapshot countdown |
| Resend / nodemailer keys | optional | Only if you wire up the email controller |

Get a PUBG key at [developer.pubg.com](https://developer.pubg.com).

### Frontend

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | optional | Overrides the API base. In dev defaults to `/api` (Vite proxy); in production defaults to `https://pubgtracker-api.onrender.com/api`. See `frontend/src/api/config.js`. |

## Common commands

Run from the relevant folder.

### Frontend (`cd frontend`)

| Command | What it does |
| --- | --- |
| `npm install` | Install deps |
| `npm start` | Vite dev server with `/api` proxy |
| `npm run build` | Production build → `frontend/build/` |
| `npm run preview` | Serve the production build locally on port 4173 |

### Backend (`cd backend`)

| Command | What it does |
| --- | --- |
| `npm install` | Install deps |
| `npm start` (= `node server.js`) | One-shot start |
| `npx nodemon server.js` | Auto-reload during development |

The backend has no test script. Validate API changes with `curl` against `http://localhost:3003/api/...`.

## Backend API surface

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/player/rank` | POST | Main stats endpoint (drives `parsePlayerRank`) |
| `/api/player/steamid` | POST | Resolves a `steamcommunity.com` URL to a Steam vanity name |
| `/api/player/reports` | POST | Wraps `api.pubg.report` for kill/death encounters |
| `/api/player/live` | GET | Live snapshot (Steam concurrent users + season countdown) |
| `/api/player/recent` | GET | Last N entries from `backend/json/last-searcheds.json` |
| `/api/articles/*` | GET/POST | Article CRUD (see `routes/articles.js`) |

Player endpoints sit behind a factory in `backend/modules/playerRank/` that wires together the PUBG and Steam clients with a set of in-process caches (see `state.js`). The pipeline coalesces concurrent identical lookups, repairs older cached payloads on the fly, and serves last-known-good data from `stalePlayerDataCache` when the PUBG API responds with HTTP 429.

## Repo layout (highlights)

```
backend/
  server.js              Express bootstrap + listen
  routes.js              Route registration
  routes/                player.js, articles.js
  controllers/           player, articles, email
  modules/playerRank/    PUBG + Steam pipeline (factory + caches in state.js)
  modules/playerIdentity Mirror of frontend's identity helpers (CommonJS)
  config/serverConfig.js Dev port / env wiring
  json/last-searcheds.json  Recent-search persistence (mutex-guarded)
  .env                   (gitignored) PUBG / Steam keys

frontend/
  index.html             Vite entry HTML
  vite.config.js         Vite config: /api proxy, build/ outDir, env prefix
  src/
    index.jsx            Root mount, BrowserRouter
    router/              RouterLayout (active), routes.js
    pages/               PlayerPage (largest), Compare, ...
    component/           Shared UI (Navbar, FavoritesList, MatchHeatmap, ...)
    api/                 fetch.js helpers, config.js (API_URL resolution)
    helpers/             Shared utils, including playerIdentity.js (mirrors backend)
    Language/            en.json / ua.json + SetLanguage HOC wrapper
    style/               style.scss + mixins.scss
    cookie/store.js      localStorage-backed history/favorites with CustomEvent sync
  public/                Static assets (logos, manifest, _redirects, sitemap, ...)
```

## Architecture notes

- **Theme switching** uses a global handle: `RouterLayout` assigns `window.App.changeTheme(theme)` so the legacy `SetTheme` component can drive the theme without prop wiring.
- **Persistence on the client** lives in `frontend/src/cookie/store.js` (localStorage despite the name): up to 5 history entries and 50 favorites, broadcast as `history:updated` / `favorites:updated` `CustomEvent`s on `window`.
- **`playerIdentity` is mirrored** between `frontend/src/helpers/playerIdentity.js` (ESM) and `backend/modules/playerIdentity.js` (CommonJS). Changes must be made in both. PUBG account identifiers look like `account.<32hex>`; user-facing handles are anything else.
- **Rate-limit handling**: the `playerRank` pipeline flips a 20-second cooldown on PUBG 429 responses and serves stale cache during the cooldown.
- **i18n**: components consume strings via the `translate` HOC and call `t("key")`. Dictionaries are JSON in `frontend/src/Language/{en,ua}.json`.

## Deployment

- **Frontend** → Cloudflare Pages, project `react-tracker`. Build command `npm run build`, output `build`, root `frontend`. Deploy on push to `main`. Preview deploys are created automatically for branch pushes.
- **Backend** → Render (`pubgtracker-api.onrender.com`).
- **DNS** is managed at thehost.com.ua: `www.pubgtracker.top` → Cloudflare Pages, `api.pubgtracker.top` → Render.

`frontend/public/_redirects` carries route rules that Cloudflare Pages applies on deploy. SPA fallback is handled by Cloudflare's default behavior, so only the explicit static-file rules (Google verification, sitemap, robots.txt) live in the file.

## Coding conventions

- 2-space indent, semicolons, double quotes for strings.
- Frontend: ESM. Components and page files in `PascalCase` (`PlayerPage.jsx`); helpers and modules in `camelCase` (`playerIdentity.js`). UI work follows existing Ant Design + SCSS patterns.
- Backend: CommonJS (`require` / `module.exports`).
- Don't rename top-level folders such as `component/` or `Language/`.

## Commit style

Conventional Commits: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`. Subjects short and imperative.
