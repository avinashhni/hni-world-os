create extension if not exists pgcrypto;

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  status text not null default 'active' check (status in ('active','suspended','archived')),
  created_at timestamptz not null default now()
);

create table if not exists public.organizational_units (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  parent_unit_id uuid references public.organizational_units(id) on delete set null,
  unit_type text not null check (unit_type in ('country','franchise','branch','city')),
  code text not null,
  name text not null,
  country text,
  city text,
  timezone text,
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  role_key text not null,
  role_name text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, role_key)
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  permission_key text not null unique,
  permission_area text not null,
  description text
);

create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  unique (tenant_id, role_id, permission_id)
);

create table if not exists public.user_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  auth_user_id uuid unique,
  unit_id uuid references public.organizational_units(id) on delete set null,
  full_name text not null,
  email text not null,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, email)
);

create table if not exists public.user_role_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.user_accounts(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unique (tenant_id, user_id, role_id)
);

create table if not exists public.crm_customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_code text not null,
  customer_type text not null default 'individual' check (customer_type in ('individual','corporate')),
  full_name text not null,
  email text,
  phone text,
  city text,
  country text,
  lifecycle_stage text not null default 'new',
  created_at timestamptz not null default now(),
  unique (tenant_id, customer_code)
);

create table if not exists public.crm_leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid references public.crm_customers(id) on delete set null,
  source text not null,
  module_type text not null check (module_type in ('travel','service','medical','education','legal','gaming')),
  pipeline_stage text not null default 'new',
  score numeric(6,2) not null default 0,
  owner_user_id uuid references public.user_accounts(id) on delete set null,
  expected_value numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  vendor_code text not null,
  vendor_name text not null,
  vendor_type text not null,
  email text,
  phone text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique (tenant_id, vendor_code)
);

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  vendor_id uuid references public.vendors(id) on delete set null,
  customer_id uuid references public.crm_customers(id) on delete set null,
  contract_number text not null,
  module_type text not null,
  start_date date not null,
  end_date date,
  amount numeric(14,2) not null default 0,
  currency text not null default 'INR',
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  unique (tenant_id, contract_number)
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  booking_number text not null,
  customer_id uuid not null references public.crm_customers(id) on delete restrict,
  lead_id uuid references public.crm_leads(id) on delete set null,
  module_type text not null check (module_type in ('travel','service','medical','education','legal')),
  current_state text not null default 'SEARCH',
  status text not null default 'open',
  gross_amount numeric(14,2) not null default 0,
  cost_amount numeric(14,2) not null default 0,
  currency text not null default 'INR',
  created_at timestamptz not null default now(),
  unique (tenant_id, booking_number)
);

create table if not exists public.booking_state_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  from_state text,
  to_state text not null,
  event_name text not null,
  actor_user_id uuid references public.user_accounts(id) on delete set null,
  transition_status text not null default 'success',
  failure_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.finance_ledger_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  account_code text not null,
  account_name text not null,
  account_type text not null check (account_type in ('asset','liability','equity','income','expense')),
  created_at timestamptz not null default now(),
  unique (tenant_id, account_code)
);

create table if not exists public.finance_journal_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  entry_number text not null,
  entry_date date not null default current_date,
  narrative text,
  created_by uuid references public.user_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tenant_id, entry_number)
);

create table if not exists public.finance_journal_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  journal_entry_id uuid not null references public.finance_journal_entries(id) on delete cascade,
  ledger_account_id uuid not null references public.finance_ledger_accounts(id) on delete restrict,
  line_type text not null check (line_type in ('debit','credit')),
  amount numeric(14,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.finance_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  customer_id uuid not null references public.crm_customers(id) on delete restrict,
  invoice_number text not null,
  invoice_date date not null default current_date,
  subtotal numeric(14,2) not null default 0,
  gst_rate numeric(5,2) not null default 18,
  gst_amount numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  unique (tenant_id, invoice_number)
);

create table if not exists public.finance_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  invoice_id uuid not null references public.finance_invoices(id) on delete cascade,
  gateway text not null,
  gateway_reference text,
  paid_amount numeric(14,2) not null,
  paid_at timestamptz,
  reconciliation_status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.workflow_definitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  workflow_key text not null,
  workflow_name text not null,
  module_type text not null,
  states jsonb not null,
  transitions jsonb not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, workflow_key)
);

