insert into public.permissions (permission_key, permission_area, description)
values
('crm.manage', 'crm', 'Create and update CRM customers and leads'),
('booking.manage', 'bookings', 'Create bookings and run transitions'),
('finance.manage', 'finance', 'Create invoices and journal entries'),
('workflow.manage', 'workflows', 'Advance workflow state machine transitions'),
('integrations.manage', 'integrations', 'Manage integration provider configurations'),
('analytics.track', 'analytics', 'Track operational and KPI events'),
('ai.execute', 'ai', 'Execute MUSKI prompt pipelines'),
('legal.execute', 'legal', 'Execute legal lifecycle transitions'),
('education.execute', 'education', 'Execute education lifecycle transitions'),
('approval.execute', 'copspower', 'Approve gated operational actions')
on conflict (permission_key) do update set
  permission_area = excluded.permission_area,
  description = excluded.description;

with tenant_rows as (
  select id as tenant_id from public.tenants
), workflow_rows as (
  select
    tenant_id,
    w.workflow_key,
    w.workflow_name,
    w.module_type,
    w.states::jsonb as states,
    w.transitions::jsonb as transitions
  from tenant_rows
  cross join (
    values
      (
        'booking.lifecycle',
        'Booking Lifecycle',
        'travel',
        '["SEARCH","HOLD","CONFIRM","TICKET","COMPLETE"]',
        '[
          {"from":"SEARCH","to":"HOLD","event":"booking.hold","guard":"inventory_available","retry":{"max_attempts":3,"backoff_seconds":30},"escalate_to":"OPS_MANAGER_AI"},
          {"from":"HOLD","to":"CONFIRM","event":"booking.confirm","guard":"payment_authorized","retry":{"max_attempts":3,"backoff_seconds":60},"escalate_to":"FINANCE_MANAGER_AI"},
          {"from":"CONFIRM","to":"TICKET","event":"booking.ticket","guard":"supplier_ticketed","retry":{"max_attempts":5,"backoff_seconds":120},"escalate_to":"TRAVEL_MANAGER_AI"},
          {"from":"TICKET","to":"COMPLETE","event":"booking.complete","guard":"travel_completed","retry":{"max_attempts":1,"backoff_seconds":0},"escalate_to":"OPS_MANAGER_AI"}
        ]'
      ),
      (
        'legal.lifecycle',
        'Legal Lifecycle',
        'legal',
        '["INTAKE","REVIEW","HEARING","VERDICT","APPEAL"]',
        '[
          {"from":"INTAKE","to":"REVIEW","event":"legal.review_start","guard":"intake_validated","retry":{"max_attempts":2,"backoff_seconds":60},"escalate_to":"LEGAL_MANAGER_AI"},
          {"from":"REVIEW","to":"HEARING","event":"legal.hearing_schedule","guard":"counsel_assigned","retry":{"max_attempts":3,"backoff_seconds":300},"escalate_to":"LEGAL_HEAD_AI"},
          {"from":"HEARING","to":"VERDICT","event":"legal.verdict_publish","guard":"hearing_completed","retry":{"max_attempts":2,"backoff_seconds":600},"escalate_to":"LEGAL_HEAD_AI"},
          {"from":"VERDICT","to":"APPEAL","event":"legal.appeal_open","guard":"appeal_requested","retry":{"max_attempts":1,"backoff_seconds":0},"escalate_to":"COPSPOWER_APPROVAL_AI"}
        ]'
      ),
      (
        'education.lifecycle',
        'Education Lifecycle',
        'education',
        '["LEAD","PROFILE","APPLICATION","OFFER","VISA","ENROLL"]',
        '[
          {"from":"LEAD","to":"PROFILE","event":"edu.profile_start","guard":"lead_qualified","retry":{"max_attempts":2,"backoff_seconds":120},"escalate_to":"EDU_MANAGER_AI"},
          {"from":"PROFILE","to":"APPLICATION","event":"edu.application_submit","guard":"documents_complete","retry":{"max_attempts":3,"backoff_seconds":240},"escalate_to":"COUNSELOR_MANAGER_AI"},
          {"from":"APPLICATION","to":"OFFER","event":"edu.offer_received","guard":"institution_response","retry":{"max_attempts":5,"backoff_seconds":3600},"escalate_to":"EDU_MANAGER_AI"},
          {"from":"OFFER","to":"VISA","event":"edu.visa_process","guard":"offer_accepted","retry":{"max_attempts":3,"backoff_seconds":1800},"escalate_to":"VISA_MANAGER_AI"},
          {"from":"VISA","to":"ENROLL","event":"edu.enrollment_confirm","guard":"visa_approved","retry":{"max_attempts":2,"backoff_seconds":600},"escalate_to":"EDU_MANAGER_AI"}
        ]'
      ),
      (
        'crm.followup.lifecycle',
        'CRM Follow-up Lifecycle',
        'crm',
        '["NEW","QUALIFIED","ROUTED","FOLLOW_UP","CLOSED"]',
        '[
          {"from":"NEW","to":"QUALIFIED","event":"crm.qualify","guard":"lead_scored","retry":{"max_attempts":2,"backoff_seconds":60},"escalate_to":"CRM_MANAGER_AI"},
          {"from":"QUALIFIED","to":"ROUTED","event":"crm.route","guard":"owner_available","retry":{"max_attempts":2,"backoff_seconds":120},"escalate_to":"OPS_MANAGER_AI"},
          {"from":"ROUTED","to":"FOLLOW_UP","event":"crm.followup","guard":"contact_attempted","retry":{"max_attempts":5,"backoff_seconds":300},"escalate_to":"CRM_MANAGER_AI"},
          {"from":"FOLLOW_UP","to":"CLOSED","event":"crm.close","guard":"outcome_recorded","retry":{"max_attempts":1,"backoff_seconds":0},"escalate_to":"CRM_MANAGER_AI"}
        ]'
      ),
      (
        'finance.approval.lifecycle',
        'Finance Approval Lifecycle',
        'finance',
        '["DRAFT","VALIDATED","APPROVED","POSTED"]',
        '[
          {"from":"DRAFT","to":"VALIDATED","event":"finance.validate","guard":"journal_balanced","retry":{"max_attempts":2,"backoff_seconds":120},"escalate_to":"FINANCE_MANAGER_AI"},
          {"from":"VALIDATED","to":"APPROVED","event":"finance.approve","guard":"approval_received","retry":{"max_attempts":2,"backoff_seconds":300},"escalate_to":"COPSPOWER_APPROVAL_AI"},
          {"from":"APPROVED","to":"POSTED","event":"finance.post","guard":"posting_window_open","retry":{"max_attempts":3,"backoff_seconds":60},"escalate_to":"FINANCE_MANAGER_AI"}
        ]'
      ),
      (
        'copspower.escalation.lifecycle',
        'COPSPOWER Escalation and Approval Lifecycle',
        'core',
        '["TRIGGERED","PENDING_APPROVAL","APPROVED","ESCALATED","CLOSED"]',
        '[
          {"from":"TRIGGERED","to":"PENDING_APPROVAL","event":"copspower.request","guard":"policy_match","retry":{"max_attempts":1,"backoff_seconds":0},"escalate_to":"COPSPOWER_MANAGER_AI"},
          {"from":"PENDING_APPROVAL","to":"APPROVED","event":"copspower.approve","guard":"authorized_actor","retry":{"max_attempts":2,"backoff_seconds":300},"escalate_to":"OWNER"},
          {"from":"PENDING_APPROVAL","to":"ESCALATED","event":"copspower.escalate","guard":"sla_breached","retry":{"max_attempts":1,"backoff_seconds":0},"escalate_to":"OWNER"},
          {"from":"APPROVED","to":"CLOSED","event":"copspower.close","guard":"execution_completed","retry":{"max_attempts":1,"backoff_seconds":0},"escalate_to":"COPSPOWER_MANAGER_AI"}
        ]'
      )
  ) as w(workflow_key, workflow_name, module_type, states, transitions)
)
insert into public.workflow_definitions (tenant_id, workflow_key, workflow_name, module_type, states, transitions, is_active)
select tenant_id, workflow_key, workflow_name, module_type, states, transitions, true
from workflow_rows
on conflict (tenant_id, workflow_key) do update set
  workflow_name = excluded.workflow_name,
  module_type = excluded.module_type,
  states = excluded.states,
  transitions = excluded.transitions,
  is_active = true;

insert into public.ai_prompts (tenant_id, prompt_key, system_prompt, role_scope, temperature)
select t.id, 'ops.decision.default', 'You are MUSKI execution AI. Return JSON with decision, confidence, actions.', 'OWNER,SUPER_ADMIN,MANAGEMENT,INTERNAL_AI', 0.2
from public.tenants t
on conflict (tenant_id, prompt_key) do update set
  system_prompt = excluded.system_prompt,
  role_scope = excluded.role_scope,
  temperature = excluded.temperature;
