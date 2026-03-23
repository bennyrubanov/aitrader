-- Remove redundant cap-weight configs for risk level 6 (top_n = 1).
-- With only one stock, cap vs equal weighting is identical.
-- Cascade deletes performance rows and compute queue entries via FK.
DELETE FROM portfolio_configs
WHERE risk_level = 6 AND weighting_method = 'cap';

-- Update remaining risk-6 equal-weight labels to drop the weighting qualifier.
UPDATE portfolio_configs
SET label = 'Top 1 · ' || initcap(rebalance_frequency)
WHERE risk_level = 6 AND weighting_method = 'equal';
