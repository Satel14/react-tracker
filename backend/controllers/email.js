const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
    family: 4, // Force IPv4
});

module.exports.sendBugReport = async (req, res) => {
    try {
        const { name, email, description } = req.body;

        if (!description || !description.trim()) {
            return res.status(400).json({ status: 400, message: "Description is required" });
        }

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_USER, // Send to self
            subject: `Bug Report from ${name || "Anonymous"}`,
            text: `Name: ${name || "Not provided"}\nEmail: ${email || "Not provided"}\n\nBug Description:\n${description}`,
            html: `
        <h2>Bug Report</h2>
        <p><strong>Name:</strong> ${name || "Not provided"}</p>
        <p><strong>Email:</strong> ${email || "Not provided"}</p>
        <hr/>
        <h3>Description:</h3>
        <p>${description.replace(/\n/g, "<br/>")}</p>
      `,
        };

        await transporter.sendMail(mailOptions);

        return res.status(200).json({ status: 200, message: "Bug report sent successfully" });
    } catch (e) {
        console.error("Email error:", e);
        return res.status(500).json({ status: 500, message: "Failed to send bug report", error: e.message });
    }
};
