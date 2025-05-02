const express = require("express");
const router = express.Router();
const User = require("../models/User");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { protect } = require("../middleware/auth");
const path = require("path");
const fs = require("fs");
const { sendPasswordResetEmail } = require("../utils/emailUtils");
const {
  generateStrongPassword,
  hashPassword,
} = require("../utils/passwordUtils");
const {
  authLimiter,
  passwordResetLimiter,
} = require("../middleware/rateLimiter");

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post("/register", async (req, res) => {
  try {
    const { username, email, password, gender } = req.body;

    // Vérifier si l'utilisateur existe déjà
    let user = await User.findOne({ email });

    if (user) {
      return res.status(400).json({
        success: false,
        message: "Cet email est déjà utilisé",
      });
    }

    // Assigner un avatar par défaut en fonction du genre
    let defaultAvatar = "/default-avatars/default-other.png";
    if (gender === "male") {
      defaultAvatar = "/default-avatars/default-male.png";
    } else if (gender === "female") {
      defaultAvatar = "/default-avatars/default-female.png";
    }

    // Créer un nouvel utilisateur
    user = new User({
      username,
      email,
      password,
      gender,
      avatar: defaultAvatar,
    });

    // Enregistrer l'utilisateur
    await user.save();

    res.status(201).json({
      success: true,
      message: "Inscription réussie",
      data: {
        id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
      },
    });
  } catch (error) {
    console.error("Erreur lors de l'inscription:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de l'inscription",
    });
  }
});

// @route   POST /api/auth/login
// @desc    Login user and return JWT token
// @access  Public
router.post("/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Vérifier si l'utilisateur existe
    const user = await User.findOne({ email }).select("+password");

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Email ou mot de passe incorrect",
      });
    }

    // Vérifier le mot de passe
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Email ou mot de passe incorrect",
      });
    }

    // Créer et retourner le token JWT
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "30d",
    });

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        bio: user.bio,
        gender: user.gender,
        followersCount: user.followersCount,
        followingCount: user.followingCount,
        postsCount: user.postsCount,
        isAdmin: user.isAdmin,
      },
    });
  } catch (error) {
    console.error("Erreur lors de la connexion:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la connexion",
    });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user info
// @access  Private
router.get("/me", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur non trouvé",
      });
    }

    res.json({
      success: true,
      data: {
        id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        bio: user.bio,
        gender: user.gender,
        followersCount: user.followersCount,
        followingCount: user.followingCount,
        postsCount: user.postsCount,
        isAdmin: user.isAdmin,
      },
    });
  } catch (error) {
    console.error(
      "Erreur lors de la récupération de l'utilisateur courant:",
      error
    );
    res.status(500).json({
      success: false,
      message: "Erreur lors de la récupération de l'utilisateur",
    });
  }
});

// @route   PUT /api/auth/update-profile
// @desc    Update user profile
// @access  Private
router.put("/update-profile", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur non trouvé",
      });
    }

    // Mettre à jour les champs de base
    if (req.body.username) user.username = req.body.username;
    if (req.body.bio) user.bio = req.body.bio;
    if (req.body.email) user.email = req.body.email;

    // Traiter l'avatar si fourni
    if (req.files && req.files.avatar) {
      const avatar = req.files.avatar;

      // Vérifier le type de fichier
      const validTypes = ["image/jpeg", "image/jpg", "image/png"];
      if (!validTypes.includes(avatar.mimetype)) {
        return res.status(400).json({
          success: false,
          message: "Veuillez télécharger une image au format jpg, jpeg ou png",
        });
      }

      // Vérifier la taille
      if (avatar.size > 5 * 1024 * 1024) {
        return res.status(400).json({
          success: false,
          message: "L'image doit faire moins de 5Mo",
        });
      }

      // Créer un nom de fichier personnalisé incluant l'ID de l'utilisateur
      const filename = `user-${user._id}.${avatar.mimetype.split("/")[1]}`;

      // Assurer que le répertoire existe
      const avatarDir = path.join(__dirname, "../uploads/avatars");
      if (!fs.existsSync(avatarDir)) {
        fs.mkdirSync(avatarDir, { recursive: true });
      }

      // Chemin complet du fichier
      const avatarPath = path.join(avatarDir, filename);

      // Déplacer le fichier
      avatar.mv(avatarPath, async (err) => {
        if (err) {
          console.error("Erreur lors du téléchargement de l'image:", err);
          return res.status(500).json({
            success: false,
            message: "Erreur lors du téléchargement de l'image",
          });
        }

        // Supprimer l'ancien avatar si ce n'est pas l'avatar par défaut
        if (
          user.avatar &&
          !user.avatar.includes("default-male.png") &&
          !user.avatar.includes("default-female.png") &&
          !user.avatar.includes("default-other.png")
        ) {
          const oldAvatarPath = path.join(__dirname, "..", user.avatar);
          if (fs.existsSync(oldAvatarPath)) {
            fs.unlinkSync(oldAvatarPath);
          }
        }

        // Mettre à jour le chemin de l'avatar
        user.avatar = `/uploads/avatars/${filename}`;
        await user.save();

        res.json({
          success: true,
          data: {
            id: user._id,
            username: user.username,
            email: user.email,
            avatar: user.avatar,
            bio: user.bio,
            gender: user.gender,
            followersCount: user.followersCount,
            followingCount: user.followingCount,
            postsCount: user.postsCount,
            isAdmin: user.isAdmin,
          },
        });
      });
    } else {
      // Enregistrer les modifications sans avatar
      await user.save();

      res.json({
        success: true,
        data: {
          id: user._id,
          username: user.username,
          email: user.email,
          avatar: user.avatar,
          bio: user.bio,
          gender: user.gender,
          followersCount: user.followersCount,
          followingCount: user.followingCount,
          postsCount: user.postsCount,
          isAdmin: user.isAdmin,
        },
      });
    }
  } catch (error) {
    console.error("Erreur lors de la mise à jour du profil:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la mise à jour du profil",
    });
  }
});

