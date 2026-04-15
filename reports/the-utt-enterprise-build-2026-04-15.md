# THE UTT Enterprise Build — 2026-04-15

## A. System Architecture (THE UTT)
- Multi-tenant domain service built under MUSKI Core Runtime with tenant-isolated state stores for users, suppliers, offers, itineraries, bookings, CRM leads, invoices, audit events, and telemetry signals.
- Layered flow:
  - MUSKI command routing -> THE UTT module -> worker execution.
  - COPSPOWER-compatible governance checks via tenant + role scope validation.
  - Booking domain linked to CRM conversion and finance invoice lifecycle.
- Role and layer model:
  - Roles: Admin, Agent, Corporate User.
  - Layers: B2C public booking flow, B2B agent-led booking flow, Corporate control flow.

## B. Modules Built (Full Breakdown)
1. Customer Layers
   - User registry with role + permission scopes and customer-layer assignment.
2. Search + Inventory Engine
   - Multi-supplier ingestion support for Expedia, Hotelbeds, WebBeds, and manual inventory mode.
   - Hotel aggregation, supplier comparison, margin-ready sell-rate computation, availability filtering.
3. Quotation + Itinerary Engine
   - Dynamic itinerary quote generation for multi-room + multi-night.
   - CWB/CNB child policy pricing and per-person/per-family totals.
   - PDF-ready payload format emitted from quote engine.
4. Booking Engine (Full Lifecycle)
   - Search -> Select -> Hold -> Confirm -> Payment -> Voucher modeled as stage/status transitions.
   - Hold expiry metadata + expiry check path.
5. Supplier / Vendor Module
   - Supplier onboarding with contract terms and hybrid API/manual flags.
   - Supplier readiness + performance score capture.
6. CRM + Customer Intelligence
   - Lead -> inquiry/converted state model with booking linkage.
   - Tenant-safe identity linkage through customerId scoped to tenant.
7. Finance Engine (V15 linked structure)
   - Invoice generation with cost vs sell, margin amount, GST amount, subtotal.
   - Payment tracking with state transition pending -> paid.
8. Role-Based System
   - Permission scope validation per tenant and action.
9. MUSKI Integration
   - Command route generation string: MUSKI -> THE_UTT -> Module -> Worker AI.
   - Escalation/recommendation engine for critical intents.
10. COPSPOWER Governance
   - Critical audit trail for tenant-scope violations and scope denial.
11. Telemetry + Monitoring
   - booking_log, error_control, queue_perf, audit_event signal families.

## C. Backend & Data Flow
- `UttEnterpriseOsService` holds orchestration and domain state with strict tenant keys.
- Aggregated offer IDs feed itinerary room selection.
- Itinerary IDs feed booking lifecycle execution.
- Booking IDs feed CRM conversion and finance invoice generation.
- Every critical action emits audit and/or telemetry records.

## D. Booking Lifecycle Execution
1. Search request accepted with dates, rooms, pax, filters.
2. Supplier offers compared and normalized to aggregated offers.
3. Offer selected into itinerary pricing engine.
4. Booking hold created with expiry timestamp.
5. Confirmation and payment captured.
6. Voucher reference generated.
7. Booking log telemetry emitted with stage history.

## E. Supplier Integration Readiness
- Supplier contracts include commission, API enabled flag, manual inventory flag.
- Supports API + manual hybrid model for each supplier record.
- Aggregation accepts mixed supplier feeds with consistent normalized output.

## F. CRM + Finance + Identity Integration
- Converted lead record ties customer identity and booking.
- Invoice links booking with cost/sell/margin/GST and payment status.
- Tenant-safe identity flow enforced through tenant-bound records.

## G. MUSKI + COPSPOWER Integration
- MUSKI command router classifies critical intents for escalation.
- Governance role checker blocks cross-tenant and missing-scope actions.
- Audit events provide traceability for control decisions.

## H. Telemetry + Monitoring Layer
- Booking lifecycle telemetry for operational visibility.
- Queue depth metric ingestion for performance tracking.
- Audit event telemetry for governance observability.

## I. Remaining Gaps (if any)
- External supplier adapters for live Expedia/Hotelbeds/WebBeds APIs require connector implementation and credentials.
- Persistent database storage layer is not yet wired (current implementation is in-memory runtime).
- Async reminder worker for hold-expiry notifications needs scheduling integration.
- Payment gateway adapter abstraction can be expanded for production PSP integrations.

## J. Final Status
- CORE UTT READY FOR NEXT MODULE
