begin;

-- La capsula "prossima partita" distingue "Convocati" da "Pubblicata": la
-- vista pubblica espone anche la visibilità, mai titolari o modulo.
create or replace view public.public_published_formation_summaries
with (security_barrier = true)
as
select
  event_id,
  published_at,
  visibility
from public.official_formations
where status = 'PUBLISHED'
  and withdrawn_at is null;

commit;
