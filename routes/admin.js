const express = require("express");
const router = express.Router();
const { protect, isAdmin } = require("../middleware/auth");
const User = require("../models/User");
const Post = require("../models/Post");
const Report = require("../models/Report");

// @route   GET /api/admin/users
// @desc    Get all users with stats (admin only)
// @access  Private
router.get("/users", protect, isAdmin, async (req, res) => {
  try {
    const users = await User.find().select("-password").lean();

    // Get online users from Socket.io
    const io = req.app.get("io");
    const onlineUsers =
      io?.sockets?.adapter?.rooms?.get("onlineUsers") || new Set();

    const userStats = await Promise.all(
      users.map(async (user) => {
        const postCount = await Post.countDocuments({ userId: user._id });
        const reportCount = await Report.countDocuments({
          reportedUser: user._id,
        });

        return {
          id: user._id,
          username: user.username,
          avatar: user.avatar,
          email: user.email,
          status: user.status || "active",
          postCount,
          reportCount,
          joinedAt: user.createdAt,
          isAdmin: user.isAdmin,
          isOnline: onlineUsers.has(user._id.toString()),
        };
      })
    );

    res.json({
      success: true,
      data: userStats,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Erreur serveur",
    });
  }
});

// @route   GET /api/admin/user-reports/:userId
// @desc    Get reports for a specific user
// @access  Private
router.get("/user-reports/:userId", protect, isAdmin, async (req, res) => {
  try {
    const reports = await Report.find({ reportedUser: req.params.userId })
      .populate("reportedBy", "username avatar")
      .populate("post", "audioUrl description")
      .sort({ createdAt: -1 });

    const formattedReports = reports.map((report) => ({
      id: report._id,
      reportedBy: {
        username: report.reportedBy?.username || "Utilisateur supprimé",
        avatar: report.reportedBy?.avatar || "",
      },
      reason: report.reason,
      details: report.details,
      status: report.status,
      createdAt: report.createdAt,
      post: report.post
        ? {
            id: report.post._id,
            audioUrl: report.post.audioUrl,
            description: report.post.description,
          }
        : null,
    }));

    res.json({
      success: true,
      data: formattedReports,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Erreur serveur",
    });
  }
});

// @route   GET /api/admin/reports
// @desc    Get all reports (admin only)
// @access  Private
router.get("/reports", protect, isAdmin, async (req, res) => {
  try {
    const reports = await Report.find()
      .populate("reportedUser", "username avatar")
      .populate("reportedBy", "username")
      .populate("post", "audio")
      .sort({ createdAt: -1 });

    const formattedReports = reports.map((report) => ({
      id: report._id,
      postId: report.post?._id || "",
      postAuthor: report.reportedUser?.username || "Utilisateur supprimé",
      postAuthorAvatar: report.reportedUser?.avatar || "",
      reportedBy: report.reportedBy?.username || "Utilisateur supprimé",
      reason: report.reason,
      status: report.status,
      createdAt: report.createdAt,
      audioUrl: report.post?.audio || "",
      details: report.details,
    }));

    res.json({
      success: true,
      data: formattedReports,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Erreur serveur",
    });
  }
});

// @route   GET /api/admin/stats
// @desc    Get admin stats
// @access  Private
router.get("/stats", protect, isAdmin, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ status: "active" });
    const totalPosts = await Post.countDocuments();
    const totalReports = await Report.countDocuments();
    const pendingReports = await Report.countDocuments({ status: "pending" });
    const resolvedReports = await Report.countDocuments({ status: "resolved" });
    const dismissedReports = await Report.countDocuments({
      status: "dismissed",
    });

    // Get online users count from Socket.io
    const io = req.app.get("io");
    const onlineUsers =
      io?.sockets?.adapter?.rooms?.get("onlineUsers")?.size || 0;

    // Calculate average response time
    const resolvedReportsData = await Report.find({
      status: { $in: ["resolved", "dismissed"] },
      resolvedAt: { $exists: true },
    });

    let totalResponseTime = 0;
    let countWithResponseTime = 0;

    resolvedReportsData.forEach((report) => {
      if (report.resolvedAt && report.createdAt) {
        const responseTime = report.resolvedAt - report.createdAt;
        totalResponseTime += responseTime;
        countWithResponseTime++;
      }
    });

    const avgResponseTimeMs =
      countWithResponseTime > 0 ? totalResponseTime / countWithResponseTime : 0;

    // Convert to hours
    const avgResponseTimeHours = (avgResponseTimeMs / (1000 * 60 * 60)).toFixed(
      1
    );

    res.json({
      success: true,
      data: {
        totalUsers,
        activeUsers,
        totalPosts,
        totalReports,
        pendingReports,
        resolvedReports,
        dismissedReports,
        averageResponseTime: `${avgResponseTimeHours} heures`,
        onlineUsers,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Erreur serveur",
    });
  }
});

// @route   PUT /api/admin/reports/:id
// @desc    Update a report status
// @access  Private
router.put("/reports/:id", protect, isAdmin, async (req, res) => {
  try {
    const { status } = req.body;

    if (!["pending", "resolved", "dismissed"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Statut invalide",
      });
    }

    const report = await Report.findById(req.params.id);

    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Signalement non trouvé",
      });
    }

    report.status = status;
    if (status !== "pending") {
      report.resolvedAt = Date.now();
      report.resolvedBy = req.user.id;
    }

    await report.save();

    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Erreur serveur",
    });
  }
});

// @route   DELETE /api/admin/reports/:id
// @desc    Delete a report
// @access  Private
router.delete("/reports/:id", protect, isAdmin, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);

    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Signalement non trouvé",
      });
    }

    await report.remove();

    res.json({
      success: true,
      message: "Signalement supprimé",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Erreur serveur",
    });
  }
});

// @route   PUT /api/admin/users/:id/status
// @desc    Update a user's status
// @access  Private
router.put("/users/:id/status", protect, isAdmin, async (req, res) => {
  try {
    const { status } = req.body;

    if (!["active", "warning", "banned"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Statut invalide",
      });
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur non trouvé",
      });
    }

    user.status = status;
    await user.save();

    res.json({
      success: true,
      message: "Statut mis à jour",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Erreur serveur",
    });
  }
});

// @route   PUT /api/admin/users/:id/role
// @desc    Update a user's admin role
// @access  Private
router.put("/users/:id/role", protect, isAdmin, async (req, res) => {
  try {
    const { isAdmin } = req.body;

    if (typeof isAdmin !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "Paramètre invalide",
      });
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur non trouvé",
      });
    }

    // Prevent removing last admin
    if (!isAdmin && user.isAdmin) {
      const adminCount = await User.countDocuments({ isAdmin: true });
      if (adminCount <= 1) {
        return res.status(400).json({
          success: false,
          message: "Impossible de retirer le dernier administrateur",
        });
      }
    }

    user.isAdmin = isAdmin;
    await user.save();

    res.json({
      success: true,
      message: "Rôle administrateur mis à jour",
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

