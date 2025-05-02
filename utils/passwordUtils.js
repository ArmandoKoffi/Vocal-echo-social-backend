const generator = require("generate-password");
const bcrypt = require("bcryptjs");

// Générer un mot de passe aléatoire sécurisé
const generateStrongPassword = (length = 12) => {
  return generator.generate({
    length: length,
    numbers: true,
    symbols: true,
    uppercase: true,
    lowercase: true,
    excludeSimilarCharacters: true,
    strict: true,
  });
};

// Vérifier la force du mot de passe
const checkPasswordStrength = (password) => {
  if (!password) return { strength: "none", score: 0 };

  let score = 0;

  // Longueur minimale
  if (password.length >= 8) score += 1;
  if (password.length >= 10) score += 1;

  // Complexité
  if (/[a-z]/.test(password)) score += 1; // Minuscules
  if (/[A-Z]/.test(password)) score += 1; // Majuscules
  if (/[0-9]/.test(password)) score += 1; // Chiffres
  if (/[^a-zA-Z0-9]/.test(password)) score += 2; // Caractères spéciaux

  // Classification
  let strength = "faible";
  if (score >= 4) strength = "moyen";
  if (score >= 6) strength = "fort";

  return { strength, score };
};

// Fonction de hashage pour les mots de passe
const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
};

module.exports = {
  generateStrongPassword,
  checkPasswordStrength,
  hashPassword,
};
