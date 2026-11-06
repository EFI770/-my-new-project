import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(new URL('../supabase/migrations/0002_contact_consent_and_blocks.sql', import.meta.url), 'utf8');
const sql1 = fs.readFileSync(new URL('../supabase/migrations/0001_initial_schema.sql', import.meta.url), 'utf8');

test('migrations use valid dollar quoting (0001 shipped with broken as $ quoting)', () => {
  for (const [name, src] of [['0001', sql1], ['0002', sql]]) {
    assert.ok(!/^as \$$/m.test(src), name + ' has bare as $ quoting');
    assert.ok(!/^\$;$/m.test(src), name + ' has bare $; terminator');
  }
});

test('bilateral consent columns exist, default false', () => {
  assert.match(sql, /requester_contact_consent boolean not null default false/);
  assert.match(sql, /recipient_contact_consent boolean not null default false/);
});

test('consent RPC follows the 0001 checked-RPC pattern', () => {
  assert.match(sql, /function public\.consent_to_contact/);
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path = ''/);
  assert.match(sql, /grant execute on function public\.consent_to_contact\(uuid, boolean\) to authenticated/);
  assert.match(sql, /revoke all on function public\.consent_to_contact\(uuid, boolean\) from public, anon/);
  assert.match(sql, /status = 'accepted'/);
});

test('block checks go through a security-definer helper (RLS-safe), not direct subqueries', () => {
  assert.match(sql, /function public\.is_blocked_between\(p_user_a uuid, p_user_b uuid\)[\s\S]*?security definer/);
  assert.match(sql, /not public\.is_blocked_between\(requester_id, recipient_id\)/);
  assert.match(sql, /not public\.is_blocked_between\(auth\.uid\(\), id\)/);
  const policies = sql.slice(sql.indexOf('drop policy'));
  assert.ok(!/from public\.user_blocks/.test(policies), 'policies must not subquery user_blocks directly');
});

test('duplicate active pair closed in both directions', () => {
  assert.match(sql, /create unique index if not exists connection_requests_unique_active_pair_idx/);
  assert.match(sql, /least\(requester_id, recipient_id\), greatest\(requester_id, recipient_id\)/);
  assert.match(sql, /where status in \('pending', 'accepted'\)/);
});

test('no contact details are stored in the schema (privacy by design)', () => {
  assert.ok(!/phone|whatsapp|email/i.test(sql), 'no contact-detail columns added');
});
