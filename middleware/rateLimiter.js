const rateLimit = require("express-rate-limit");

// Limiteur pour les routes d'authentification (5 requêtes par minute)
const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 requêtes max par fenêtre
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Trop de tentatives, veuillez réessayer dans une minute.",
  },
});

// Limiteur pour la réinitialisation de mot de passe (3 requêtes par heure)
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 3, // 3 requêtes max par fenêtre
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message:
      "Trop de tentatives de réinitialisation de mot de passe, veuillez réessayer plus tard.",
  },
});

module.exports = {
  authLimiter,
  passwordResetLimiter,
};
