
const mongoose = require("mongoose");

const ReportSchema = new mongoose.Schema(
  {
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
    },
    reason: {
      type: String,
      required: [true, "Veuillez fournir une raison"],
      enum: [
        "Contenu inapproprié",
        "Harcèlement",
        "Spam",
        "Discours haineux",
        "Autre",
      ],
    },
    details: {
      type: String,
    },
    status: {
      type: String,
      enum: ["pending", "resolved", "dismissed"],
      default: "pending",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Report", ReportSchema);
