import { ROLES } from '../../constants/roles.js';

export const users = {
  'y.stepanishin@gmail.com': {
    role: ROLES.ADMIN,
    tenantAdmin: 'olgatorg',
    department: 'Усі відділи',
    representative: 'Юрій Степанишин',
  },
};

export const getUserProfile = (email) => {
  if (!email) return null;

  return users[email.trim().toLowerCase()] || null;
};

export const allowedEmails = Object.keys(users);
