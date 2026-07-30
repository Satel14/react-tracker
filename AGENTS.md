# Repository Guidelines

## Project Structure & Module Organization

This repository is split into two Node projects. `frontend/` contains the React 18 client built with Vite. The entry point is `frontend/src/index.jsx`; routes are declared in `src/router/routes.js` and rendered by `src/router/RouterLayout.jsx`. Application code lives in `frontend/src/`, with pages in `src/pages/`, shared UI in `src/component/`, API wrappers in `src/api/`, helpers in `src/helpers/`, translations in `src/Language/`, and SCSS in `src/style/`. Static assets are in `frontend/public/`.

`backend/` contains the Express API. Entry points are `backend/server.js` and `backend/routes.js`; handlers live in `backend/controllers/`, route definitions in `backend/routes/`, domain modules in `backend/modules/`, JSON data in `backend/json/`, and config in `backend/config/`.

## Build, Test, and Development Commands

Run commands from the relevant subdirectory:

- `cd frontend && npm start`: run the Vite dev server, proxying `/api` to `http://localhost:3003`.
- `cd frontend && npm run build`: create a production client build (Vite).
- `cd frontend && npm test`: run the Vitest suite once.
- `cd frontend && npm run test:watch`: run the Vitest suite in watch mode.
- `cd frontend && npm run lint`: run ESLint (`eslint .`).
- `cd backend && npm start`: start the Express server with `node server.js`.
- `cd backend && npx nodemon server.js`: start the API with reloads during local development.
- `cd backend && npm test`: run the backend test suite (`node --test`).
- `cd backend && npm run lint`: run ESLint (`eslint .`).

Run `npm install` in both projects before first use or after dependency changes.

## Coding Style & Naming Conventions

Use JavaScript and JSX consistently with nearby code. Prefer 2-space indentation, semicolons in frontend files, and CommonJS `require`/`module.exports` in backend files. Name React components and page files in `PascalCase` (`PlayerPage.jsx`) and helpers/modules in `camelCase` (`playerIdentity.js`).

Keep UI changes aligned with existing Ant Design, SCSS, and component patterns. Avoid broad folder renames such as `component` or `Language`.

## Testing Guidelines

Frontend tests use Vitest with React Testing Library. The suite is split into two Vitest projects declared under `test.projects` in `frontend/vite.config.js`: `logic` runs pure-logic specs (helpers, API wrappers, language files) in a Node environment with no DOM, and `dom` runs component specs in a jsdom environment via `frontend/src/setupTests.js`, which imports `@testing-library/jest-dom`. Add tests beside covered code using `*.test.js` or `*.test.jsx`. Focus on rendered behavior, routing, and API-state handling. The backend uses Node's built-in `node:test` runner (`npm test` = `node --test`) and has a real test suite; live PUBG API behavior still needs manual validation (e.g. `curl` against `http://localhost:3003/api/...`) since it requires a `PUBG_API_KEY`.

CI (`.github/workflows/ci.yml`) runs `npm run lint` and `npm test` for both the frontend and backend projects on every push and pull request.

## Commit & Pull Request Guidelines

Recent history mostly uses Conventional Commit prefixes such as `feat:`, `fix:`, and `chore:`. Keep subjects short, imperative, and specific, for example `fix: normalize Steam avatar fallback`.

Pull requests should describe the change, list verification steps, link related issues when available, and include screenshots for visible frontend changes. Mention any required environment variables or deployment changes.

## Security & Configuration Tips

The backend loads `.env` through `dotenv`; do not commit API keys, mail credentials, or service tokens. `RESEND_API_KEY` is required, not optional: `backend/controllers/email.js` constructs the Resend client at module scope, and that module is reached from `server.js` → `routes.js` → `routes/articles.js`, so a missing key throws before `app.listen` runs and the entire API fails to boot — not just the bug-report endpoint. Production port selection uses `PORT` or `SERVER_PORT`, while development defaults to `3003`.
