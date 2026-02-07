import nodemailer from "nodemailer";

export const sendEmailByGmail = async (
  email: string,
  htmlBody: string,
  subject: string
) => {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      host: process.env.EMAIL_HOST,
      port: 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject,
      html: htmlBody,
    });

    console.log("[Gmail API] Email sent successfully!");
    return true;
  } catch (error) {
    console.error("[Gmail API] Email failed to send!", error);
    return false;
  }
};
