import { getPool } from '../db/index.js';

const getUserPool = (tenant) => {
  if (!tenant) {
    throw new Error('Tenant is required for user operation');
  }

  return getPool(tenant);
};

export const findUserById = async (tenant, id) => {
  const pool = getUserPool(tenant);

  const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);

  return result.rows[0];
};

export const findUserByEmail = async (tenant, email) => {
  const pool = getUserPool(tenant);

  const result = await pool.query('SELECT * FROM users WHERE email = $1', [
    email,
  ]);

  return result.rows[0];
};

export const createUser = async (tenant, { email, passwordHash }) => {
  const pool = getUserPool(tenant);

  const result = await pool.query(
    `
    INSERT INTO users (
      email,
      password_hash
    )
    VALUES ($1, $2)
    RETURNING *
    `,
    [email, passwordHash],
  );

  return result.rows[0];
};

export const updateUserPasswordById = async ({ tenant, id, passwordHash }) => {
  const pool = getUserPool(tenant);

  const result = await pool.query(
    `
    UPDATE users
    SET password_hash = $1
    WHERE id = $2
    RETURNING *
    `,
    [passwordHash, id],
  );

  return result.rows[0];
};
