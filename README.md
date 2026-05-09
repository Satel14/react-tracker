# PUBG Tracker

Веб-додаток для відстеження статистики гравців PUBG: ранги, історія матчів, лідерборди, порівняння профілів. Працює поверх офіційного PUBG Developer API.

**Live:** [pubgtracker.top](https://www.pubgtracker.top)

## Стек

- **Frontend** — React 18 + Vite, Ant Design, react-router-dom, recharts
- **Backend** — Node + Express
- **i18n** — українська та англійська
- **Хостинг** — Cloudflare Pages (фронт) + Render (бек)

## Запуск локально

Потрібен **Node 22.12+** і npm.

```bash
# 1. Встановити залежності
cd frontend && npm install
cd ../backend && npm install

# 2. Створити backend/.env з ключем PUBG API
echo "PUBG_API_KEY=your_key_here" > backend/.env

# 3. Запустити (у двох терміналах)
cd backend && node server.js          # порт 3003
cd frontend && npm start              # Vite сам обере вільний порт
```

Ключ PUBG отримати на [developer.pubg.com](https://developer.pubg.com).

## Білд та деплой

```bash
cd frontend && npm run build          # → frontend/build/
```

Прод-деплой автоматичний: push у `main` → Cloudflare Pages робить білд і викочує. Бекенд деплоїться окремо на Render.

## Структура

```
frontend/   React-фронт
backend/    Express-бек, обгортка над PUBG/Steam API
```

Кожна папка — окремий npm-проект зі своїм `package.json`.
