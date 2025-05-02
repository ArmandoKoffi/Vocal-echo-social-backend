
const express = require('express');
const router = express.Router();
const Post = require('../models/Post');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { protect } = require('../middleware/auth');
const mongoose = require("mongoose");
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Assurer que les répertoires existent
const ensureDirectoryExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

// Créer les répertoires nécessaires
const uploadDir = path.join(__dirname, '../uploads');
const audioDir = path.join(uploadDir, 'audio');
const commentAudioDir = path.join(uploadDir, 'comments');

ensureDirectoryExists(uploadDir);
ensureDirectoryExists(audioDir);
ensureDirectoryExists(commentAudioDir);

// @route   GET /api/posts
// @desc    Récupérer tous les posts
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const posts = await Post.find()
      .sort({ timestamp: -1 })
      .populate({
        path: 'userId',
        select: 'username avatar'
      });

    // Transformer les données pour qu'elles correspondent au format frontend
    const formattedPosts = await Promise.all(posts.map(async (post) => {
      const hasLiked = post.likes.some(like => like.toString() === req.user.id.toString());

      // Récupérer et formater les commentaires
      const comments = await Promise.all(post.comments.map(async (comment) => {
        const commentUser = await User.findById(comment.userId);
        return {
          id: comment._id,
          userId: comment.userId,
          username: commentUser.username,
          avatar: commentUser.avatar,
          content: comment.content || '',
          audioUrl: comment.audioUrl || null,
          audioDuration: comment.audioDuration || null,
          timestamp: comment.timestamp
        };
      }));

      return {
        id: post._id,
        userId: post.userId._id,
        username: post.userId.username,
        avatar: post.userId.avatar,
        audioUrl: post.audioUrl,
        audioDuration: post.audioDuration,
        description: post.description || '',
        timestamp: post.timestamp,
        likes: post.likes.length,
        comments: comments,
        hasLiked: hasLiked
      };
    }));

    res.status(200).json({
      success: true,
      data: formattedPosts
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des posts'
    });
  }
});

// @route   POST /api/posts
// @desc    Créer un nouveau post vocal
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    const { description, audioDuration } = req.body;

    // Vérifier si un fichier audio a été uploadé
    if (!req.files || !req.files.audio) {
      return res.status(400).json({
        success: false,
        message: 'Veuillez uploader un fichier audio'
      });
    }

    const audioFile = req.files.audio;

    // Vérifier le type de fichier
    if (!audioFile.mimetype.startsWith('audio')) {
      return res.status(400).json({
        success: false,
        message: 'Le fichier doit être un audio'
      });
    }

    // Vérifier la taille du fichier (max 10MB)
    if (audioFile.size > 10 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: 'Le fichier audio ne doit pas dépasser 10Mo'
      });
    }

    // Créer un nom de fichier unique
    const filename = `post_${uuidv4()}.mp3`;

    // Chemin du fichier audio
    const audioPath = path.join(audioDir, filename);

    // Déplacer le fichier
    audioFile.mv(audioPath, async (err) => {
      if (err) {
        console.error('Erreur lors de l\'upload de l\'audio:', err);
        return res.status(500).json({
          success: false,
          message: 'Problème lors de l\'upload de l\'audio'
        });
      }

      // Créer le post dans la base de données
      const post = await Post.create({
        userId: req.user.id,
        audioUrl: `/uploads/audio/${filename}`,
        audioDuration: parseFloat(audioDuration) || 0,
        description: description || ''
      });

      // Mettre à jour le compteur de posts de l'utilisateur
      await User.findByIdAndUpdate(req.user.id, { $inc: { postsCount: 1 } });

      const user = await User.findById(req.user.id);

      // Retourner le post créé
      res.status(201).json({
        success: true,
        data: {
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
          hasLiked: false
        }
      });
    });
  } catch (err) {
    console.error('Erreur lors de la création du post:', err);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création du post'
    });
  }
});

