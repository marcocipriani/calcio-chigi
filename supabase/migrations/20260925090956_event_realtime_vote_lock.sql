-- La pagina evento si iscrive ai cambi di attendance/events, ma la
-- pubblicazione supabase_realtime era vuota: nessun aggiornamento live.
alter publication supabase_realtime add table public.attendance, public.events;

-- Il giocatore cambia la propria disponibilità solo prima dell'inizio e mai
-- su eventi annullati o giocati. I manager restano liberi ("Manager gestiscono tutto").
drop policy if exists "Utenti gestiscono il proprio profilo" on public.attendance;

create or replace function public.attendance_vote_open(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.events e
    where e.id = p_event_id
      and not coalesce(e.cancellato, false)
      and not coalesce(e.giocata, false)
      and (e.data_ora is null or e.data_ora > now())
  );
$function$;

create policy attendance_own_select on public.attendance
  for select
  using (profile_id in (select id from public.profiles where user_id = auth.uid()));

create policy attendance_own_insert on public.attendance
  for insert
  with check (
    profile_id in (select id from public.profiles where user_id = auth.uid())
    and public.attendance_vote_open(event_id)
  );

create policy attendance_own_update on public.attendance
  for update
  using (
    profile_id in (select id from public.profiles where user_id = auth.uid())
    and public.attendance_vote_open(event_id)
  )
  with check (
    profile_id in (select id from public.profiles where user_id = auth.uid())
    and public.attendance_vote_open(event_id)
  );

create policy attendance_own_delete on public.attendance
  for delete
  using (
    profile_id in (select id from public.profiles where user_id = auth.uid())
    and public.attendance_vote_open(event_id)
  );
