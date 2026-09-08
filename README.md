# PUBG Tracker

Web app for tracking PUBG player stats: ranks, match history, leaderboards, profile comparisons. Built on top of the official PUBG Developer API.

**Live:** [pubgtracker.top](https://www.pubgtracker.top)

## Measured PUBG rank distribution

The site samples ranked matches every day and publishes the resulting tier
distribution as files. It does that because nothing else on the web publishes a
measured one: the tables in circulation either trace back to a collection that
stopped years ago, or give round numbers with no method attached.

- [`/data/tier-census.json`](https://www.pubgtracker.top/data/tier-census.json) — per-tier share, 95% interval, counts, sample size and the window it covers
- [`/data/tier-census.csv`](https://www.pubgtracker.top/data/tier-census.csv) — the same rows, one line per tier
- [The method, in full](https://www.pubgtracker.top/ranks) — including what it does not claim

Refreshed daily by [`.github/workflows/tier-census.yml`](.github/workflows/tier-census.yml),
which commits the reading it just collected. The file's git history in this repo
is therefore the measurement's history.

### What the numbers say, and what they do not

The sample comes from PUBG's own match list on the **PC (Steam)** shard: fifteen
players drawn from each sampled ranked match, every account counted once at its
most recent reading, pooled over a rolling week. Intervals are widened for lobby
clustering — players in one match are alike because matchmaking put them there —
and a tier whose own sample is too thin carries `publishable: false` instead of
a number.

Because the sample is drawn from **matches** rather than from a list of
accounts, a share answers *where a random ranked lobby seat sits*, not what
percentage of account holders sit in a tier: a player who queues twenty times a
week is likelier to appear than one who queues twice. Console and Kakao run
their own ladders and are not measured here. And there are no per-tier RP bands
in this data, because KRAFTON has never published any.

## Stack

- **Frontend** — React 18 + Vite, Ant Design, react-router-dom, recharts
- **Backend** — Node + Express
- **i18n** — English and Ukrainian

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

## Production build

```bash
cd frontend && npm run build          # → frontend/build/
```

## Layout

```
frontend/   React frontend
backend/    Express backend, wraps PUBG / Steam APIs
```

Each folder is its own npm project with its own `package.json`.
