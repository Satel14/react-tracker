// Renders a route's real page component to static HTML at build time.
//
// The static shells used to carry a hand-written heading and one sentence. That
// is the right amount for the application routes, but /ranks is a
// seventeen-hundred-word article and a crawler was reading about fifty words of
// it -- the rest existed only after the bundle ran.
//
// Rendering the component rather than writing the article out twice is the
// whole point: the text a crawler reads is the text a visitor sees, by
// construction, and a paragraph added to the copy cannot land in one and not
// the other.
//
// Extensions are spelled out because vite.config.js imports this under Node's
// resolver, where extensionless ESM specifiers do not resolve.

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server.mjs";
import { setTranslations, setDefaultLanguage, setLanguage } from "react-switch-lang";
import Ranks from "../pages/Ranks.jsx";
import RankPoints from "../pages/RankPoints.jsx";
import HomeIntro from "../component/home/HomeIntro.jsx";
import HomeHeading from "../component/home/HomeHeading.jsx";
import HomeGuideLinks from "../component/home/HomeGuideLinks.jsx";
import Help from "../pages/Help.jsx";
import LeaderboardStatic from "../component/leaderboard/LeaderboardIntro.jsx";
import en from "../Language/en.json";
import ua from "../Language/ua.json";

// One entry per URL, not per component: /ranks and /ua/ranks are the same
// article read from different dictionaries, and the URL is what decides which.
// Everything else in the shell is still English -- language stays a
// client-side choice on every route that does not carry one in its path.
// The homepage renders its shared heading, guide links and body, without
// the search or live widgets that need the application context.
//
// /help joined once its answers existed in the DOM at all. antd's collapse
// renders a closed panel's content as null, so a static render of that page
// used to produce ten questions with nothing under them -- the same nothing a
// crawler got from the client render, which is why Google fell back to
// snippeting the site footer for the URL. With forceRender on each panel it is
// six hundred words of answers, which is worth putting in the file.
//
// /leaderboards renders its two halves that are words rather than data: the
// heading and the explainer the page puts either side of its table. The table
// is still absent, for the reason it always was -- live standings would need a
// build-time call to an API that sleeps, and would hand a crawler numbers that
// stopped matching the page the moment they were written.
const HomeStatic = () => (
  <>
    <HomeHeading />
    <HomeGuideLinks />
    <HomeIntro />
  </>
);

const PAGES = {
  "/ranks": { Page: Ranks, language: "en" },
  "/ua/ranks": { Page: Ranks, language: "ua" },
  "/rank-points": { Page: RankPoints, language: "en" },
  "/ua/rank-points": { Page: RankPoints, language: "ua" },
  "/": { Page: HomeStatic, language: "en" },
  "/help": { Page: Help, language: "en" },
  "/leaderboards": { Page: LeaderboardStatic, language: "en" },
};

export const PRERENDERED_ROUTES = Object.keys(PAGES);

export const prerenderBody = (path) => {
  const entry = PAGES[path];
  if (!entry) return null;
  const { Page, language } = entry;

  setTranslations({ en, ua });
  setDefaultLanguage("en");
  // Set per call, not once: the build renders every route in one process, so a
  // language left over from the previous page would ship on this one.
  setLanguage(language);

  // StaticRouter, not the memory one: it is react-router's own answer for a
  // render with no browser behind it, and it does not warn about layout
  // effects that cannot run here.
  return renderToStaticMarkup(
    <StaticRouter location={path}>
      <Page />
    </StaticRouter>,
  );
};

export default prerenderBody;
