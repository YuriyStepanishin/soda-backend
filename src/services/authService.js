import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import {
  findUserByEmail,
  findUserById,
  updateUserPasswordById,
} from '../models/userModel.js';

import { getUserProfile } from '../services/userProfileService.js';
import { ROLES } from '../constants/roles.js';

const VALID_ROLES = new Set(Object.values(ROLES));

const resolveRole = (dbRole, profileRole) => {
  if (VALID_ROLES.has(dbRole)) {
    return dbRole;
  }

  if (VALID_ROLES.has(profileRole)) {
    return profileRole;
  }

  return null;
};

const getAuthTenant = (profile, role) => {
  return role === ROLES.ADMIN ? profile.tenantAdmin : profile.tenant;
};

const buildUserContext = ({ user, profile, role }) => ({
  id: user.id,
  email: user.email,
  role,
  ...(role === ROLES.ADMIN
    ? { tenantAdmin: profile.tenantAdmin }
    : { tenant: profile.tenant }),
  department: profile.department,
  departments: profile.departments || [],
  representative: profile.representative,
  brands: profile.brands || [],
});

const createToken = ({ id, email }) =>
  jwt.sign({ id, email }, process.env.JWT_SECRET, { expiresIn: '7d' });

const getAuthenticatedUser = async (email) => {
  const normalizedEmail = email.trim().toLowerCase();
  const profile = getUserProfile(normalizedEmail);

  if (!profile || !VALID_ROLES.has(profile.role)) {
    return null;
  }

  const authTenant = getAuthTenant(profile, profile.role);

  if (!authTenant) {
    return null;
  }

  const user = await findUserByEmail(authTenant, normalizedEmail);

  if (!user) {
    return null;
  }

  const role = resolveRole(user.role, profile.role);

  if (!role) {
    return null;
  }

  return {
    user,
    profile,
    role,
    authTenant,
  };
};

export const loginUser = async ({ email, password }) => {
  const authenticated = await getAuthenticatedUser(email);

  if (!authenticated) {
    throw new Error('Invalid credentials');
  }

  const { user, profile, role } = authenticated;

  const isMatch = await bcrypt.compare(password, user.password_hash);

  if (!isMatch) {
    throw new Error('Invalid credentials');
  }

  const token = createToken({
    id: user.id,
    email: user.email,
  });

  return {
    token,
    user: buildUserContext({
      user,
      profile,
      role,
    }),
  };
};

export const getAuthContextByEmail = async (email) => {
  const authenticated = await getAuthenticatedUser(email);

  if (!authenticated) {
    return null;
  }

  const { user, profile, role } = authenticated;

  return buildUserContext({
    user,
    profile,
    role,
  });
};

export const changeUserPassword = async ({
  user,
  currentPassword,
  newPassword,
}) => {
  const tenant = user.role === ROLES.ADMIN ? user.tenantAdmin : user.tenant;

  if (!tenant) {
    throw new Error('Authentication tenant is not configured');
  }

  const dbUser = await findUserById(tenant, user.id);

  if (!dbUser) {
    throw new Error('User not found');
  }

  const isMatch = await bcrypt.compare(currentPassword, dbUser.password_hash);

  if (!isMatch) {
    throw new Error('Current password is invalid');
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await updateUserPasswordById({
    tenant,
    id: dbUser.id,
    passwordHash,
  });

  return {
    updated: true,
  };
};
