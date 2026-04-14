-- Phase 20: Performance & Scale hardening for 1M-100M user readiness.

create index if not exists idx_job_queue_claim
  on public.job_queue (status, queue_name, priority desc, available_at asc)
  where status in ('queued', 'retrying');

create index if not exists idx_job_queue_tenant_status
  on public.job_queue (tenant_id, status, updated_at desc);

create index if not exists idx_ai_executions_tenant_status
  on public.ai_executions (tenant_id, status, created_at desc);

create index if not exists idx_workflow_events_ready
  on public.workflow_events (tenant_id, event_status, created_at asc)
  where event_status in ('queued', 'running');

create index if not exists idx_muski_commands_ready
  on public.muski_commands (tenant_id, status, priority desc, created_at asc)
  where status in ('queued', 'running');

create index if not exists idx_analytics_events_tenant_created
  on public.analytics_events (tenant_id, created_at desc);

create materialized view if not exists public.job_queue_backlog_mv as
select
  tenant_id,
  queue_name,
  status,
  count(*) as total_jobs,
  max(available_at) as latest_available_at,
  min(created_at) as oldest_created_at
from public.job_queue
group by tenant_id, queue_name, status;

create unique index if not exists idx_job_queue_backlog_mv_unique
  on public.job_queue_backlog_mv (tenant_id, queue_name, status);

create or replace function public.refresh_job_queue_backlog_mv()
returns void
language plpgsql
security definer
as $$
begin
  refresh materialized view concurrently public.job_queue_backlog_mv;
end;
$$;
