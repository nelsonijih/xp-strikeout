-- XP StrikeOut — schema (M1 subset). Runs on first Postgres boot via docker-compose.
-- NOTE: In production, `users.id` = Supabase auth.uid() and rows are provisioned by an
-- auth trigger (architecture §13). Locally we use plain Postgres; dev-login inserts here.

create extension if not exists "pgcrypto";

create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  email         text unique,
  gamer_tag     text,
  provider      text default 'dev',
  role          text default 'player',
  created_at    timestamptz default now()
);

create unique index if not exists player_gamer_tag_unique on users (lower(gamer_tag))
  where gamer_tag is not null;

create table if not exists matches (
  id               uuid primary key default gen_random_uuid(),
  status           text not null default 'waiting',
  -- waiting | countdown | active | finalizing | results_locked | void
  max_players      int  not null default 20,
  min_players      int  not null default 6,
  entry_fee_naira  numeric not null default 2000,
  gross_pool       numeric,
  platform_fee     numeric,
  takedown_pool    numeric,
  survival_prize   numeric,
  total_takedowns  int,
  payout_per_takedown numeric,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  started_at       timestamptz,
  ended_at         timestamptz
);

create index if not exists matches_status_idx on matches (status);

create table if not exists match_players (
  id             uuid primary key default gen_random_uuid(),
  match_id       uuid not null references matches(id),
  user_id        uuid not null references users(id),
  payment_status text not null default 'pending', -- pending|paid|refunded
  seat_status    text not null default 'reserved', -- reserved|consumed|released
  takedowns      int  not null default 0,
  deaths         int  not null default 0,
  created_at     timestamptz default now(),
  unique (match_id, user_id)
);

create table if not exists payments (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references users(id),
  match_id           uuid references matches(id),
  amount             numeric not null,
  provider           text not null default 'stub',
  provider_reference text unique,
  status             text not null default 'pending', -- pending|paid|expired|refunded
  created_at         timestamptz default now()
);

-- Finalization is idempotent: unique on (match_id, user_id). Re-submits ON CONFLICT DO NOTHING.
create table if not exists match_results (
  match_id           uuid not null references matches(id),
  user_id            uuid not null references users(id),
  takedowns          int  not null default 0,
  deaths             int  not null default 0,
  takedown_earnings  numeric not null default 0,
  survival_prize     numeric not null default 0,
  total_payout       numeric not null default 0,
  created_at         timestamptz default now(),
  primary key (match_id, user_id)
);
