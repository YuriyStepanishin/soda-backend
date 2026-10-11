import { getUserProfile as getAdminUserProfile } from '../config/users_db/adminUser.js';
import { getUserProfile as getLaskaUserProfile } from '../config/users_db/laskaUsers.js';
import { getUserProfile as getOlgatorgUserProfile } from '../config/users_db/olgatorgUsers.js';

const TENANT_USER_PROFILES = {
  laska: getLaskaUserProfile,
  olgatorg: getOlgatorgUserProfile,
};

export const getUserProfile = (email) => {
  if (!email) {
    return null;
  }

  const normalizedEmail = email.trim().toLowerCase();

  const adminProfile = getAdminUserProfile(normalizedEmail);

  if (adminProfile) {
    return adminProfile;
  }

  for (const [tenant, getProfile] of Object.entries(TENANT_USER_PROFILES)) {
    const profile = getProfile(normalizedEmail);

    if (profile) {
      return {
        ...profile,
        tenant,
      };
    }
  }

  return null;
};
