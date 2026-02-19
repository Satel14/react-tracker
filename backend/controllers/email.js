const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

module.exports.sendBugReport = async (req, res) => {
    try {
        const { name, email, description } = req.body;

        if (!description || !description.trim()) {
            return res.status(400).json({ status: 400, message: "Description is required" });
        }

        await resend.emails.send({
            from: "PubG Tracker <onboarding@resend.dev>",
            to: process.env.EMAIL_USER || "ostaplvov@gmail.com",
            subject: `Bug Report from ${name || "Anonymous"}`,
            html: `
                <h2>Bug Report</h2>
                <p><strong>Name:</strong> ${name || "Not provided"}</p>
                <p><strong>Email:</strong> ${email || "Not provided"}</p>
                <hr/>
                <h3>Description:</h3>
                <p>${description.replace(/\n/g, "<br/>")}</p>
            `,
        });

        return res.status(200).json({ status: 200, message: "Bug report sent successfully" });
    } catch (e) {
        console.error("Email error:", e);
        return res.status(500).json({ status: 500, message: "Failed to send bug report", error: e.message });
    }
};
