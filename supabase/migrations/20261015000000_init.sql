-- InvoiceFlow KSA — initial schema.
-- Every table is owned per user through Row Level Security. The mobile app talks
-- to these tables directly with the user's JWT; privileged work (Claude, Google
-- tokens, account deletion) happens in Edge Functions with the service role.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Profiles: plan and preferences. Created automatically for every auth user,
-- including anonymous (guest) users.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: read own" on public.profiles
  for select using (auth.uid() = id);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Batches: a group of invoices scanned together (e.g. one site visit, one month).
-- ---------------------------------------------------------------------------
create table public.batches (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  exported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create index batches_user_updated on public.batches (user_id, updated_at);

-- ---------------------------------------------------------------------------
-- Invoices.
-- ---------------------------------------------------------------------------
create table public.invoices (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  batch_id uuid references public.batches (id) on delete set null,
  vendor_name text not null default '',
  vendor_tax_id text not null default '',
  customer_name text not null default '',
  customer_tax_id text not null default '',
  invoice_number text not null default '',
  issue_date text not null default '',
  project_name text not null default '',
  category text not null default 'other',
  subtotal numeric(14, 2) not null default 0,
  vat numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  currency text not null default 'SAR',
  notes text not null default '',
  status text not null default 'needs-review' check (status in ('needs-review', 'approved')),
  confidence real not null default 0,
  source text not null default 'camera' check (source in ('camera', 'gallery', 'pdf', 'manual')),
  qr_status text not null default 'none',
  file_path text,
  exported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create index invoices_user_updated on public.invoices (user_id, updated_at);
create index invoices_user_batch on public.invoices (user_id, batch_id);

-- ---------------------------------------------------------------------------
-- Export history: every Excel file generated and uploaded to the cloud.
-- ---------------------------------------------------------------------------
create table public.exports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  file_path text not null,
  invoice_count integer not null default 0,
  total numeric(14, 2) not null default 0,
  sheets_url text,
  created_at timestamptz not null default now()
);

create index exports_user_created on public.exports (user_id, created_at desc);

-- Owner-only access for app data tables.
alter table public.batches enable row level security;
alter table public.invoices enable row level security;
alter table public.exports enable row level security;

create policy "batches: owner" on public.batches
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "invoices: owner" on public.invoices
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "exports: owner" on public.exports
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Monthly AI scan quota. Only Edge Functions (service role) write here.
-- ---------------------------------------------------------------------------
create table public.usage_counters (
  user_id uuid not null references auth.users (id) on delete cascade,
  month text not null,
  scans integer not null default 0,
  primary key (user_id, month)
);

alter table public.usage_counters enable row level security;

create policy "usage: read own" on public.usage_counters
  for select using (auth.uid() = user_id);

-- Atomically counts one scan if the user is under the limit. Returns the new
-- count, or -1 when the limit is reached. Callable only by the service role.
create function public.consume_scan(p_user uuid, p_limit integer) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_month text := to_char(now() at time zone 'Asia/Riyadh', 'YYYY-MM');
  v_count integer;
begin
  insert into public.usage_counters (user_id, month, scans)
  values (p_user, v_month, 0)
  on conflict (user_id, month) do nothing;

  update public.usage_counters
     set scans = scans + 1
   where user_id = p_user and month = v_month and scans < p_limit
  returning scans into v_count;

  return coalesce(v_count, -1);
end;
$$;

revoke all on function public.consume_scan(uuid, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Google Sheets connection. Holds an encrypted refresh token, so no client
-- policy at all: only Edge Functions (service role) can read or write it.
-- ---------------------------------------------------------------------------
create table public.google_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  refresh_token_enc text not null,
  google_email text,
  spreadsheet_id text,
  spreadsheet_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_connections enable row level security;

-- ---------------------------------------------------------------------------
-- Storage: private buckets, one folder per user id.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('invoice-files', 'invoice-files', false, 15728640),
  ('exports', 'exports', false, 15728640)
on conflict (id) do nothing;

create policy "storage: owner read" on storage.objects
  for select using (
    bucket_id in ('invoice-files', 'exports')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "storage: owner insert" on storage.objects
  for insert with check (
    bucket_id in ('invoice-files', 'exports')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "storage: owner update" on storage.objects
  for update using (
    bucket_id in ('invoice-files', 'exports')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "storage: owner delete" on storage.objects
  for delete using (
    bucket_id in ('invoice-files', 'exports')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Gives back a scan when the AI call failed on our side (network / provider error).
create function public.refund_scan(p_user uuid) returns void
language sql security definer set search_path = public as $$
  update public.usage_counters
     set scans = greatest(scans - 1, 0)
   where user_id = p_user and month = to_char(now() at time zone 'Asia/Riyadh', 'YYYY-MM');
$$;

revoke all on function public.refund_scan(uuid) from public, anon, authenticated;

-- Server-side clock for sync: devices pull rows changed after the last
-- updated_at they saw, so the timestamp must come from the database.
create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger invoices_touch before insert or update on public.invoices
  for each row execute function public.touch_updated_at();
create trigger batches_touch before insert or update on public.batches
  for each row execute function public.touch_updated_at();
