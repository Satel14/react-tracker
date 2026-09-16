import { lazy } from "react";
import ErrorPage from "../pages/ErrorPage";
import Main from "../pages/Main";
// Prerendered routes are imported statically on purpose. Their article is
// already in the static HTML; loading the component lazily makes React render
// a spinner for one frame and throw that article away, which moved CLS from
// 0.001 to 0.164 on /ranks. See eagerRoutes.test.js.
import Help from "../pages/Help";
import Ranks from "../pages/Ranks";
import RankPoints from "../pages/RankPoints";
import RankedLobbies from "../pages/RankedLobbies";
import StatsByRank from "../pages/StatsByRank";

const PlayerPage = lazy(() => import("../pages/PlayerPage"));
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
    path: "/ranks",
    component: Ranks,
    exact: true,
  },
  // Same component, read from the ua dictionary. The language comes from the
  // URL rather than from localStorage -- see languageForPath in routeMeta.
  {
    path: "/ua/ranks",
    component: Ranks,
    exact: true,
  },
  {
    path: "/rank-points",
    component: RankPoints,
    exact: true,
  },
  // Same component, read from the ua dictionary. The language comes from the
  // URL rather than from localStorage -- see languageForPath in routeMeta.
  {
    path: "/ua/rank-points",
    component: RankPoints,
    exact: true,
  },
  {
    path: "/ranked-lobbies",
    component: RankedLobbies,
    exact: true,
  },
  // Same component, read from the ua dictionary. The language comes from the
  // URL rather than from localStorage -- see languageForPath in routeMeta.
  {
    path: "/ua/ranked-lobbies",
    component: RankedLobbies,
    exact: true,
  },
  {
    path: "/stats-by-rank",
    component: StatsByRank,
    exact: true,
  },
  // Same component, read from the ua dictionary. The language comes from the
  // URL rather than from localStorage -- see languageForPath in routeMeta.
  {
    path: "/ua/stats-by-rank",
    component: StatsByRank,
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
