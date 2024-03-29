import ErrorPage from "../pages/ErrorPage";
import PlayerPage from "../pages/PlayerPage";
import Main from "../pages/Main";
import Help from "../pages/Help"
import Player from "../pages/Player";
import FavoritesPage from '../pages/Favorites'
import BugReportPage from '../pages/BugReportPage'
const routes = [
  {
    path: "/",
    layout: Main,
    component: Main,
    exact: true,
  },
  {
    path: "/404",
    layout: ErrorPage,
    component: ErrorPage,
    exact: true,
  },
  {
    path: "/help",
    layout: Help,
    component: Help,
    exact: true,
  },
  {
    path: "/player",
    layout: Player,
    component: Player,
    exact: true,
  },
  {
    path: "/playerpage",
    layout: PlayerPage,
    component: PlayerPage,
    exact: true,
  },
  {
    path: "/favorites",
    layout: FavoritesPage,
    component: FavoritesPage,
    exact: true,
  },
  {
    path: "/bugreport",
    layout: BugReportPage,
    component: BugReportPage,
    exact: true,
  },
];

export default routes;
