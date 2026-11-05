import { randomUUID } from 'node:crypto';
import { initialState } from './motivation.domain.js';
// Only the authorized LASKA pool is supplied by the route. No connection to OLGATORG.
export function createMotivationRepository(pool) {
  let ready;
  async function ensureSchema() {
    if (!ready) ready = pool.query(`
      CREATE TABLE IF NOT EXISTS motivation_state (
        id integer PRIMARY KEY CHECK (id = 1), data jsonb NOT NULL, revision integer NOT NULL DEFAULT 0,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS motivation_history (
        id uuid PRIMARY KEY, revision integer NOT NULL UNIQUE, at timestamptz NOT NULL DEFAULT now(),
        actor text NOT NULL, action text NOT NULL, data jsonb NOT NULL
      );
    `).catch(error => { ready = undefined; throw error; });
    await ready;
  }
  return {
    async read() {
      await ensureSchema();
      const { rows } = await pool.query('SELECT data, revision FROM motivation_state WHERE id = 1');
      return rows[0] || { data: initialState(), revision: 0 };
    },
    async history(before = null) {
      await ensureSchema();
      const { rows } = await pool.query('SELECT id, revision, at, actor, action FROM motivation_history WHERE ($1::int IS NULL OR revision < $1) ORDER BY revision DESC LIMIT 100', [before]);
      return rows;
    },
    async snapshot(id) {
      await ensureSchema();
      const { rows } = await pool.query('SELECT id, revision, at, actor, action, data FROM motivation_history WHERE id = $1::uuid', [id]);
      return rows[0];
    },
    async write({ data, revision, action }, actor) {
      await ensureSchema();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('INSERT INTO motivation_state(id, data) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING', [JSON.stringify(initialState())]);
        const { rows } = await client.query('UPDATE motivation_state SET data = $1::jsonb, revision = revision + 1, updated_at = now() WHERE id = 1 AND revision = $2 RETURNING revision', [JSON.stringify(data), revision]);
        if (!rows.length) { const error = new Error('Дані змінилися. Оновіть панель перед повторним збереженням.'); error.status = 409; throw error; }
        const history = await client.query('INSERT INTO motivation_history(id, revision, actor, action, data) VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING id, revision, at, actor, action', [randomUUID(), rows[0].revision, actor, action, JSON.stringify(data)]);
        await client.query('COMMIT');
        return { revision: rows[0].revision, history: history.rows[0] };
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
  };
}
