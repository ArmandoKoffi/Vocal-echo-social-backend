const jwt = require("jsonwebtoken");
const User = require("../models/User");

/**
 * Middleware pour protéger les routes
 * Vérifie que l'utilisateur est authentifié via un token JWT
 */
exports.protect = async (req, res, next) => {
  let token;

  // Vérifier si le token est présent dans les headers
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    // Format: Bearer <token>
    token = req.headers.authorization.split(" ")[1];
  }

  // Vérifier si le token existe
  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Non autorisé, aucun token",
    });
  }

  try {
    // Vérifier le token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Ajouter l'utilisateur à la requête
    req.user = await User.findById(decoded.id);

    // Vérifier si l'utilisateur est banni
    if (req.user.status === "banned") {
      return res.status(401).json({
        success: false,
        message: "Votre compte a été suspendu par les administrateurs",
      });
    }

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Non autorisé, token invalide",
    });
  }
};

/**
 * Middleware pour vérifier si l'utilisateur est admin
 * Doit être utilisé après le middleware protect
 */
exports.isAdmin = (req, res, next) => {
  if (!req.user.isAdmin) {
    return res.status(403).json({
      success: false,
      message: "Accès interdit, privilèges d'administrateur requis",
    });
  }
  next();
};
