-- 私人访客记录：只允许服务端 service_role 调用两个受限 RPC。
-- Supabase SQL editor / migration 以数据库管理角色执行；浏览器不能得到 service_role key。
-- 参考：https://supabase.com/docs/guides/database/functions

begin;

create table if not exists public.portfolio_visits (
  id uuid primary key,
  visited_at timestamptz not null default clock_timestamp(),
  path text not null check (length(path) between 1 and 512 and left(path, 1) = '/'),
  ip inet,
  country text check (length(country) <= 128),
  region text check (length(region) <= 128),
  city text check (length(city) <= 128),
  referrer text check (length(referrer) <= 512)
);

alter table public.portfolio_visits enable row level security;
revoke all on table public.portfolio_visits from public, anon, authenticated, service_role;
grant usage on schema public to service_role;

create index if not exists portfolio_visits_time_idx
  on public.portfolio_visits (visited_at desc, id desc);
create index if not exists portfolio_visits_ip_time_idx
  on public.portfolio_visits (ip, visited_at desc, id desc);
create index if not exists portfolio_visits_path_time_idx
  on public.portfolio_visits (path, visited_at desc, id desc);

-- DEFINER 用于 RPC 独占表读写：service_role 自身没有表权限，不能绕过限流直接插入。
-- 两个函数均清空 search_path，并在下文同时撤销 PUBLIC/anon/authenticated 的 EXECUTE。
create or replace function public.portfolio_record_visit(
  p_id uuid,
  p_path text,
  p_ip text default null,
  p_country text default null,
  p_region text default null,
  p_city text default null,
  p_referrer text default null
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz;
  v_ip inet;
begin
  if p_id is null or p_path is null or length(p_path) > 512
    or left(p_path, 1) <> '/' or left(p_path, 2) = '//'
    or p_path ~ '[[:space:]?#\\]' then
    raise exception 'Invalid page path' using errcode = '22023';
  end if;
  if p_ip is not null and (p_ip = '' or strpos(p_ip, '/') > 0) then
    raise exception 'Invalid IP address' using errcode = '22023';
  end if;
  v_ip := p_ip::inet;
  -- 锁与持久事件表共同计数，跨进程/跨函数实例仍是同一个每 IP 滚动一分钟配额。
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('portfolio-visits:' || coalesce(host(v_ip), 'unknown'), 0));
  v_now := clock_timestamp();
  delete from public.portfolio_visits where visited_at < v_now - interval '30 days';
  -- 重试同一事件幂等，不消耗第二份配额。
  if exists (select 1 from public.portfolio_visits where id = p_id) then return true; end if;
  if (select count(*) from public.portfolio_visits
      where ip is not distinct from v_ip and visited_at > v_now - interval '1 minute') >= 60 then
    return false;
  end if;
  insert into public.portfolio_visits (id, visited_at, path, ip, country, region, city, referrer)
    values (p_id, v_now, p_path, v_ip, p_country, p_region, p_city, p_referrer)
    on conflict (id) do nothing;
  return true;
end;
$$;

create or replace function public.portfolio_query_visits(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_ip text default null,
  p_path text default null,
  p_page integer default 1
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ip inet;
  v_result jsonb;
begin
  if p_page is null or p_page < 1 or p_page > 1000000 or (p_from is not null and p_to is not null and p_from >= p_to) then
    raise exception 'Invalid filters' using errcode = '22023';
  end if;
  if p_ip is not null and (p_ip = '' or strpos(p_ip, '/') > 0) then
    raise exception 'Invalid IP address' using errcode = '22023';
  end if;
  v_ip := p_ip::inet;
  delete from public.portfolio_visits where visited_at < clock_timestamp() - interval '30 days';
  with matched as materialized (
    select * from public.portfolio_visits
    where (p_from is null or visited_at >= p_from)
      and (p_to is null or visited_at < p_to)
      and (v_ip is null or ip = v_ip)
      and (p_path is null or path = p_path)
  ), page_rows as (
    select * from matched order by visited_at desc, id desc
    limit 50 offset ((p_page - 1)::bigint * 50)
  )
  select jsonb_build_object(
    'records', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'visitedAt', visited_at, 'path', path, 'ip', host(ip),
      'country', country, 'region', region, 'city', city, 'referrer', referrer
    ) order by visited_at desc, id desc) from page_rows), '[]'::jsonb),
    'total', (select count(*) from matched),
    'uniqueIps', (select count(distinct ip) from matched),
    'page', p_page,
    'pageSize', 50
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.portfolio_record_visit(uuid, text, text, text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.portfolio_query_visits(timestamptz, timestamptz, text, text, integer) from public, anon, authenticated, service_role;
grant execute on function public.portfolio_record_visit(uuid, text, text, text, text, text, text) to service_role;
grant execute on function public.portfolio_query_visits(timestamptz, timestamptz, text, text, integer) to service_role;

-- 有 pg_cron 时直接建立定期物理删除，无访问时也不会永久保留原始 IP。
-- 没启用时，在 Supabase Dashboard > Database > Extensions 启用 pg_cron 后再执行：
-- select cron.schedule('portfolio-visits-retention', '*/10 * * * *',
--   $$delete from public.portfolio_visits where visited_at < now() - interval '30 days'$$);
-- 也可由既有数据库管理调度器每 10 分钟执行该 DELETE；不要仅依赖查询隐藏过期记录。
do $schedule$
begin
  if exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    execute 'select cron.schedule($1, $2, $3)' using
      'portfolio-visits-retention', '*/10 * * * *',
      'delete from public.portfolio_visits where visited_at < now() - interval ''30 days''';
  else
    raise notice 'Enable pg_cron and schedule portfolio-visits-retention before enabling production collection (see migration comments).';
  end if;
end;
$schedule$;

commit;
