import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import {
  findUserByEmail,
  findUserById,
  updateUserPasswordById,
} from '../models/userModel.js';
import { getUserProfile } from '../config/olgatorgUsers.js';
import { ROLES } from '../constants/roles.js';

const VALID_ROLES = new Set(Object.values(ROLES));

// Єдине правило пріоритезації ролі: спершу роль із БД, якщо невалідна — з профілю.
const resolveRole = (dbRole, profileRole) => {
  if (VALID_ROLES.has(dbRole)) {
    return dbRole;
  }

  if (VALID_ROLES.has(profileRole)) {
    return profileRole;
  }

  return null;
};

// Повний цикл логіну: перевірка користувача, пароля, ролі та видача JWT.
export const loginUser = async ({ email, password }) => {
  const normalizedEmail = email.trim().toLowerCase();

  const user = await findUserByEmail(normalizedEmail);

  if (!user) {
    throw new Error('Invalid credentials');
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);

  if (!isMatch) {
    throw new Error('Invalid credentials');
  }

  const profile = getUserProfile(normalizedEmail);
  const resolvedRole = resolveRole(user.role, profile?.role);

  if (!resolvedRole) {
    throw new Error('Access denied');
  }

  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: '7d',
    },
  );

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      role: resolvedRole,
      department: profile?.department,
      departments: profile?.departments || [],
      representative: profile?.representative,
      brands: profile?.brands || [],
    },
  };
};

// Формує безпечний auth-контекст користувача для middleware authenticate.
export const getAuthContextByEmail = async (email) => {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await findUserByEmail(normalizedEmail);

  if (!user) {
    return null;
  }

  const profile = getUserProfile(normalizedEmail);
  const resolvedRole = resolveRole(user.role, profile?.role);

  if (!resolvedRole) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    role: resolvedRole,
    department: profile?.department,
    departments: profile?.departments || [],
    representative: profile?.representative,
    brands: profile?.brands || [],
  };
};

// Перевіряє старий пароль і зберігає новий хеш пароля.
export const changeUserPassword = async ({
  userId,
  currentPassword,
  newPassword,
}) => {
  const user = await findUserById(userId);

  if (!user) {
    throw new Error('User not found');
  }

  const isMatch = await bcrypt.compare(currentPassword, user.password_hash);

  if (!isMatch) {
    throw new Error('Current password is invalid');
  }

  const newPasswordHash = await bcrypt.hash(newPassword, 10);

  await updateUserPasswordById({
    id: user.id,
    passwordHash: newPasswordHash,
  });

  return { updated: true };
};
