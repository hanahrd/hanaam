-- 하나증권 AI 마켓 v1.2 — Postgres 스키마 (12 테이블 / 51 컬럼)
-- 서버(서비스 연결)에서만 접근한다. 모든 테이블 RLS ON, 정책 없음.
-- 출처: docs/SSOT.md 부록 A

create table if not exists settings (
  id smallint primary key check (id = 1),
  payload jsonb not null
);

create table if not exists credentials (
  role text primary key check (role in ('member','admin')),
  salt text not null,
  digest text not null
);

create table if not exists participants (
  id text primary key,
  nickname text not null,
  nickname_key text not null,
  recovery_digest text not null,
  status text not null default 'active' check (status in ('active','blocked')),
  created timestamptz not null default now(),
  constraint participants_nickname_key_uq unique (nickname_key)
);

create table if not exists sessions (
  token_hash text primary key,
  role text not null check (role in ('member','admin')),
  csrf text not null,
  expires timestamptz not null,
  participant_id text references participants(id)
);
create index if not exists sessions_expires on sessions(expires);

create table if not exists works (
  id text primary key,
  title text not null,
  category text not null,
  tools text not null,
  description text not null,
  participant_id text not null references participants(id),
  visible boolean not null default true,
  deleted boolean not null default false,
  created timestamptz not null default now(),
  views integer not null default 0
);
create index if not exists works_created on works(created desc);
create index if not exists works_participant on works(participant_id);

create table if not exists files (
  id text primary key,
  name text not null,
  mime text not null,
  size bigint not null,
  participant_id text not null references participants(id),
  work_id text references works(id),
  created timestamptz not null default now(),
  uploaded_at timestamptz                      -- NULL = 업로드 완료 미확인
);
create index if not exists files_work on files(work_id);
create index if not exists files_orphans on files(created) where work_id is null;

create table if not exists likes (
  work_id text not null references works(id),
  participant_id text not null references participants(id),
  primary key (work_id, participant_id)
);

create table if not exists views (
  work_id text not null references works(id),
  participant_id text not null references participants(id),
  primary key (work_id, participant_id)
);

create table if not exists ballots (
  id text primary key,
  participant_id text not null references participants(id),
  created timestamptz not null default now(),
  constraint ballots_participant_uq unique (participant_id)
);

create table if not exists ballot_choices (
  ballot_id text not null references ballots(id),
  work_id text not null references works(id),
  primary key (ballot_id, work_id)
);
create index if not exists choices_work on ballot_choices(work_id);

create table if not exists attempts (
  id bigint generated always as identity primary key,
  fingerprint text not null,
  bucket text not null,
  created timestamptz not null default now()
);
create index if not exists attempts_lookup on attempts(fingerprint, bucket, created);

create table if not exists audit (
  id bigint generated always as identity primary key,
  action text not null,
  detail text not null,
  created timestamptz not null default now()
);

-- ── 보안: 전 테이블 RLS ON, 정책 없음, anon/authenticated 차단 ──
alter table settings        enable row level security;
alter table credentials     enable row level security;
alter table participants    enable row level security;
alter table sessions        enable row level security;
alter table works           enable row level security;
alter table files           enable row level security;
alter table likes           enable row level security;
alter table views            enable row level security;
alter table ballots         enable row level security;
alter table ballot_choices  enable row level security;
alter table attempts        enable row level security;
alter table audit           enable row level security;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- ── Storage 버킷 (비공개, 50 MiB, 허용 MIME). 객체 정책은 만들지 않는다 ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'works', 'works', false, 52428800,
  array[
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/pdf',
    'image/png','image/jpeg','image/gif','image/webp',
    'video/mp4','video/webm','video/quicktime'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
