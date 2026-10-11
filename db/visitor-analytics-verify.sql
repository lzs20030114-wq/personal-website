-- 在执行 visitor-analytics.sql 的同一个数据库中，以数据库管理角色运行整个脚本。
-- 全程事务回滚：验证结束不留下测试访问，也不改动真实记录。
-- 本脚本未连接真实数据库执行；部署时必须执行，再检查最后的 cron 运行结果。
begin;

do $verify_permissions$
declare
  v_role text;
  v_record text := 'public.portfolio_record_visit(uuid,text,text,text,text,text,text)';
  v_query text := 'public.portfolio_query_visits(timestamptz,timestamptz,text,text,integer)';
begin
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.portfolio_visits'::regclass) then
    raise exception 'Visitor table RLS is disabled';
  end if;
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_table_privilege(v_role, 'public.portfolio_visits', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') then
      raise exception 'Unexpected direct table privilege: %', v_role;
    end if;
    if v_role <> 'service_role' and (has_function_privilege(v_role, v_record, 'EXECUTE')
      or has_function_privilege(v_role, v_query, 'EXECUTE')) then
      raise exception 'Unexpected RPC privilege: %', v_role;
    end if;
  end loop;
  if not has_function_privilege('service_role', v_record, 'EXECUTE')
    or not has_function_privilege('service_role', v_query, 'EXECUTE') then
    raise exception 'service_role cannot call visitor RPCs';
  end if;
end;
$verify_permissions$;

-- 文档示例保留网段，只在当前回滚事务中隔离这组测试数据。
delete from public.portfolio_visits where ip = '192.0.2.254'::inet;
insert into public.portfolio_visits (id, visited_at, path, ip)
values ('00000000-0000-4000-8000-000000000001', now() - interval '31 days', '/__visitor_verify__', '192.0.2.254');

set local role service_role;
do $verify_functions$
declare
  v_first uuid := gen_random_uuid();
  v_result jsonb;
  v_started timestamptz := clock_timestamp();
  v_i integer;
begin
  if not public.portfolio_record_visit(v_first, '/__visitor_verify__', '192.0.2.254') then
    raise exception 'First visit rejected';
  end if;
  if not public.portfolio_record_visit(v_first, '/__visitor_verify__', '192.0.2.254') then
    raise exception 'Idempotent retry rejected';
  end if;
  for v_i in 2..60 loop
    if not public.portfolio_record_visit(gen_random_uuid(), '/__visitor_verify__', '192.0.2.254') then
      raise exception 'Visit % incorrectly rate limited', v_i;
    end if;
  end loop;
  if public.portfolio_record_visit(gen_random_uuid(), '/__visitor_verify__', '192.0.2.254') then
    raise exception '61st visit bypassed rate limit';
  end if;
  v_result := public.portfolio_query_visits(null, null, '192.0.2.254', '/__visitor_verify__', 1);
  if (v_result->>'total')::integer <> 60 or (v_result->>'uniqueIps')::integer <> 1
    or jsonb_array_length(v_result->'records') <> 50 then
    raise exception 'Query totals, deduplication, retention or page size failed';
  end if;
  if (v_result->'records'->0->>'visitedAt')::timestamptz < v_started then
    raise exception 'Visit did not use server receive time';
  end if;
  v_result := public.portfolio_query_visits(null, null, '192.0.2.254', '/__visitor_verify__', 2);
  if (v_result->>'total')::integer <> 60 or jsonb_array_length(v_result->'records') <> 10 then
    raise exception 'Second page failed';
  end if;
  begin
    perform 1 from public.portfolio_visits limit 1;
    raise exception 'service_role unexpectedly read table directly';
  exception when insufficient_privilege then null;
  end;
end;
$verify_functions$;
reset role;

do $verify_cleanup$
declare
  v_scheduled boolean;
begin
  if exists (select 1 from public.portfolio_visits where id = '00000000-0000-4000-8000-000000000001') then
    raise exception 'Expired row was hidden instead of physically deleted';
  end if;
  if not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    raise exception 'Enable pg_cron and schedule portfolio-visits-retention before enabling collection';
  end if;
  execute 'select exists (select 1 from cron.job where jobname = $1 and active)'
    into v_scheduled using 'portfolio-visits-retention';
  if not v_scheduled then raise exception 'Retention cron job is missing or inactive'; end if;
end;
$verify_cleanup$;

rollback;

-- 首次计划执行后再运行；必须能看到 status = succeeded。
select r.status, r.start_time, r.end_time
from cron.job_run_details r join cron.job j on j.jobid = r.jobid
where j.jobname = 'portfolio-visits-retention'
order by r.start_time desc limit 5;
