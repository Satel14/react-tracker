import ErrorPage from "../pages/ErrorPage";
import PlayerPage from "../pages/PlayerPage";
import Main from "../pages/Main";
import Help from "../pages/Help"
import Player from "../pages/Player";
import FavoritesPage from '../pages/Favorites'
import BugReportPage from '../pages/BugReportPage'
import Compare from '../pages/Compare'
import Overlay from '../pages/Overlay'
import MatchReplayPage from '../pages/MatchReplayPage'
import Leaderboard from '../pages/Leaderboard'
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
