-- Exports can live in the user's own Google Drive instead of (or as well as)
-- the private Supabase bucket.
alter table public.google_connections add column drive_folder_id text;
alter table public.google_connections add column drive_folder_url text;

alter table public.exports alter column file_path drop not null;
alter table public.exports add column drive_url text;
