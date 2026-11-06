// Postgres access for the DEVELOPMENT-ONLY emulator.
// Every authenticated query runs inside a transaction as role `authenticated`
// with app.sub set - the same mechanism Supabase/PostgREST uses - so the RLS
// policies and security-definer RPCs in supabase/migrations are what actually
// authorize every request. No authorization logic lives in this file.
import pg from 'pg';

const { Pool } = pg;

export function createDb({ socketDir, database }) {
  const pool = new Pool({ host: socketDir, database, user: 'postgres', max: 5 });

  async function withRls(userId, fn) {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query('set local role authenticated');
      await client.query(`set local app.sub = '${userId}'`);
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
    const client = await pool.connect();
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
