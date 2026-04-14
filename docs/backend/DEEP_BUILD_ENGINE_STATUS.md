# HNI WORLD OS Deep Build Engine Status

## Scope
This document tracks production backend assets delivered for deep-build execution mode.

## Backend Assets Delivered

### Database foundation
- Multi-tenant entities: `tenants`, `organizational_units`, `user_accounts`.
- Governance entities: `roles`, `permissions`, `role_permissions`, `user_role_assignments`.
- Domain entities: `crm_customers`, `crm_leads`, `bookings`, `vendors`, `contracts`, `finance_*`, `workflow_*`, `analytics_*`, `ai_*`, `audit_logs`, `job_queue`.
- Financial functions: invoice GST totals, booking profit, balanced journal validation.
- Integration registry with status lock: `READY FOR LIVE API KEY`.

### API execution layer
Implemented edge function router at `supabase/functions/core-api/index.ts`.

Supported executable routes:
- `POST /core-api/crm/upsert`
- `POST /core-api/bookings/create`
- `POST /core-api/finance/invoice`
- `POST /core-api/workflows/transition`
- `POST /core-api/integrations/providers`
- `POST /core-api/analytics/track`
- `POST /core-api/ai/execute`

### Workflow engine behavior
- Booking transition guard: `SEARCH -> HOLD -> CONFIRM -> TICKET -> COMPLETE`.
- Failed transition logging in `booking_state_history` with failure reason.
- Workflow event persistence tables for async event-driven execution.

### Security and governance
- RLS enabled across deep-build tables.
- Tenant isolation policy using `current_tenant_id()`.
- Role gates at API layer before data writes.
- COPSPOWER audit-ready table (`audit_logs`) for action tracing.

### Performance and scalability primitives
- Indexed hot paths (tenant, state, status, time).
- Queue table (`job_queue`) for async job processing.
- Integration webhook ingestion table for eventual processing workers.

## Pending live integrations
- Expedia / Hotelbeds credentials.
- Stripe / Razorpay credentials.
- Twilio WhatsApp credentials.
- SMTP relay credentials.
- LLM provider secret keys.

All provider rows must remain marked `READY FOR LIVE API KEY` until secrets are provisioned.
