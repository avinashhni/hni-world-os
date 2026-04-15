create table if not exists public.error_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  source_system text not null,
  source_entity text not null,
  source_entity_id uuid,
  severity text not null default 'error' check (severity in ('info','warning','error','critical')),
  error_code text,
  error_message text not null,
  error_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.monitoring_alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  alert_type text not null,
  severity text not null default 'warning' check (severity in ('info','warning','critical')),
  title text not null,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open','acknowledged','resolved')),
  escalation_target text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.worker_health_metrics (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  worker_name text not null,
  heartbeat_at timestamptz not null default now(),
  jobs_claimed int not null default 0,
  jobs_processed int not null default 0,
  jobs_failed int not null default 0,
  jobs_dead_lettered int not null default 0,
  meta jsonb not null default '{}'::jsonb
);

create table if not exists public.api_status_checks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  service_name text not null,
  route_key text not null,
  status text not null check (status in ('ok','warning','error')),
  latency_ms int,
  status_payload jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now()
);

create table if not exists public.queue_depth_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  queue_name text not null,
  queued_count int not null default 0,
  running_count int not null default 0,
  failed_count int not null default 0,
  completed_count int not null default 0,
  sampled_at timestamptz not null default now()
);

create table if not exists public.admin_override_actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  target_type text not null,
  target_id uuid,
  override_action text not null,
  reason text not null,
  requested_by uuid references public.user_accounts(id) on delete set null,
  approved_by uuid references public.user_accounts(id) on delete set null,
  status text not null default 'requested' check (status in ('requested','approved','rejected','executed')),
  created_at timestamptz not null default now(),
  executed_at timestamptz
);

create table if not exists public.emergency_controls (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  control_key text not null,
  is_active boolean not null default false,
  activated_by uuid references public.user_accounts(id) on delete set null,
  activated_at timestamptz,
  notes text,
  unique (tenant_id, control_key)
);

create table if not exists public.retry_execution_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  queue_job_id uuid,
  source text not null,
  reason text not null,
  requested_by uuid references public.user_accounts(id) on delete set null,
  status text not null default 'queued' check (status in ('queued','running','completed','failed')),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists idx_error_logs_tenant_time on public.error_logs(tenant_id, created_at desc);
create index if not exists idx_monitoring_alerts_open on public.monitoring_alerts(tenant_id, status, created_at desc);
create index if not exists idx_worker_health_metrics_worker_time on public.worker_health_metrics(worker_name, heartbeat_at desc);
create index if not exists idx_api_status_checks_service_time on public.api_status_checks(service_name, checked_at desc);
create index if not exists idx_queue_depth_snapshots_queue_time on public.queue_depth_snapshots(queue_name, sampled_at desc);
create index if not exists idx_admin_override_actions_status on public.admin_override_actions(status, created_at desc);
create index if not exists idx_retry_execution_requests_status on public.retry_execution_requests(status, created_at desc);

alter table public.error_logs enable row level security;
alter table public.monitoring_alerts enable row level security;
alter table public.worker_health_metrics enable row level security;
alter table public.api_status_checks enable row level security;
alter table public.queue_depth_snapshots enable row level security;
alter table public.admin_override_actions enable row level security;
alter table public.emergency_controls enable row level security;
alter table public.retry_execution_requests enable row level security;

drop policy if exists error_logs_tenant_policy on public.error_logs;
create policy error_logs_tenant_policy on public.error_logs
for all to authenticated
using (tenant_id = public.current_tenant_id())
with check (tenant_id = public.current_tenant_id());

drop policy if exists monitoring_alerts_tenant_policy on public.monitoring_alerts;
create policy monitoring_alerts_tenant_policy on public.monitoring_alerts
for all to authenticated
using (tenant_id = public.current_tenant_id())
with check (tenant_id = public.current_tenant_id());

drop policy if exists worker_health_metrics_tenant_policy on public.worker_health_metrics;
create policy worker_health_metrics_tenant_policy on public.worker_health_metrics
for all to authenticated
using (tenant_id is null or tenant_id = public.current_tenant_id())
with check (tenant_id is null or tenant_id = public.current_tenant_id());

drop policy if exists api_status_checks_tenant_policy on public.api_status_checks;
create policy api_status_checks_tenant_policy on public.api_status_checks
for all to authenticated
using (tenant_id is null or tenant_id = public.current_tenant_id())
with check (tenant_id is null or tenant_id = public.current_tenant_id());

drop policy if exists queue_depth_snapshots_tenant_policy on public.queue_depth_snapshots;
create policy queue_depth_snapshots_tenant_policy on public.queue_depth_snapshots
for all to authenticated
using (tenant_id is null or tenant_id = public.current_tenant_id())
with check (tenant_id is null or tenant_id = public.current_tenant_id());

drop policy if exists admin_override_actions_tenant_policy on public.admin_override_actions;
create policy admin_override_actions_tenant_policy on public.admin_override_actions
for all to authenticated
using (tenant_id = public.current_tenant_id())
with check (tenant_id = public.current_tenant_id());

drop policy if exists emergency_controls_tenant_policy on public.emergency_controls;
create policy emergency_controls_tenant_policy on public.emergency_controls
for all to authenticated
using (tenant_id = public.current_tenant_id())
with check (tenant_id = public.current_tenant_id());

drop policy if exists retry_execution_requests_tenant_policy on public.retry_execution_requests;
create policy retry_execution_requests_tenant_policy on public.retry_execution_requests
for all to authenticated
using (tenant_id = public.current_tenant_id())
with check (tenant_id = public.current_tenant_id());
