-- Quando un profilo viene collegato a un account (approvazione o "Sono io"),
-- se il profilo non ha email prende quella dell'account: il prossimo login
-- con la stessa email si collega da solo, senza approvazione.

create or replace function public.fill_profile_email_from_account()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if new.user_id is not null
     and old.user_id is distinct from new.user_id
     and nullif(trim(new.email), '') is null then
    select u.email into new.email
    from auth.users u
    where u.id = new.user_id;
  end if;
  return new;
end;
$$;

revoke execute on function public.fill_profile_email_from_account() from public, anon, authenticated;

drop trigger if exists trg_fill_profile_email_from_account on public.profiles;
create trigger trg_fill_profile_email_from_account
  before update of user_id on public.profiles
  for each row
  execute function public.fill_profile_email_from_account();

-- Profili già collegati senza email.
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.user_id
  and nullif(trim(p.email), '') is null;
