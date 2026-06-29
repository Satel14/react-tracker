module.exports = (app) => {
    require("./routes/player")(app);
    require("./routes/articles")(app);
    require("./routes/leaderboard")(app);
};