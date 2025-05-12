
const express = require("express");
const router = express.Router();
const Report = require("../models/Report");
const { protect } = require("../middleware/auth");

// @route   POST /api/reports
// @desc    Create a new report
// @access  Private
router.post("/", protect, async (req, res) => {
  try {
    const { postId, reason, details } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: "Veuillez fournir une raison pour le signalement",
      });
    }

    const report = new Report({
      reportedBy: req.user.id,
      post: postId,
      reason,
      details,
      status: "pending",
    });

    await report.save();

    res.status(201).json({
      success: true,
      message: "Signalement envoyé avec succès",
      data: report,
    });
  } catch (error) {
    console.error("Erreur lors de la création du signalement:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la création du signalement",
    });
  }
});

module.exports = router;

