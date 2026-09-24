-- Allegato n.1 al Regolamento 2026/27: PDF servito dall'app (public/docs), non da Enjore.
insert into public.comunicati (enjore_url, titolo, data)
values (
  '/docs/allegato-1-arti-mestieri-2026-2027.pdf',
  'Allegato n.1 al Regolamento 2026/27',
  '2026-09-23'
)
on conflict (enjore_url) do nothing;
