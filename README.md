# PUBG Tracker

Web app for tracking PUBG player stats: ranks, match history, leaderboards, profile comparisons. Built on top of the official PUBG Developer API.

**Live:** [pubgtracker.top](https://www.pubgtracker.top)

## Stack

- **Frontend** — React 18 + Vite, Ant Design, react-router-dom, recharts
- **Backend** — Node + Express
- **i18n** — English and Ukrainian
- **Hosting** — Cloudflare Pages (frontend) + Render (backend)

## Run locally

Requires **Node 22.12+** and npm.

```bash
# 1. Install deps
cd frontend && npm install
cd ../backend && npm install

# 2. Create backend/.env with a PUBG API key
echo "PUBG_API_KEY=your_key_here" > backend/.env

# 3. Run (in two terminals)
cd backend && node server.js          # port 3003
cd frontend && npm start              # Vite picks the first free port
```

Get a PUBG key at [developer.pubg.com](https://developer.pubg.com).

## Build and deploy

```bash
cd frontend && npm run build          # → frontend/build/
```

Production deploy is automatic: push to `main` → Cloudflare Pages builds and ships the frontend. The backend deploys separately on Render.

## Layout

```
frontend/   React frontend
backend/    Express backend, wraps PUBG / Steam APIs
```

Each folder is its own npm project with its own `package.json`.
