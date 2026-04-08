alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.partner_profiles enable row level security;
alter table public.b2c_intakes enable row level security;
alter table public.leads enable row level security;
alter table public.matters enable row level security;
alter table public.documents enable row level security;
alter table public.consultation_sessions enable row level security;
alter table public.billing_records enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
for select to authenticated
using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
for update to authenticated
using (auth.uid() = id);

drop policy if exists "partner_profiles_select_all" on public.partner_profiles;
create policy "partner_profiles_select_all" on public.partner_profiles
for select to authenticated
using (true);

drop policy if exists "b2c_intakes_insert_own" on public.b2c_intakes;
create policy "b2c_intakes_insert_own" on public.b2c_intakes
for insert to authenticated
with check (created_by = auth.uid());

drop policy if exists "b2c_intakes_select_own" on public.b2c_intakes;
create policy "b2c_intakes_select_own" on public.b2c_intakes
for select to authenticated
using (created_by = auth.uid());

drop policy if exists "leads_select_all" on public.leads;
create policy "leads_select_all" on public.leads
for select to authenticated
using (true);

drop policy if exists "matters_select_all" on public.matters;
create policy "matters_select_all" on public.matters
for select to authenticated
using (true);

drop policy if exists "documents_select_all" on public.documents;
create policy "documents_select_all" on public.documents
for select to authenticated
using (true);

drop policy if exists "consultation_sessions_select_all" on public.consultation_sessions;
create policy "consultation_sessions_select_all" on public.consultation_sessions
for select to authenticated
using (true);

drop policy if exists "billing_records_select_all" on public.billing_records;
create policy "billing_records_select_all" on public.billing_records
for select to authenticated
using (true);
