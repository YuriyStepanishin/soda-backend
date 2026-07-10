import { pool } from '../db/connectNeon.js';

export const findUserById = async (id) => {
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);

  return result.rows[0];
};

export const findUserByEmail = async (email) => {
  const result = await pool.query('SELECT * FROM users WHERE email = $1', [
    email,
  ]);

  return result.rows[0];
};

export const createUser = async ({ email, passwordHash }) => {
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

export const updateUserPasswordById = async ({ id, passwordHash }) => {
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
