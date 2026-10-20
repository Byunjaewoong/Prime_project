-- Shared, append-only drawing board. Run in the Supabase SQL editor or via migrations.
create table if not exists public.dashboard_strokes (
  id bigint generated always as identity primary key,
  stroke_key uuid not null unique,
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  width real not null check (width between 1 and 16),
  points jsonb not null check (jsonb_typeof(points) = 'array' and jsonb_array_length(points) between 1 and 600),
  created_at timestamptz not null default now()
);

alter table public.dashboard_strokes enable row level security;
revoke all on table public.dashboard_strokes from anon, authenticated;
grant select, insert on table public.dashboard_strokes to anon, authenticated;

create policy "Everyone can view the shared drawing"
  on public.dashboard_strokes for select to anon, authenticated using (true);
create policy "Everyone can add strokes"
  on public.dashboard_strokes for insert to anon, authenticated with check (true);
