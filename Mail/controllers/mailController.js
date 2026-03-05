import sgMail from "../config/sendgrid.js";

export const sendEmail = async (req, res) => {
  try {
    const { toEmail, subject } = req.body;

    if (!toEmail || !subject) {
      return res.status(400).send("Email and Subject are required");
    }

    const recipients = toEmail.split(",").map(e => e.trim());

    const data = {
      userName: "Raziya",
      serviceType: "House Cleaning",
      spName: "Anita",
      dateTime: "25 Feb 2026, 10:00 AM",
      confirmCode: "SE1234",
      phoneNumber: "+91 9999999999"
    };

    // Template Mapping
    const templateMap = {
      "Welcome to ServEaso": "welcome",
      "Your Booking is Confirmed": "confirm",
      "Your Order Has Been Cancelled": "cancel"
    };

    const templateName = templateMap[subject];

    if (!templateName) {
      return res.status(400).send("Invalid subject selected.");
    }

    // Render EJS to HTML
    const htmlContent = await new Promise((resolve, reject) => {
      res.render(templateName, data, (err, html) => {
        if (err) reject(err);
        else resolve(html);
      });
    });

    const msg = {
      from: process.env.SENDER_EMAIL,
      to: recipients,
      subject,
      html: htmlContent
    };

    await sgMail.send(msg);

    res.status(200).send("Mail sent successfully ✅");

  } catch (error) {
    console.error("Email Error:", error.response?.body || error);
    res.status(500).send("Email sending failed ❌");
  }
};