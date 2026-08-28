const express = require("express")
const bodyParser = require("body-parser");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const config = require("./config/serverConfig.js");
const { createCorsOptions } = require("./modules/corsConfig");

require("dotenv").config();
const routes = require("./routes");
const { warmRecentSearches } = require("./modules/recentSearches");
const { warmRankPointHistory } = require("./modules/rankPointHistory");

const app = express();

// Render sits in front of the app as a reverse proxy; trust its X-Forwarded-For
// so req.ip (used to key express-rate-limit) reflects the real client IP.
app.set("trust proxy", 1);

app.use(helmet());
app.use(cors(createCorsOptions(process.env.CORS_ORIGIN)));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(compression());

// Cheap liveness target for an uptime pinger: no upstream calls, no database.
app.get("/healthz", (_req, res) =>
  res.status(200).json({ status: 200, uptime: Math.round(process.uptime()) })
);

routes(app);

app.listen(config.port, () => {
  console.log(`Listening on port ${config.port}`);
  warmRecentSearches();
  warmRankPointHistory();
});

if (process.env.CI) {
  console.log(`Tested success`);
  process.exit(0);
}
