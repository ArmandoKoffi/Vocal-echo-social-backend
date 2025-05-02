const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

/**
 * Schéma de l'utilisateur
 * Définit la structure des données pour les utilisateurs dans MongoDB
 */
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
    select: false, // Ne pas inclure par défaut dans les requêtes
  },
 avatar: {
  type: String,
  default: function () {
    // Retourne directement le chemin relatif
    if (this.gender === "female") {
      return "/default-avatars/default-female.png";
    } else if (this.gender === "male") {
      return "/default-avatars/default-male.png";
    }
    return "/default-avatars/default-other.png";
  },
  get: (avatar) => {
    // Transforme le chemin en URL absolue lorsqu'on accède au champ
    if (!avatar) return avatar;
    if (avatar.startsWith('https')) return avatar;
    return `${process.env.BASE_URL || 'https://vocal-echo-social-backend.onrender.com'}${avatar}`;
  }
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

/**
 * Middleware pour hacher le mot de passe avant l'enregistrement
 * S'exécute automatiquement avant chaque sauvegarde
 */
UserSchema.pre("save", async function (next) {
  // Ne pas hacher à nouveau si le mot de passe n'a pas été modifié
  if (!this.isModified("password")) {
    return next();
  }

  // Hacher le mot de passe
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

/**
 * Méthode pour comparer les mots de passe
 * Utilisée lors de la connexion pour vérifier le mot de passe
 */
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

/**
 * Middleware pour définir le premier utilisateur comme administrateur
 * Garantit qu'au moins un administrateur existe dans le système
 */
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
    // Convertit les chemins relatifs en URLs absolues
    if (ret.avatar && !ret.avatar.startsWith("http")) {
      ret.avatar = `${process.env.BASE_URL || "http://localhost:5000"}${
        ret.avatar
      }`;
    }
    return ret;
  },
});

module.exports = mongoose.model("User", UserSchema);
