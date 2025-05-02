const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const {
  sendUserContactConfirmation,
  sendAdminContactNotification,
} = require("../utils/contactEmail"); // Import corrigé

router.post("/", protect, async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    // Validation des champs
    if (!name || !email || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: "Tous les champs sont requis",
      });
    }

    // Envoi des emails en parallèle
    const [userEmailResult, adminEmailResult] = await Promise.all([
      sendUserContactConfirmation(email, subject, message, name),
      sendAdminContactNotification(email, subject, message, name),
    ]);

    if (!userEmailResult.success || !adminEmailResult.success) {
      return res.status(500).json({
        success: false,
        message: "Erreur lors de l'envoi des emails",
        errors: {
          userEmail: userEmailResult.error,
          adminEmail: adminEmailResult.error,
        },
      });
    }

    res.status(200).json({
      success: true,
      message: "Message envoyé avec succès",
    });
  } catch (error) {
    console.error("Erreur contact route:", error);
    res.status(500).json({
      success: false,
      message: "Erreur serveur",
      error: error.message,
    });
  }
});

module.exports = router;