// @route   PUT /api/auth/reset-avatar
// @desc    Réinitialiser l'avatar de l'utilisateur à sa valeur par défaut
// @access  Private
router.put("/reset-avatar", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur non trouvé",
      });
    }

    // Déterminer l'avatar par défaut basé sur le genre de l'utilisateur
    let defaultAvatarPath = "/default-avatars/default-other.png";
    if (user.gender === "male") {
      defaultAvatarPath = "/default-avatars/default-male.png";
    } else if (user.gender === "female") {
      defaultAvatarPath = "/default-avatars/default-female.png";
    }

    // Met à jour l'avatar de l'utilisateur
    user.avatar = defaultAvatarPath;
    await user.save();

    // Retourne l'utilisateur mis à jour
    res.status(200).json({
      success: true,
      data: {
        id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        bio: user.bio,
        gender: user.gender,
        isAdmin: user.isAdmin,
        followersCount: user.followers.length,
        followingCount: user.following.length,
        },
    });
  } catch (error) {
    console.error("Erreur lors de la réinitialisation de l'avatar:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la réinitialisation de l'avatar",
    });
  }
});


// @route   PUT /api/auth/change-password
// @desc    Change user password
// @access  Private
router.put("/change-password", protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Les mots de passe actuels et nouveaux sont requis",
      });
    }

    const user = await User.findById(req.user.id).select("+password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur non trouvé",
      });
    }

    // Vérifier le mot de passe actuel
    const isMatch = await bcrypt.compare(currentPassword, user.password);

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Le mot de passe actuel est incorrect",
      });
    }

    // Mettre à jour le mot de passe
    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: "Mot de passe mis à jour avec succès",
    });
  } catch (error) {
    console.error("Erreur lors du changement de mot de passe:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors du changement de mot de passe",
    });
  }
});

// @route   POST /api/auth/forgot-password
// @desc    Generate and send reset password
// @access  Public
router.post("/forgot-password", passwordResetLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Veuillez fournir une adresse email",
      });
    }

    // Vérifier si l'utilisateur existe
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(200).json({
        success: true,
        message:
          "Si l'adresse existe dans notre base de données, un email de réinitialisation a été envoyé",
      });
    }

    // Générer un mot de passe aléatoire sécurisé
    const newPassword = generateStrongPassword(12);

    // Hasher le nouveau mot de passe
    const hashedPassword = await hashPassword(newPassword);

    // Mettre à jour le mot de passe
    user.password = hashedPassword;
    await user.save({ validateBeforeSave: false });

    // Envoyer l'email de réinitialisation
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const emailResult = await sendPasswordResetEmail(
      user.email,
      newPassword,
      frontendUrl
    );

    if (!emailResult.success) {
      return res.status(500).json({
        success: false,
        message: "Erreur lors de l'envoi de l'email",
        error: emailResult.error,
      });
    }

    res.status(200).json({
      success: true,
      message:
        "Si l'adresse existe dans notre base de données, un email de réinitialisation a été envoyé",
    });
  } catch (error) {
    console.error("Erreur lors de la réinitialisation du mot de passe:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la réinitialisation du mot de passe",
    });
  }
});

module.exports = router;
