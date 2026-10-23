-- Quote a rate e pagamenti parziali. Ogni rata (payments) riceve più
-- versamenti (payment_entries) dichiarati dal giocatore o registrati dal
-- manager; lo stato della rata è derivato dai versamenti. IBAN della squadra
-- in payment_settings.

create schema if not exists private;

do $$ begin
  create type public.payment_entry_status as enum ('PENDING', 'VERIFIED', 'REJECTED');
exception when duplicate_object then null;
end $$;

create table public.payment_entries (
  id                uuid primary key default gen_random_uuid(),
  payment_id        uuid not null references public.payments(id) on delete cascade,
  amount            numeric(10,2) not null check (amount > 0),
  paid_on           date not null,
  method            public.payment_method not null,
  cash_recipient_id uuid references public.profiles(id) on delete set null,
  status            public.payment_entry_status not null default 'PENDING',
  rejection_reason  text,
  declared_by       uuid default public.current_profile_id()
    references public.profiles(id) on delete set null,
  verified_at       timestamptz,
  verified_by       uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- Il destinatario è obbligatorio per i nuovi contanti, ma lo controllano le
  -- RPC: i versamenti migrati non lo hanno.
  check (method = 'CASH' or cash_recipient_id is null),
  check (status = 'PENDING' or verified_at is not null)
);

create index payment_entries_payment_idx
  on public.payment_entries (payment_id, status);

alter table public.payments
  add column if not exists amount_paid numeric(10,2) not null default 0;

-- Stato della rata derivato dai versamenti: PAID se i verificati coprono
-- l'importo, PENDING_REVIEW se c'è un versamento da verificare, altrimenti DUE.
create or replace function private.derive_payment_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_verified numeric;
  v_committed numeric;
  v_pending boolean;
  v_last public.payment_entries;
  v_last_verified public.payment_entries;
begin
  select coalesce(sum(amount) filter (where status = 'VERIFIED'), 0),
         coalesce(sum(amount) filter (where status <> 'REJECTED'), 0),
         coalesce(bool_or(status = 'PENDING'), false)
    into v_verified, v_committed, v_pending
  from public.payment_entries
  where payment_id = new.id;

  if new.amount_due < v_committed then
    raise exception 'Importo della quota inferiore ai versamenti già dichiarati'
      using errcode = '23514';
  end if;

  select * into v_last
  from public.payment_entries
  where payment_id = new.id and status <> 'REJECTED'
  order by created_at desc
  limit 1;

  select * into v_last_verified
  from public.payment_entries
  where payment_id = new.id and status = 'VERIFIED'
  order by verified_at desc
  limit 1;

  new.amount_paid := v_verified;
  new.status := case
    when v_committed > 0 and v_verified >= new.amount_due then 'PAID'
    when v_pending then 'PENDING_REVIEW'
    else 'DUE'
  end::public.payment_status;
  new.method := v_last.method;
  new.declared_at := v_last.created_at;
  new.verified_at := case when new.status = 'PAID' then v_last_verified.verified_at end;
  new.verified_by := case when new.status = 'PAID' then v_last_verified.verified_by end;
  return new;
end;
$$;

-- Prima la migrazione dei dati, poi il trigger: ogni pagamento già dichiarato
-- o pagato diventa un versamento di importo pieno.
insert into public.payment_entries (
  payment_id, amount, paid_on, method, status, declared_by,
  verified_at, verified_by, created_at
)
select p.id,
       p.amount_due,
       coalesce(p.declared_at, p.verified_at, p.updated_at)::date,
       p.method,
       case when p.status = 'PAID' then 'VERIFIED' else 'PENDING' end::public.payment_entry_status,
       p.updated_by,
       case when p.status = 'PAID' then p.verified_at end,
       case when p.status = 'PAID' then p.verified_by end,
       coalesce(p.declared_at, p.verified_at, p.updated_at)
from public.payments p
where p.status <> 'DUE'
  and p.amount_due > 0
  and p.method is not null;

update public.payments
set amount_paid = amount_due
where status = 'PAID';

drop trigger if exists trg_derive_payment_status on public.payments;
create trigger trg_derive_payment_status
before insert or update on public.payments
for each row execute function private.derive_payment_status();

