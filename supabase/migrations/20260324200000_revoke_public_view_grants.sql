-- Remove direct API access to recommendation data.
-- All reads now go through server routes (service role) with tier checks.
revoke select on public.nasdaq100_recommendations_current_public from anon, authenticated;
