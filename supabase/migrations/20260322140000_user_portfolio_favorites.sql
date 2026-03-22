-- Pin portfolios to the platform overview grid
alter table public.user_portfolio_profiles
  add column if not exists is_favorited boolean not null default false;
