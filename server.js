require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const fileUpload = require("express-fileupload");
const path = require("path");
const http = require("http");
const socketIo = require("socket.io");
const fs = require("fs");
const createUploadDirectories = require("./createDirectories");
const healthcheckRoutes = require("./routes/healthcheck");

// Création des répertoires nécessaires
createUploadDirectories();

const uploadDir = path.join(__dirname, "uploads");
const audioDir = path.join(uploadDir, "audio");
const commentsAudioDir = path.join(uploadDir, "comments-audio");
const avatarDir = path.join(uploadDir, "avatars");
const defaultAvatarsDir = path.join(__dirname, "default-avatars");

// Initialiser les avatars par défaut
const createDefaultAvatar = (gender, filename) => {
  const targetPath = path.join(defaultAvatarsDir, `default-${gender}.png`);
  const sourcePath = path.join(__dirname, "default-avatars", filename);

  // Ne créer que si le fichier n'existe pas déjà
  if (!fs.existsSync(targetPath)) {
    // Utiliser un avatar générique si le fichier source n'existe pas
    if (
      !fs.existsSync(sourcePath) &&
      fs.existsSync(path.join(__dirname, "default-avatars", "male.png"))
    ) {
      fs.copyFileSync(
        path.join(__dirname, "default-avatars", "male.png"),
        targetPath
      );
    } else if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, targetPath);
    }
    console.log(`Creating default avatar for ${gender}`);
  }
};

// Créer des avatars par défaut
createDefaultAvatar("male", "male.png");
createDefaultAvatar("female", "female.png");
createDefaultAvatar("other", "other.png");

// Import des routes
const authRoutes = require("./routes/auth");
const postsRoutes = require("./routes/posts");
const usersRoutes = require("./routes/users");
const notificationsRoutes = require("./routes/notifications");
const adminRoutes = require("./routes/admin");
const contactRoutes = require("./routes/contact");

const app = express();
const server = http.createServer(app);

// Configuration du socket.io pour les notifications en temps réel
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

// Middleware pour rendre io accessible dans les routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(
  fileUpload({
    useTempFiles: true,
    tempFileDir: "/tmp/",
    createParentPath: true,
    limits: { fileSize: 50 * 1024 * 1024 }, // Limite à 50MB
  })
);

// Dossier static pour les uploads
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/uploads/comments-audio", express.static(path.join(__dirname, "uploads/comments-audio")));

// Dossier static spécifique pour les fichiers audio avec headers personnalisés
app.use("/uploads/audio", express.static(path.join(__dirname, "uploads/audio"), {
  setHeaders: (res, path) => {
    if (path.endsWith('.mp3')) {
      res.set('Content-Type', 'audio/mpeg');
      res.set('Accept-Ranges', 'bytes');
      res.set('Access-Control-Allow-Origin', '*');
    }
  }
}));

app.use(
  "/default-avatars",
  express.static(path.join(__dirname, "default-avatars"))
);


// Routes
app.use("/api/auth", authRoutes);
app.use("/api/posts", postsRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/contact", contactRoutes);

// Gestion des erreurs
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send({
    success: false,
    message: err.message || "Une erreur est survenue sur le serveur",
  });
});
app.use("/api/healthcheck", healthcheckRoutes);

// Socket.io events
io.on("connection", (socket) => {
  console.log("Un utilisateur est connecté", socket.id);

  socket.on("join", (userId) => {
    socket.join(userId);
    console.log(`Utilisateur ${userId} a rejoint sa salle privée`);
  });

  socket.on("disconnect", () => {
    console.log("Utilisateur déconnecté");
  });
});

// Connexion à MongoDB
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("Connecté à MongoDB");
    // Démarrage du serveur
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`Serveur démarré sur le port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Erreur de connexion à MongoDB:", err.message);
    process.exit(1);
  });
