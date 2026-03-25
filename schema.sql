-- ============================================================
-- EventSnap — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. EVENTS TABLE
create table if not exists events (
  id          text        primary key,          -- 8-char uppercase code e.g. "A3BX9K2M"
  title       text        not null,
  subtitle    text,
  date        text        not null,             -- stored as ISO date string "YYYY-MM-DD"
  host        text,
  created_at  timestamptz not null default now()
);

-- 2. PHOTOS TABLE
create table if not exists photos (
  id            uuid        primary key default gen_random_uuid(),
  event_id      text        not null references events(id) on delete cascade,
  uploader_name text        not null default 'Guest',
  image_url     text        not null,
  created_at    timestamptz not null default now()
);

-- Index for fast gallery loads
create index if not exists photos_event_id_idx on photos(event_id, created_at desc);

-- ============================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- Public read + insert, no update/delete from client
-- ============================================================

alter table events enable row level security;
alter table photos enable row level security;

-- Anyone can read events (needed to join by code)
create policy "Public read events"
  on events for select
  using (true);

-- Anyone can create an event
create policy "Public insert events"
  on events for insert
  with check (true);

-- Anyone can read photos for any event
create policy "Public read photos"
  on photos for select
  using (true);

-- Anyone can upload a photo
create policy "Public insert photos"
  on photos for insert
  with check (true);

-- ============================================================
-- 4. ENABLE RLS ON ADDITIONAL TABLES
-- ============================================================

alter table payments enable row level security;
alter table face_tagging_consents enable row level security;

-- Allow users to see only their own payments
create policy "Users can view own payments"
  on payments for select
  using (auth.uid() = user_id);

-- Allow users to insert their own payments
create policy "Users can insert own payments"
  on payments for insert
  with check (auth.uid() = user_id);

-- Allow users to update their own payments
create policy "Users can update own payments"
  on payments for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Allow users to view only their own consent records
create policy "Users can view own consents"
  on face_tagging_consents for select
  using (auth.uid() = user_id);

-- Allow users to insert their own consent records
create policy "Users can insert own consents"
  on face_tagging_consents for insert
  with check (auth.uid() = user_id);
