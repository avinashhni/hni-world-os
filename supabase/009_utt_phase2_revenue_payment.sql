-- UTT Phase 2 persistence tables: bookings, payments, suppliers, invoices.
-- Structure-first migration to support API + payment + revenue + invoice lifecycle.

create table if not exists public.utt_bookings (
  id bigint generated always as identity primary key,
  tenant_id text not null,
  booking_id text not null,
  search_id text not null,
  customer_id text not null,
  supplier_code text not null,
  status text not null,
  stage text not null,
  payment_id text,
  payment_status text,
  payment_gateway text,
  cost_amount numeric(12,2) not null,
  sell_amount numeric(12,2) not null,
  margin_amount numeric(12,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, booking_id)
);

create table if not exists public.utt_payments (
  id bigint generated always as identity primary key,
  tenant_id text not null,
  payment_id text not null,
  booking_id text not null,
  payment_gateway text not null,
  payment_status text not null,
  amount numeric(12,2) not null,
  currency text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, payment_id)
);

create table if not exists public.utt_suppliers (
  id bigint generated always as identity primary key,
  tenant_id text not null,
  supplier_code text not null,
  supplier_name text not null,
  onboarding_status text not null,
  api_enabled boolean not null default false,
  health_status text not null default 'unknown',
  updated_at timestamptz not null default now(),
  unique (tenant_id, supplier_code)
);

create table if not exists public.utt_invoices (
  id bigint generated always as identity primary key,
  tenant_id text not null,
  invoice_id text not null,
  booking_id text not null,
  customer_id text not null,
  amount numeric(12,2) not null,
  gst_amount numeric(12,2) not null,
  total_amount numeric(12,2) not null,
  vendor_payable numeric(12,2) not null,
  margin_amount numeric(12,2) not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, invoice_id)
);

create index if not exists idx_utt_bookings_tenant_status on public.utt_bookings (tenant_id, status);
create index if not exists idx_utt_payments_tenant_status on public.utt_payments (tenant_id, payment_status);
create index if not exists idx_utt_invoices_tenant_booking on public.utt_invoices (tenant_id, booking_id);
