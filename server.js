require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");
const reportsRoutes = require("./routes/reports");

// Initialisation de l'application Express
const app = express();
const server = http.createServer(app);

// Configuration CORS
const corsOptions = {
  origin: process.env.FRONTEND_URL || [
    "https://vocal-echo-social-frontend.vercel.app",
    "http://localhost:3000",
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};

// Middlewares
app.use(cors(corsOptions));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Configuration Socket.io
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || [
      "https://vocal-echo-social-frontend.vercel.app",
      "http://localhost:3000",
    ],
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

// Stockage en mémoire pour les utilisateurs connectés et les sessions admin
const connectedUsers = new Map(); // userId -> socketId
const adminSockets = new Set(); // ensemble des socketId des administrateurs

// Rendre l'objet io accessible dans les routes
app.set("io", io);
app.set("connectedUsers", connectedUsers);
app.set("adminSockets", adminSockets);

// Middleware pour ajouter io à toutes les requêtes
app.use((req, res, next) => {
  req.io = io;
  req.connectedUsers = connectedUsers;
  req.adminSockets = adminSockets;
  next();
});

// Routes API
const authRoutes = require("./routes/auth");
const postsRoutes = require("./routes/posts");
const usersRoutes = require("./routes/users");
const notificationsRoutes = require("./routes/notifications");
const adminRoutes = require("./routes/admin");
const contactRoutes = require("./routes/contact");
const healthcheckRoutes = require("./routes/healthcheck");

app.use("/api/auth", authRoutes);
app.use("/api/posts", postsRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/healthcheck", healthcheckRoutes);
app.use("/api/reports", reportsRoutes);

// Gestion des connexions Socket.io
io.on("connection", (socket) => {
  console.log(`⚡ Nouvelle connexion Socket.io: ${socket.id}`);

  // Stocker l'ID utilisateur quand il se connecte
  socket.on("join", (userData) => {
    if (!userData) return;

    const userId = typeof userData === "object" ? userData.userId : userData;
    const isAdmin = typeof userData === "object" ? userData.isAdmin : false;

    if (userId) {
      // Garder trace des socketId pour chaque utilisateur
      connectedUsers.set(userId, socket.id);
      socket.userId = userId; // Associer l'ID utilisateur à la socket
      socket.join(userId); // Room personnelle
      socket.join("allUsers"); // Room globale pour tous les utilisateurs
      console.log(`👤 Utilisateur ${userId} connecté à sa room`);

      // Rejoindre la room des administrateurs si nécessaire
      if (isAdmin) {
        socket.join("adminRoom");
        adminSockets.add(socket.id);
        console.log(`👑 Administrateur ${userId} connecté`);
      }

      // Mettre à jour la liste des utilisateurs en ligne
      updateOnlineUsers();
    }
  });

  // Gestion du suivi des pages administrateur
  socket.on("joinAdminDashboard", () => {
    if (socket.userId) {
      socket.join("adminDashboard");
      console.log(`👑 Admin ${socket.userId} rejoint le dashboard admin`);
    }
  });

  // L'utilisateur quitte le dashboard admin
  socket.on("leaveAdminDashboard", () => {
    socket.leave("adminDashboard");
    console.log(`👑 Admin quitte le dashboard admin`);
  });

  // Gestion des déconnexions
  socket.on("disconnect", () => {
    console.log(`🔌 Déconnexion Socket.io: ${socket.id}`);

    if (socket.userId) {
      connectedUsers.delete(socket.userId);
    }

    adminSockets.delete(socket.id);

    updateOnlineUsers();
  });

  // Fonction pour mettre à jour la liste des utilisateurs en ligne
  const updateOnlineUsers = () => {
    const onlineUserIds = Array.from(connectedUsers.keys());

    // Émission à tous les utilisateurs connectés
    io.emit("onlineUsers", onlineUserIds);

    // Émission spécifique aux admins pour le tableau de bord
    io.to("adminDashboard").emit("onlineUsersCount", onlineUserIds.length);
  };
});

// Module exports pour utilisation dans d'autres fichiers si nécessaire
module.exports = {
  io,
  app,
  server,
};

// Gestion des erreurs
app.use((err, req, res, next) => {
  console.error("Erreur interceptée:", err.stack);
  res.status(500).json({
    success: false,
    message:
      process.env.NODE_ENV === "production" ? "Erreur serveur" : err.message,
  });
});

// Connexion à MongoDB
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
  })
  .then(() => {
    console.log("✅ Connecté à MongoDB avec succès");

    // Démarrage du serveur
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`🚀 Serveur démarré sur le port ${PORT}`);
      console.log(`🌍 Environnement: ${process.env.NODE_ENV || "development"}`);
      console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL}`);
      console.log(`☁️  Cloudinary Cloud: ${process.env.CLOUDINARY_CLOUD_NAME}`);

      // Vérification des variables d'environnement critiques
      if (!process.env.JWT_SECRET) {
        console.warn("⚠️ Avertissement: JWT_SECRET non défini");
      }
      if (!process.env.MONGODB_URI) {
        console.warn("⚠️ Avertissement: MONGODB_URI non défini");
      }
    });
  })
  .catch((err) => {
    console.error("❌ Échec de la connexion à MongoDB:", err.message);
    process.exit(1);
  });

// Gestion des arrêts propres
process.on("SIGINT", () => {
  mongoose.connection.close(() => {
    console.log("⏏️ Déconnexion de MongoDB due à l'arrêt de l'application");
    process.exit(0);
  });
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

