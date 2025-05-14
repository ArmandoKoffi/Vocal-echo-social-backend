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
          reportedBy: user._id,
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
    const reports = await Report.find({ reportedBy: req.params.userId })
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
      .populate("reportedBy", "username avatar")
      .populate("post", "audioUrl description userId")
      .sort({ createdAt: -1 });

    const formattedReports = await Promise.all(
      reports.map(async (report) => {
        // Récupérer les informations sur l'auteur du post si disponible
        let postAuthor = { username: "Utilisateur supprimé", avatar: "" };
        if (report.post && report.post.userId) {
          const user = await User.findById(report.post.userId).select(
            "username avatar"
          );
          if (user) {
            postAuthor = { username: user.username, avatar: user.avatar };
          }
        }

        return {
          id: report._id,
          postId: report.post?._id || "",
          postAuthor: postAuthor.username,
          postAuthorAvatar: postAuthor.avatar,
          reportedBy: report.reportedBy?.username || "Utilisateur supprimé",
          reason: report.reason,
          status: report.status,
          createdAt: report.createdAt,
          audioUrl: report.post?.audioUrl || "",
          details: report.details,
        };
      })
    );

    res.json({
      success: true,
      data: formattedReports,
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des rapports:", error);
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

    const report = await Report.findById(req.params.id)
      .populate("reportedBy", "id")
      .populate("post", "userId");

    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Signalement non trouvé",
      });
    }

    const previousStatus = report.status;
    report.status = status;
    
    if (status !== "pending") {
      report.resolvedAt = Date.now();
      report.resolvedBy = req.user.id;
    }

    await report.save();

    // Envoyer une notification si le statut a changé
    if (previousStatus !== status) {
      const io = req.app.get("io");
      
      // Notification à l'utilisateur qui a signalé
      if (report.reportedBy) {
        io.to(report.reportedBy._id.toString()).emit("notification", {
          type: "report",
          message: `Votre signalement a été ${status === "resolved" ? "résolu" : "ignoré"}`,
          createdAt: new Date(),
        });
      }

      // Si résolu, notifier l'auteur du post et supprimer le contenu si nécessaire
      if (status === "resolved" && report.post) {
        // Supprimer le post signalé
        await Post.findByIdAndDelete(report.post._id);
        
        // Notifier l'auteur du post
        io.to(report.post.userId.toString()).emit("notification", {
          type: "report",
          message: "Votre publication a été supprimée suite à un signalement",
          createdAt: new Date(),
        });
      }
    }

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

    await report.deleteOne();

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

    const previousStatus = user.status;
    user.status = status;
    await user.save();

    const io = req.app.get("io");

    // Envoyer une notification à l'utilisateur
    if (status === "warning") {
      io.to(user._id.toString()).emit("notification", {
        type: "warning",
        message: "Vous avez reçu un avertissement de la part des administrateurs",
        createdAt: new Date(),
      });
    } else if (status === "banned") {
      // Supprimer tous les posts de l'utilisateur
      await Post.deleteMany({ userId: user._id });
      
      // Envoyer une notification
      io.to(user._id.toString()).emit("notification", {
        type: "ban",
        message: "Votre compte a été banni par les administrateurs",
        createdAt: new Date(),
      });

      // Déconnecter l'utilisateur
      io.to(user._id.toString()).emit("forceLogout");
    }

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
