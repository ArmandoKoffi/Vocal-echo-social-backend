const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const Notification = require("../models/Notification");
const Post = require("../models/Post");
const mongoose = require("mongoose");

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

// @route   GET /api/notifications/unread-count
// @desc    Get count of unread notifications
// @access  Private
router.get("/unread-count", protect, async (req, res) => {
  try {
    const count = await Notification.countDocuments({ 
      user: req.user.id,
      read: false
    });
    
    res.json({
      success: true,
      data: { count },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Erreur serveur",
    });
  }
});

// @route   GET /api/notifications/:id
// @desc    Get a specific notification with related post details
// @access  Private
router.get("/:id", protect, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id)
      .populate("fromUser", "username avatar")
      .populate({
        path: "post",
        populate: {
          path: "userId",
          select: "username avatar"
        }
      });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification non trouvée",
      });
    }

    if (notification.user.toString() !== req.user.id) {
      return res.status(401).json({
        success: false,
        message: "Non autorisé",
      });
    }

    notification.read = true;
    await notification.save();

    const formattedNotification = {
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
      postId: notification.post?._id || null,
      post: notification.post
        ? {
            id: notification.post._id,
            userId: notification.post.userId._id,
            username: notification.post.userId.username,
            avatar: notification.post.userId.avatar,
            audioUrl: notification.post.audioUrl,
            audioDuration: notification.post.audioDuration,
            description: notification.post.description || "",
            timestamp: notification.post.timestamp,
            likes: notification.post.likes.length,
            comments: notification.post.comments,
            hasLiked: notification.post.likes.some(
              (like) => like.toString() === req.user.id
            ),
          }
        : null,
    };

    res.json({
      success: true,
      data: formattedNotification,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Erreur serveur",
    });
  }
});

// @route   PUT /api/notifications/:id/read
// @desc    Mark a notification as read
// @access  Private
router.put("/:id/read", protect, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification non trouvée",
      });
    }

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

// @route   PUT /api/notifications/read-all
// @desc    Mark all notifications as read
// @access  Private
router.put("/read-all", protect, async (req, res) => {
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