-- Ogni modifica ai versamenti tocca la rata, che ricalcola il suo stato.
create or replace function private.touch_payment_from_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.payments
  set updated_at = now()
  where id = coalesce(new.payment_id, old.payment_id);
  return null;
end;
$$;

drop trigger if exists trg_touch_payment_from_entry on public.payment_entries;
create trigger trg_touch_payment_from_entry
after insert or update or delete on public.payment_entries
for each row execute function private.touch_payment_from_entry();

-- Il giocatore non modifica più la rata direttamente: passa dalle RPC.
drop trigger if exists trg_guard_payment_owner_update on public.payments;
drop function if exists public.guard_payment_owner_update();
drop policy if exists payments_owner_manager_update on public.payments;
drop function if exists public.declare_payment(uuid, public.payment_method);
drop function if exists public.manager_verify_payment(uuid, public.payment_method);

-- La notifica ai manager parte da ogni nuovo versamento, non dal cambio di
-- stato della rata: un secondo versamento su una rata già da verificare
-- notifica comunque.
create or replace function public.notify_payment_change()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_user uuid;
begin
  if tg_op = 'INSERT' then
    select p.user_id into target_user
    from public.season_memberships m
    join public.profiles p on p.id = m.profile_id
    where m.id = new.membership_id;

    if target_user is not null then
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
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.notify_payment_entry()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_payment public.payments;
  v_owner_user uuid;
  v_owner_name text;
  manager_users uuid[];
begin
  select * into v_payment from public.payments where id = new.payment_id;
  select pr.user_id, pr.nome || ' ' || pr.cognome
    into v_owner_user, v_owner_name
  from public.season_memberships m
  join public.profiles pr on pr.id = m.profile_id
  where m.id = v_payment.membership_id;

  if tg_op = 'INSERT' and new.status = 'PENDING' then
    select array_agg(user_id) into manager_users
    from public.profiles
    where is_manager = true and user_id is not null;

    perform public.create_notification(
      'PAYMENT_DECLARED',
      'Pagamento da verificare',
      v_owner_name || ' · ' || v_payment.description || ' · € '
        || to_char(new.amount, 'FM999990.00'),
      '/gestione?view=quote',
      manager_users,
      true,
      'payment-entry-declared:' || new.id::text,
      new.declared_by
    );
  elsif tg_op = 'UPDATE'
        and new.status = 'REJECTED'
        and old.status is distinct from new.status
        and v_owner_user is not null then
    perform public.create_notification(
      'PAYMENT_REJECTED',
      'Pagamento non confermato',
      v_payment.description || ' · € ' || to_char(new.amount, 'FM999990.00')
        || coalesce(' · ' || nullif(trim(new.rejection_reason), ''), ''),
      '/profilo?section=quote',
      array[v_owner_user],
      true,
      'payment-entry-rejected:' || new.id::text,
      new.verified_by
    );
  end if;
  return null;
end;
$$;

drop trigger if exists trg_notify_payment_entry on public.payment_entries;
create trigger trg_notify_payment_entry
after insert or update on public.payment_entries
for each row execute function private.notify_payment_entry();

