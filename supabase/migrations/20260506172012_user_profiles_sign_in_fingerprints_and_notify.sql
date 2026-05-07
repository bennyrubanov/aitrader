-- Sign-in fingerprints + in-app security.new_sign_in on new client (not first session).

alter table public.user_profiles
  add column if not exists sign_in_client_fingerprints jsonb not null default '[]'::jsonb;

alter table public.user_profiles drop constraint if exists user_profiles_sign_in_fingerprints_is_array;
alter table public.user_profiles add constraint user_profiles_sign_in_fingerprints_is_array check (
  jsonb_typeof(sign_in_client_fingerprints) = 'array'
);

drop function if exists public.record_user_sign_in_context(text, jsonb, timestamptz);

create or replace function public.record_user_sign_in_context(
  p_device_class text,
  p_client jsonb,
  p_now timestamptz,
  p_fingerprint text,
  p_client_summary text,
  p_location_label text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  existing jsonb;
  f text;
  had_any boolean;
  already boolean;
  new_fingerprints jsonb;
  v_summary text;
  v_loc text;
  v_body text;
  v_data jsonb;
  n int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_device_class not in ('mobile', 'desktop', 'tablet', 'unknown') then
    raise exception 'invalid device class';
  end if;

  if p_fingerprint is null or length(trim(p_fingerprint)) = 0 then
    raise exception 'invalid fingerprint';
  end if;

  f := lower(trim(p_fingerprint));

  v_summary := left(trim(coalesce(p_client_summary, '')), 120);
  if v_summary = '' then
    v_summary := case p_device_class
      when 'mobile' then 'A mobile device'
      when 'tablet' then 'A tablet'
      when 'desktop' then 'A desktop device'
      else 'This device'
    end;
  end if;

  v_loc := nullif(left(trim(coalesce(p_location_label, '')), 80), '');

  if v_loc is not null then
    v_body := left('We noticed a sign-in from ' || v_summary || ' near ' || v_loc || '.', 500);
  else
    v_body := left('We noticed a sign-in from ' || v_summary || '.', 500);
  end if;

  select coalesce(up.sign_in_client_fingerprints, '[]'::jsonb)
  into strict existing
  from public.user_profiles up
  where up.id = auth.uid()
  for update;

  had_any := jsonb_array_length(existing) > 0;
  already := existing @> jsonb_build_array(to_jsonb(f));

  if already then
    new_fingerprints := existing;
  else
    new_fingerprints := coalesce(existing, '[]'::jsonb) || jsonb_build_array(to_jsonb(f));
    while jsonb_array_length(new_fingerprints) > 20 loop
      new_fingerprints := new_fingerprints #- '{0}';
    end loop;
  end if;

  update public.user_profiles
  set
    last_sign_in_at = p_now,
    last_sign_in_device_class = p_device_class,
    last_sign_in_client = p_client,
    updated_at = p_now,
    sign_in_client_fingerprints = new_fingerprints,
    sign_in_count_mobile = sign_in_count_mobile + case when p_device_class = 'mobile' then 1 else 0 end,
    sign_in_count_desktop = sign_in_count_desktop + case when p_device_class = 'desktop' then 1 else 0 end,
    sign_in_count_tablet = sign_in_count_tablet + case when p_device_class = 'tablet' then 1 else 0 end,
    sign_in_count_unknown = sign_in_count_unknown + case when p_device_class = 'unknown' then 1 else 0 end
  where id = auth.uid();

  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'user profile not found';
  end if;

  if had_any and not already then
    v_data :=
      jsonb_build_object(
        'catalog_id',
        'security.new_sign_in',
        'href',
        '/platform/settings/security',
        'device_class',
        p_device_class,
        'client_summary',
        v_summary
      );
    if v_loc is not null then
      v_data := v_data || jsonb_build_object('approx_location', v_loc);
    end if;

    insert into public.notifications (user_id, type, title, body, data)
    values (auth.uid(), 'system', 'New sign-in detected', v_body, v_data);
  end if;
end;
$$;

revoke all on function public.record_user_sign_in_context(text, jsonb, timestamptz, text, text, text) from public;
grant execute on function public.record_user_sign_in_context(text, jsonb, timestamptz, text, text, text) to authenticated;
