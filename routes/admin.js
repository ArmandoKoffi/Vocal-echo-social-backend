const express = require("express");
const router = express.Router();
const { protect, isAdmin } = require("../middleware/auth");
const User = require("../models/User");
const Post = require("../models/Post");
const Report = require("../models/Report");
const Notification = require("../models/Notification");
const mongoose = require("mongoose");

// @route   GET /api/admin/users
// @desc    Get all users with stats (admin only)
// @access  Private
router.get("/users", protect, isAdmin, async (req, res) => {
  try {
    const users = await User.find().select("-password").lean();

    // Récupérer les utilisateurs en ligne depuis le stockage Socket.io
    const connectedUsers = req.connectedUsers || new Map();

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
          isOnline: connectedUsers.has(user._id.toString()),
        };
      })
    );

    res.json({
      success: true,
      data: userStats,
    });
  } catch (error) {
    console.error("Erreur dans /api/admin/users:", error);
    res.status(500).json({
      success: false,
      message: "Erreur serveur lors de la récupération des utilisateurs",
      error: error.message,
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
    console.error("Erreur dans /api/admin/user-reports/:userId:", error);
    res.status(500).json({
      success: false,
      message: "Erreur serveur lors de la récupération des signalements",
      error: error.message,
    });
  }
});

// @route   GET /api/admin/reports
// @desc    Get all reports (admin only)
// @access  Private
router.get("/reports", protect, isAdmin, async (req, res) => {
  try {
    const reports = await Report.find({ status: "pending" }) // Seuls les non traités
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
      error: error.message,
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

    // Récupérer le nombre d'utilisateurs en ligne
    const connectedUsers = req.connectedUsers || new Map();
    const onlineUsers = connectedUsers.size;

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

    const stats = {
      totalUsers,
      activeUsers,
      totalPosts,
      totalReports,
      pendingReports,
      resolvedReports,
      dismissedReports,
      averageResponseTime: `${avgResponseTimeHours} heures`,
      onlineUsers,
    };

    res.json({
      success: true,
      data: stats,
    });

    // Émettre ces statistiques à tous les administrateurs connectés sur le dashboard
    req.io.to("adminDashboard").emit("adminStats", stats);
  } catch (error) {
    console.error("Erreur dans /api/admin/stats:", error);
    res.status(500).json({
      success: false,
      message: "Erreur serveur lors de la récupération des statistiques",
      error: error.message,
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

    // Traitement pour "ignoré"
    if (status === "dismissed") {
      report.status = "dismissed";
      report.resolvedAt = Date.now();
      report.resolvedBy = req.user.id;
    }
    // Traitement pour "résolu"
    else if (status === "resolved") {
      // Supprimer le post signalé si existant
      if (report.post) {
        await Post.findByIdAndDelete(report.post._id);

        // Notifier l'auteur du post s'il existe
        if (report.post.userId) {
          const notification = new Notification({
            type: "post_removed",
            message: "Votre publication a été supprimée suite à un signalement",
            user: report.post.userId,
            fromUser: req.user.id,
            read: false,
          });

          await notification.save();

          // Envoyer une notification en temps réel
          const io = req.io;
          const targetSocketId = req.connectedUsers.get(
            report.post.userId.toString()
          );

          if (targetSocketId) {
            io.to(targetSocketId).emit("notification", {
              ...notification.toObject(),
              fromUser: {
                username: req.user.username,
                avatar: req.user.avatar,
              },
            });
          }
        }
      }

      report.status = "resolved";
      report.resolvedAt = Date.now();
      report.resolvedBy = req.user.id;
    }

    await report.save();

    // Envoyer une notification à l'utilisateur qui a signalé
    if (report.reportedBy && previousStatus !== status) {
      const notification = new Notification({
        type: "report_update",
        message: `Votre signalement a été ${
          status === "resolved" ? "résolu" : "ignoré"
        }`,
        user: report.reportedBy._id,
        fromUser: req.user.id,
        read: false,
      });

      await notification.save();

      const targetSocketId = req.connectedUsers.get(
        report.reportedBy._id.toString()
      );
      if (targetSocketId) {
        req.io.to(targetSocketId).emit("notification", {
          ...notification.toObject(),
          fromUser: {
            username: req.user.username,
            avatar: req.user.avatar,
          },
        });
      }
    }

    // Mettre à jour les statistiques en temps réel pour tous les admins
    const updatedStats = {
      pendingReports: await Report.countDocuments({ status: "pending" }),
      resolvedReports: await Report.countDocuments({ status: "resolved" }),
      dismissedReports: await Report.countDocuments({ status: "dismissed" }),
    };

    req.io.to("adminDashboard").emit("reportStatsUpdate", updatedStats);

    // Envoyer la mise à jour du rapport à tous les administrateurs
    req.io.to("adminDashboard").emit("reportStatusChanged", {
      id: report._id,
      status: report.status,
      resolvedBy: req.user.username,
      resolvedAt: report.resolvedAt,
    });

    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    console.error("Erreur dans PUT /api/admin/reports/:id:", error);
    res.status(500).json({
      success: false,
      message: "Erreur serveur lors de la mise à jour du rapport",
      error: error.message,
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

    // Notifier les administrateurs de la suppression
    req.io.to("adminDashboard").emit("reportDeleted", {
      id: req.params.id,
    });

    // Mettre à jour les statistiques en temps réel
    const updatedStats = {
      totalReports: await Report.countDocuments(),
      pendingReports: await Report.countDocuments({ status: "pending" }),
      resolvedReports: await Report.countDocuments({ status: "resolved" }),
      dismissedReports: await Report.countDocuments({ status: "dismissed" }),
    };

    req.io.to("adminDashboard").emit("reportStatsUpdate", updatedStats);

    res.json({
      success: true,
      message: "Signalement supprimé",
    });
  } catch (error) {
    console.error("Erreur dans DELETE /api/admin/reports/:id:", error);
    res.status(500).json({
      success: false,
      message: "Erreur serveur lors de la suppression du rapport",
      error: error.message,
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

    const io = req.io;
    const targetSocketId = req.connectedUsers.get(user._id.toString());

    // Envoyer une notification à l'utilisateur
    if (status === "warning") {
      // Créer la notification en base
      const notification = new Notification({
        type: "warning",
        message:
          "Vous avez reçu un avertissement de la part des administrateurs",
        user: user._id,
        fromUser: req.user.id, // Admin
        read: false,
      });

      await notification.save();

      // Émettre via Socket.io
      if (targetSocketId) {
        io.to(targetSocketId).emit("notification", {
          ...notification.toObject(),
          fromUser: { username: req.user.username, avatar: req.user.avatar },
        });
      }
    } else if (status === "banned") {
      // Créer la notification en base
      const notification = new Notification({
        type: "ban",
        message: "Votre compte a été banni par les administrateurs",
        user: user._id,
        fromUser: req.user.id,
        read: false,
      });

      await notification.save();

      // Émettre via Socket.io
      if (targetSocketId) {
        io.to(targetSocketId).emit("notification", {
          ...notification.toObject(),
          fromUser: { username: req.user.username, avatar: req.user.avatar },
        });

        // Déconnecter l'utilisateur
        io.to(targetSocketId).emit("forceLogout");
      }

      // Supprimer tous les posts de l'utilisateur
      await Post.deleteMany({ userId: user._id });

      // Mettre à jour les statistiques de posts en temps réel
      const totalPosts = await Post.countDocuments();
      io.to("adminDashboard").emit("postStatsUpdate", { totalPosts });
    }

    // Informer tous les administrateurs du changement de statut
    io.to("adminDashboard").emit("userStatusChanged", {
      userId: user._id.toString(),
      previousStatus,
      newStatus: status,
      changedBy: req.user.username,
    });

    res.json({
      success: true,
      message: "Statut mis à jour",
    });
  } catch (error) {
    console.error("Erreur dans PUT /api/admin/users/:id/status:", error);
    res.status(500).json({
      success: false,
      message: "Erreur serveur lors de la mise à jour du statut utilisateur",
      error: error.message,
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

    const previousRole = user.isAdmin;
    user.isAdmin = isAdmin;
    await user.save();

    // Notifier tous les administrateurs du changement de rôle
    req.io.to("adminDashboard").emit("userRoleChanged", {
      userId: user._id.toString(),
      username: user.username,
      previousRole: previousRole ? "Admin" : "Utilisateur",
      newRole: isAdmin ? "Admin" : "Utilisateur",
      changedBy: req.user.username,
    });

    res.json({
      success: true,
      message: "Rôle administrateur mis à jour",
    });
  } catch (error) {
    console.error("Erreur dans PUT /api/admin/users/:id/role:", error);
    res.status(500).json({
      success: false,
      message: "Erreur serveur lors de la mise à jour du rôle",
      error: error.message,
    });
  }
});

module.exports = router;
