/**
 * Contrôleur user controller. Valide la requête HTTP, appelle les modèles/services et construit une réponse cohérente.
 */
import UserModel from '../models/UserModel.js';
import { hashPassword } from '../services/authService.js';

// Validation du mot de passe
const validatePassword = (password) => {
  const minLength = 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);
  
  if (password.length < minLength) {
    return `Le mot de passe doit contenir au moins ${minLength} caractères.`;
  }
  if (!hasUpperCase) {
    return 'Le mot de passe doit contenir au moins une lettre majuscule.';
  }
  if (!hasLowerCase) {
    return 'Le mot de passe doit contenir au moins une lettre minuscule.';
  }
  if (!hasNumbers) {
    return 'Le mot de passe doit contenir au moins un chiffre.';
  }
  if (!hasSpecialChar) {
    return 'Le mot de passe doit contenir au moins un caractère spécial (!@#$%^&* etc.).';
  }
  return null;
};

export const getUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const { users, total } = await UserModel.findAll(limit, offset);
    res.json({
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la récupération des utilisateurs' });
  }
};

export const createUser = async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password || !role) {
      return res.status(400).json({ message: 'Tous les champs sont requis' });
    }
    
    // Validation du mot de passe
    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }
    
    if (!['admin', 'agent_financier'].includes(role)) {
      return res.status(400).json({ message: 'Rôle invalide' });
    }

    // Vérifier si username existe déjà
    const existing = await UserModel.findByUsername(username);
    if (existing) {
      return res.status(409).json({ message: 'Cet identifiant est déjà utilisé' });
    }

    // Règle : maximum 2 admins
    if (role === 'admin') {
      const adminCount = await UserModel.countAdmins();
      if (adminCount >= 2) {
        return res.status(403).json({ message: 'Impossible de créer plus de 2 administrateurs' });
      }
    }

    const hashed = await hashPassword(password);
    const newUser = await UserModel.create(username, hashed, role);
    res.status(201).json(newUser);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, role, actif } = req.body;
    const currentUser = await UserModel.findById(id);
    if (!currentUser) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    // Un admin ne peut pas désactiver ou supprimer son propre compte
    if (parseInt(id) === req.user.id && (actif === false || (role && role !== currentUser.role))) {
      return res.status(403).json({ message: 'Vous ne pouvez pas modifier votre propre rôle ou désactiver votre compte' });
    }

    // Si on change le rôle en admin, vérifier la limite de 2 admins
    if (role === 'admin' && currentUser.role !== 'admin') {
      const adminCount = await UserModel.countAdmins();
      if (adminCount >= 2) {
        return res.status(403).json({ message: 'Limite de 2 administrateurs atteinte' });
      }
    }

    let passwordHash = undefined;
    if (password) {
      // Validation du nouveau mot de passe
      const passwordError = validatePassword(password);
      if (passwordError) {
        return res.status(400).json({ message: passwordError });
      }
      passwordHash = await hashPassword(password);
    }

    const updateData = {};
    if (username !== undefined) updateData.username = username;
    if (passwordHash !== undefined) updateData.passwordHash = passwordHash;
    if (role !== undefined) updateData.role = role;
    if (actif !== undefined) updateData.actif = actif;

    const updated = await UserModel.update(id, updateData);
    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUser = await UserModel.findById(id);
    if (!currentUser) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }
    // Auto-suppression interdite
    if (parseInt(id) === req.user.id) {
      return res.status(403).json({ message: 'Vous ne pouvez pas supprimer votre propre compte' });
    }
    await UserModel.delete(id);
    res.json({ message: 'Utilisateur supprimé avec succès' });
  } catch (error) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
};