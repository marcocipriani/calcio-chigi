-- La data del versamento si confronta con il giorno a Roma, come nel client:
-- con current_date (UTC) dopo mezzanotte "oggi" risultava nel futuro.
-- Una quota da 0 € non si può saldare con versamenti positivi: vietata.

alter table public.payments
  add constraint payments_amount_due_positive check (amount_due > 0);

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
  if p_paid_on is null or p_paid_on > (now() at time zone 'Europe/Rome')::date then
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

revoke all on function private.check_payment_entry(
  uuid, numeric, date, public.payment_method, uuid, uuid
) from public, anon, authenticated;
