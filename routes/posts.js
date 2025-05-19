const express = require("express");
const router = express.Router();
const Post = require("../models/Post");
const User = require("../models/User");
const Notification = require("../models/Notification");
const { protect } = require("../middleware/auth");
const mongoose = require("mongoose");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");

// Configuration Cloudinary pour les posts audio
const postStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "audio-posts",
    resource_type: "auto",
    allowed_formats: ["mp3", "wav", "ogg", "m4a"],
    format: "mp3",
  },
});

// Configuration Cloudinary pour les commentaires audio
const commentStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "audio-comments",
    resource_type: "auto",
    allowed_formats: ["mp3", "wav", "ogg", "m4a"],
    format: "mp3",
  },
});

const uploadPostAudio = multer({
  storage: postStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});
const uploadCommentAudio = multer({ storage: commentStorage });

// Helper function to format post for frontend
const formatPostForFrontend = async (post, userId) => {
  const hasLiked = post.likes.some(
    (like) => like.toString() === userId.toString()
  );

  // Récupérer et formater les commentaires
  const comments = await Promise.all(
    post.comments.map(async (comment) => {
      const commentUser = await User.findById(comment.userId);
      return {
        id: comment._id,
        userId: comment.userId,
        username: commentUser.username,
        avatar: commentUser.avatar,
        content: comment.content || "",
        audioUrl: comment.audioUrl || null,
        audioDuration: comment.audioDuration || null,
        timestamp: comment.timestamp,
      };
    })
  );

  return {
    id: post._id,
    userId: post.userId._id || post.userId,
    username: post.userId.username || post.username,
    avatar: post.userId.avatar || post.avatar,
    audioUrl: post.audioUrl,
    audioDuration: post.audioDuration,
    description: post.description || "",
    timestamp: post.timestamp,
    likes: post.likes.length,
    comments: comments,
    hasLiked: hasLiked,
  };
};

// @route   GET /api/posts
// @desc    Récupérer tous les posts
// @access  Private
router.get("/", protect, async (req, res) => {
  try {
    const posts = await Post.find().sort({ timestamp: -1 }).populate({
      path: "userId",
      select: "username avatar",
    });

    // Transformer les données pour qu'elles correspondent au format frontend
    const formattedPosts = await Promise.all(
      posts.map(async (post) => {
        return await formatPostForFrontend(post, req.user.id);
      })
    );

    res.status(200).json({
      success: true,
      data: formattedPosts,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la récupération des posts",
    });
  }
});

// @route   POST /api/posts
// @desc    Créer un nouveau post vocal
// @access  Private
router.post("/", protect, uploadPostAudio.single("audio"), async (req, res) => {
  try {
    const { description, audioDuration } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Veuillez uploader un fichier audio valide",
      });
    }

    const post = await Post.create({
      userId: req.user.id,
      audioUrl: req.file.path,
      audioDuration: parseFloat(audioDuration) || 0,
      description: description || "",
    });

    await User.findByIdAndUpdate(req.user.id, { $inc: { postsCount: 1 } });
    const user = await User.findById(req.user.id);

    const formattedPost = {
      id: post._id,
      userId: req.user.id,
      username: user.username,
      avatar: user.avatar,
      audioUrl: post.audioUrl,
      audioDuration: post.audioDuration,
      description: post.description,
      timestamp: post.timestamp,
      likes: 0,
      comments: [],
      hasLiked: false,
    };

    // Émission de l'événement en temps réel
    const io = req.app.get("io");
    if (io) {
      io.emit("post:created", formattedPost);
    }

    res.status(201).json({
      success: true,
      data: formattedPost,
    });
  } catch (err) {
    console.error("Erreur création post:", err);
    res.status(500).json({
      success: false,
      message: "Erreur création post",
    });
  }
});

