// The one structured-data node this site ships, built in one place.
//
// It used to be a literal in index.html that two consumers patched by hand.
// The build swapped its `url` per route with a regex; the Pages Function
// swapped nothing at all — so every URL the Function serves carried a node
// claiming to be the site root while the canonical beside it said otherwise,
// which is a page contradicting itself in the machine-readable half. And the
// `description` was the homepage's on all nine routes, including a
// two-thousand-word article about the ranked ladder.
//
// A WebApplication describing the app, stated at the URL it is being served
// from. Deliberately no `aggregateRating` and no `review`: Google's software-app
// rich result requires one of them, there is no honest source for either here,
// and inventing them is not on the table.
//
// Extension-free imports elsewhere in src/; renderHead.js is loaded by
// vite.config.js under Node's resolver, so the specifier it uses is spelled out.

export const SITE_NAME = "PUBG Tracker";

// JSON.stringify leaves `<` alone, and this string is written inside a
// <script> element: a description containing "</script>" would close it and
// spill the rest of the node into the page as markup. `<` is the same
// character to a JSON parser and inert to an HTML one, so the guard holds by
// construction rather than because our own copy happens not to contain one.
const scriptSafe = (json) => json.replace(/</g, "\\u003C");

export const webApplicationLd = ({ url, description }) =>
  scriptSafe(JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: SITE_NAME,
      url,
      description,
      applicationCategory: "GameApplication",
      operatingSystem: "Web",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    },
    null,
    2,
  ));
