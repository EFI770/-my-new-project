-- Bounded synthetic seed for the GATED private preview ONLY
-- (parent directive 2026-11-06 14:12 IST: 2 synthetic men + 2 synthetic women
-- so the same-gender match/request/consent/contact flow is exercisable).
-- All rows are synthetic: preview.synthetic emails, 050-000000x phones.
-- NEVER run against a production database.
set row_security to off;

-- Complete the two demo-login profiles (IDs from the live demo provisioning).
update public.profiles set
  bio = 'אברהם דמו: לומד פרשת שבוע וגמרא, מחפש חברותא קבועה לערבים.',
  learning_topics = array['פרשת שבוע','גמרא'],
  learning_level = 'intermediate',
  preferred_modes = array['in_person','video'],
  available_days = array['sun','tue','thu'],
  availability_notes = 'ערבים'
where id = '94aae434-8b47-41a0-8343-422d47cd9ca3';
update public.profiles set
  bio = 'שרה דמו: לומדת תנ"ך ומוסר, פנויה בשעות הבוקר.',
  learning_topics = array['תנ"ך','מוסר'],
  learning_level = 'beginner',
  preferred_modes = array['video','phone'],
  available_days = array['mon','wed'],
  availability_notes = 'בוקר'
where id = '3fb6f0c4-c7a9-4b8c-90ad-73297816af31';

-- Second man + second woman: login identities bound to their fixed profile
-- UUIDs, so the demo-login route finds these rows and does not provision new
-- empty profiles. Password login stays impossible (sentinel hash).
insert into dev_auth.users (id, email, password_hash) values
  ('11111111-1111-4111-8111-111111111111', 'demo.man2@preview.synthetic', 'demo-password-login-impossible'),
  ('22222222-2222-4222-8222-222222222222', 'demo.woman2@preview.synthetic', 'demo-password-login-impossible')
on conflict (email) do nothing;
insert into auth.users (id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222')
on conflict do nothing;
insert into public.profiles (id, display_name, gender, age_attested_at, bio, learning_topics, learning_level, preferred_modes, available_days, availability_notes) values
  ('11111111-1111-4111-8111-111111111111', 'יעקב (דמו)', 'man', now(),
   'יעקב דמו: מתמקד בהלכה ומשנה, לומד בסדר קבוע.', array['הלכה','משנה'], 'advanced', array['in_person'], array['sun','wed'], 'אחרי הצהריים'),
  ('22222222-2222-4222-8222-222222222222', 'רבקה (דמו)', 'woman', now(),
   'רבקה דמו: חסידות ופרשת שבוע, מחפשת חברותא לערב.', array['חסידות','פרשת שבוע'], 'intermediate', array['in_person','video'], array['tue','thu'], 'ערב')
on conflict (id) do nothing;

-- Synthetic contact methods for all four (revealed only after consent).
insert into public.contact_methods (user_id, kind, value, is_primary) values
  ('94aae434-8b47-41a0-8343-422d47cd9ca3', 'whatsapp', '050-0000001', true),
  ('3fb6f0c4-c7a9-4b8c-90ad-73297816af31', 'whatsapp', '050-0000002', true),
  ('11111111-1111-4111-8111-111111111111', 'phone', '050-0000003', true),
  ('22222222-2222-4222-8222-222222222222', 'whatsapp', '050-0000004', true)
on conflict do nothing;
