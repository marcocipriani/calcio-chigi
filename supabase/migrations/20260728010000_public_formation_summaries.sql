-- Public next-match UI needs publication state without access to private
-- formation or player rows.
begin;

create or replace view public.public_published_formation_summaries
with (security_barrier = true)
as
select
  event_id,
  published_at
from public.official_formations
where status = 'PUBLISHED'
  and withdrawn_at is null;

revoke all on public.public_published_formation_summaries from public;
grant select on public.public_published_formation_summaries
  to anon, authenticated;

commit;
