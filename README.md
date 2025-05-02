
# VocalExpress Backend

Ce backend Node.js/Express fournit une API complète pour l'application VocalExpress, le réseau social des notes vocales.

## Fonctionnalités

- Authentification complète (inscription, connexion, profil)
- Gestion des posts vocaux (création, lecture, like, commentaire)
- Système de followers/following
- Notifications en temps réel avec Socket.io
- Gestion des uploads de fichiers (audio et avatars)
- Base de données MongoDB

## Installation

1. **Cloner le projet et installer les dépendances**

```bash
cd backend
npm install
```

2. **Configurer les variables d'environnement**

Le fichier `.env` doit être présent avec les variables suivantes:
- PORT: Port du serveur (défaut: 5000)
- MONGODB_URI: URI de la base de données MongoDB
- JWT_SECRET: Clé secrète pour les tokens JWT
- JWT_EXPIRE: Durée de validité des tokens JWT
- UPLOAD_PATH: Chemin pour les fichiers uploadés

3. **Lancer le serveur**

```bash
# Mode développement
npm run dev

# Mode production
npm start
```

## Structure du projet

- `server.js`: Point d'entrée de l'application
- `models/`: Schémas et modèles Mongoose
- `routes/`: Routes de l'API
- `middleware/`: Middlewares (authentification, etc.)
- `uploads/`: Répertoire des fichiers uploadés (audio, avatars)

## Routes API

### Authentification

- `POST /api/auth/register`: Inscription d'un utilisateur
- `POST /api/auth/login`: Connexion d'un utilisateur
- `GET /api/auth/me`: Obtenir les informations de l'utilisateur connecté
- `PUT /api/auth/update-profile`: Mettre à jour le profil
- `PUT /api/auth/change-password`: Changer le mot de passe

### Posts

- `GET /api/posts`: Récupérer tous les posts
- `POST /api/posts`: Créer un nouveau post vocal
- `POST /api/posts/:id/like`: Aimer/Ne plus aimer un post
- `POST /api/posts/:id/comment`: Commenter un post
- `DELETE /api/posts/:id`: Supprimer un post
- `GET /api/posts/user/:userId`: Récupérer les posts d'un utilisateur

### Utilisateurs

- `GET /api/users/:id`: Récupérer un utilisateur par son ID
- `POST /api/users/:id/follow`: Suivre/Ne plus suivre un utilisateur
- `GET /api/users/search/:query`: Rechercher des utilisateurs
- `GET /api/users/:id/followers`: Récupérer les followers d'un utilisateur
- `GET /api/users/:id/following`: Récupérer les utilisateurs suivis

### Notifications

- `GET /api/notifications`: Récupérer toutes les notifications
- `PUT /api/notifications/read-all`: Marquer toutes les notifications comme lues
- `PUT /api/notifications/:id/read`: Marquer une notification comme lue
- `GET /api/notifications/:id`: Récupérer une notification par son ID
- `DELETE /api/notifications/:id`: Supprimer une notification

## Sécurité

Le backend implémente de nombreuses mesures de sécurité:
- Hachage des mots de passe avec bcryptjs
- Authentification par tokens JWT
- Validation des données entrantes
- Protection des routes privées
- Vérification des autorisations pour les actions sensibles
