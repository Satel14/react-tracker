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
import en from "../Language/en.json";
import ua from "../Language/ua.json";

// One entry per URL, not per component: /ranks and /ua/ranks are the same
// article read from different dictionaries, and the URL is what decides which.
// Everything else in the shell is still English -- language stays a
// client-side choice on every route that does not carry one in its path.
const PAGES = {
  "/ranks": { Page: Ranks, language: "en" },
  "/ua/ranks": { Page: Ranks, language: "ua" },
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
