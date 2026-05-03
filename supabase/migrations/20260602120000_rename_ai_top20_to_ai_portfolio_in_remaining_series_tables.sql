-- Renames JSONB key `aiTop20` -> `aiPortfolio` on every element of `series`
-- in the three tables not covered by 20260601120000_rename_ai_top20_to_ai_portfolio_in_daily_series.sql.
-- Idempotent: rows already migrated have no `aiTop20` key, so the CASE branch is a no-op.

DO $$
DECLARE
  tbl text;
  remaining int;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'portfolio_config_daily_series_history',
    'portfolio_strategy_daily_series',
    'portfolio_strategy_daily_series_history'
  ] LOOP
    EXECUTE format($f$
      UPDATE public.%I
      SET series = COALESCE(
        (
          SELECT jsonb_agg(
            CASE
              WHEN elem ? 'aiTop20'
                THEN (elem - 'aiTop20')
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
    $f$, tbl);

    EXECUTE format($f$
      SELECT COUNT(*) FROM public.%I cds,
        LATERAL jsonb_array_elements(cds.series) elem
      WHERE elem ? 'aiTop20';
    $f$, tbl) INTO remaining;
    RAISE NOTICE 'table % rows still containing aiTop20: %', tbl, remaining;
  END LOOP;
END $$;
