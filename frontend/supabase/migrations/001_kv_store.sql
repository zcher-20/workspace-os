create table if not exists kv_store (
  key        text        primary key,
  value      jsonb       not null,
  updated_at timestamptz default now()
);

-- Allow the anon key to read and write (personal app, no auth yet)
alter table kv_store enable row level security;

create policy "anon read"  on kv_store for select using (true);
create policy "anon write" on kv_store for insert with check (true);
create policy "anon update" on kv_store for update using (true) with check (true);