// @route   POST /api/posts/:id/like
// @desc    Aimer un post
// @access  Private
router.post("/:id/like", protect, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id).populate(
      "userId",
      "username"
    );

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post non trouvé",
      });
    }

    const userId = req.user._id;
    const alreadyLiked = post.likes.some((like) => like.equals(userId));

    if (alreadyLiked) {
      post.likes.pull(userId);
    } else {
      post.likes.push(userId);

      // Créer une notification si ce n'est pas l'auteur qui like son propre post
      if (!post.userId._id.equals(userId)) {
        const notification = new Notification({
          user: post.userId._id,
          fromUser: userId,
          type: "like",
          message: "a aimé votre publication",
          post: post._id,
          read: false,
        });

        await notification.save();

        // Envoyer une notification en temps réel
        const io = req.app.get("io");
        if (io) {
          io.to(post.userId._id.toString()).emit("notification", {
            id: notification._id,
            type: notification.type,
            message: notification.message,
            timestamp: notification.createdAt,
            read: notification.read,
            fromUser: {
              id: req.user._id,
              username: req.user.username,
              avatar: req.user.avatar,
            },
            postId: post._id.toString(),
          });
        }
      }
    }

    await post.save();

    const likeData = {
      likes: post.likes.length,
      hasLiked: !alreadyLiked,
    };

    // Émission de l'événement en temps réel pour les likes
    const io = req.app.get("io");
    if (io) {
      io.emit("post:liked", {
        postId: post._id.toString(),
        likes: post.likes.length,
        userId: userId.toString(),
      });
    }

    res.status(200).json({
      success: true,
      data: likeData,
    });
  } catch (err) {
    console.error("Erreur serveur:", err);
    res.status(500).json({
      success: false,
      message: "Erreur technique",
      error: err.message,
    });
  }
});

