-- Account association, notifications, private storage and operational RPCs.

begin;

do $$ begin
  create type public.association_request_status as enum ('PENDING', 'APPROVED');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.notification_delivery_status as enum (
    'PENDING', 'PROCESSING', 'DELIVERED', 'FAILED'
  );
exception when duplicate_object then null;
end $$;

alter table public.events
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_touch_updated_at on public.events;
create trigger trg_touch_updated_at
before update on public.events
for each row execute function public.touch_updated_at();

create table if not exists public.account_association_requests (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  profile_id            uuid not null references public.profiles(id) on delete cascade,
  status                public.association_request_status not null default 'PENDING',
  requested_at          timestamptz not null default now(),
  reviewed_at           timestamptz,
  reviewed_by           uuid references public.profiles(id) on delete set null,
  unique (user_id)
);

create unique index if not exists association_pending_profile_idx
  on public.account_association_requests (profile_id)
  where status = 'PENDING';

create table if not exists public.rejected_account_hashes (
  email_hash    text primary key,
  rejected_at   timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '30 days'),
  check (expires_at > rejected_at)
);

create table if not exists public.notifications (
  id                  uuid primary key default gen_random_uuid(),
  type                text not null,
  title               text not null check (nullif(trim(title), '') is not null),
  body                text not null check (nullif(trim(body), '') is not null),
  deep_link           text,
  critical            boolean not null default false,
  actor_profile_id    uuid references public.profiles(id) on delete set null,
  idempotency_key     text not null unique,
  created_at          timestamptz not null default now()
);

create table if not exists public.notification_recipients (
  notification_id   uuid not null references public.notifications(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  read_at           timestamptz,
  created_at        timestamptz not null default now(),
  primary key (notification_id, user_id)
);

create index if not exists notification_recipients_user_unread_idx
  on public.notification_recipients (user_id, created_at desc)
  where read_at is null;

create table if not exists public.push_subscriptions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  endpoint          text not null unique,
  p256dh            text not null,
  auth_secret       text not null,
  platform          text,
  user_agent        text,
  last_seen_at      timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id, last_seen_at desc);

create table if not exists public.notification_preferences (
  user_id         uuid not null references auth.users(id) on delete cascade,
  category        text not null,
  push_enabled    boolean not null default true,
  updated_at      timestamptz not null default now(),
  primary key (user_id, category)
);

