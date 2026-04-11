# Legalnomics Enterprise Testable Flows

## Persona Flows
1. **B2C Intake to Advocate Assignment**
   - Route: `/legalnomics/b2c` → `/legalnomics/workflows/case-lifecycle`
   - Expected: case transitions from `INTAKE_SUBMITTED` to `ADVOCATE_ASSIGNED`.
2. **Advocate Hearing to Verdict Review**
   - Route: `/legalnomics/advocate/workspace` → `/legalnomics/tracking/hearings-verdicts`
   - Expected: hearing completion updates verdict watch queue.
3. **Corporate Approval to External Counsel**
   - Route: `/legalnomics/corporate/legal-ops`
   - Expected: matter enters `L2_COMMERCIAL` approval before assignment.
4. **Owner Challenge Escalation to MUSKI**
   - Route: `/legalnomics/tracking/challenges-appeals` + `/muski`
   - Expected: high-risk challenge items are escalated into governance queue.

## Compliance and Vault
- Route: `/legalnomics/documents/vault`
- Verify chain-of-custody metadata, retention flags, and audit event visibility.

## AI Review Hooks
- Route: `/legalnomics/intelligence/review-engine`
- Verify presence of draft risk, verdict intelligence, and governance trace hooks.
