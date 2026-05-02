-- One-paste investigation: daily snapshot / weekly cadence regression.
-- Run the entire file once in Supabase SQL Editor — one result grid.
--
-- Locks to strategy slug below and portfolio config: risk_level=6, weekly, equal, top_n=1.
-- Edit slug only if you need another model.

WITH strat AS (
  SELECT id AS strategy_id
  FROM public.strategy_models
  WHERE slug = 'ait-1-daneel'
    AND status = 'active'
  LIMIT 1
),
target_cfg AS (
  SELECT
    c.id AS config_id,
    c.label AS config_label,
    c.risk_level,
    c.rebalance_frequency,
    c.weighting_method,
    c.top_n
  FROM public.portfolio_configs c
  CROSS JOIN strat s
  WHERE s.strategy_id IS NOT NULL
    AND c.risk_level = 6
    AND c.rebalance_frequency = 'weekly'
    AND c.weighting_method = 'equal'
    AND c.top_n = 1
  LIMIT 1
),
cur_series AS (
  SELECT
    p.as_of_run_date,
    p.data_status,
    coalesce(jsonb_array_length(p.series), 0) AS series_points,
    p.computed_at,
    p.updated_at
  FROM public.portfolio_config_daily_series p
  CROSS JOIN strat s
  CROSS JOIN target_cfg t
  WHERE p.strategy_id = s.strategy_id
    AND p.config_id = t.config_id
  LIMIT 1
),
hist_last30 AS (
  SELECT
    coalesce(jsonb_array_length(h.series), 0) AS series_points,
    h.as_of_run_date,
    h.computed_at
  FROM public.portfolio_config_daily_series_history h
  CROSS JOIN strat s
  CROSS JOIN target_cfg t
  WHERE h.strategy_id = s.strategy_id
    AND h.config_id = t.config_id
  ORDER BY h.as_of_run_date DESC, h.computed_at DESC
  LIMIT 30
),
hist_agg AS (
  SELECT
    min(series_points) AS min_points_last30,
    max(series_points) AS max_points_last30,
    count(*)::int AS history_rows_sampled
  FROM hist_last30
),
hist_head AS (
  SELECT
    string_agg(
      format('%s → %s pts', as_of_run_date::text, series_points::text),
      ' | '
      ORDER BY as_of_run_date DESC, computed_at DESC
    ) AS last_five_summary
  FROM (
    SELECT as_of_run_date, series_points, computed_at
    FROM hist_last30
    ORDER BY as_of_run_date DESC, computed_at DESC
    LIMIT 5
  ) z
),
perf AS (
  SELECT p.strategy_id, p.config_id, p.run_date
  FROM public.strategy_portfolio_config_performance p
  CROSS JOIN strat s
  WHERE p.strategy_id = s.strategy_id
),
hld AS (
  SELECT h.strategy_id, h.config_id, h.run_date
  FROM public.strategy_portfolio_config_holdings h
  CROSS JOIN strat s
  WHERE h.strategy_id = s.strategy_id
),
gaps_target AS (
  SELECT perf.run_date AS perf_run_date
  FROM perf
  CROSS JOIN target_cfg t
  LEFT JOIN hld
    ON hld.strategy_id = perf.strategy_id
   AND hld.config_id = perf.config_id
   AND hld.run_date = perf.run_date
  WHERE t.config_id IS NOT NULL
    AND perf.config_id = t.config_id
    AND hld.run_date IS NULL
),
gap_list AS (
  SELECT string_agg(perf_run_date::text, ', ' ORDER BY perf_run_date) AS missing_holdings_dates
  FROM (
    SELECT perf_run_date
    FROM gaps_target
    ORDER BY perf_run_date
    LIMIT 40
  ) g
),
gap_count AS (
  SELECT count(*)::bigint AS n FROM gaps_target
),
counts_target AS (
  SELECT
    (SELECT count(*)::bigint
     FROM public.strategy_portfolio_config_performance p
     CROSS JOIN strat s
     CROSS JOIN target_cfg t
     WHERE t.config_id IS NOT NULL
       AND p.strategy_id = s.strategy_id
       AND p.config_id = t.config_id) AS perf_rows,
    (SELECT count(*)::bigint
     FROM public.strategy_portfolio_config_holdings h
     CROSS JOIN strat s
     CROSS JOIN target_cfg t
     WHERE t.config_id IS NOT NULL
       AND h.strategy_id = s.strategy_id
       AND h.config_id = t.config_id) AS holdings_rows
),
short_configs AS (
  SELECT count(*)::bigint AS configs_under_20_pts
  FROM public.portfolio_config_daily_series p
  CROSS JOIN strat s
  WHERE p.strategy_id = s.strategy_id
    AND coalesce(jsonb_array_length(p.series), 0) < 20
),
min_pts_strategy AS (
  SELECT min(coalesce(jsonb_array_length(p.series), 0))::int AS min_series_points_any_config
  FROM public.portfolio_config_daily_series p
  CROSS JOIN strat s
  WHERE p.strategy_id = s.strategy_id
),
raw_latest AS (
  SELECT max(run_date) AS latest_nasdaq_100_daily_raw_run_date
  FROM public.nasdaq_100_daily_raw
),
facts AS (
  SELECT
    (SELECT strategy_id FROM strat) AS strategy_id,
    (SELECT config_id FROM target_cfg) AS config_id,
    (SELECT config_label FROM target_cfg) AS config_label,
    (SELECT series_points FROM cur_series) AS current_series_points,
    (SELECT as_of_run_date FROM cur_series) AS current_as_of_run_date,
    (SELECT data_status FROM cur_series) AS current_data_status,
    (SELECT min_points_last30 FROM hist_agg) AS hist_min_pts_30,
    (SELECT max_points_last30 FROM hist_agg) AS hist_max_pts_30,
    (SELECT history_rows_sampled FROM hist_agg) AS hist_rows_sampled,
    (SELECT last_five_summary FROM hist_head) AS hist_last5_text,
    (SELECT n FROM gap_count) AS gap_perf_dates_without_holdings,
    (SELECT missing_holdings_dates FROM gap_list) AS gap_dates_sample,
    (SELECT perf_rows FROM counts_target) AS perf_rows_target,
    (SELECT holdings_rows FROM counts_target) AS holdings_rows_target,
    (SELECT configs_under_20_pts FROM short_configs) AS configs_series_under_20,
    (SELECT min_series_points_any_config FROM min_pts_strategy) AS min_series_pts_any_cfg,
    (SELECT latest_nasdaq_100_daily_raw_run_date FROM raw_latest) AS latest_raw_bar
),
verdict AS (
  SELECT
    CASE
      WHEN f.strategy_id IS NULL THEN
        'BAD: no active strategy row for slug ait-1-daneel'
      WHEN f.config_id IS NULL THEN
        'BAD: no portfolio_configs row for risk 6 + weekly + equal + top_n=1'
      WHEN f.gap_perf_dates_without_holdings > 0 THEN
        format(
          'WARN: %s perf run_dates for this config have no holdings row — daily walk can hit incomplete rebalance ladder / MTM holes. Sample dates: %s',
          f.gap_perf_dates_without_holdings,
          coalesce(left(f.gap_dates_sample, 400), '(none listed)')
        )
      WHEN f.perf_rows_target IS DISTINCT FROM f.holdings_rows_target THEN
        format(
          'WARN: perf rows (%s) ≠ holdings rows (%s) for this config — compare dates and query gaps.',
          f.perf_rows_target,
          f.holdings_rows_target
        )
      WHEN f.current_series_points IS NOT NULL AND f.current_series_points < 20 THEN
        format(
          'WARN: current daily series is short (%s pts). Healthy weekly configs are often much longer.',
          f.current_series_points
        )
      ELSE
        'OK: this scan did not find missing perf→holdings pairs for the target config, and series length is not flagged as critically short.'
    END AS verdict_text
  FROM facts f
)
SELECT *
FROM (
  SELECT
    1 AS sort_order,
    'identity'::text AS category,
    'strategy_id'::text AS check_name,
    CASE WHEN f.strategy_id IS NULL THEN 'MISSING' ELSE 'OK' END AS status,
    coalesce(f.strategy_id::text, '(no row)') AS value,
    'Active slug ait-1-daneel in strategy_models'::text AS hint
  FROM facts f

  UNION ALL
  SELECT
    2,
    'identity',
    'target_config',
    CASE WHEN f.config_id IS NULL THEN 'MISSING' ELSE 'OK' END,
    coalesce(f.config_id::text || ' — ' || f.config_label, '(no row)'),
    'risk_level=6, rebalance_frequency=weekly, weighting_method=equal, top_n=1'
  FROM facts f

  UNION ALL
  SELECT
    10,
    'current_daily_series',
    'series_points',
    CASE
      WHEN f.config_id IS NULL THEN 'SKIP'
      WHEN f.current_series_points IS NULL THEN 'MISSING'
      WHEN f.current_series_points < 20 THEN 'WARN'
      ELSE 'OK'
    END,
    coalesce(f.current_series_points::text, '(no series row)'),
    'jsonb_array_length(series) on portfolio_config_daily_series for target'
  FROM facts f

  UNION ALL
  SELECT
    11,
    'current_daily_series',
    'as_of_run_date / data_status',
    CASE WHEN f.config_id IS NULL THEN 'SKIP' WHEN f.current_as_of_run_date IS NULL THEN 'MISSING' ELSE 'INFO' END,
    coalesce(f.current_as_of_run_date::text, '(null)') || ' | ' || coalesce(f.current_data_status::text, '(null)'),
    'Compare to latest_nasdaq_100_daily_raw below'
  FROM facts f

  UNION ALL
  SELECT
    20,
    'history_top30',
    'min / max points (last 30 history rows)',
    CASE WHEN f.config_id IS NULL THEN 'SKIP' WHEN f.hist_rows_sampled = 0 THEN 'MISSING' ELSE 'INFO' END,
    coalesce(f.hist_min_pts_30::text, '?') || ' … ' || coalesce(f.hist_max_pts_30::text, '?') || ' (n=' || coalesce(f.hist_rows_sampled::text, '0') || ')',
    'Flapping min/max suggests overwrite / partial recompute'
  FROM facts f

  UNION ALL
  SELECT
    21,
    'history_top30',
    'last 5 snapshots (as_of → pts)',
    'INFO',
    coalesce(f.hist_last5_text, '(no history)'),
    'Most recent first'
  FROM facts f

  UNION ALL
  SELECT
    30,
    'perf_vs_holdings',
    'rows for target config',
    CASE
      WHEN f.config_id IS NULL THEN 'SKIP'
      WHEN f.perf_rows_target IS DISTINCT FROM f.holdings_rows_target THEN 'WARN'
      ELSE 'OK'
    END,
    'perf=' || coalesce(f.perf_rows_target::text, '?') || ' | holdings=' || coalesce(f.holdings_rows_target::text, '?'),
    'strategy_portfolio_config_performance vs _holdings'
  FROM facts f

  UNION ALL
  SELECT
    31,
    'perf_vs_holdings',
    'perf run_dates with NO holdings (target only)',
    CASE
      WHEN f.config_id IS NULL THEN 'SKIP'
      WHEN f.gap_perf_dates_without_holdings > 0 THEN 'BAD'
      ELSE 'OK'
    END,
    coalesce(f.gap_perf_dates_without_holdings::text, '0') || ' gap(s)',
    'Non-zero => root-cause class: incomplete ladder for walk/MTM'
  FROM facts f

  UNION ALL
  SELECT
    32,
    'perf_vs_holdings',
    'sample missing perf dates (up to 40)',
    CASE
      WHEN f.config_id IS NULL THEN 'SKIP'
      WHEN f.gap_perf_dates_without_holdings = 0 THEN 'OK'
      ELSE 'INFO'
    END,
    coalesce(nullif(f.gap_dates_sample, ''), '(none)'),
    'Full list may be longer than shown'
  FROM facts f

  UNION ALL
  SELECT
    40,
    'strategy_wide',
    'configs with series_points < 20',
    CASE WHEN f.strategy_id IS NULL THEN 'SKIP' WHEN f.configs_series_under_20 > 0 THEN 'WARN' ELSE 'OK' END,
    coalesce(f.configs_series_under_20::text, '0'),
    'Across all configs for this strategy daily_series table'
  FROM facts f

  UNION ALL
  SELECT
    41,
    'strategy_wide',
    'min series_points any config',
    'INFO',
    coalesce(f.min_series_pts_any_cfg::text, '(no rows)'),
    'Floor length across portfolio_config_daily_series for strategy'
  FROM facts f

  UNION ALL
  SELECT
    50,
    'freshness',
    'max(nasdaq_100_daily_raw.run_date)',
    'INFO',
    coalesce(f.latest_raw_bar::text, '(null)'),
    'Ingestion ceiling vs portfolio as_of_run_date'
  FROM facts f

  UNION ALL
  SELECT
    900,
    'VERDICT',
    'read_this_first',
    CASE
      WHEN f.strategy_id IS NULL OR f.config_id IS NULL THEN 'BAD'
      WHEN f.gap_perf_dates_without_holdings > 0 THEN 'BAD'
      WHEN f.perf_rows_target IS DISTINCT FROM f.holdings_rows_target THEN 'WARN'
      WHEN f.current_series_points IS NOT NULL AND f.current_series_points < 20 THEN 'WARN'
      ELSE 'OK'
    END,
    v.verdict_text,
    'Single-line conclusion from the facts above'
  FROM facts f
  CROSS JOIN verdict v
) report
ORDER BY sort_order;

-- --- Empty config holdings (json length 0), recent rows only ---
-- MTM skips rebalance dates with empty `holdings` JSON and carries the prior basket.
-- Uncomment to list offending rows (holdings column is jsonb in schema).
--
-- SELECT
--   h.strategy_id,
--   h.config_id,
--   h.run_date,
--   coalesce(jsonb_array_length(h.holdings), 0) AS n_positions,
--   pc.label AS config_label
-- FROM public.strategy_portfolio_config_holdings h
-- LEFT JOIN public.portfolio_configs pc ON pc.id = h.config_id
-- WHERE coalesce(jsonb_array_length(h.holdings), 0) = 0
--   AND h.run_date >= (current_date - interval '540 days')
-- ORDER BY h.run_date DESC
-- LIMIT 100;
