-- Clear portfolio_config_daily_series rows stuck in 'empty' when perf rows exist.
-- After deletion, ensureConfigDailySeries recomputes and writes a healthy row.

DELETE FROM portfolio_config_daily_series cds
USING (
  SELECT DISTINCT strategy_id, config_id
  FROM strategy_portfolio_config_performance
) perf
WHERE cds.strategy_id = perf.strategy_id
  AND cds.config_id = perf.config_id
  AND cds.data_status = 'empty';

DO $$
DECLARE
  remaining int;
BEGIN
  SELECT COUNT(*) INTO remaining
  FROM portfolio_config_daily_series
  WHERE data_status = 'empty';
  RAISE NOTICE 'portfolio_config_daily_series empty rows remaining: %', remaining;
END $$;
