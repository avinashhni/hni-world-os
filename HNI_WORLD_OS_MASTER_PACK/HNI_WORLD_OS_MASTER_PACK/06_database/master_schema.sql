-- HNI WORLD OS MASTER SQL FOUNDATION
-- Generated automatically

CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS iam;
CREATE SCHEMA IF NOT EXISTS org;
CREATE SCHEMA IF NOT EXISTS intelligence;
CREATE SCHEMA IF NOT EXISTS ai;
CREATE SCHEMA IF NOT EXISTS workflow;
CREATE SCHEMA IF NOT EXISTS business;
CREATE SCHEMA IF NOT EXISTS security;
CREATE SCHEMA IF NOT EXISTS deployment;
CREATE SCHEMA IF NOT EXISTS analytics;

CREATE TABLE IF NOT EXISTS core.tenants (
    id UUID PRIMARY KEY,
    tenant_code VARCHAR(100) NOT NULL UNIQUE,
    tenant_name VARCHAR(255) NOT NULL,
    tenant_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL,
    primary_country_code VARCHAR(10),
    primary_currency_code VARCHAR(10),
    default_language_code VARCHAR(10),
    default_timezone VARCHAR(100),
    data_residency_region VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_at TIMESTAMPTZ,
    updated_by UUID,
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS core.brands (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    brand_code VARCHAR(100) NOT NULL,
    brand_name VARCHAR(255) NOT NULL,
    parent_brand_id UUID,
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_at TIMESTAMPTZ,
    updated_by UUID,
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS core.os_products (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    brand_id UUID,
    os_product_code VARCHAR(100) NOT NULL,
    os_product_name VARCHAR(255) NOT NULL,
    product_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_at TIMESTAMPTZ,
    updated_by UUID,
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS core.modules (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    os_product_id UUID,
    module_code VARCHAR(100) NOT NULL,
    module_name VARCHAR(255) NOT NULL,
    module_category VARCHAR(100),
    module_version VARCHAR(50),
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_at TIMESTAMPTZ,
    updated_by UUID,
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS core.submodules (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    module_id UUID NOT NULL,
    submodule_code VARCHAR(100) NOT NULL,
    submodule_name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_at TIMESTAMPTZ,
    updated_by UUID,
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS core.dashboards (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    module_id UUID,
    submodule_id UUID,
    dashboard_code VARCHAR(100) NOT NULL,
    dashboard_name VARCHAR(255) NOT NULL,
    dashboard_type VARCHAR(100),
    shell_version VARCHAR(50),
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_at TIMESTAMPTZ,
    updated_by UUID,
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS iam.users (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    user_uid VARCHAR(150) UNIQUE,
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(50),
    first_name VARCHAR(120),
    last_name VARCHAR(120),
    display_name VARCHAR(255),
    role_scope VARCHAR(100),
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_at TIMESTAMPTZ,
    updated_by UUID,
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS iam.roles (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    role_code VARCHAR(100) NOT NULL,
    role_name VARCHAR(255) NOT NULL,
    role_scope VARCHAR(100),
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_at TIMESTAMPTZ,
    updated_by UUID,
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS iam.permissions (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    permission_code VARCHAR(100) NOT NULL,
    permission_name VARCHAR(255) NOT NULL,
    permission_area VARCHAR(150),
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_at TIMESTAMPTZ,
    updated_by UUID,
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS org.organizations (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    org_code VARCHAR(100) NOT NULL,
    org_name VARCHAR(255) NOT NULL,
    legal_name VARCHAR(255),
    org_type VARCHAR(100),
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_at TIMESTAMPTZ,
    updated_by UUID,
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS org.countries (
    id UUID PRIMARY KEY,
    country_code VARCHAR(10) NOT NULL UNIQUE,
    country_name VARCHAR(255) NOT NULL,
    region_code VARCHAR(50),
    currency_code VARCHAR(10),
    timezone VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS org.regions (
    id UUID PRIMARY KEY,
    country_id UUID,
    region_code VARCHAR(50) NOT NULL,
    region_name VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS org.states (
    id UUID PRIMARY KEY,
    country_id UUID,
    region_id UUID,
    state_code VARCHAR(50) NOT NULL,
    state_name VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS org.cities (
    id UUID PRIMARY KEY,
    country_id UUID,
    state_id UUID,
    city_code VARCHAR(50),
    city_name VARCHAR(255) NOT NULL,
    timezone VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS org.branches (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    organization_id UUID,
    country_id UUID,
    state_id UUID,
    city_id UUID,
    branch_code VARCHAR(100) NOT NULL,
    branch_name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_at TIMESTAMPTZ,
    updated_by UUID,
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS org.franchises (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    organization_id UUID,
    branch_id UUID,
    franchise_code VARCHAR(100) NOT NULL,
    franchise_name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_at TIMESTAMPTZ,
    updated_by UUID,
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS intelligence.intelligences (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    intelligence_code VARCHAR(100) NOT NULL,
    intelligence_name VARCHAR(255) NOT NULL,
    intelligence_category VARCHAR(100),
    owner_user_id UUID,
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_at TIMESTAMPTZ,
    updated_by UUID,
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ai.ai_agents (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    agent_code VARCHAR(100) NOT NULL,
    agent_name VARCHAR(255) NOT NULL,
    agent_level VARCHAR(100) NOT NULL,
    specialization VARCHAR(255),
    model_name VARCHAR(150),
    temperature NUMERIC(5,2),
    max_tokens INTEGER,
    parent_agent_id UUID,
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID,
    updated_at TIMESTAMPTZ,
    updated_by UUID,
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ai.ai_reporting_lines (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    parent_agent_id UUID NOT NULL,
    child_agent_id UUID NOT NULL,
    reporting_type VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai.ai_tasks (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    agent_id UUID NOT NULL,
    task_type VARCHAR(150) NOT NULL,
    task_priority VARCHAR(50),
    task_status VARCHAR(50) NOT NULL,
    input_payload_json JSONB,
    output_payload_json JSONB,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow.workflow_definitions (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    workflow_code VARCHAR(100) NOT NULL,
    workflow_name VARCHAR(255) NOT NULL,
    workflow_type VARCHAR(100),
    entity_type VARCHAR(100),
    version_no INTEGER DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow.automation_jobs (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    job_code VARCHAR(100) NOT NULL,
    job_name VARCHAR(255) NOT NULL,
    job_type VARCHAR(100),
    schedule_expression VARCHAR(255),
    execution_status VARCHAR(50) NOT NULL,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS security.confidentiality_levels (
    id UUID PRIMARY KEY,
    level_code VARCHAR(100) NOT NULL,
    level_name VARCHAR(255) NOT NULL,
    sort_order INTEGER,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS security.protected_objects (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID NOT NULL,
    confidentiality_level_id UUID,
    access_scope VARCHAR(100),
    is_legal_hold BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deployment.environments (
    id UUID PRIMARY KEY,
    environment_code VARCHAR(100) NOT NULL,
    environment_name VARCHAR(255) NOT NULL,
    environment_type VARCHAR(100) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS deployment.deployments (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    environment_id UUID NOT NULL,
    deployment_code VARCHAR(100) NOT NULL,
    release_version VARCHAR(100) NOT NULL,
    deployment_status VARCHAR(50) NOT NULL,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deployment.api_registry (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    api_code VARCHAR(100) NOT NULL,
    api_name VARCHAR(255) NOT NULL,
    api_scope VARCHAR(100),
    auth_type VARCHAR(100),
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS analytics.kpi_definitions (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    kpi_code VARCHAR(100) NOT NULL,
    kpi_name VARCHAR(255) NOT NULL,
    kpi_category VARCHAR(100),
    calculation_logic TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS analytics.audit_logs (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    actor_user_id UUID,
    action_type VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100),
    entity_id UUID,
    before_data_json JSONB,
    after_data_json JSONB,
    ip_address VARCHAR(100),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS analytics.alerts (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    alert_code VARCHAR(100) NOT NULL,
    alert_name VARCHAR(255) NOT NULL,
    severity VARCHAR(50) NOT NULL,
    entity_type VARCHAR(100),
    entity_id UUID,
    owner_user_id UUID,
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS analytics.escalation_ladders (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    ladder_code VARCHAR(100) NOT NULL,
    ladder_name VARCHAR(255) NOT NULL,
    severity VARCHAR(50),
    escalation_json JSONB,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