create table if not exists public.notification_outbox (
  id                  uuid primary key default gen_random_uuid(),
  notification_id     uuid not null references public.notifications(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  subscription_id     uuid references public.push_subscriptions(id) on delete set null,
  idempotency_key     text not null unique,
  status              public.notification_delivery_status not null default 'PENDING',
  attempts            integer not null default 0 check (attempts >= 0),
  next_attempt_at     timestamptz not null default now(),
  last_error          text,
  delivered_at        timestamptz,
  locked_at           timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists notification_outbox_pending_idx
  on public.notification_outbox (status, next_attempt_at)
  where status in ('PENDING', 'FAILED');

drop trigger if exists trg_touch_updated_at on public.notification_preferences;
create trigger trg_touch_updated_at
before update on public.notification_preferences
for each row execute function public.touch_updated_at();

drop trigger if exists trg_touch_updated_at on public.notification_outbox;
create trigger trg_touch_updated_at
before update on public.notification_outbox
for each row execute function public.touch_updated_at();

create or replace view public.claimable_profile_directory
with (security_barrier = true)
as
select p.id, p.nome, p.cognome
from public.profiles p
where p.user_id is null
  and not exists (
    select 1
    from public.account_association_requests r
    where r.profile_id = p.id
      and r.status = 'PENDING'
  );

revoke all on public.claimable_profile_directory from public;
grant select on public.claimable_profile_directory to authenticated;

create or replace function public.create_notification(
  p_type text,
  p_title text,
  p_body text,
  p_deep_link text,
  p_target_user_ids uuid[],
  p_critical boolean,
  p_idempotency_key text,
  p_actor_profile_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  notification_id_value uuid;
begin
  if nullif(trim(p_type), '') is null
     or nullif(trim(p_title), '') is null
     or nullif(trim(p_body), '') is null
     or nullif(trim(p_idempotency_key), '') is null then
    raise exception 'Notification type, title, body and idempotency key are required';
  end if;

  insert into public.notifications (
    type,
    title,
    body,
    deep_link,
    critical,
    actor_profile_id,
    idempotency_key
  )
  values (
    p_type,
    p_title,
    p_body,
    nullif(trim(p_deep_link), ''),
    coalesce(p_critical, false),
    p_actor_profile_id,
    p_idempotency_key
  )
  on conflict (idempotency_key) do update
  set idempotency_key = excluded.idempotency_key
  returning id into notification_id_value;

  insert into public.notification_recipients (notification_id, user_id)
  select notification_id_value, target_user_id
  from unnest(coalesce(p_target_user_ids, array[]::uuid[])) target_user_id
  where target_user_id is not null
  on conflict do nothing;

  insert into public.notification_outbox (
    notification_id,
    user_id,
    subscription_id,
    idempotency_key
  )
  select
    notification_id_value,
    subscription.user_id,
    subscription.id,
    notification_id_value::text || ':' || subscription.id::text
  from public.push_subscriptions subscription
  left join public.notification_preferences preference
    on preference.user_id = subscription.user_id
   and preference.category = p_type
  where subscription.user_id = any(coalesce(p_target_user_ids, array[]::uuid[]))
    and (coalesce(p_critical, false) or coalesce(preference.push_enabled, true))
  on conflict (idempotency_key) do nothing;

  return notification_id_value;
end;
$$;

revoke all on function public.create_notification(
  text, text, text, text, uuid[], boolean, text, uuid
) from public, anon, authenticated;
grant execute on function public.create_notification(
  text, text, text, text, uuid[], boolean, text, uuid
) to service_role;

create or replace function public.get_app_context()
returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  with own_profile as (
    select p.*
    from public.profiles p
    where p.user_id = auth.uid()
    limit 1
  ),
  association as (
    select r.id, r.profile_id, r.status, r.requested_at
    from public.account_association_requests r
    where r.user_id = auth.uid()
    limit 1
  ),
  target_season as (
    select s.*
    from public.seasons s
    order by s.starts_on desc
    limit 1
  ),
  membership as (
    select m.*
    from public.season_memberships m
    join own_profile p on p.id = m.profile_id
    join target_season s on s.id = m.season_id
    limit 1
  )
  select jsonb_build_object(
    'profile',
    (
      select jsonb_build_object(
        'id', p.id,
        'nome', p.nome,
        'cognome', p.cognome,
        'avatar_url', p.avatar_url,
        'data_nascita', p.data_nascita,
        'is_manager', p.is_manager
      )
      from own_profile p
    ),
    'associationStatus',
    case
      when exists(select 1 from own_profile) then 'ACTIVE'
      when exists(select 1 from association where status = 'PENDING') then 'REQUESTED'
      else 'NONE'
    end,
    'associationRequest',
    (select to_jsonb(a) from association a),
    'membership',
    (select to_jsonb(m) from membership m),
    'unreadNotifications',
    (
      select count(*)
      from public.notification_recipients nr
      where nr.user_id = auth.uid()
        and nr.read_at is null
    )
  );
$$;

revoke all on function public.get_app_context() from public;
grant execute on function public.get_app_context() to authenticated;

create or replace function public.request_profile_association(p_profile_id uuid)
returns public.account_association_requests
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result public.account_association_requests;
  profile_name text;
  manager_user_ids uuid[];
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if public.current_profile_id() is not null then
    raise exception 'Account is already associated';
  end if;

  select concat_ws(' ', nome, cognome) into profile_name
  from public.profiles
  where id = p_profile_id
    and user_id is null
    and not exists (
      select 1
      from public.account_association_requests
      where profile_id = p_profile_id
        and status = 'PENDING'
    )
  for update;

  if profile_name is null then
    raise exception 'Profile is not available';
  end if;

  insert into public.account_association_requests (user_id, profile_id)
  values (auth.uid(), p_profile_id)
  returning * into result;

  select array_agg(user_id) into manager_user_ids
  from public.profiles
  where is_manager = true
    and user_id is not null;

  perform public.create_notification(
    'ACCOUNT_ASSOCIATION_REQUEST',
    'Nuova richiesta account',
    profile_name || ' ha richiesto l’associazione del profilo.',
    '/gestione?view=account',
    manager_user_ids,
    true,
    'association-request:' || result.id::text,
    null
  );

  return result;
end;
$$;

revoke all on function public.request_profile_association(uuid) from public;
grant execute on function public.request_profile_association(uuid) to authenticated;

create or replace function public.respond_to_season_confirmation(
  p_season_slug text,
  p_response text
)
returns public.season_memberships
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result public.season_memberships;
  mapped_status public.membership_status;
begin
  mapped_status := case upper(trim(p_response))
    when 'YES' then 'YES'::public.membership_status
    when 'MAYBE' then 'MAYBE'::public.membership_status
    when 'NO' then 'NO'::public.membership_status
    when 'DEFER' then 'PENDING'::public.membership_status
    else null
  end;

  if mapped_status is null then
    raise exception 'Unsupported confirmation response';
  end if;

  update public.season_memberships m
  set status = mapped_status,
      last_confirmation_requested_at = now(),
      updated_by = public.current_profile_id()
  from public.seasons s
  where m.profile_id = public.current_profile_id()
    and m.season_id = s.id
    and s.slug = p_season_slug
  returning m.* into result;

  if result.id is null then
    raise exception 'Season membership not found';
  end if;

  return result;
end;
$$;

revoke all on function public.respond_to_season_confirmation(text, text) from public;
grant execute on function public.respond_to_season_confirmation(text, text) to authenticated;

create or replace function public.mark_season_confirmation_prompted(
  p_season_slug text
)
returns timestamptz
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  prompted_at timestamptz;
begin
  update public.season_memberships m
  set last_confirmation_requested_at = now()
  from public.seasons s
  where m.profile_id = public.current_profile_id()
    and m.season_id = s.id
    and s.slug = p_season_slug
    and m.status = 'PENDING'
  returning m.last_confirmation_requested_at into prompted_at;
  return prompted_at;
end;
$$;

revoke all on function public.mark_season_confirmation_prompted(text) from public;
grant execute on function public.mark_season_confirmation_prompted(text) to authenticated;

create or replace function public.set_event_checkin(
  p_event_id uuid,
  p_profile_id uuid,
  p_status public.event_checkin_status
)
returns public.event_checkins
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor uuid;
  result public.event_checkins;
begin
  if not public.is_current_user_manager() then
    raise exception 'Manager permission required' using errcode = '42501';
  end if;

  actor := public.current_profile_id();

  if not exists (
    select 1
    from public.events e
    join public.season_memberships m
      on m.season_id = e.season_id
     and m.profile_id = p_profile_id
     and m.status in ('YES', 'MAYBE')
    where e.id = p_event_id
  ) then
    raise exception 'Profile is not in the event season roster';
  end if;

  insert into public.event_checkins (
    event_id,
    profile_id,
    status,
    checked_in_by
  )
  values (p_event_id, p_profile_id, p_status, actor)
  on conflict (event_id, profile_id) do update
  set status = excluded.status,
      checked_in_by = excluded.checked_in_by
  returning * into result;

  if p_status = 'PRESENT' then
    insert into public.attendance (
      event_id,
      profile_id,
      modified_by,
      status
    )
    values (p_event_id, p_profile_id, actor, 'PRESENTE')
    on conflict (event_id, profile_id) do update
    set status = 'PRESENTE',
        modified_by = excluded.modified_by;
  end if;

  return result;
end;
$$;

revoke all on function public.set_event_checkin(
  uuid, uuid, public.event_checkin_status
) from public;
grant execute on function public.set_event_checkin(
  uuid, uuid, public.event_checkin_status
) to authenticated;

create or replace function public.declare_payment(
  p_payment_id uuid,
  p_method public.payment_method
)
returns public.payments
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result public.payments;
begin
  update public.payments p
  set status = 'PENDING_REVIEW',
      method = p_method,
      declared_at = now(),
      updated_by = public.current_profile_id()
  where p.id = p_payment_id
    and exists (
      select 1
      from public.season_memberships m
      where m.id = p.membership_id
        and m.profile_id = public.current_profile_id()
    )
    and p.status <> 'PAID'
  returning p.* into result;

  if result.id is null then
    raise exception 'Payment not available';
  end if;
  return result;
end;
$$;

revoke all on function public.declare_payment(uuid, public.payment_method) from public;
grant execute on function public.declare_payment(uuid, public.payment_method) to authenticated;

create or replace function public.send_manager_notification(
  p_type text,
  p_title text,
  p_body text,
  p_deep_link text,
  p_target_user_ids uuid[],
  p_critical boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_current_user_manager() then
    raise exception 'Manager permission required' using errcode = '42501';
  end if;

  return public.create_notification(
    p_type,
    p_title,
    p_body,
    p_deep_link,
    p_target_user_ids,
    p_critical,
    'manual:' || gen_random_uuid()::text,
    public.current_profile_id()
  );
end;
$$;

revoke all on function public.send_manager_notification(
  text, text, text, text, uuid[], boolean
) from public;
grant execute on function public.send_manager_notification(
  text, text, text, text, uuid[], boolean
) to authenticated;

create or replace function public.notify_payment_change()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_user uuid;
  manager_users uuid[];
begin
  select p.user_id into target_user
  from public.season_memberships m
  join public.profiles p on p.id = m.profile_id
  where m.id = new.membership_id;

  if tg_op = 'INSERT' and target_user is not null then
    perform public.create_notification(
      'PAYMENT_DUE',
      'Nuova quota',
      new.description,
      '/profilo?section=quote',
      array[target_user],
      true,
      'payment-due:' || new.id::text,
      new.created_by
    );
  elsif tg_op = 'UPDATE'
        and new.status = 'PENDING_REVIEW'
        and old.status is distinct from new.status then
    select array_agg(user_id) into manager_users
    from public.profiles
    where is_manager = true and user_id is not null;

    perform public.create_notification(
      'PAYMENT_DECLARED',
      'Pagamento da verificare',
      new.description,
      '/gestione?view=quote',
      manager_users,
      true,
      'payment-declared:' || new.id::text || ':' || new.declared_at::text,
      new.updated_by
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_payment_change on public.payments;
create trigger trg_notify_payment_change
after insert or update on public.payments
for each row execute function public.notify_payment_change();

create or replace function public.notify_certificate_change()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_user uuid;
  manager_users uuid[];
begin
  select p.user_id into target_user
  from public.season_memberships m
  join public.profiles p on p.id = m.profile_id
  where m.id = new.membership_id;

  if new.status = 'PENDING_REVIEW'
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    select array_agg(user_id) into manager_users
    from public.profiles
    where is_manager = true and user_id is not null;

    perform public.create_notification(
      'CERTIFICATE_REVIEW',
      'Certificato da verificare',
      'È stato caricato un certificato agonistico.',
      '/gestione?view=certificati',
      manager_users,
      true,
      'certificate-review:' || new.id::text || ':' || new.updated_at::text,
      new.updated_by
    );
  elsif tg_op = 'UPDATE'
        and new.status in ('VALID', 'REJECTED')
        and old.status is distinct from new.status
        and target_user is not null then
    perform public.create_notification(
      'CERTIFICATE_RESULT',
      case when new.status = 'VALID'
        then 'Certificato verificato'
        else 'Certificato respinto'
      end,
      coalesce(new.rejection_reason, 'Il certificato agonistico è valido.'),
      '/profilo?section=certificato',
      array[target_user],
      true,
      'certificate-result:' || new.id::text || ':' || new.status::text,
      new.verified_by
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_certificate_change on public.medical_certificates;
create trigger trg_notify_certificate_change
after insert or update on public.medical_certificates
for each row execute function public.notify_certificate_change();

create or replace function public.notify_event_update()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_users uuid[];
begin
  if row(
    new.data_ora,
    new.data_fine_ora,
    new.luogo,
    new.cancellato,
    new.note
  ) is distinct from row(
    old.data_ora,
    old.data_fine_ora,
    old.luogo,
    old.cancellato,
    old.note
  ) then
    select array_agg(distinct p.user_id) into target_users
    from public.profiles p
    join public.season_memberships m on m.profile_id = p.id
    where m.season_id = new.season_id
      and m.status in ('YES', 'MAYBE')
      and p.user_id is not null;

    perform public.create_notification(
      'EVENT_UPDATED',
      'Evento aggiornato',
      case when new.tipo = 'PARTITA' then 'La partita è stata aggiornata.'
           else 'L’allenamento è stato aggiornato.' end,
      '/evento/' || new.id::text,
      target_users,
      true,
      'event-update:' || new.id::text || ':' || txid_current()::text,
      public.current_profile_id()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_event_update on public.events;
create trigger trg_notify_event_update
after update on public.events
for each row execute function public.notify_event_update();

alter table public.account_association_requests enable row level security;
alter table public.rejected_account_hashes enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_recipients enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_outbox enable row level security;

create policy association_request_self_manager_select
on public.account_association_requests for select to authenticated
using (user_id = auth.uid() or public.is_current_user_manager());

create policy notifications_recipient_manager_select
on public.notifications for select to authenticated
using (
  exists (
    select 1
    from public.notification_recipients recipient
    where recipient.notification_id = id
      and recipient.user_id = auth.uid()
  )
  or public.is_current_user_manager()
);

create policy notification_recipients_self_manager_select
on public.notification_recipients for select to authenticated
using (user_id = auth.uid() or public.is_current_user_manager());

create policy notification_recipients_self_update
on public.notification_recipients for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy push_subscriptions_self_all
on public.push_subscriptions for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy notification_preferences_self_all
on public.notification_preferences for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

grant select on public.account_association_requests to authenticated;
grant select on public.notifications to authenticated;
grant select, update on public.notification_recipients to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select, insert, update, delete on public.notification_preferences to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values
  (
    'passport-photos',
    'passport-photos',
    false,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'medical-certificates',
    'medical-certificates',
    false,
    10485760,
    array['application/pdf']
  )
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists passport_photos_owner_manager_select on storage.objects;
create policy passport_photos_owner_manager_select
on storage.objects for select to authenticated
using (
  bucket_id = 'passport-photos'
  and (
    (storage.foldername(name))[1] = public.current_profile_id()::text
    or public.is_current_user_manager()
  )
);

drop policy if exists passport_photos_owner_manager_insert on storage.objects;
create policy passport_photos_owner_manager_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'passport-photos'
  and (
    public.is_current_user_manager()
    or exists (
      select 1
      from public.season_memberships membership
      where membership.id::text = (storage.foldername(name))[2]
        and membership.profile_id = public.current_profile_id()
        and (
          membership.registration_status <> 'ACTIVE'
          or membership.passport_photo_unlocked_at is not null
        )
    )
  )
);

drop policy if exists passport_photos_owner_manager_update on storage.objects;
create policy passport_photos_owner_manager_update
on storage.objects for update to authenticated
using (
  bucket_id = 'passport-photos'
  and (
    public.is_current_user_manager()
    or exists (
      select 1
      from public.season_memberships membership
      where membership.id::text = (storage.foldername(name))[2]
        and membership.profile_id = public.current_profile_id()
        and (
          membership.registration_status <> 'ACTIVE'
          or membership.passport_photo_unlocked_at is not null
        )
    )
  )
)
with check (bucket_id = 'passport-photos');

drop policy if exists medical_certificates_owner_manager_select on storage.objects;
create policy medical_certificates_owner_manager_select
on storage.objects for select to authenticated
using (
  bucket_id = 'medical-certificates'
  and (
    public.is_current_user_manager()
    or exists (
      select 1
      from public.season_memberships membership
      where membership.id::text = (storage.foldername(name))[2]
        and membership.profile_id = public.current_profile_id()
    )
  )
);

drop policy if exists medical_certificates_owner_manager_insert on storage.objects;
create policy medical_certificates_owner_manager_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'medical-certificates'
  and (
    public.is_current_user_manager()
    or exists (
      select 1
      from public.season_memberships membership
      where membership.id::text = (storage.foldername(name))[2]
        and membership.profile_id = public.current_profile_id()
    )
  )
);

drop policy if exists medical_certificates_owner_manager_update on storage.objects;
create policy medical_certificates_owner_manager_update
on storage.objects for update to authenticated
using (
  bucket_id = 'medical-certificates'
  and (
    public.is_current_user_manager()
    or exists (
      select 1
      from public.season_memberships membership
      where membership.id::text = (storage.foldername(name))[2]
        and membership.profile_id = public.current_profile_id()
    )
  )
)
with check (bucket_id = 'medical-certificates');

grant all privileges on public.account_association_requests to service_role;
grant all privileges on public.rejected_account_hashes to service_role;
grant all privileges on public.notifications to service_role;
grant all privileges on public.notification_recipients to service_role;
grant all privileges on public.push_subscriptions to service_role;
grant all privileges on public.notification_preferences to service_role;
grant all privileges on public.notification_outbox to service_role;

commit;
