const { Resend } = require("resend");
const { validationResult, body } = require("express-validator");
const MESSAGE = require("../constant/responseMessage");
const { escapeHtml } = require("../modules/escapeHtml");

// Built on first send, not at import. The Resend constructor throws on a
// missing key, and this module is reached from server.js through routes.js ->
// routes/articles.js -- so at module scope that throw happened inside require,
// before app.listen, and took player stats, replays, leaderboards and the
// census down with a key only the bug-report form needs.
let client = null;

const getClient = () => {
    if (!process.env.RESEND_API_KEY) return null;
    if (!client) client = new Resend(process.env.RESEND_API_KEY);
    return client;
};

module.exports.validate = (method) => {
    switch (method) {
        case "sendBugReport": {
            return [
                body("name").optional({ nullable: true }).isString().isLength({ max: 100 }),
                body("email")
                    .optional({ nullable: true, checkFalsy: true })
                    .isEmail()
                    .isLength({ max: 254 }),
                body("description").exists().isString().trim().isLength({ min: 1, max: 5000 }),
            ];
        }
        default:
            return [];
    }
};

module.exports.sendBugReport = async (req, res) => {
    try {
        const error = validationResult(req);
        if (!error.isEmpty()) {
            return res.status(422).json({ status: 422, message: MESSAGE.VALIDATOR.ERROR });
        }

        const { name, email, description } = req.body;

        if (!description || !description.trim()) {
            return res.status(400).json({ status: 400, message: "Description is required" });
        }

        // Ours to fix, not the reporter's, and a different thing from a send
        // that failed -- so it says so rather than falling into the catch and
        // returning the SDK's constructor advice as a 500.
        const resend = getClient();
        if (!resend) {
            console.error("Email error: RESEND_API_KEY is not set; bug report dropped");
            return res.status(503).json({ status: 503, message: "Bug reports are temporarily unavailable" });
        }

        const { error: sendError } = await resend.emails.send({
            from: "PubG Tracker <onboarding@resend.dev>",
            to: process.env.EMAIL_USER || "ostaplvov@gmail.com",
            subject: `Bug Report from ${name || "Anonymous"}`,
            html: `
                <h2>Bug Report</h2>
                <p><strong>Name:</strong> ${escapeHtml(name) || "Not provided"}</p>
                <p><strong>Email:</strong> ${escapeHtml(email) || "Not provided"}</p>
                <hr/>
                <h3>Description:</h3>
                <p>${escapeHtml(description).replace(/\n/g, "<br/>")}</p>
            `,
        });

        // The SDK resolves with `{ data, error }` rather than rejecting, so an
        // API refusal never reaches the catch below. Unread, it made every
        // failure -- a revoked key, a rate limit, a rejected recipient -- tell
        // the reporter their report was sent, and lose it.
        if (sendError) {
            console.error("Email error: send refused:", sendError);
            return res.status(502).json({ status: 502, message: "Failed to send bug report" });
        }

        return res.status(200).json({ status: 200, message: "Bug report sent successfully" });
    } catch (e) {
        console.error("Email error:", e);
        return res.status(500).json({ status: 500, message: "Failed to send bug report", error: e.message });
    }
};
