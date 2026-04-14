insert into public.permissions (permission_key, permission_area, description)
values
('crm.manage', 'crm', 'Create and update CRM customers and leads'),
('booking.manage', 'bookings', 'Create bookings and run transitions'),
('finance.manage', 'finance', 'Create invoices and journal entries'),
('workflow.manage', 'workflows', 'Advance workflow state machine transitions'),
('integrations.manage', 'integrations', 'Manage integration provider configurations'),
('analytics.track', 'analytics', 'Track operational and KPI events'),
('ai.execute', 'ai', 'Execute MUSKI prompt pipelines')
on conflict (permission_key) do update set
  permission_area = excluded.permission_area,
  description = excluded.description;

-- The following workflow definitions are tenant-scoped and should be inserted per tenant in deployment pipelines.
-- Booking lifecycle: SEARCH -> HOLD -> CONFIRM -> TICKET -> COMPLETE
-- Legal lifecycle: INTAKE -> REVIEW -> HEARING -> VERDICT -> APPEAL
-- Education lifecycle: LEAD -> PROFILE -> APPLICATION -> OFFER -> VISA -> ENROLL
