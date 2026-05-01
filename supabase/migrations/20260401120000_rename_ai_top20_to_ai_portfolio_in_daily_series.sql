-- Renames the JSONB key `aiTop20` -> `aiPortfolio` on every element of
-- `portfolio_config_daily_series.series`. Idempotent: rows already migrated
-- are unchanged because `elem ? 'aiTop20'` returns false for them.

UPDATE portfolio_config_daily_series
SET series = COALESCE(
  (
    SELECT jsonb_agg(
      CASE
        WHEN elem ? 'aiTop20' THEN
          (elem - 'aiTop20')
            || jsonb_build_object('aiPortfolio', elem -> 'aiTop20')
        ELSE elem
      END
      ORDER BY ord
    )
    FROM jsonb_array_elements(series) WITH ORDINALITY AS t(elem, ord)
  ),
  series
)
WHERE jsonb_typeof(series) = 'array';

DO $$
DECLARE remaining int;
BEGIN
  SELECT COUNT(*) INTO remaining
  FROM portfolio_config_daily_series cds,
       LATERAL jsonb_array_elements(cds.series) elem
  WHERE elem ? 'aiTop20';
  RAISE NOTICE 'rows still containing aiTop20 key: %', remaining;
END $$;