// @route   POST /api/posts/:id/like
// @desc    Aimer un post
// @access  Private
router.post("/:id/like", protect, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post non trouvé",
      });
    }

    const userId = req.user._id; // Utilisation de _id au lieu de id
    const alreadyLiked = post.likes.some(
      (like) => like.equals(userId) // Utilisation de .equals() pour ObjectId
    );

    // Mise à jour des likes
    if (alreadyLiked) {
      post.likes.pull(userId); // Méthode Mongoose pour retirer
    } else {
      post.likes.push(userId);
    }

    await post.save();

    // Réponse formatée
    res.status(200).json({
      success: true,
      data: {
        likes: post.likes.length,
        hasLiked: !alreadyLiked,
      },
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
router.post("/:id/comment", protect, async (req, res) => {
  try {
    // Ajoutez ces 2 lignes cruciales
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: "Post non trouvé" });

    const user = await User.findById(req.user.id);
    const { content, audioDuration } = req.body; // Récupération correcte de audioDuration

    const newComment = {
      _id: new mongoose.Types.ObjectId(),
      userId: user._id,
      username: user.username,
      avatar: user.avatar,
      content: content || "",
      timestamp: new Date(),
    };

    if (req.files?.audio) {
      const audioFile = req.files.audio;
      const filename = `comment_${uuidv4()}.mp3`;
      const audioPath = path.join(commentAudioDir, filename);

      await audioFile.mv(audioPath);
      newComment.audioUrl = `/uploads/comments-audio/${filename}`;
      newComment.audioDuration = parseFloat(audioDuration); // Utilisation correcte de req.body.audioDuration
    }

    post.comments.push(newComment);
    await post.save(); // Sauvegarde directe sans variable intermédiaire

    res.status(201).json({
      success: true,
      data: {
        ...newComment,
        id: newComment._id,
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Échec technique",
      error: err.message
    });
  }
});

// @route   GET /api/posts/user/:userId
// @desc    Récupérer les posts d'un utilisateur
// @access  Private
router.get('/user/:userId', protect, async (req, res) => {
  try {
    const posts = await Post.find({ userId: req.params.userId })
      .sort({ timestamp: -1 })
      .populate({
        path: 'userId',
        select: 'username avatar'
      });

    // Transformer les données pour qu'elles correspondent au format frontend
    const formattedPosts = await Promise.all(posts.map(async (post) => {
      const hasLiked = post.likes.some(like => like.toString() === req.user.id.toString());

      // Récupérer et formater les commentaires
      const comments = await Promise.all(post.comments.map(async (comment) => {
        const commentUser = await User.findById(comment.userId);
        return {
          id: comment._id,
          userId: comment.userId,
          username: commentUser.username,
          avatar: commentUser.avatar,
          content: comment.content || '',
          audioUrl: comment.audioUrl || null,
          audioDuration: comment.audioDuration || null,
          timestamp: comment.timestamp
        };
      }));

      return {
        id: post._id,
        userId: post.userId._id,
        username: post.userId.username,
        avatar: post.userId.avatar,
        audioUrl: post.audioUrl,
        audioDuration: post.audioDuration,
        description: post.description || '',
        timestamp: post.timestamp,
        likes: post.likes.length,
        comments: comments,
        hasLiked: hasLiked
      };
    }));

    res.status(200).json({
      success: true,
      data: formattedPosts
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des posts'
    });
  }
});

// @route   DELETE /api/posts/:id
// @desc    Supprimer un post
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post non trouvé'
      });
    }

    // Vérifier si l'utilisateur est l'auteur du post
    if (post.userId.toString() !== req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Non autorisé à supprimer ce post'
      });
    }

    // Supprimer le fichier audio
    if (post.audioUrl) {
      const audioPath = path.join(__dirname, '..', post.audioUrl);
      if (fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
      }
    }

    // Supprimer les fichiers audio des commentaires
    for (const comment of post.comments) {
      if (comment.audioUrl) {
        const commentAudioPath = path.join(__dirname, '..', comment.audioUrl);
        if (fs.existsSync(commentAudioPath)) {
          fs.unlinkSync(commentAudioPath);
        }
      }
    }

    // Supprimer les notifications liées au post
    await Notification.deleteMany({ postId: post._id });

    // Supprimer le post
    await post.deleteOne();

    // Mettre à jour le compteur de posts de l'utilisateur
    await User.findByIdAndUpdate(req.user.id, { $inc: { postsCount: -1 } });

    res.status(200).json({
      success: true,
      message: 'Post supprimé avec succès'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression du post'
    });
  }
});

module.exports = router;
