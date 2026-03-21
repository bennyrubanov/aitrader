-- Standard portfolio display names: Top N · Equal|Cap · Weekly|Monthly|Quarterly|Yearly
-- (risk_label remains the human tier badge; label encodes holdings, weighting, cadence only.)

update public.portfolio_construction_configs
set label =
  'Top ' || top_n::text || ' · ' ||
  case weighting_method
    when 'equal' then 'Equal'
    when 'cap' then 'Cap'
    else initcap(weighting_method)
  end || ' · ' ||
  case rebalance_frequency
    when 'weekly' then 'Weekly'
    when 'monthly' then 'Monthly'
    when 'quarterly' then 'Quarterly'
    when 'yearly' then 'Yearly'
    else initcap(rebalance_frequency)
  end;
