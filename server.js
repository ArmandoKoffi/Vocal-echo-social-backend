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

  if (!fs.existsSync(targetPath)) {
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

// Configuration CORS mise à jour
const allowedOrigins = [
  "http://localhost:3000",
  "https://vocal-echo-social-frontend.vercel.app"
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

// Middleware pour rendre io accessible dans les routes
const io = socketIo(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  }
});

app.use((req, res, next) => {
  req.io = io;
  next();
});

app.use(express.json());

app.use(
  fileUpload({
    useTempFiles: true,
    tempFileDir: "/tmp/",
    createParentPath: true,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  })
);

// Dossiers statiques
app.use("/uploads", express.static(uploadDir));
app.use("/uploads/comments-audio", express.static(commentsAudioDir));

app.use("/uploads/audio", express.static(audioDir, {
  setHeaders: (res, path) => {
    if (path.endsWith('.mp3')) {
      res.set('Content-Type', 'audio/mpeg');
      res.set('Accept-Ranges', 'bytes');
      res.set('Access-Control-Allow-Origin', '*');
    }
  }
}));

app.use("/default-avatars", express.static(defaultAvatarsDir));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/posts", postsRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/healthcheck", healthcheckRoutes);

// Gestion des erreurs
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send({
    success: false,
    message: err.message || "Une erreur est survenue sur le serveur",
  });
});

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

// Connexion MongoDB + démarrage serveur
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("Connecté à MongoDB");
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`Serveur démarré sur le port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Erreur de connexion à MongoDB:", err.message);
    process.exit(1);
  });
