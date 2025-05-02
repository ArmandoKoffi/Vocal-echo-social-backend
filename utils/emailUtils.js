const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

const sendPasswordResetEmail = async (email, newPassword, frontendUrl) => {
  try {
    const loginUrl = `${frontendUrl}/login`;

    const mailOptions = {
      from: `"VocalExpress" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Réinitialisation de votre mot de passe VocalExpress",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h1 style="color: #ff6b00; margin-bottom: 5px;">VocalExpress</h1>
            <p style="color: #666; font-size: 16px;">Réinitialisation de mot de passe</p>
          </div>

          <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
            <p style="margin-top: 0;">Bonjour,</p>
            <p>Vous avez demandé la réinitialisation de votre mot de passe sur VocalExpress.</p>
            <p>Voici votre nouveau mot de passe temporaire :</p>
            <div style="background-color: #eee; padding: 10px; border-radius: 5px; font-family: monospace; text-align: center; margin: 15px 0; font-size: 18px; letter-spacing: 1px;">
              ${newPassword}
            </div>
            <p>Pour des raisons de sécurité, nous vous recommandons de changer ce mot de passe dès que possible après vous être connecté.</p>
          </div>

          <div style="text-align: center;">
            <a href="${loginUrl}" style="display: inline-block; background-color: #ff6b00; color: white; text-decoration: none; padding: 10px 20px; border-radius: 5px; font-weight: bold;">Se connecter maintenant</a>
          </div>

          <div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; font-size: 12px; color: #666; text-align: center;">
            <p>Si vous n'avez pas demandé cette réinitialisation, vous pouvez ignorer cet email en toute sécurité.</p>
            <p>&copy; ${new Date().getFullYear()} VocalExpress. Tous droits réservés.</p>
          </div>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(
      "Erreur lors de l'envoi de l'email de réinitialisation:",
      error
    );
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendPasswordResetEmail,
};
