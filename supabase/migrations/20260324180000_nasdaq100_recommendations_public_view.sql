-- Expose current recommendations to anon/authenticated without latent_rank (ordinal signal).
-- Base table SELECT is revoked from API roles; service role and table owner still have full access.

create or replace view public.nasdaq100_recommendations_current_public
with (security_invoker = false)
as
select
  stock_id,
  latest_run_id,
  score,
  score_delta,
  confidence,
  bucket,
  reason_1s,
  risks,
  citations,
  sources,
  updated_at
from public.nasdaq100_recommendations_current;

comment on view public.nasdaq100_recommendations_current_public is
  'Public-safe current recommendations (excludes latent_rank). Use from publishable Supabase clients.';

revoke select on public.nasdaq100_recommendations_current from anon, authenticated;

grant select on public.nasdaq100_recommendations_current_public to anon, authenticated;

drop policy if exists "Public read current recommendations" on public.nasdaq100_recommendations_current;
