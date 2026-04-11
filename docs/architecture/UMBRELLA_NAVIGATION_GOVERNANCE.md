# HNI WORLD OS Umbrella Navigation & Governance

## 1) Central Governance Layer

**Control plane:** MUSKI + Umbrella Governance shell in `/dashboard/master-shell.js`.

- Governance entry routes:
  - `/dashboard/` → Umbrella Governance / Owner command
  - `/muski/` → MUSKI central command layer
- Shared session governance state:
  - Role scope (`hni_os.role`)
  - Active OS family (`hni_os.family`)
  - Cross-OS route continuity (`hni_os.route_context`)
  - Shared identity payload (`hni_os.identity`)

## 2) Unified Navigation Structure Across OS Families

Navigation now renders by **sections** and **role policy**.

### Central Governance
- Umbrella Governance → `/dashboard/`
- MUSKI Command Layer → `/muski/`

### OS Families
- AI LEGALNOMICS OS → `/legalnomics/`
- AI AIRNOMICS OS → `/airnomics/`
- AI EDUNOMICS OS → `/edunomics/`

## 3) Permission Model (Role-Aware Visibility)

| Role | Visible Nav Keys | Family Switching Allowed |
|---|---|---|
| owner | governance, dashboard, muski, legalnomics, airnomics, edunomics | core, legalnomics, airnomics, edunomics, muski |
| governance_admin | governance, dashboard, muski, legalnomics, airnomics, edunomics | core, legalnomics, airnomics, edunomics, muski |
| os_director | dashboard, muski, legalnomics, airnomics, edunomics | legalnomics, airnomics, edunomics, muski |
| legal_ops | muski, legalnomics | legalnomics, muski |
| air_ops | muski, airnomics | airnomics, muski |
| edu_ops | muski, edunomics | edunomics, muski |
| observer | dashboard, muski | core, muski |

## 4) Seamless OS Switching + Context Continuity

- Every OS page sets `activeFamily` on shell mount.
- Last visited route per family is preserved in `hni_os.route_context`.
- Cross-family clicks resume from last family route when available.
- Role switcher updates role in local storage and reloads shell with new access scope.

## 5) Routes Updated

- Root OS family pages now provide family context to shell:
  - `/dashboard/index.html` → `activeFamily: 'core'`
  - `/muski/index.html` → `activeFamily: 'muski'`
  - `/legalnomics/index.html` → `activeFamily: 'legalnomics'`
  - `/airnomics/index.html` → `activeFamily: 'airnomics'`
  - `/edunomics/index.html` → `activeFamily: 'edunomics'`

This establishes umbrella-grade governance, role-aware navigation, and cross-OS continuity with MUSKI at the center.
