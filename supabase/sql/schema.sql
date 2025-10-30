-- Profiles (optional convenience, auth.users exists)
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz default now()
);

-- OAuth tokens (refresh stored encrypted by edge function)
create table if not exists public.oauth_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null default 'google',
  refresh_token_cipher text not null,
  access_token_expires_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.channels (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  yt_channel_id text unique not null,
  title text,
  country text,
  uploads_playlist_id text,
  subs bigint,
  views bigint,
  last_sync timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.videos (
  id bigserial primary key,
  channel_id bigint not null references public.channels(id) on delete cascade,
  yt_video_id text unique not null,
  title text not null,
  published_at timestamptz not null,
  duration_seconds int not null,
  views bigint,
  likes bigint,
  comments bigint,
  tags jsonb,
  created_at timestamptz default now()
);

create table if not exists public.insights (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  channel_id bigint not null references public.channels(id) on delete cascade,
  type text not null,
  payload jsonb not null,
  summary text,
  generated_at timestamptz default now()
);

-- Feedback on insights
create table if not exists public.insight_feedback (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  channel_id bigint not null references public.channels(id) on delete cascade,
  insight_id bigint references public.insights(id) on delete cascade,
  helpful boolean not null,
  created_at timestamptz default now()
);

create table if not exists public.ingestion_state (
  channel_id bigint primary key references public.channels(id) on delete cascade,
  last_video_published_at timestamptz,
  last_run timestamptz,
  status text,
  quota_notes text
);

-- RLS Policies (idempotent)
do $$ begin
  alter table public.profiles enable row level security;
exception when others then null; end $$;

do $$ begin
  alter table public.oauth_tokens enable row level security;
exception when others then null; end $$;

do $$ begin
  alter table public.channels enable row level security;
exception when others then null; end $$;

do $$ begin
  alter table public.videos enable row level security;
exception when others then null; end $$;

do $$ begin
  alter table public.insights enable row level security;
exception when others then null; end $$;

do $$ begin
  alter table public.ingestion_state enable row level security;
exception when others then null; end $$;

do $$ begin
  alter table public.insight_feedback enable row level security;
exception when others then null; end $$;

do $$ begin
  create policy "own profile" on public.profiles for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "own tokens" on public.oauth_tokens for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "own channels" on public.channels for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "own videos via channel" on public.videos for select using (
    exists (
      select 1 from public.channels c where c.id = videos.channel_id and c.user_id = auth.uid()
    )
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "own insights" on public.insights for select using (user_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "feedback read" on public.insight_feedback for select using (user_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "feedback write" on public.insight_feedback for insert with check (user_id = auth.uid());
exception when duplicate_object then null; end $$;


