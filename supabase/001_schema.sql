create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'public_user',
  full_name text,
  email text,
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  organization_type text not null default 'law_firm',
  name text not null,
  established_year int,
  total_staff_count int default 0,
  combined_team_experience_years int default 0,
  city text,
  state text,
  country text default 'India',
  geo_code text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.partner_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  partner_type text not null default 'advocate',
  qualification text,
  years_experience int default 0,
  bar_council_number text,
  enrollment_year int,
  specialization text[],
  languages text[],
  service_modes text[],
  office_address text,
  city text,
  state text,
  country text default 'India',
  geo_code text,
  radius_km int default 3,
  verified_status text not null default 'pending',
  is_notary boolean not null default false,
  available_now boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.b2c_intakes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  intake_type text not null,
  full_name text,
  email text,
  phone text,
  category text,
  urgency text,
  preferred_language text,
  summary text,
  desired_outcome text,
  city text,
  state text,
  country text default 'India',
  geo_code text,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  intake_id uuid references public.b2c_intakes(id) on delete set null,
  lead_type text not null,
  category text,
  urgency text,
  city text,
  state text,
  country text default 'India',
  geo_code text,
  budget_band text,
  premium boolean not null default false,
  status text not null default 'open',
  assigned_partner_id uuid references public.partner_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.matters (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  intake_id uuid references public.b2c_intakes(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  client_profile_id uuid references public.profiles(id) on delete set null,
  partner_profile_id uuid references public.partner_profiles(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  title text not null,
  category text,
  stage text not null default 'intake',
  priority text not null default 'normal',
  next_action text,
  next_deadline timestamptz,
  billing_status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  matter_id uuid references public.matters(id) on delete cascade,
  intake_id uuid references public.b2c_intakes(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  doc_type text,
  created_at timestamptz not null default now()
);

create table if not exists public.consultation_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  intake_id uuid references public.b2c_intakes(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  partner_profile_id uuid references public.partner_profiles(id) on delete set null,
  session_mode text not null default 'video',
  status text not null default 'scheduled',
  is_free_intro boolean not null default true,
  scheduled_for timestamptz,
  duration_minutes int not null default 5,
  summary text,
  created_at timestamptz not null default now()
);

create table if not exists public.billing_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  matter_id uuid not null references public.matters(id) on delete cascade,
  invoice_number text,
  amount numeric(12,2) not null default 0,
  currency text not null default 'INR',
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
