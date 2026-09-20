/**
 * Contrôleur auth controller. Valide la requête HTTP, appelle les modèles/services et construit une réponse cohérente.
 */
import UserModel from '../models/UserModel.js';
import { comparePassword, generateToken, setTokenCookie, clearTokenCookie } from '../services/authService.js';

export const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Identifiant et mot de passe requis' });
    }

    const user = await UserModel.findByUsername(username);
    if (!user) {
      return res.status(401).json({ message: 'Identifiant ou mot de passe incorrect' });
    }

    const isMatch = await comparePassword(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Identifiant ou mot de passe incorrect' });
    }

    if (!user.actif) {
      return res.status(401).json({ message: 'Compte désactivé, contactez l\'administrateur' });
    }

    const token = generateToken(user.id, user.username, user.role);
    setTokenCookie(res, token);

    res.json({
      message: 'Connexion réussie',
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        actif: user.actif
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

export const logout = (req, res) => {
  clearTokenCookie(res);
  res.json({ message: 'Déconnexion réussie' });
};

export const me = async (req, res) => {
  try {
    const user = await UserModel.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
};