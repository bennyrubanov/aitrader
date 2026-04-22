-- Step 1 from .cursor/plans/notifications-implementation-audit-follow-up.plan.md
-- Expects migration 20260422212537_notifications_per_scope_channels.sql applied.
--
-- Usage (local or any Postgres with DB URL):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/verify-notifications-migration.sql
--
-- All checks run inside a transaction that rolls back (no data left from the insert test).

BEGIN;

DO $$
DECLARE
  n int;
  uid uuid;
BEGIN
  SELECT count(*) INTO n
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'user_portfolio_profiles'
    AND column_name IN (
      'notify_rebalance_inapp',
      'notify_rebalance_email',
      'notify_price_move_inapp',
      'notify_price_move_email',
      'notify_entries_exits_inapp',
      'notify_entries_exits_email'
    );
  IF n != 6 THEN
    RAISE EXCEPTION 'Step 1A failed: expected 6 user_portfolio_profiles scope columns, got %', n;
  END IF;

  SELECT count(*) INTO n
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'user_portfolio_stocks'
    AND column_name IN ('notify_rating_inapp', 'notify_rating_email');
  IF n != 2 THEN
    RAISE EXCEPTION 'Step 1B failed: expected 2 user_portfolio_stocks rating columns, got %', n;
  END IF;

  SELECT id INTO uid FROM public.user_profiles LIMIT 1;
  IF uid IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (uid, 'portfolio_price_move', '__migration_verify__', null, '{}'::jsonb);
    RAISE NOTICE 'Step 1C: notifications.type accepts portfolio_price_move (rolled back after script)';
  ELSE
    RAISE NOTICE 'Step 1C skipped: user_profiles is empty';
  END IF;

  RAISE NOTICE 'Notifications migration verification passed (1A + 1B + 1C as applicable).';
END $$;

ROLLBACK;