create table if not exists public.workflow_instances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  workflow_definition_id uuid not null references public.workflow_definitions(id) on delete restrict,
  entity_type text not null,
  entity_id uuid not null,
  current_state text not null,
  retry_count int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workflow_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  workflow_instance_id uuid not null references public.workflow_instances(id) on delete cascade,
  event_name text not null,
  payload jsonb not null default '{}'::jsonb,
  event_status text not null default 'queued' check (event_status in ('queued','running','completed','failed')),
  error_message text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  module_type text not null,
  title text not null,
  assignee_user_id uuid references public.user_accounts(id) on delete set null,
  due_at timestamptz,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references public.user_accounts(id) on delete cascade,
  channel text not null check (channel in ('email','whatsapp','in_app')),
  title text not null,
  payload jsonb not null default '{}'::jsonb,
  delivery_status text not null default 'queued',
  created_at timestamptz not null default now()
);

create table if not exists public.ai_prompts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  prompt_key text not null,
  system_prompt text not null,
  role_scope text not null,
  temperature numeric(3,2) not null default 0.20,
  created_at timestamptz not null default now(),
  unique (tenant_id, prompt_key)
);

create table if not exists public.ai_executions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  prompt_id uuid references public.ai_prompts(id) on delete set null,
  actor_user_id uuid references public.user_accounts(id) on delete set null,
  module_type text not null,
  input_payload jsonb not null,
  output_payload jsonb,
  decision jsonb,
  status text not null default 'queued',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.integration_providers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider_key text not null,
  provider_type text not null,
  base_url text,
  auth_type text,
  status_note text not null default 'READY FOR LIVE API KEY',
  created_at timestamptz not null default now(),
  unique (tenant_id, provider_key)
);

create table if not exists public.integration_webhooks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider_id uuid not null references public.integration_providers(id) on delete cascade,
  event_name text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed boolean not null default false
);

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_user_id uuid references public.user_accounts(id) on delete set null,
  module_type text not null,
  event_name text not null,
  entity_type text,
  entity_id uuid,
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.analytics_kpi_daily (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  metric_date date not null,
  module_type text not null,
  bookings_count int not null default 0,
  revenue_total numeric(14,2) not null default 0,
  invoices_count int not null default 0,
  leads_count int not null default 0,
  unique (tenant_id, metric_date, module_type)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_user_id uuid references public.user_accounts(id) on delete set null,
  source_system text not null default 'COPSPOWER',
  action text not null,
  entity_type text not null,
  entity_id uuid,
  action_payload jsonb not null default '{}'::jsonb,
  ip_address inet,
  created_at timestamptz not null default now()
);

create table if not exists public.job_queue (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  queue_name text not null,
  payload jsonb not null,
  status text not null default 'queued',
  attempts int not null default 0,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_accounts_tenant on public.user_accounts(tenant_id);
create index if not exists idx_crm_leads_tenant_stage on public.crm_leads(tenant_id, pipeline_stage);
create index if not exists idx_bookings_tenant_state on public.bookings(tenant_id, current_state);
create index if not exists idx_booking_state_history_booking on public.booking_state_history(booking_id, created_at desc);
create index if not exists idx_finance_lines_entry on public.finance_journal_lines(journal_entry_id);
create index if not exists idx_workflow_events_status on public.workflow_events(event_status, created_at);
create index if not exists idx_notifications_user_status on public.notifications(user_id, delivery_status);
create index if not exists idx_ai_executions_status on public.ai_executions(status, created_at);
create index if not exists idx_analytics_events_tenant_time on public.analytics_events(tenant_id, created_at desc);
create index if not exists idx_audit_logs_tenant_time on public.audit_logs(tenant_id, created_at desc);
create index if not exists idx_job_queue_status_available on public.job_queue(status, available_at);

create or replace function public.calculate_invoice_totals(invoice_subtotal numeric, gst_rate numeric)
returns table(gst_amount numeric, total_amount numeric)
language plpgsql
as $$
begin
  gst_amount := round((invoice_subtotal * gst_rate / 100.0)::numeric, 2);
  total_amount := round((invoice_subtotal + gst_amount)::numeric, 2);
  return next;
end;
$$;

create or replace function public.calculate_booking_profit(p_booking_id uuid)
returns table(booking_id uuid, gross_amount numeric, cost_amount numeric, profit_amount numeric)
language sql
as $$
  select b.id, b.gross_amount, b.cost_amount, round((b.gross_amount - b.cost_amount)::numeric, 2)
  from public.bookings b
  where b.id = p_booking_id;
$$;

create or replace function public.validate_journal_balance(p_journal_entry_id uuid)
returns boolean
language sql
as $$
  with totals as (
    select
      coalesce(sum(case when line_type = 'debit' then amount end), 0) as total_debit,
      coalesce(sum(case when line_type = 'credit' then amount end), 0) as total_credit
    from public.finance_journal_lines
    where journal_entry_id = p_journal_entry_id
  )
  select total_debit = total_credit from totals;
$$;
