import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(new URL('../supabase/migrations/0002_contact_consent_and_blocks.sql', import.meta.url), 'utf8');

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

test('blocks enforced on new connection requests in both directions', () => {
  const policy = sql.match(/create policy "requester creates connection requests"[\s\S]*?\);/);
  assert.ok(policy);
  assert.match(policy[0], /b\.blocker_id = recipient_id and b\.blocked_id = requester_id/);
  assert.match(policy[0], /b\.blocker_id = requester_id and b\.blocked_id = recipient_id/);
});

test('profile visibility excludes block relationships both ways', () => {
  const policy = sql.match(/create policy "authenticated members can view profiles"[\s\S]*?\);/);
  assert.ok(policy);
  assert.match(policy[0], /b\.blocker_id = auth\.uid\(\) and b\.blocked_id = profiles\.id/);
  assert.match(policy[0], /b\.blocker_id = profiles\.id and b\.blocked_id = auth\.uid\(\)/);
});

test('no contact details are stored in the schema (privacy by design)', () => {
  assert.ok(!/phone|whatsapp|email/i.test(sql), 'no contact-detail columns added');
});
