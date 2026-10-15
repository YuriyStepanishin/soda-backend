import { ROLES } from '../../constants/roles.js';

export const users = {
  'kristal-km@ukr.net': {
    role: ROLES.MANAGER,
    tenant: 'laska',
    department: 'Усі відділи',
    representative: 'Максим Розенгоф',
  },

  'vvasilyuk28@gmail.com': {
    role: ROLES.AGENT,
    tenant: 'laska',
    department: 'Областний відділ',
    representative: 'Василюк Віталій Вікторович',
  },
  'ruslan1976m50b20@icloud.com': {
    role: ROLES.AGENT,
    tenant: 'laska',
    department: 'Областний відділ',
    representative: 'Войцехівський Руслан Володимирович',
  },
  'karvan.sm006@gmail.com': {
    role: ROLES.AGENT,
    tenant: 'laska',
    department: 'Областний відділ',
    representative: 'Гороцька Тетяна Петрівна',
  },

  'ks_sup@gmail.com': {
    role: ROLES.SUPERVISOR,
    tenant: 'laska',
    departments: ['Місто'],
    representative: 'Сергій Кузнєцов',
  },

  'email_brand@gmail.com': {
    role: ROLES.BRAND_MANAGER,
    tenant: 'laska',
    brands: ['LASKA', 'Бренд 2'],
    representative: 'Зоя Іванова',
  },
};

export const getUserProfile = (email) => {
  if (!email) return null;

  return users[email.trim().toLowerCase()] || null;
};

export const allowedEmails = Object.keys(users);
