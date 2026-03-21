-- Add cap-weight portfolio construction configs for all risk levels and frequencies.
-- The initial migration only seeded risk-3 weekly+monthly cap-weight.

insert into public.portfolio_construction_configs
  (risk_level, rebalance_frequency, weighting_method, top_n, label, risk_label, is_default, min_suggested_investment)
values
  -- Weekly cap
  (1, 'weekly',    'cap', 30, 'Conservative cap-weighted weekly',      'Conservative',   false, 3000),
  (2, 'weekly',    'cap', 25, 'Careful cap-weighted weekly',           'Careful',        false, 2500),
  -- (3, weekly, cap) already exists
  (4, 'weekly',    'cap', 10, 'Aggressive cap-weighted weekly',        'Aggressive',     false, 1000),
  (5, 'weekly',    'cap',  5, 'Max aggression cap-weighted weekly',    'Max Aggression', false,  500),
  (6, 'weekly',    'cap',  1, 'Experimental cap-weighted weekly',      'Experimental',   false,  100),
  -- Monthly cap
  (1, 'monthly',   'cap', 30, 'Conservative cap-weighted monthly',     'Conservative',   false, 3000),
  (2, 'monthly',   'cap', 25, 'Careful cap-weighted monthly',          'Careful',        false, 2500),
  -- (3, monthly, cap) already exists
  (4, 'monthly',   'cap', 10, 'Aggressive cap-weighted monthly',       'Aggressive',     false, 1000),
  (5, 'monthly',   'cap',  5, 'Max aggression cap-weighted monthly',   'Max Aggression', false,  500),
  (6, 'monthly',   'cap',  1, 'Experimental cap-weighted monthly',     'Experimental',   false,  100),
  -- Quarterly cap
  (1, 'quarterly', 'cap', 30, 'Conservative cap-weighted quarterly',   'Conservative',   false, 3000),
  (2, 'quarterly', 'cap', 25, 'Careful cap-weighted quarterly',        'Careful',        false, 2500),
  (3, 'quarterly', 'cap', 20, 'Balanced cap-weighted quarterly',       'Balanced',       false, 2000),
  (4, 'quarterly', 'cap', 10, 'Aggressive cap-weighted quarterly',     'Aggressive',     false, 1000),
  (5, 'quarterly', 'cap',  5, 'Max aggression cap-weighted quarterly', 'Max Aggression', false,  500),
  (6, 'quarterly', 'cap',  1, 'Experimental cap-weighted quarterly',   'Experimental',   false,  100),
  -- Yearly cap
  (1, 'yearly',    'cap', 30, 'Conservative cap-weighted yearly',      'Conservative',   false, 3000),
  (2, 'yearly',    'cap', 25, 'Careful cap-weighted yearly',           'Careful',        false, 2500),
  (3, 'yearly',    'cap', 20, 'Balanced cap-weighted yearly',          'Balanced',       false, 2000),
  (4, 'yearly',    'cap', 10, 'Aggressive cap-weighted yearly',        'Aggressive',     false, 1000),
  (5, 'yearly',    'cap',  5, 'Max aggression cap-weighted yearly',    'Max Aggression', false,  500),
  (6, 'yearly',    'cap',  1, 'Experimental cap-weighted yearly',      'Experimental',   false,  100)
on conflict (risk_level, rebalance_frequency, weighting_method) do nothing;
