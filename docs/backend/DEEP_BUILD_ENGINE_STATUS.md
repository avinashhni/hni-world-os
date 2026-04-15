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

Integration provider runtime now includes:
- Request builders per provider category (travel, payment, WhatsApp, email, AI).
- Response normalization contracts with unified status mapping.
- Explicit retry policy with status-aware backoff profiles.
- Error mapping (`timeout`, `unauthorized`, `rate_limit`, `unknown`).
- Execution flow stages (`build_request -> execute -> normalize_response -> handle_error -> retry_or_finalize`).

Async integration execution worker at `supabase/functions/job-worker/index.ts` now supports:
- Runtime request payload builders.
- Live API execution when `PROVIDER_<KEY>_KEY` and base URL are present.
- Safe execution-ready mode (`READY FOR LIVE API KEY`) when secrets are still pending.
- Retry with exponential backoff and transient status handling.
- Normalized webhook payload persistence for downstream adapters.

### Workflow engine behavior
- Booking transition guard: `SEARCH -> HOLD -> CONFIRM -> EXECUTE -> COMPLETE -> AUDIT`.
- Failed transition logging in `booking_state_history` with failure reason.
- Workflow event persistence tables for async event-driven execution.
- Failure capture table: `error_logs` with source-level severity tracking.
- Retry and dead-letter handling active via `job_queue` + `job_dead_letters`.

### Security and governance
- RLS enabled across deep-build tables.
- Tenant isolation policy using `current_tenant_id()`.
- Role gates at API layer before data writes.
- COPSPOWER audit-ready table (`audit_logs`) for action tracing.

### Performance and scalability primitives
- Indexed hot paths (tenant, state, status, time).
- Queue table (`job_queue`) for async job processing.
- Integration webhook ingestion table for eventual processing workers.
- Monitoring tables for enterprise control plane:
  - `monitoring_alerts`
  - `worker_health_metrics`
  - `api_status_checks`
  - `queue_depth_snapshots`
  - `admin_override_actions`
  - `emergency_controls`
  - `retry_execution_requests`

## Pending live integrations
- Expedia / Hotelbeds credentials.
- Stripe / Razorpay credentials.
- Twilio WhatsApp credentials.
- SMTP relay credentials.
- LLM provider secret keys.

All provider rows must remain marked `READY FOR LIVE API KEY` until secrets are provisioned.
