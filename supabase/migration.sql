create extension if not exists pgcrypto;

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rank text not null check (rank in ('병장', '상병', '일병', '이병')),
  unit text not null default '전투지원소대 수송분대',
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamp with time zone default now()
);

create table if not exists exception_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamp with time zone default now()
);

insert into exception_categories (name, sort_order)
values
  ('외출', 10),
  ('외박', 20),
  ('휴가', 30),
  ('전투휴무', 40),
  ('외진', 50),
  ('식청', 60),
  ('기타', 70)
on conflict (name) do nothing;

create table if not exists daily_exceptions (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  member_id uuid not null references members(id) on delete cascade,
  category text not null,
  reason text,
  created_at timestamp with time zone default now(),
  unique(date, member_id)
);

alter table daily_exceptions drop constraint if exists daily_exceptions_category_check;

create table if not exists daily_reports (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  assault text default '없음',
  verbal_abuse text default '없음',
  sexual_misconduct text default '없음',
  suicide_risk text default '없음',
  complaints text default '없음',
  patient text default '없음',
  next_day_work text,
  created_at timestamp with time zone default now()
);

alter table members enable row level security;
alter table exception_categories enable row level security;
alter table daily_exceptions enable row level security;
alter table daily_reports enable row level security;

drop policy if exists "authenticated members crud" on members;
drop policy if exists "public members crud" on members;
drop policy if exists "public categories crud" on exception_categories;
drop policy if exists "authenticated exceptions crud" on daily_exceptions;
drop policy if exists "public exceptions crud" on daily_exceptions;
drop policy if exists "authenticated reports crud" on daily_reports;
drop policy if exists "public reports crud" on daily_reports;

create policy "public members crud" on members for all to anon, authenticated using (true) with check (true);
create policy "public categories crud" on exception_categories for all to anon, authenticated using (true) with check (true);
create policy "public exceptions crud" on daily_exceptions for all to anon, authenticated using (true) with check (true);
create policy "public reports crud" on daily_reports for all to anon, authenticated using (true) with check (true);

create index if not exists members_sort_idx on members (active, rank, sort_order, name);
create index if not exists exception_categories_sort_idx on exception_categories (active, sort_order, name);
create index if not exists daily_exceptions_date_idx on daily_exceptions (date);