// @route   POST /api/posts/:id/comment
// @desc    Commenter un post
// @access  Private
router.post(
  "/:id/comment",
  protect,
  uploadCommentAudio.single("audio"),
  async (req, res) => {
    try {
      const post = await Post.findById(req.params.id).populate(
        "userId",
        "username"
      );
      if (!post)
        return res
          .status(404)
          .json({ success: false, message: "Post non trouvé" });

      const user = await User.findById(req.user.id);
      const { content, audioDuration } = req.body;

      const newComment = {
        _id: new mongoose.Types.ObjectId(),
        userId: user._id,
        username: user.username,
        avatar: user.avatar,
        content: content || "",
        timestamp: new Date(),
      };

      if (req.file) {
        newComment.audioUrl = req.file.path;
        newComment.audioDuration = parseFloat(audioDuration) || 0;
      }

      post.comments.push(newComment);
      await post.save();

      // Formater le commentaire pour le frontend
      const formattedComment = {
        id: newComment._id.toString(), // Assurer le format string
        userId: user._id.toString(),
        username: user.username,
        avatar: user.avatar,
        content: newComment.content,
        audioUrl: newComment.audioUrl,
        audioDuration: newComment.audioDuration,
        timestamp: newComment.timestamp.toISOString(),
      };

      // Créer une notification si ce n'est pas l'auteur qui commente son propre post
      if (!post.userId._id.equals(user._id)) {
        const notification = new Notification({
          user: post.userId._id,
          fromUser: user._id,
          type: "comment",
          message: "a commenté votre publication",
          post: post._id,
          comment: newComment._id,
          read: false,
        });

        await notification.save();

        // Envoyer une notification en temps réel
        const io = req.app.get("io");
        if (io) {
          io.to(post.userId._id.toString()).emit("notification", {
            id: notification._id,
            type: notification.type,
            message: notification.message,
            timestamp: notification.createdAt,
            read: notification.read,
            fromUser: {
              id: user._id,
              username: user.username,
              avatar: user.avatar,
            },
            postId: post._id.toString(),
          });
        }
      }

      // Émission de l'événement en temps réel pour les commentaires
      const io = req.app.get("io");
      if (io) {
        io.emit("comment:created", {
          postId: post._id.toString(),
          comment: formattedComment,
        });
      }

      res.status(201).json({
        success: true,
        data: formattedComment,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({
        success: false,
        message: "Erreur technique",
        error: err.message,
      });
    }
  }
);

// @route   GET /api/posts/user/:userId
// @desc    Récupérer les posts d'un utilisateur
// @access  Private
router.get("/user/:userId", protect, async (req, res) => {
  try {
    const posts = await Post.find({ userId: req.params.userId })
      .sort({ timestamp: -1 })
      .populate({
        path: "userId",
        select: "username avatar",
      });

    // Transformer les données pour qu'elles correspondent au format frontend
    const formattedPosts = await Promise.all(
      posts.map(async (post) => {
        return await formatPostForFrontend(post, req.user.id);
      })
    );

    res.status(200).json({
      success: true,
      data: formattedPosts,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la récupération des posts",
    });
  }
});

// @route   DELETE /api/posts/:id
// @desc    Supprimer un post
// @access  Private
router.delete("/:id", protect, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post)
      return res
        .status(404)
        .json({ success: false, message: "Post non trouvé" });

    if (post.userId.toString() !== req.user.id) {
      return res.status(401).json({ success: false, message: "Non autorisé" });
    }

    // Fonction pour supprimer de Cloudinary
    const deleteFromCloudinary = async (url) => {
      const publicId = url.split("/").slice(-2).join("/").split(".")[0];
      await cloudinary.uploader.destroy(publicId, { resource_type: "video" });
    };

    if (post.audioUrl) await deleteFromCloudinary(post.audioUrl);

    for (const comment of post.comments) {
      if (comment.audioUrl) await deleteFromCloudinary(comment.audioUrl);
    }

    await Notification.deleteMany({ postId: post._id });
    await post.deleteOne();
    await User.findByIdAndUpdate(req.user.id, { $inc: { postsCount: -1 } });

    // Émission de l'événement en temps réel
    const io = req.app.get("io");
    if (io) {
      io.emit("post:deleted", post._id.toString());
    }

    res.status(200).json({ success: true, message: "Post supprimé" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Erreur suppression" });
  }
});

// @route   PUT /api/posts/:id
// @desc    Modifier un post
// @access  Private
router.put(
  "/:id",
  protect,
  uploadPostAudio.single("audio"),
  async (req, res) => {
    try {
      console.log("Tentative de modification du post:", req.params.id);

      const post = await Post.findById(req.params.id);
      if (!post) {
        console.log("Post non trouvé");
        return res.status(404).json({
          success: false,
          message: "Post non trouvé",
        });
      }

      // Vérification de l'auteur
      if (post.userId.toString() !== req.user.id) {
        console.log("Tentative de modification non autorisée");
        return res.status(403).json({
          success: false,
          message: "Non autorisé à modifier ce post",
        });
      }

      // Mise à jour de la description
      if (req.body.description !== undefined) {
        post.description = req.body.description;
      }

      // Mise à jour de l'audio si fourni
      if (req.file) {
        console.log("Nouveau fichier audio reçu");
        // Suppression de l'ancien audio
        if (post.audioUrl) {
          const publicId = post.audioUrl
            .split("/")
            .slice(-2)
            .join("/")
            .split(".")[0];
          await cloudinary.uploader.destroy(publicId, {
            resource_type: "video",
          });
        }
        post.audioUrl = req.file.path;
        post.audioDuration = parseFloat(req.body.audioDuration) || 0;
      }

      await post.save();

      const updatedPost = {
        id: post._id,
        userId: post.userId,
        username: req.user.username,
        avatar: req.user.avatar,
        audioUrl: post.audioUrl,
        audioDuration: post.audioDuration,
        description: post.description,
        timestamp: post.timestamp,
        likes: post.likes.length,
        comments: post.comments,
        hasLiked: post.likes.some(
          (like) => like.toString() === req.user.id.toString()
        ),
      };

      // Émission de l'événement en temps réel
      const io = req.app.get("io");
      if (io) {
        io.emit("post:updated", updatedPost);
      }

      console.log("Post mis à jour avec succès");
      res.status(200).json({
        success: true,
        data: updatedPost,
      });
    } catch (err) {
      console.error("Erreur lors de la modification du post:", err);
      res.status(500).json({
        success: false,
        message: "Erreur lors de la modification du post",
      });
    }
  }
);

// @route   GET /api/posts/search
// @desc    Rechercher des posts par description
router.get("/search", protect, async (req, res) => {
  try {
    const { query } = req.query;
    const posts = await Post.find({ 
      description: { $regex: query, $options: 'i' }
    }).populate('userId', 'username avatar');

    const formattedPosts = await Promise.all(
      posts.map(post => formatPostForFrontend(post, req.user.id))
    );

    res.status(200).json({ success: true, data: formattedPosts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Erreur de recherche" });
  }
});

module.exports = router;
