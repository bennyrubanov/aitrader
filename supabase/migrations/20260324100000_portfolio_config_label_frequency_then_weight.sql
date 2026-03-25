-- Portfolio display names: Top N · Weekly|Monthly|Quarterly|Yearly · Equal|Cap
-- (Align with app formatter; previous migration used weighting before frequency.)

update public.portfolio_configs
set label =
  'Top ' || top_n::text || ' · ' ||
  case rebalance_frequency
    when 'weekly' then 'Weekly'
    when 'monthly' then 'Monthly'
    when 'quarterly' then 'Quarterly'
    when 'yearly' then 'Yearly'
    else initcap(rebalance_frequency)
  end || ' · ' ||
  case weighting_method
    when 'equal' then 'Equal'
    when 'cap' then 'Cap'
    else initcap(weighting_method)
  end;
