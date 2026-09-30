-- Allegati liberi di un'iscrizione stagionale: documento d'identità, modulo di
-- iscrizione, ricevute delle quote e altri documenti. Fototessera e certificato
-- agonistico restano dove sono.

-- La ricevuta deve appartenere alla stessa iscrizione della quota: serve una
-- chiave su cui appoggiare la fk composta.
alter table public.payments
  add constraint payments_id_membership_key unique (id, membership_id);

create table public.membership_documents (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null
    references public.season_memberships (id) on delete cascade,
  kind text not null
    check (kind in ('IDENTITY', 'REGISTRATION_FORM', 'PAYMENT_RECEIPT', 'OTHER')),
  title text,
  payment_id uuid,
  document_path text not null unique,
  content_type text not null,
  uploaded_by uuid default public.current_profile_id()
    references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint membership_documents_title_check check (
    case
      when kind = 'OTHER' then btrim(coalesce(title, '')) <> ''
      else title is null
    end
  ),
  constraint membership_documents_payment_check check (
    (kind = 'PAYMENT_RECEIPT') = (payment_id is not null)
  ),
  constraint membership_documents_payment_fkey
    foreign key (payment_id, membership_id)
    references public.payments (id, membership_id) on delete cascade
);

create index membership_documents_membership_idx
  on public.membership_documents (membership_id);

-- Un solo documento per slot; sostituire significa eliminare e ricaricare.
create unique index membership_documents_slot_key
  on public.membership_documents (membership_id, kind)
  where kind in ('IDENTITY', 'REGISTRATION_FORM');

create unique index membership_documents_receipt_key
  on public.membership_documents (payment_id)
  where kind = 'PAYMENT_RECEIPT';

alter table public.membership_documents enable row level security;

revoke all on public.membership_documents from public, anon;
grant select, insert, delete on public.membership_documents to authenticated;
grant all on public.membership_documents to service_role;

create policy membership_documents_self_manager_select
on public.membership_documents for select to authenticated
using (
  public.is_current_user_manager()
  or exists (
    select 1
    from public.season_memberships m
    where m.id = membership_documents.membership_id
      and m.profile_id = public.current_profile_id()
  )
);

create policy membership_documents_self_manager_insert
on public.membership_documents for insert to authenticated
with check (
  uploaded_by = public.current_profile_id()
  and (
    public.is_current_user_manager()
    or exists (
      select 1
      from public.season_memberships m
      where m.id = membership_documents.membership_id
        and m.profile_id = public.current_profile_id()
    )
  )
);

-- Il giocatore elimina solo ciò che ha caricato lui.
create policy membership_documents_uploader_manager_delete
on public.membership_documents for delete to authenticated
using (
  public.is_current_user_manager()
  or uploaded_by = public.current_profile_id()
);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'membership-documents',
  'membership-documents',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Percorso: {profileId}/{membershipId}/{documentId}. Nessuna policy di update:
-- ogni documento ha un id nuovo, non si sovrascrive.
create policy membership_documents_owner_manager_select
on storage.objects for select to authenticated
using (
  bucket_id = 'membership-documents'
  and (
    (storage.foldername(name))[1] = public.current_profile_id()::text
    or public.is_current_user_manager()
  )
);

create policy membership_documents_owner_manager_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'membership-documents'
  and (
    public.is_current_user_manager()
    or exists (
      select 1
      from public.season_memberships membership
      where membership.id::text = (storage.foldername(objects.name))[2]
        and membership.profile_id = public.current_profile_id()
        and membership.profile_id::text = (storage.foldername(objects.name))[1]
    )
  )
);

-- Il giocatore non toglie il file di un documento caricato dal manager, ma può
-- ripulire un file rimasto senza riga dopo un inserimento fallito.
create policy membership_documents_owner_manager_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'membership-documents'
  and (
    public.is_current_user_manager()
    or (
      (storage.foldername(name))[1] = public.current_profile_id()::text
      and not exists (
        select 1
        from public.membership_documents document
        where document.document_path = objects.name
          and document.uploaded_by is distinct from public.current_profile_id()
      )
    )
  )
);
