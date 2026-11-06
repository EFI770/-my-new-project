// Postgres access for the DEVELOPMENT-ONLY emulator.
// Every authenticated query runs inside a transaction as role `authenticated`
// with app.sub set - the same mechanism Supabase/PostgREST uses - so the RLS
// policies and security-definer RPCs in supabase/migrations are what actually
// authorize every request. No authorization logic lives in this file.
import pg from 'pg';

const { Pool } = pg;

export function createDb({ socketDir, database, appUrl, adminUrl }) {
  // Two modes:
  // - local dev emulator: socket connection as local superuser (bootstrap/DDL),
  //   SET ROLE authenticated for user traffic (same as Neon mode).
  // - Neon vendor (appUrl/DATABASE_APP_URL set): user traffic connects as the
  //   least-privilege chavruta_app role (no BYPASSRLS, no table grants of its
  //   own); adminUrl/DATABASE_ADMIN_URL (owner) is used ONLY for bootstrap/binding
  //   writes that mirror the service role, never for end-user reads.
  // Explicit appUrl/adminUrl parameters let hosted runtimes inject connection
  // strings from their own binding/env system instead of process.env.
  const app = appUrl || process.env.DATABASE_APP_URL;
  const admin = adminUrl || process.env.DATABASE_ADMIN_URL || app;
  const neon = !!app;
  const pool = neon
    ? new Pool({ connectionString: app, max: Number(process.env.PGPOOL_MAX || 5) })
    : new Pool({ host: socketDir, database, user: 'postgres', max: 5 });
  const servicePool = neon
    ? new Pool({ connectionString: admin, max: 2 })
    : pool;

  async function withRls(userId, fn) {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query('set local role authenticated');
      // Parameterized set_config: the user id is a value, never interpolated SQL.
      await client.query(`select set_config('app.sub', $1, true)`, [String(userId)]);
      const result = await fn(client);
      await client.query('commit');
      return result;
    } catch (err) {
      await client.query('rollback').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  // DDL / bootstrap / dev-auth tables: superuser, mirroring Supabase service_role.
  // Never used for end-user data access.
  async function asService(fn) {
    const client = await servicePool.connect();
    try { return await fn(client); } finally { client.release(); }
  }

  return { pool, withRls, asService };
}

export function mapPgError(err) {
  if (err?.code === '42501') return { status: 403, error: err.message.includes('Authentication required') ? 'authentication_required' : 'not_permitted' };
  if (err?.code === '23505') return { status: 409, error: 'conflict' };
  if (err?.code === '23514' || err?.code === '22023') return { status: 400, error: 'invalid_input' };
  if (err?.code === '23503') return { status: 400, error: 'invalid_reference' };
  return null;
}
