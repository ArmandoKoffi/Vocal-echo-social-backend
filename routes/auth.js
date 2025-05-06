
const express = require("express");
const router = express.Router();
const User = require("../models/User");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { protect } = require("../middleware/auth");
const { sendPasswordResetEmail } = require("../utils/emailUtils");
const {
  generateStrongPassword,
  hashPassword,
} = require("../utils/passwordUtils");
const {
  authLimiter,
  passwordResetLimiter,
} = require("../middleware/rateLimiter");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");

// Configuration identique à celle du modèle
const DEFAULT_AVATARS = {
  male: 'https://res.cloudinary.com/dx9ihjr0f/image/upload/v1746491998/default-avatars/default-male.png',
  female: 'https://res.cloudinary.com/dx9ihjr0f/image/upload/v1746492000/default-avatars/default-female.png',
  other: 'https://res.cloudinary.com/dx9ihjr0f/image/upload/v1746492001/default-avatars/default-other.png'
};

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure storage
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "user-avatars",
    allowed_formats: ["jpg", "jpeg", "png"],
    transformation: [{ width: 500, height: 500, crop: "limit" }]
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post("/register", async (req, res) => {
  try {
    const { username, email, password, gender } = req.body;

    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({
        success: false,
        message: "Cet email est déjà utilisé",
      });
    }

    user = new User({
      username,
      email,
      password,
      gender,
      avatar: DEFAULT_AVATARS[gender] || DEFAULT_AVATARS.other,
    });

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
    const user = await User.findOne({ email }).select("+password");

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Email ou mot de passe incorrect",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Email ou mot de passe incorrect",
      });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "90d",
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
router.put(
  "/update-profile",
  protect,
  (req, res, next) => {
    upload.single("avatar")(req, res, (err) => {
      if (err) {
        console.error("Upload error:", err);
        return res.status(400).json({
          success: false,
          message: err.message.includes("File too large")
            ? "Le fichier ne doit pas dépasser 5MB"
            : "Seuls les JPG/PNG sont acceptés",
        });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      const user = await User.findById(req.user.id);
      if (!user)
        return res
          .status(404)
          .json({ success: false, message: "Utilisateur non trouvé" });

      // Mise à jour des champs
      const updates = ["username", "email", "bio"];
      updates.forEach((field) => {
        if (req.body[field]) user[field] = req.body[field];
      });

      // Gestion de l'avatar
      if (req.file) {
        // Suppression ancien avatar si non par défaut
        const isDefaultAvatar = Object.values(DEFAULT_AVATARS).includes(
          user.avatar
        );
        if (!isDefaultAvatar && user.avatar) {
          try {
            const publicId = user.avatar
              .split("/")
              .slice(-2)
              .join("/")
              .split(".")[0];
            await cloudinary.uploader.destroy(publicId);
          } catch (err) {
            console.error("Erreur suppression ancien avatar:", err);
          }
        }
        user.avatar = req.file.path;
      }

      await user.save();

      res.json({
        success: true,
        data: {
          ...user.toObject(),
          password: undefined,
        },
      });
    } catch (error) {
      console.error("Update error:", error);
      res.status(500).json({
        success: false,
        message: "Erreur serveur lors de la mise à jour",
      });
    }
  }
);

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

    user.avatar = DEFAULT_AVATARS[user.gender] || DEFAULT_AVATARS.other;
    await user.save();

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
    const frontendUrl = process.env.FRONTEND_URL || "https://vocal-echo-social-backend.onrender.com";
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
