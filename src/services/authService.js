import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import { findUserByEmail } from '../models/userModel.js';
import { getUserProfile } from '../config/users.js';

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

  if (!profile) {
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
      role: profile.role,
      department: profile.department,
      departments: profile.departments || [],
      representative: profile.representative,
      brands: profile.brands || [],
    },
  };
};
