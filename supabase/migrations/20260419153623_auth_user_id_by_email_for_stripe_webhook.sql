-- Single-query auth user lookup for Stripe webhook email fallback (replaces unbounded listUsers paging).
-- service_role execute only.

create or replace function public.auth_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = auth, public
as $$
  select u.id
  from auth.users u
  where u.email is not null
    and lower(trim(u.email)) = lower(trim(p_email))
  limit 1;
$$;

comment on function public.auth_user_id_by_email(text) is
  'Returns auth.users.id for a case-insensitive email match; Stripe webhook email fallback. service_role execute only.';

revoke all on function public.auth_user_id_by_email(text) from public;
grant execute on function public.auth_user_id_by_email(text) to service_role;
