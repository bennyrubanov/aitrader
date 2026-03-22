-- Add cap-weight portfolio configs for all risk levels and frequencies.
-- The initial migration only seeded risk-3 weekly+monthly cap-weight.

insert into public.portfolio_construction_configs
  (risk_level, rebalance_frequency, weighting_method, top_n, label, risk_label, is_default, min_suggested_investment)
values
  -- Weekly cap
  (1, 'weekly',    'cap', 30, 'Top 30 · Cap · Weekly',       'Conservative',   false, 3000),
  (2, 'weekly',    'cap', 25, 'Top 25 · Cap · Weekly',       'Careful',        false, 2500),
  -- (3, weekly, cap) already exists
  (4, 'weekly',    'cap', 10, 'Top 10 · Cap · Weekly',       'Aggressive',     false, 1000),
  (5, 'weekly',    'cap',  5, 'Top 5 · Cap · Weekly',        'Max Aggression', false,  500),
  (6, 'weekly',    'cap',  1, 'Top 1 · Cap · Weekly',        'Experimental',   false,  100),
  -- Monthly cap
  (1, 'monthly',   'cap', 30, 'Top 30 · Cap · Monthly',      'Conservative',   false, 3000),
  (2, 'monthly',   'cap', 25, 'Top 25 · Cap · Monthly',      'Careful',        false, 2500),
  -- (3, monthly, cap) already exists
  (4, 'monthly',   'cap', 10, 'Top 10 · Cap · Monthly',      'Aggressive',     false, 1000),
  (5, 'monthly',   'cap',  5, 'Top 5 · Cap · Monthly',       'Max Aggression', false,  500),
  (6, 'monthly',   'cap',  1, 'Top 1 · Cap · Monthly',       'Experimental',   false,  100),
  -- Quarterly cap
  (1, 'quarterly', 'cap', 30, 'Top 30 · Cap · Quarterly',    'Conservative',   false, 3000),
  (2, 'quarterly', 'cap', 25, 'Top 25 · Cap · Quarterly',      'Careful',        false, 2500),
  (3, 'quarterly', 'cap', 20, 'Top 20 · Cap · Quarterly',      'Balanced',       false, 2000),
  (4, 'quarterly', 'cap', 10, 'Top 10 · Cap · Quarterly',      'Aggressive',     false, 1000),
  (5, 'quarterly', 'cap',  5, 'Top 5 · Cap · Quarterly',       'Max Aggression', false,  500),
  (6, 'quarterly', 'cap',  1, 'Top 1 · Cap · Quarterly',       'Experimental',   false,  100),
  -- Yearly cap
  (1, 'yearly',    'cap', 30, 'Top 30 · Cap · Yearly',       'Conservative',   false, 3000),
  (2, 'yearly',    'cap', 25, 'Top 25 · Cap · Yearly',       'Careful',        false, 2500),
  (3, 'yearly',    'cap', 20, 'Top 20 · Cap · Yearly',       'Balanced',       false, 2000),
  (4, 'yearly',    'cap', 10, 'Top 10 · Cap · Yearly',       'Aggressive',     false, 1000),
  (5, 'yearly',    'cap',  5, 'Top 5 · Cap · Yearly',        'Max Aggression', false,  500),
  (6, 'yearly',    'cap',  1, 'Top 1 · Cap · Yearly',        'Experimental',   false,  100)
on conflict (risk_level, rebalance_frequency, weighting_method) do nothing;
