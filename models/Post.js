const mongoose = require("mongoose");


const CommentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  username: String, // Ajouté
  avatar: String,   // Ajouté
  content: {
    type: String,
    trim: true
  },
  audioUrl: String,
  audioDuration: Number,
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const PostSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    audioUrl: {
      type: String,
      required: true,
    },
    audioDuration: {
      type: Number,
      required: true,
    },
    description: {
      type: String,
      trim: true,
    },
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    comments: [CommentSchema],
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtuals
PostSchema.virtual("likesCount").get(function () {
  return this.likes.length;
});

PostSchema.virtual("commentsCount").get(function () {
  return this.comments.length;
});

module.exports = mongoose.model("Post", PostSchema);
