// backend/routes/healthcheck.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

// Middleware qui vérifie simplement que le serveur répond
router.head("/", (req, res) => {
  res.set("X-Health-Check", "OK");
  res.status(200).end();
});

// Version plus détaillée pour le debug
router.get("/", (req, res) => {
  const status = {
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database:
      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    memoryUsage: process.memoryUsage(),
  };

  res.status(200).json(status);
});

module.exports = router;
