-- Emotion labeling study schema for Supabase/Postgres
-- Run this file in the Supabase SQL Editor BEFORE uploading the study dataset.
--
-- Security model:
--   * The public GitHub Pages client gets only EXECUTE access to two RPC functions.
--   * The underlying tables are not directly readable/writable by anon users.
--   * start_or_resume_study returns tweet text but never ground_truth.
--   * Never put your Supabase secret/service-role key in the GitHub repository.

create extension if not exists pgcrypto;

create table if not exists public.study_items (
  study_version text not null,
  tweet_id text not null,
  source_split text not null default 'train',
  source_index integer,
  tweet_text text not null,
  ground_truth text not null check (
    ground_truth in ('anger','fear','joy','love','sadness','surprise')
  ),
  created_at timestamptz not null default now(),
  primary key (study_version, tweet_id)
);

create table if not exists public.participants (
  study_version text not null,
  participant_id text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (study_version, participant_id)
);

create table if not exists public.assignments (
  study_version text not null,
  participant_id text not null,
  tweet_id text not null,
  position smallint not null check (position between 1 and 5),
  assigned_at timestamptz not null default now(),
  primary key (study_version, participant_id, tweet_id),
  unique (study_version, participant_id, position),
  foreign key (study_version, participant_id)
    references public.participants(study_version, participant_id)
    on delete cascade,
  foreign key (study_version, tweet_id)
    references public.study_items(study_version, tweet_id)
    on delete restrict
);

create table if not exists public.annotations (
  study_version text not null,
  participant_id text not null,
  tweet_id text not null,
  chosen_label text not null check (
    chosen_label in ('anger','fear','joy','love','sadness','surprise')
  ),
  submitted_at timestamptz not null default now(),
  primary key (study_version, participant_id, tweet_id),
  foreign key (study_version, participant_id, tweet_id)
    references public.assignments(study_version, participant_id, tweet_id)
    on delete cascade
);

alter table public.study_items enable row level security;
alter table public.participants enable row level security;
alter table public.assignments enable row level security;
alter table public.annotations enable row level security;

-- Do not expose the raw tables to the browser roles.
revoke all on table public.study_items from anon, authenticated;
revoke all on table public.participants from anon, authenticated;
revoke all on table public.assignments from anon, authenticated;
revoke all on table public.annotations from anon, authenticated;

-- The study client calls this to create or resume a stable five-item assignment.
create or replace function public.start_or_resume_study(
  p_participant_id text,
  p_study_version text default 'emotion-v1'
)
returns table (
  tweet_id text,
  tweet_text text,
  item_position smallint,
  chosen_label text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pid text := btrim(p_participant_id);
  v_item_count integer;
begin
  if v_pid is null or v_pid !~ '^[A-Za-z0-9_-]{2,64}$' then
    raise exception 'Invalid participant ID';
  end if;

  select count(*)
    into v_item_count
  from public.study_items
  where study_version = p_study_version;

  if v_item_count < 100 then
    raise exception 'Study dataset is not ready';
  end if;

  -- Avoid duplicate assignment creation if the same ID is opened in two tabs.
  perform pg_advisory_xact_lock(hashtext(p_study_version || ':' || v_pid));

  insert into public.participants(study_version, participant_id)
  values (p_study_version, v_pid)
  on conflict do nothing;

  if not exists (
    select 1
    from public.assignments a
    where a.study_version = p_study_version
      and a.participant_id = v_pid
  ) then
    insert into public.assignments(
      study_version, participant_id, tweet_id, position
    )
    select
      p_study_version,
      v_pid,
      picked.tweet_id,
      row_number() over ()::smallint
    from (
      select s.tweet_id
      from public.study_items s
      where s.study_version = p_study_version
      order by random()
      limit 5
    ) as picked;
  end if;

  return query
  select
    a.tweet_id,
    i.tweet_text,
    a.position,
    n.chosen_label
  from public.assignments a
  join public.study_items i
    on i.study_version = a.study_version
   and i.tweet_id = a.tweet_id
  left join public.annotations n
    on n.study_version = a.study_version
   and n.participant_id = a.participant_id
   and n.tweet_id = a.tweet_id
  where a.study_version = p_study_version
    and a.participant_id = v_pid
  order by a.position;
end;
$$;

-- The study client calls this to save one label.
create or replace function public.submit_annotation(
  p_participant_id text,
  p_study_version text,
  p_tweet_id text,
  p_label text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pid text := btrim(p_participant_id);
  v_completed integer;
begin
  if v_pid is null or v_pid !~ '^[A-Za-z0-9_-]{2,64}$' then
    raise exception 'Invalid participant ID';
  end if;

  if p_label not in ('anger','fear','joy','love','sadness','surprise') then
    raise exception 'Invalid emotion label';
  end if;

  if not exists (
    select 1
    from public.assignments a
    where a.study_version = p_study_version
      and a.participant_id = v_pid
      and a.tweet_id = p_tweet_id
  ) then
    raise exception 'Tweet is not assigned to this participant';
  end if;

  insert into public.annotations(
    study_version, participant_id, tweet_id, chosen_label, submitted_at
  )
  values (
    p_study_version, v_pid, p_tweet_id, p_label, now()
  )
  on conflict (study_version, participant_id, tweet_id)
  do update set
    chosen_label = excluded.chosen_label,
    submitted_at = excluded.submitted_at;

  select count(*)
    into v_completed
  from public.annotations n
  where n.study_version = p_study_version
    and n.participant_id = v_pid;

  if v_completed = 5 then
    update public.participants
    set completed_at = coalesce(completed_at, now())
    where study_version = p_study_version
      and participant_id = v_pid;
  end if;
end;
$$;

revoke all on function public.start_or_resume_study(text, text) from public;
revoke all on function public.submit_annotation(text, text, text, text) from public;

grant execute on function public.start_or_resume_study(text, text) to anon, authenticated;
grant execute on function public.submit_annotation(text, text, text, text) to anon, authenticated;
