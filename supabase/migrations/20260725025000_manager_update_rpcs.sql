-- Transactional manager edits for profiles, memberships, payments and certificates.

begin;

create or replace function public.manager_update_person(
  p_profile_id uuid,
  p_membership_id uuid,
  p_profile jsonb,
  p_membership jsonb,
  p_private jsonb
)
returns public.season_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.season_memberships;
  next_category public.membership_category;
  next_registration public.registration_status;
begin
  if not public.is_current_user_manager() then
    raise exception 'Manager role required' using errcode = '42501';
  end if;
  if nullif(trim(p_profile->>'nome'), '') is null
     or nullif(trim(p_profile->>'cognome'), '') is null then
    raise exception 'Name and surname are required';
  end if;

  select (p_membership->>'category')::public.membership_category,
         (p_membership->>'registration_status')::public.registration_status
  into next_category, next_registration;

  update public.profiles
  set nome = trim(p_profile->>'nome'),
      cognome = trim(p_profile->>'cognome'),
      joined_on = nullif(p_profile->>'joined_on', '')::date,
      is_manager = coalesce((p_profile->>'is_manager')::boolean, false),
      is_staff = next_category = 'STAFF',
      updated_at = now()
  where id = p_profile_id;

  if not found then raise exception 'Profile not found'; end if;

  update public.profile_private_details
  set phone = nullif(trim(p_private->>'phone'), ''),
      operational_email = nullif(trim(p_private->>'operational_email'), ''),
      updated_by = public.current_profile_id(),
      updated_at = now()
  where profile_id = p_profile_id;

  if not found then
    insert into public.profile_private_details (
      profile_id, phone, operational_email, updated_by
    )
    values (
      p_profile_id,
      nullif(trim(p_private->>'phone'), ''),
      nullif(trim(p_private->>'operational_email'), ''),
      public.current_profile_id()
    );
  end if;

  update public.season_memberships
  set category = next_category,
      status = (p_membership->>'status')::public.membership_status,
      role = case when next_category = 'PLAYER'
        then nullif(p_membership->>'role', '') else null end,
      staff_function = case when next_category = 'STAFF'
        then coalesce(nullif(trim(p_membership->>'staff_function'), ''), 'Staff')
        else null end,
      jersey_number = nullif(p_membership->>'jersey_number', '')::integer,
      department = nullif(trim(p_membership->>'department'), ''),
      asi_card_number = nullif(trim(p_membership->>'asi_card_number'), ''),
      uniform_size = nullif(trim(p_membership->>'uniform_size'), ''),
      is_external = coalesce((p_membership->>'is_external')::boolean, false),
      is_aggregated = coalesce((p_membership->>'is_aggregated')::boolean, false),
      training_only = coalesce((p_membership->>'training_only')::boolean, false),
      operational_notes = nullif(trim(p_membership->>'operational_notes'), ''),
      next_contact_on = nullif(p_membership->>'next_contact_on', '')::date,
      registration_status = next_registration,
      registration_completed_on = case when next_registration = 'ACTIVE'
        then coalesce(
          nullif(p_membership->>'registration_completed_on', '')::date,
          current_date
        )
        else null
      end,
      registration_completed_by = case when next_registration = 'ACTIVE'
        then public.current_profile_id()
        else null
      end,
      updated_by = public.current_profile_id(),
      updated_at = now()
  where id = p_membership_id
    and profile_id = p_profile_id
  returning * into result;

  if result.id is null then raise exception 'Membership not found'; end if;
  return result;
end;
$$;

create or replace function public.manager_verify_payment(
  p_payment_id uuid,
  p_method public.payment_method
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.payments;
begin
  if not public.is_current_user_manager() then
    raise exception 'Manager role required' using errcode = '42501';
  end if;

  update public.payments
  set status = 'PAID',
      method = p_method,
      declared_at = coalesce(declared_at, now()),
      verified_at = now(),
      verified_by = public.current_profile_id(),
      updated_by = public.current_profile_id(),
      updated_at = now()
  where id = p_payment_id
  returning * into result;

  if result.id is null then raise exception 'Payment not found'; end if;
  return result;
end;
$$;

create or replace function public.manager_review_certificate(
  p_certificate_id uuid,
  p_status public.medical_certificate_status,
  p_rejection_reason text default null
)
returns public.medical_certificates
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.medical_certificates;
begin
  if not public.is_current_user_manager() then
    raise exception 'Manager role required' using errcode = '42501';
  end if;
  if p_status not in ('VALID', 'REJECTED') then
    raise exception 'Review status must be VALID or REJECTED';
  end if;
  if p_status = 'REJECTED' and nullif(trim(p_rejection_reason), '') is null then
    raise exception 'Rejection reason is required';
  end if;

  update public.medical_certificates
  set status = p_status,
      rejection_reason = case when p_status = 'REJECTED'
        then trim(p_rejection_reason) else null end,
      verified_at = now(),
      verified_by = public.current_profile_id(),
      updated_by = public.current_profile_id(),
      updated_at = now()
  where id = p_certificate_id
  returning * into result;

  if result.id is null then raise exception 'Certificate not found'; end if;
  return result;
end;
$$;

revoke all on function public.manager_update_person(uuid, uuid, jsonb, jsonb, jsonb)
  from public, anon;
revoke all on function public.manager_verify_payment(uuid, public.payment_method)
  from public, anon;
revoke all on function public.manager_review_certificate(
  uuid, public.medical_certificate_status, text
) from public, anon;

grant execute on function public.manager_update_person(uuid, uuid, jsonb, jsonb, jsonb)
  to authenticated, service_role;
grant execute on function public.manager_verify_payment(uuid, public.payment_method)
  to authenticated, service_role;
grant execute on function public.manager_review_certificate(
  uuid, public.medical_certificate_status, text
) to authenticated, service_role;

commit;
