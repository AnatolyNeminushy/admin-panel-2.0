-- ===== accounts =====
create extension if not exists "pgcrypto"; -- для gen_random_uuid()

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  full_name text,
  role text default 'admin',
  is_active boolean default true,
  last_login_at timestamptz,
  created_at timestamptz default now()
);

-- ===== chats =====
create table if not exists chats (
  id serial primary key,
  chat_id bigint unique not null,
  username text,
  first_name text,
  last_name text,
  platform text
);

-- ===== messages =====
create table if not exists messages (
  id serial primary key,
  chat_id bigint references chats(chat_id) on delete cascade,
  from_me boolean,
  text text,
  date timestamptz default current_timestamp
);

-- ===== orders =====
create table if not exists orders (
  id serial primary key,
  tg_username text,
  name text,
  phone text,
  order_type text,
  "date" date,          -- было: text
  "time" time,          -- было: text
  address text,
  items text,
  total integer,
  comment text,
  created_at timestamptz default now(),
  platform text
);

-- ===== reservations =====
create table if not exists reservations (
  id serial primary key,
  tg_username text,
  name text,
  phone text,
  address text,
  "date" date,
  "time" text,          -- можешь позже тоже поменять на time, если удобно
  guests integer,
  comment text,
  created_at timestamptz default now(),
  platform text
);
