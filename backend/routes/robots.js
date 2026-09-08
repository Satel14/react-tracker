// api.pubgtracker.top answered 404 for /robots.txt, and to a crawler a missing
// robots.txt is not silence -- it is permission. Nothing on this host is meant
// to be read by one: every endpoint costs a database read or PUBG quota, the
// service sleeps after fifteen idle minutes on the free plan, and the site
// serves its own robots.txt and sitemap from its own host.
//
// A browser does not consult robots.txt before an XHR, so the site's own calls
// are untouched by this.
const ROBOTS_BODY = "User-agent: *\nDisallow: /\n";

module.exports = (app) => {
  app.get("/robots.txt", (_req, res) => res.type("text/plain").send(ROBOTS_BODY));
};

module.exports.ROBOTS_BODY = ROBOTS_BODY;
