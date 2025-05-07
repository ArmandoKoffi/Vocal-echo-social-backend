
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);

const corsOptions = {
  origin: process.env.FRONTEND_URL || [
    "https://vocal-echo-social-frontend.vercel.app",
    "http://localhost:3000",
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Middleware de logging pour le débogage
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Configuration Socket.io
const io = socketIo(server, {
  cors: corsOptions,
});

// Middleware global pour Socket.io
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Middleware de base
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Import des routes
const authRoutes = require("./routes/auth");
const postsRoutes = require("./routes/posts");
const usersRoutes = require("./routes/users");
const notificationsRoutes = require("./routes/notifications");
const adminRoutes = require("./routes/admin");
const contactRoutes = require("./routes/contact");
const healthcheckRoutes = require("./routes/healthcheck");

// Configuration des routes
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
  res.status(500).json({
    success: false,
    message:
      process.env.NODE_ENV === "production" ? "Erreur serveur" : err.message,
  });
});

// Connexion à MongoDB avec meilleures pratiques
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
      console.log(`🌍 Environnement: ${process.env.NODE_ENV}`);
      console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL}`);
      console.log(`☁️  Cloudinary Cloud: ${process.env.CLOUDINARY_CLOUD_NAME}`);
    });
  })
  .catch((err) => {
    console.error("❌ Échec de la connexion à MongoDB:", err.message);
    process.exit(1);
  });

// Gestion des connexions Socket.io
io.on("connection", (socket) => {
  console.log(`⚡ Nouvelle connexion Socket.io: ${socket.id}`);

  socket.on("join", (userId) => {
    socket.join(userId);
    console.log(`👤 Utilisateur ${userId} connecté à sa room`);
  });

  socket.on("disconnect", () => {
    console.log(`🔌 Déconnexion Socket.io: ${socket.id}`);
  });
});

