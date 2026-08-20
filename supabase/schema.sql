-- ============================================================
-- 我的收藏展览 · 论坛模块 Supabase Schema
-- 使用方法：Supabase Dashboard -> SQL Editor -> New query
-- 粘贴本文件全部内容并运行（可重复执行，幂等）
-- ============================================================

-- 帖子表（主题）
create table if not exists public.forum_topics (
    id         uuid primary key default gen_random_uuid(),
    title      text not null check (char_length(title) between 1 and 120),
    content    text not null check (char_length(content) between 1 and 5000),
    category   text not null default 'general',
    nickname   text not null check (char_length(nickname) between 1 and 30),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- 回复表
create table if not exists public.forum_replies (
    id         uuid primary key default gen_random_uuid(),
    topic_id   uuid not null references public.forum_topics (id) on delete cascade,
    content    text not null check (char_length(content) between 1 and 2000),
    nickname   text not null check (char_length(nickname) between 1 and 30),
    created_at timestamptz not null default now()
);

-- 索引
create index if not exists forum_replies_topic_idx on public.forum_replies (topic_id);
create index if not exists forum_topics_created_idx on public.forum_topics (created_at desc);

-- 自动维护 updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end $$;

drop trigger if exists forum_topics_set_updated_at on public.forum_topics;
create trigger forum_topics_set_updated_at
    before update on public.forum_topics
    for each row execute function public.set_updated_at();

-- ============================================================
-- Row Level Security：公开论坛，任何人可读、可发帖
-- （如需管理员删除/编辑，可在 Dashboard 中另行补充策略）
-- ============================================================
alter table public.forum_topics  enable row level security;
alter table public.forum_replies enable row level security;

drop policy if exists "forum_topics_select_anon"  on public.forum_topics;
drop policy if exists "forum_topics_insert_anon"  on public.forum_topics;
drop policy if exists "forum_replies_select_anon" on public.forum_replies;
drop policy if exists "forum_replies_insert_anon" on public.forum_replies;

create policy "forum_topics_select_anon"  on public.forum_topics
    for select using (true);

create policy "forum_topics_insert_anon"  on public.forum_topics
    for insert with check (true);

create policy "forum_replies_select_anon" on public.forum_replies
    for select using (true);

create policy "forum_replies_insert_anon" on public.forum_replies
    for insert with check (true);

-- ============================================================
-- 图片上传（Supabase Storage）
-- ============================================================

-- 帖子/回复增加图片 URL 数组列
alter table public.forum_topics
    add column if not exists images text[] not null default '{}';

alter table public.forum_replies
    add column if not exists images text[] not null default '{}';

-- 公开图片桶（通过 CDN 公开读取）
insert into storage.buckets (id, name, public)
values ('forum-images', 'forum-images', true)
on conflict (id) do update set public = true;

-- 允许匿名用户上传图片到该桶
drop policy if exists "forum_images_upload_anon" on storage.objects;
create policy "forum_images_upload_anon" on storage.objects
    for insert to anon
    with check (bucket_id = 'forum-images');
