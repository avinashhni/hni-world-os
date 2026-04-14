create or replace function public.current_tenant_id()
returns uuid
language sql
stable
as $$
  select tenant_id from public.user_accounts where auth_user_id = auth.uid() limit 1;
$$;

alter table public.tenants enable row level security;
alter table public.organizational_units enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_accounts enable row level security;
alter table public.user_role_assignments enable row level security;
alter table public.crm_customers enable row level security;
alter table public.crm_leads enable row level security;
alter table public.vendors enable row level security;
alter table public.contracts enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_state_history enable row level security;
alter table public.finance_ledger_accounts enable row level security;
alter table public.finance_journal_entries enable row level security;
alter table public.finance_journal_lines enable row level security;
alter table public.finance_invoices enable row level security;
alter table public.finance_payments enable row level security;
alter table public.workflow_definitions enable row level security;
alter table public.workflow_instances enable row level security;
alter table public.workflow_events enable row level security;
alter table public.tasks enable row level security;
alter table public.notifications enable row level security;
alter table public.ai_prompts enable row level security;
alter table public.ai_executions enable row level security;
alter table public.integration_providers enable row level security;
alter table public.integration_webhooks enable row level security;
alter table public.analytics_events enable row level security;
alter table public.analytics_kpi_daily enable row level security;
alter table public.audit_logs enable row level security;
alter table public.job_queue enable row level security;

drop policy if exists tenant_select on public.tenants;
create policy tenant_select on public.tenants for select to authenticated using (id = public.current_tenant_id());

-- tenant-scoped read/write policies
create policy org_units_tenant_policy on public.organizational_units for all to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy roles_tenant_policy on public.roles for all to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy role_permissions_tenant_policy on public.role_permissions for all to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy users_tenant_policy on public.user_accounts for all to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy user_roles_tenant_policy on public.user_role_assignments for all to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy customers_tenant_policy on public.crm_customers for all to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy leads_tenant_policy on public.crm_leads for all to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy vendors_tenant_policy on public.vendors for all to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy contracts_tenant_policy on public.contracts for all to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy bookings_tenant_policy on public.bookings for all to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy booking_history_tenant_policy on public.booking_state_history for all to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy ledger_accounts_tenant_policy on public.finance_ledger_accounts for all to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy journal_entries_tenant_policy on public.finance_journal_entries for all to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy journal_lines_tenant_policy on public.finance_journal_lines for all to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy invoices_tenant_policy on public.finance_invoices for all to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy payments_tenant_policy on public.finance_payments for all to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy workflows_tenant_policy on public.workflow_definitions for all to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy workflow_instances_tenant_policy on public.workflow_instances for all to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy workflow_events_tenant_policy on public.workflow_events for all to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy tasks_tenant_policy on public.tasks for all to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy notifications_tenant_policy on public.notifications for all to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy ai_prompts_tenant_policy on public.ai_prompts for all to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy ai_exec_tenant_policy on public.ai_executions for all to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy integrations_tenant_policy on public.integration_providers for all to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy webhook_tenant_policy on public.integration_webhooks for all to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy analytics_events_tenant_policy on public.analytics_events for all to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy analytics_kpi_tenant_policy on public.analytics_kpi_daily for all to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy audit_tenant_policy on public.audit_logs for all to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy queue_tenant_policy on public.job_queue for all to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());

-- global read access for permission dictionary
create policy permissions_catalog_read on public.permissions for select to authenticated using (true);