-- Controlli comuni a dichiarazione e registrazione manager. Blocca la rata
-- per serializzare i versamenti concorrenti.
create or replace function private.check_payment_entry(
  p_payment_id uuid,
  p_amount numeric,
  p_paid_on date,
  p_method public.payment_method,
  p_cash_recipient_id uuid,
  p_owner_profile_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments;
  v_committed numeric;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if v_payment.id is null then
    raise exception 'Quota non trovata';
  end if;
  if v_payment.status = 'PAID' then
    raise exception 'Quota già saldata';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Importo non valido';
  end if;
  if p_paid_on is null or p_paid_on > current_date then
    raise exception 'La data del pagamento non può essere nel futuro';
  end if;
  if p_method = 'CASH' and p_cash_recipient_id is null then
    raise exception 'Indica a chi hai dato i contanti';
  end if;
  if p_method = 'CASH' and p_cash_recipient_id = p_owner_profile_id then
    raise exception 'I contanti vanno dati a un''altra persona';
  end if;
  if p_method = 'BANK_TRANSFER' and p_cash_recipient_id is not null then
    raise exception 'Il bonifico non ha un destinatario';
  end if;

  select coalesce(sum(amount), 0) into v_committed
  from public.payment_entries
  where payment_id = p_payment_id and status <> 'REJECTED';

  if p_amount > v_payment.amount_due - v_committed then
    raise exception 'Importo oltre il residuo della quota (€ %)',
      to_char(v_payment.amount_due - v_committed, 'FM999990.00');
  end if;
end;
$$;

create or replace function public.declare_payment_entry(
  p_payment_id uuid,
  p_amount numeric,
  p_paid_on date,
  p_method public.payment_method,
  p_cash_recipient_id uuid default null
)
returns public.payment_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid := public.current_profile_id();
  result public.payment_entries;
begin
  if not exists (
    select 1
    from public.payments p
    join public.season_memberships m on m.id = p.membership_id
    where p.id = p_payment_id and m.profile_id = v_profile
  ) then
    raise exception 'Quota non disponibile';
  end if;

  perform private.check_payment_entry(
    p_payment_id, p_amount, p_paid_on, p_method, p_cash_recipient_id, v_profile
  );

  insert into public.payment_entries (
    payment_id, amount, paid_on, method, cash_recipient_id, declared_by
  )
  values (
    p_payment_id, p_amount, p_paid_on, p_method, p_cash_recipient_id, v_profile
  )
  returning * into result;
  return result;
end;
$$;

create or replace function public.cancel_payment_entry(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.payment_entries e
  using public.payments p, public.season_memberships m
  where e.id = p_entry_id
    and e.status = 'PENDING'
    and p.id = e.payment_id
    and m.id = p.membership_id
    and m.profile_id = public.current_profile_id();

  if not found then
    raise exception 'Versamento non annullabile';
  end if;
end;
$$;

create or replace function public.manager_review_payment_entry(
  p_entry_id uuid,
  p_status public.payment_entry_status,
  p_rejection_reason text default null
)
returns public.payment_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.payment_entries;
begin
  if not public.is_current_user_manager() then
    raise exception 'Manager role required' using errcode = '42501';
  end if;
  if p_status not in ('VERIFIED', 'REJECTED') then
    raise exception 'Review status must be VERIFIED or REJECTED';
  end if;

  update public.payment_entries
  set status = p_status,
      rejection_reason = case when p_status = 'REJECTED'
        then nullif(trim(p_rejection_reason), '') end,
      verified_at = now(),
      verified_by = public.current_profile_id(),
      updated_at = now()
  where id = p_entry_id and status = 'PENDING'
  returning * into result;

  if result.id is null then
    raise exception 'Versamento già verificato o inesistente';
  end if;
  return result;
end;
$$;

create or replace function public.manager_record_payment_entry(
  p_payment_id uuid,
  p_amount numeric,
  p_paid_on date,
  p_method public.payment_method,
  p_cash_recipient_id uuid default null
)
returns public.payment_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  result public.payment_entries;
begin
  if not public.is_current_user_manager() then
    raise exception 'Manager role required' using errcode = '42501';
  end if;

  select m.profile_id into v_owner
  from public.payments p
  join public.season_memberships m on m.id = p.membership_id
  where p.id = p_payment_id;

  perform private.check_payment_entry(
    p_payment_id, p_amount, p_paid_on, p_method, p_cash_recipient_id, v_owner
  );

  insert into public.payment_entries (
    payment_id, amount, paid_on, method, cash_recipient_id, status,
    declared_by, verified_at, verified_by
  )
  values (
    p_payment_id, p_amount, p_paid_on, p_method, p_cash_recipient_id, 'VERIFIED',
    public.current_profile_id(), now(), public.current_profile_id()
  )
  returning * into result;
  return result;
end;
$$;

-- Persone a cui si possono dare i contanti: staff, poi manager, poi
-- calciatori dell'ultima stagione, in ordine alfabetico.
create or replace function public.payment_cash_recipients()
returns table (id uuid, nome text, cognome text, recipient_group text)
language sql
stable
security definer
set search_path = public
as $$
  with target_season as (
    select s.id from public.seasons s order by s.starts_on desc limit 1
  ),
  people as (
    select p.id, p.nome, p.cognome,
           case
             when bool_or(m.category = 'STAFF') then 'STAFF'
             when bool_or(p.is_manager) then 'MANAGER'
             else 'PLAYER'
           end as recipient_group
    from public.profiles p
    left join public.season_memberships m
      on m.profile_id = p.id
     and m.season_id = (select id from target_season)
     and m.status <> 'NO'
    where p.deleted_at is null
      and (m.id is not null or p.is_manager)
    group by p.id, p.nome, p.cognome
  )
  select id, nome, cognome, recipient_group
  from people
  where public.is_current_user_associated()
  order by case recipient_group when 'STAFF' then 0 when 'MANAGER' then 1 else 2 end,
           cognome, nome;
$$;

-- IBAN della squadra: una sola riga.
create table public.payment_settings (
  id          boolean primary key default true check (id),
  iban        text not null,
  holder      text not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id) on delete set null
);

insert into public.payment_settings (iban, holder)
values ('IT60X0542811101000000123456', 'Circolo Chigi (prova)')
on conflict (id) do nothing;

alter table public.payment_settings enable row level security;

create policy payment_settings_associated_select
on public.payment_settings for select to authenticated
using (public.is_current_user_associated());

create policy payment_settings_manager_update
on public.payment_settings for update to authenticated
using (public.is_current_user_manager())
with check (public.is_current_user_manager());

alter table public.payment_entries enable row level security;

create policy payment_entries_self_manager_select
on public.payment_entries for select to authenticated
using (
  public.is_current_user_manager()
  or exists (
    select 1
    from public.payments p
    join public.season_memberships m on m.id = p.membership_id
    where p.id = payment_id
      and m.profile_id = public.current_profile_id()
  )
);

revoke all on public.payment_entries, public.payment_settings from anon, authenticated;
grant select on public.payment_entries to authenticated;
grant select, update on public.payment_settings to authenticated;

revoke all on function private.derive_payment_status() from public, anon, authenticated;
revoke all on function private.touch_payment_from_entry() from public, anon, authenticated;
revoke all on function private.notify_payment_entry() from public, anon, authenticated;
revoke all on function private.check_payment_entry(
  uuid, numeric, date, public.payment_method, uuid, uuid
) from public, anon, authenticated;
revoke all on function public.declare_payment_entry(
  uuid, numeric, date, public.payment_method, uuid
) from public, anon;
revoke all on function public.cancel_payment_entry(uuid) from public, anon;
revoke all on function public.manager_review_payment_entry(
  uuid, public.payment_entry_status, text
) from public, anon;
revoke all on function public.manager_record_payment_entry(
  uuid, numeric, date, public.payment_method, uuid
) from public, anon;
revoke all on function public.payment_cash_recipients() from public, anon;
grant execute on function public.declare_payment_entry(
  uuid, numeric, date, public.payment_method, uuid
) to authenticated;
grant execute on function public.cancel_payment_entry(uuid) to authenticated;
grant execute on function public.manager_review_payment_entry(
  uuid, public.payment_entry_status, text
) to authenticated;
grant execute on function public.manager_record_payment_entry(
  uuid, numeric, date, public.payment_method, uuid
) to authenticated;
grant execute on function public.payment_cash_recipients() to authenticated;

-- Il badge "quote aperte" mostra il residuo, non l'importo pieno.
create or replace function public.get_app_context()
returns jsonb
language sql
stable security definer
set search_path to 'public', 'auth'
as $function$
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
  ),
  open_payments as (
    select count(*)::integer as count,
           coalesce(sum(p.amount_due - p.amount_paid), 0) as amount
    from public.payments p
    join membership m on m.id = p.membership_id
    where p.status <> 'PAID'
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
    'targetSeason',
    (
      select jsonb_build_object(
        'id', s.id,
        'slug', s.slug,
        'name', s.name,
        'starts_on', s.starts_on,
        'ends_on', s.ends_on
      )
      from target_season s
    ),
    'membership',
    (select to_jsonb(m) from membership m),
    'openPayments',
    (
      select jsonb_build_object('count', p.count, 'amount', p.amount)
      from open_payments p
    ),
    'unreadNotifications',
    (
      select count(*)
      from public.notification_recipients nr
      where nr.user_id = auth.uid()
        and nr.read_at is null
    )
  );
$function$;
