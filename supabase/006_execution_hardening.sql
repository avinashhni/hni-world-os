alter table public.b2c_intakes add column if not exists tenant_id uuid references public.tenants(id) on delete cascade;
alter table public.leads add column if not exists tenant_id uuid references public.tenants(id) on delete cascade;
alter table public.matters add column if not exists tenant_id uuid references public.tenants(id) on delete cascade;
alter table public.documents add column if not exists tenant_id uuid references public.tenants(id) on delete cascade;
alter table public.consultation_sessions add column if not exists tenant_id uuid references public.tenants(id) on delete cascade;
alter table public.billing_records add column if not exists tenant_id uuid references public.tenants(id) on delete cascade;

create index if not exists idx_b2c_intakes_tenant on public.b2c_intakes(tenant_id, created_at desc);
create index if not exists idx_legacy_leads_tenant on public.leads(tenant_id, created_at desc);
create index if not exists idx_matters_tenant on public.matters(tenant_id, created_at desc);

update public.b2c_intakes i
set tenant_id = ua.tenant_id
from public.user_accounts ua
where ua.auth_user_id = i.created_by
  and i.tenant_id is null;

update public.leads l
set tenant_id = i.tenant_id
from public.b2c_intakes i
where l.intake_id = i.id
  and l.tenant_id is null;

update public.matters m
set tenant_id = coalesce(i.tenant_id, l.tenant_id)
from public.b2c_intakes i
left join public.leads l on l.id = m.lead_id
where m.intake_id = i.id
  and m.tenant_id is null;

update public.consultation_sessions c
set tenant_id = coalesce(i.tenant_id, l.tenant_id)
from public.b2c_intakes i
left join public.leads l on l.id = c.lead_id
where c.intake_id = i.id
  and c.tenant_id is null;

update public.documents d
set tenant_id = m.tenant_id
from public.matters m
where d.matter_id = m.id
  and d.tenant_id is null;

update public.billing_records b
set tenant_id = m.tenant_id
from public.matters m
where b.matter_id = m.id
  and b.tenant_id is null;

drop policy if exists "leads_select_all" on public.leads;
drop policy if exists "matters_select_all" on public.matters;
drop policy if exists "documents_select_all" on public.documents;
drop policy if exists "consultation_sessions_select_all" on public.consultation_sessions;
drop policy if exists "billing_records_select_all" on public.billing_records;
drop policy if exists "b2c_intakes_select_own" on public.b2c_intakes;
drop policy if exists "b2c_intakes_insert_own" on public.b2c_intakes;

create policy b2c_intakes_tenant_policy on public.b2c_intakes
for all to authenticated
using (tenant_id = public.current_tenant_id())
with check (tenant_id = public.current_tenant_id());

create policy leads_tenant_policy_legacy on public.leads
for all to authenticated
using (tenant_id = public.current_tenant_id())
with check (tenant_id = public.current_tenant_id());

create policy matters_tenant_policy_legacy on public.matters
for all to authenticated
using (tenant_id = public.current_tenant_id())
with check (tenant_id = public.current_tenant_id());

create policy documents_tenant_policy_legacy on public.documents
for all to authenticated
using (tenant_id = public.current_tenant_id())
with check (tenant_id = public.current_tenant_id());

create policy consultation_sessions_tenant_policy_legacy on public.consultation_sessions
for all to authenticated
using (tenant_id = public.current_tenant_id())
with check (tenant_id = public.current_tenant_id());

create policy billing_records_tenant_policy_legacy on public.billing_records
for all to authenticated
using (tenant_id = public.current_tenant_id())
with check (tenant_id = public.current_tenant_id());
