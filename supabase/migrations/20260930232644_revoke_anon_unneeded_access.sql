-- Accessi anon non necessari segnalati dagli advisor di sicurezza.

-- La directory dei profili rivendicabili si legge solo dopo il login (AppGates):
-- da anonimi elencava i nomi di tutti i profili non associati, ex giocatori compresi.
revoke select on public.claimable_profile_directory from anon;

-- Per anon restituisce sempre zero righe (filtro is_current_user_associated): grant inutile.
revoke select on public.authenticated_active_roster from anon;

-- Serve solo alle policy di scrittura su attendance, valutate per utenti loggati.
revoke execute on function public.attendance_vote_open(uuid) from public, anon;
grant execute on function public.attendance_vote_open(uuid) to authenticated;
