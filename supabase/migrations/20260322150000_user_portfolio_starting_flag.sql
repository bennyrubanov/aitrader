-- Marks the portfolio created from onboarding "Follow this portfolio" for overview badge.
alter table public.user_portfolio_profiles
  add column if not exists is_starting_portfolio boolean not null default false;
