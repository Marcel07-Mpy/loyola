/**
 * Regroupe les opérations de sécurité liées aux mots de passe et aux jetons JWT.
 */
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const SALT_ROUNDS = 10;

export const hashPassword = async (password) => {
  return await bcrypt.hash(password, SALT_ROUNDS);
};

export const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

export const generateToken = (userId, username, role) => {
  return jwt.sign(
    { id: userId, username, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN, algorithm: 'HS256' }
  );
};

export const setTokenCookie = (res, token) => {
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // true en prod
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 jours
  });
};

export const clearTokenCookie = (res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  });
};