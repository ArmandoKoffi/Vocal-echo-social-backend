const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Notification = require("../models/Notification");
const { protect } = require("../middleware/auth");

// @route   GET /api/users/:id
// @desc    Récupérer un utilisateur par son ID
// @access  Private
router.get("/:id", protect, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).populate("postsCount");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur non trouvé",
      });
    }

    res.status(200).json({
      success: true,
      data: {
        id: user._id,
        username: user.username,
        avatar: user.avatar,
        bio: user.bio,
        followersCount: user.followers.length,
        followingCount: user.following.length,
        postsCount: user.postsCount || 0,
        isFollowing: user.followers.includes(req.user.id),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la récupération de l'utilisateur",
    });
  }
});

// @route   POST /api/users/:id/follow
// @desc    Suivre/Ne plus suivre un utilisateur
// @access  Private
router.post("/:id/follow", protect, async (req, res) => {
  try {
    // Vérifier si on essaie de se suivre soi-même
    if (req.params.id === req.user.id) {
      return res.status(400).json({
        success: false,
        message: "Vous ne pouvez pas vous suivre vous-même",
      });
    }

    const userToFollow = await User.findById(req.params.id);
    const currentUser = await User.findById(req.user.id);

    if (!userToFollow) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur non trouvé",
      });
    }

    // Vérifier si l'utilisateur est déjà suivi
    const isFollowing = userToFollow.followers.includes(req.user.id);

    if (isFollowing) {
      // Ne plus suivre
      userToFollow.followers = userToFollow.followers.filter(
        (follower) => follower.toString() !== req.user.id
      );
      currentUser.following = currentUser.following.filter(
        (following) => following.toString() !== req.params.id
      );

      await userToFollow.save();
      await currentUser.save();

      res.status(200).json({
        success: true,
        data: {
          isFollowing: false,
          followersCount: userToFollow.followers.length,
        },
      });
    } else {
      // Suivre
      userToFollow.followers.push(req.user.id);
      currentUser.following.push(req.params.id);

      await userToFollow.save();
      await currentUser.save();

      // Créer une notification
      const notification = await Notification.create({
        type: "follow",
        message: "a commencé à vous suivre",
        toUser: userToFollow._id,
        fromUser: req.user.id,
      });

      // Envoyer la notification en temps réel
      req.io.to(userToFollow._id.toString()).emit("notification", {
        id: notification._id,
        type: notification.type,
        message: notification.message,
        timestamp: notification.timestamp,
        read: notification.read,
        fromUser: {
          id: currentUser._id,
          username: currentUser.username,
          avatar: currentUser.avatar,
        },
      });

      res.status(200).json({
        success: true,
        data: {
          isFollowing: true,
          followersCount: userToFollow.followers.length,
        },
      });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Erreur lors de l'action de suivre",
    });
  }
});

// @route   GET /api/users/search/:query
// @desc    Rechercher des utilisateurs
// @access  Private
router.get("/search/:query", protect, async (req, res) => {
  try {
    const query = req.params.query;

    // Rechercher les utilisateurs par nom d'utilisateur
    const users = await User.find({
      username: { $regex: query, $options: "i" },
    }).select("_id username avatar bio");

    res.status(200).json({
      success: true,
      data: users,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la recherche d'utilisateurs",
    });
  }
});

// @route   GET /api/users/:id/followers
// @desc    Récupérer les followers d'un utilisateur
// @access  Private
router.get("/:id/followers", protect, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).populate({
      path: "followers",
      select: "_id username avatar bio",
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur non trouvé",
      });
    }

    res.status(200).json({
      success: true,
      data: user.followers,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la récupération des followers",
    });
  }
});

// @route   GET /api/users/:id/following
// @desc    Récupérer les utilisateurs suivis
// @access  Private
router.get("/:id/following", protect, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).populate({
      path: "following",
      select: "_id username avatar bio",
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur non trouvé",
      });
    }

    res.status(200).json({
      success: true,
      data: user.following,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la récupération des utilisateurs suivis",
    });
  }
});

module.exports = router;
