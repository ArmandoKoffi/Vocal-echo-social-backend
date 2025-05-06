const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// Configuration des avatars Cloudinary
const DEFAULT_AVATARS = {
  male: 'https://res.cloudinary.com/dx9ihjr0f/image/upload/v1746491998/default-avatars/default-male.png',
  female: 'https://res.cloudinary.com/dx9ihjr0f/image/upload/v1746492000/default-avatars/default-female.png',
  other: 'https://res.cloudinary.com/dx9ihjr0f/image/upload/v1746492001/default-avatars/default-other.png'
};

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, "Veuillez fournir un nom d'utilisateur"],
    unique: true,
    trim: true,
  },
  email: {
    type: String,
    required: [true, "Veuillez fournir un email"],
    unique: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      "Veuillez fournir un email valide",
    ],
  },
  password: {
    type: String,
    required: [true, "Veuillez fournir un mot de passe"],
    minlength: 6,
    select: false,
  },
  avatar: {
    type: String,
    validate: {
      validator: function (v) {
        return /^https?:\/\//.test(v);
      },
      message: (props) => `${props.value} n'est pas une URL valide!`,
    },
    default: function () {
      return DEFAULT_AVATARS[this.gender] || DEFAULT_AVATARS.other;
    },
  },
  bio: {
    type: String,
    default: "",
  },
  gender: {
    type: String,
    enum: ["male", "female", "other"],
    required: true,
  },
  isAdmin: {
    type: Boolean,
    default: false,
  },
  followersCount: {
    type: Number,
    default: 0,
  },
  followingCount: {
    type: Number,
    default: 0,
  },
  postsCount: {
    type: Number,
    default: 0,
  },
  followers: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  following: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

UserSchema.pre("save", async function (next) {
  if (this.isNew) {
    const count = await mongoose.model("User").countDocuments();
    if (count === 0) {
      this.isAdmin = true;
    }
  }
  next();
});

UserSchema.set("toJSON", {
  transform: function (doc, ret) {
    delete ret.password;
    return ret;
  },
});

module.exports = mongoose.model("User", UserSchema);
