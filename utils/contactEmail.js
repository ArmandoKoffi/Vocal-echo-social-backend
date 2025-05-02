const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

/**
 * Envoie un email de confirmation à l'utilisateur
 */
const sendUserContactConfirmation = async (
  userEmail,
  subject,
  message,
  name
) => {
  try {
    const mailOptions = {
      from: `"VocalExpress" <${process.env.EMAIL_USER}>`,
      to: userEmail,
      subject: `Confirmation: ${subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h1 style="color: #ff6b00; margin-bottom: 5px;">VocalExpress</h1>
            <p style="color: #666; font-size: 16px;">Confirmation de réception de votre message</p>
          </div>

          <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
            <p style="margin-top: 0;">Bonjour ${name},</p>
            <p>Nous avons bien reçu votre message et vous en remercions.</p>

            <div style="background-color: #eee; padding: 10px; border-radius: 5px; margin: 15px 0;">
              <p style="font-weight: bold; margin-top: 0;">Votre message :</p>
              <p style="font-style: italic;">${message}</p>
            </div>

            <p>Notre équipe vous répondra dans les plus brefs délais.</p>
          </div>

          <div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; font-size: 12px; color: #666; text-align: center;">
            <p>Ceci est un message automatique. Merci de ne pas y répondre directement.</p>
            <p>&copy; ${new Date().getFullYear()} VocalExpress. Tous droits réservés.</p>
          </div>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error("Erreur confirmation email:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Envoie une notification à l'admin
 */
const sendAdminContactNotification = async (
  userEmail,
  subject,
  message,
  name
) => {
  try {
    const mailOptions = {
      from: `"VocalExpress" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      subject: `Nouveau contact: ${subject}`,
      replyTo: userEmail,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h1 style="color: #ff6b00; margin-bottom: 5px;">VocalExpress</h1>
            <p style="color: #666; font-size: 16px;">Nouveau message de contact</p>
          </div>

          <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
            <p style="margin-top: 0; font-weight: bold;">De : ${name} (${userEmail})</p>
            <p style="font-weight: bold;">Sujet : ${subject}</p>

            <div style="background-color: #eee; padding: 10px; border-radius: 5px; margin: 15px 0;">
              <p style="font-weight: bold; margin-top: 0;">Message :</p>
              <p>${message.replace(/\n/g, "<br>")}</p>
            </div>
          </div>

          <div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; font-size: 12px; color: #666; text-align: center;">
            <p>Ce message a été envoyé via le formulaire de contact de VocalExpress.</p>
            <p>&copy; ${new Date().getFullYear()} VocalExpress. Tous droits réservés.</p>
          </div>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error("Erreur notification admin:", error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendUserContactConfirmation,
  sendAdminContactNotification,
};
