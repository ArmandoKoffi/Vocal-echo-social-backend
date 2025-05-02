const fs = require("fs");
const path = require("path");

/**
 * Crée les répertoires nécessaires pour les uploads
 */
function createUploadDirectories() {
  const uploadDir = path.join(__dirname, "uploads");
  const avatarsDir = path.join(uploadDir, "avatars");
  const audioDir = path.join(uploadDir, "audio");
  const commentsDir = path.join(uploadDir, "comments-audio");
  const defaultAvatarsDir = path.join(__dirname, "default-avatars");

  // Créer les répertoires d'upload s'ils n'existent pas
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
    console.log("Creating directory:", uploadDir);
  }

  if (!fs.existsSync(avatarsDir)) {
    fs.mkdirSync(avatarsDir);
    console.log("Creating directory:", avatarsDir);
  }

  if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir);
    console.log("Creating directory:", audioDir);
  }

  if (!fs.existsSync(commentsDir)) {
    fs.mkdirSync(commentsDir);
    console.log("Creating directory:", commentsDir);
  }

  // Créer le répertoire pour les avatars par défaut
  if (!fs.existsSync(defaultAvatarsDir)) {
    fs.mkdirSync(defaultAvatarsDir);
    console.log("Creating directory:", defaultAvatarsDir);
  }

  // Déplacer les avatars par défaut s'ils existent dans le dossier uploads/avatars
  const defaultAvatars = ["male.png", "female.png", "other.png"];

  defaultAvatars.forEach((avatar) => {
    const gender = avatar.split(".")[0];
    const sourceFile = path.join(avatarsDir, `default-${gender}.png`);
    const targetFile = path.join(defaultAvatarsDir, `default-${gender}.png`);

    if (fs.existsSync(sourceFile) && !fs.existsSync(targetFile)) {
      fs.copyFileSync(sourceFile, targetFile);
      console.log(
        `Moved default avatar for ${gender} to default-avatars directory`
      );
    }
  });

  console.log("All required directories have been created");
}

module.exports = createUploadDirectories;
