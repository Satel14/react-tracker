const ArticlesController = require("../controllers/articles");
const EmailController = require("../controllers/email");

module.exports = (router) => {
    router.get(
        "/api/articles/bugreport",
        ArticlesController.getBugReport
    );
    router.get(
        "/api/articles/aboutme",
        ArticlesController.getAboutMe
    );
    router.get(
        "/api/articles/roadmap",
        ArticlesController.getRoadmap
    );
    router.post(
        "/api/bugreport/send",
        EmailController.sendBugReport
    );
};
