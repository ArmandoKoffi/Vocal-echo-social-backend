const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const Notification = require("../models/Notification");

// @route   GET /api/notifications
// @desc    Get all notifications for the logged in user
// @access  Private
router.get("/", protect, async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user.id })
      .populate("fromUser", "username avatar")
      .sort({ createdAt: -1 });

    const formattedNotifications = notifications.map((notification) => ({
      id: notification._id,
      type: notification.type,
      message: notification.message,
      timestamp: notification.createdAt,
      read: notification.read,
      fromUser: notification.fromUser
        ? {
            id: notification.fromUser._id,
            username: notification.fromUser.username,
            avatar: notification.fromUser.avatar,
          }
        : null,
      postId: notification.post,
    }));

    res.json({
      success: true,
      data: formattedNotifications,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Erreur serveur",
    });
  }
});

// @route   POST /api/notifications/mark-read/:id
// @desc    Mark a notification as read
// @access  Private
router.post("/mark-read/:id", protect, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification non trouvée",
      });
    }

    // Vérifier que la notification appartient à l'utilisateur
    if (notification.user.toString() !== req.user.id) {
      return res.status(401).json({
        success: false,
        message: "Non autorisé",
      });
    }

    notification.read = true;
    await notification.save();

    res.json({
      success: true,
      data: notification,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Erreur serveur",
    });
  }
});

// @route   POST /api/notifications/mark-all-read
// @desc    Mark all notifications as read
// @access  Private
router.post("/mark-all-read", protect, async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user.id, read: false },
      { read: true }
    );

    res.json({
      success: true,
      message: "Toutes les notifications ont été marquées comme lues",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Erreur serveur",
    });
  }
});

module.exports = router;
 