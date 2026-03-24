-- Portfolio onboarding completion (source of truth). Client mirrors to localStorage cache per userId.
alter table public.user_profiles
  add column if not exists portfolio_onboarding_done boolean not null default false;

comment on column public.user_profiles.portfolio_onboarding_done is
  'True after the user completes the platform portfolio onboarding wizard; default false for new users.';
