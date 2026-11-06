-- 0006: adults-only (18+) age attestation.
-- Stores ONLY the attestation timestamp (data minimization: no date of birth,
-- no ID document). NULL means "not attested": the API fails closed on member
-- endpoints until the user attests. The attestation is a self-declaration, not
-- age verification.
alter table public.profiles add column if not exists age_attested_at timestamptz;
