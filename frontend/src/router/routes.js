import { lazy } from "react";
import ErrorPage from "../pages/ErrorPage";
import Main from "../pages/Main";

const PlayerPage = lazy(() => import("../pages/PlayerPage"));
const Help = lazy(() => import("../pages/Help"));
const Player = lazy(() => import("../pages/Player"));
const FavoritesPage = lazy(() => import("../pages/Favorites"));
const BugReportPage = lazy(() => import("../pages/BugReportPage"));
const Compare = lazy(() => import("../pages/Compare"));
const Overlay = lazy(() => import("../pages/Overlay"));
const MatchReplayPage = lazy(() => import("../pages/MatchReplayPage"));
const Leaderboard = lazy(() => import("../pages/Leaderboard"));

const routes = [
  {
    path: "/",
    component: Main,
    exact: true,
  },
  {
    path: "/404",
    component: ErrorPage,
    exact: true,
  },
  {
    path: "/help",
    component: Help,
    exact: true,
  },
  {
    path: "/player/:platform/:gameId",
    component: PlayerPage,
    exact: true,
  },
  {
    path: "/player",
    component: Player,
    exact: true,
  },
  {
    path: "/favorites",
    component: FavoritesPage,
    exact: true,
  },
  {
    path: "/leaderboards",
    component: Leaderboard,
    exact: true,
  },
  {
    path: "/bugreport",
    component: BugReportPage,
    exact: true,
  },
  {
    path: "/compare",
    component: Compare,
    exact: true,
  },
  {
    path: "/overlay/:platform/:gameId",
    component: Overlay,
    exact: true,
  },
  {
    path: "/match/:platform/:matchId/replay",
    component: MatchReplayPage,
    exact: true,
  },
];

export default routes;
