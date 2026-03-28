begin;

do $$
declare
  constraint_name text;
begin
  select tc.constraint_name
    into constraint_name
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on tc.constraint_name = kcu.constraint_name
   and tc.table_schema = kcu.table_schema
  where tc.table_schema = 'public'
    and tc.table_name = 'newsletter_subscribers'
    and tc.constraint_type = 'FOREIGN KEY'
    and kcu.column_name = 'user_id'
  limit 1;

  if constraint_name is not null then
    execute format(
      'alter table public.newsletter_subscribers drop constraint %I',
      constraint_name
    );
  end if;
end $$;

alter table public.newsletter_subscribers
  add constraint newsletter_subscribers_user_id_fkey
  foreign key (user_id)
  references auth.users(id)
  on delete cascade;

commit;
