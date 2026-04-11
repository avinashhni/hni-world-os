const MUSKI_API_BASE = window.MUSKI_API_BASE || "http://localhost:3000";

const muskiState = {
  sessionRole: "MUSKI_SUPER_ADMIN",
  queue: [],
  approvals: [],
  executions: [],
  telemetry: [
    { module: "LEGALNOMICS", health: "healthy", queueDepth: 8, activeAgents: 34, alerts: 1 },
    { module: "CORE", health: "healthy", queueDepth: 4, activeAgents: 12, alerts: 0 },
    { module: "MUSKI", health: "healthy", queueDepth: 6, activeAgents: 9, alerts: 0 },
    { module: "AIRNOMICS", health: "degraded", queueDepth: 11, activeAgents: 15, alerts: 2 },
    { module: "EDUNOMICS", health: "healthy", queueDepth: 3, activeAgents: 10, alerts: 0 }
  ],
  agents: [
    { id: "MUSKI_MASTER", layer: "MUSKI", reportsTo: "BOARD", scope: "Global governance & orchestration" },
    { id: "LEGAL_MANAGER_AI", layer: "MANAGER_AI", reportsTo: "MUSKI_MASTER", scope: "Legalnomics strategic control" },
    { id: "OPS_MANAGER_AI", layer: "MANAGER_AI", reportsTo: "MUSKI_MASTER", scope: "Core + infrastructure execution" },
    { id: "LEGAL_MODULE_AI", layer: "MODULE_AI", reportsTo: "LEGAL_MANAGER_AI", scope: "Case routing & verdict ops" },
    { id: "COMPLIANCE_MODULE_AI", layer: "MODULE_AI", reportsTo: "LEGAL_MANAGER_AI", scope: "Policy and compliance checks" },
    { id: "RUNTIME_MODULE_AI", layer: "MODULE_AI", reportsTo: "OPS_MANAGER_AI", scope: "Runtime dispatch & telemetry" }
  ],
  roles: {
    MUSKI_SUPER_ADMIN: { execute: true, approve: true, escalate: true, visibility: "all" },
    MANAGER_AI: { execute: true, approve: true, escalate: true, visibility: "domain" },
    MODULE_AI: { execute: true, approve: false, escalate: true, visibility: "module" },
    AUDITOR: { execute: false, approve: false, escalate: false, visibility: "audit" }
  },
  auditLogs: []
};

function makeId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function logAudit(eventType, message, metadata = {}) {
  muskiState.auditLogs.unshift({
    id: makeId("log"),
    eventType,
    message,
    metadata,
    ts: new Date().toISOString()
  });
}

function seedState() {
  const bootstrapTask = {
    id: makeId("task"),
    title: "Cross-OS telemetry sync",
    description: "Sync Legalnomics + Core runtime telemetry to MUSKI monitor",
    priority: "high",
    requestedBy: "MUSKI_SUPER_ADMIN",
    targetAgent: "OPS_MANAGER_AI",
    status: "pending",
    route: "MODULE_AI -> MANAGER_AI -> MUSKI"
  };

  muskiState.queue.push(bootstrapTask);
  logAudit("BOOT", "MUSKI command center initialized", { queueSeeded: 1 });
}

async function callApi(path, options) {
  try {
    const res = await fetch(`${MUSKI_API_BASE}${path}`, options);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    return null;
  }
}

function renderNav() {
  const navItems = [
    ["Global Command Center", "Unified shell navigation and governance KPIs"],
    ["Decision Queue", "Approval/escalation workflows and command routing"],
    ["Agent Hierarchy", "Module AI → Manager AI → MUSKI command tree"],
    ["Control Plane", "Cross-OS monitoring and guarded execution APIs"]
  ];
  document.getElementById("muskiNavGrid").innerHTML = navItems
    .map(([title, note]) => `<div class="muski-nav-item"><strong>${title}</strong>${note}</div>`)
    .join("");
}

function renderKPIs() {
  const pending = muskiState.queue.filter((q) => q.status === "pending").length;
  const approved = muskiState.queue.filter((q) => q.status === "approved").length;
  const escalated = muskiState.queue.filter((q) => q.status === "escalated").length;
  const executed = muskiState.executions.length;

  document.getElementById("muskiKpiGrid").innerHTML = `
    <article class="stat-card"><h4>Pending Decisions</h4><div class="stat-number">${pending}</div><p>Tasks awaiting approval or escalation path.</p></article>
    <article class="stat-card"><h4>Approved Queue</h4><div class="stat-number">${approved}</div><p>Commands cleared for execution dispatch.</p></article>
    <article class="stat-card"><h4>Escalated Items</h4><div class="stat-number">${escalated}</div><p>Governance exceptions elevated to MUSKI.</p></article>
    <article class="stat-card"><h4>Executions</h4><div class="stat-number">${executed}</div><p>Completed/active orchestration actions.</p></article>
  `;
}

function renderTaskQueue() {
  const rows = muskiState.queue.map((task) => `
    <tr>
      <td>${task.id}</td>
      <td>${task.title}</td>
      <td>${task.targetAgent}</td>
      <td>${task.route}</td>
      <td><span class="muski-badge ${task.status}">${task.status}</span></td>
    </tr>
  `);

  document.getElementById("taskQueueTable").innerHTML = `
    <tr><th>ID</th><th>Task</th><th>Target Agent</th><th>Route</th><th>Status</th></tr>
    ${rows.join("") || '<tr><td colspan="5">No tasks in queue.</td></tr>'}
  `;
}

function renderHierarchy() {
  document.getElementById("agentHierarchy").innerHTML = `
    <div class="muski-hierarchy">
      ${muskiState.agents
        .map(
          (agent) => `<div class="muski-node"><strong>${agent.id}</strong><small>${agent.layer} • Reports to ${agent.reportsTo}</small><small>${agent.scope}</small></div>`
        )
        .join("")}
    </div>
  `;
}

function renderExecution() {
  const rows = muskiState.executions.map((run) => `
    <tr>
      <td>${run.taskId}</td>
      <td>${run.executedBy}</td>
      <td>${run.result}</td>
      <td>${new Date(run.ts).toLocaleTimeString()}</td>
    </tr>
  `);

  document.getElementById("executionTable").innerHTML = `
    <tr><th>Task ID</th><th>Executed By</th><th>Result</th><th>Timestamp</th></tr>
    ${rows.join("") || '<tr><td colspan="4">No executions yet.</td></tr>'}
  `;
}

function renderTelemetry() {
  const rows = muskiState.telemetry.map((t) => `
    <tr>
      <td>${t.module}</td>
      <td><span class="muski-badge ${t.health === "healthy" ? "approved" : "blocked"}">${t.health}</span></td>
      <td>${t.queueDepth}</td>
      <td>${t.activeAgents}</td>
      <td>${t.alerts}</td>
    </tr>
  `);

  document.getElementById("telemetryTable").innerHTML = `
    <tr><th>Module</th><th>Health</th><th>Queue Depth</th><th>Active Agents</th><th>Alerts</th></tr>
    ${rows.join("")}
  `;
}

function renderRolePanel() {
  const buttons = Object.keys(muskiState.roles)
    .map((role) => `<button class="${role === muskiState.sessionRole ? "primary-btn" : "secondary-btn"}" onclick="muskiSetRole('${role}')">${role}</button>`)
    .join("");

  const roleData = muskiState.roles[muskiState.sessionRole];
  document.getElementById("roleButtons").innerHTML = buttons;
  document.getElementById("roleSummary").textContent = `Role ${muskiState.sessionRole}: execute=${roleData.execute}, approve=${roleData.approve}, escalate=${roleData.escalate}, visibility=${roleData.visibility}.`;
}

function renderAudit() {
  const logs = muskiState.auditLogs
    .slice(0, 12)
    .map((l) => `<div class="muski-log-item"><strong>${l.eventType}</strong> • ${l.message}<br/><span class="muski-muted">${new Date(l.ts).toLocaleString()} | ${JSON.stringify(l.metadata)}</span></div>`)
    .join("");

  document.getElementById("auditLogList").innerHTML = logs || '<div class="muski-log-item">No logs yet.</div>';
}

function refreshAll() {
  renderNav();
  renderKPIs();
  renderTaskQueue();
  renderHierarchy();
  renderExecution();
  renderTelemetry();
  renderRolePanel();
  renderAudit();
}

window.muskiSetRole = function muskiSetRole(role) {
  muskiState.sessionRole = role;
  logAudit("ROLE_SWITCH", "Session role switched", { role });
  refreshAll();
};

window.muskiCreateTask = async function muskiCreateTask() {
  const payload = {
    title: "Governed command execution",
    description: "Owner-triggered enterprise action",
    priority: "high",
    requestedBy: muskiState.sessionRole,
    targetAgent: "OPS_MANAGER_AI"
  };

  const apiResult = await callApi("/task", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const task = {
    id: apiResult?.task?.id || makeId("task"),
    ...payload,
    status: "pending",
    route: "MODULE_AI -> MANAGER_AI -> MUSKI"
  };

  muskiState.queue.unshift(task);
  logAudit("TASK_CREATED", "Task entered decision queue", { taskId: task.id, source: apiResult ? "api" : "stub" });
  refreshAll();
};

window.muskiApproveFirstPending = async function muskiApproveFirstPending() {
  const task = muskiState.queue.find((q) => q.status === "pending");
  if (!task) return;

  const role = muskiState.roles[muskiState.sessionRole];
  if (!role.approve) {
    logAudit("DENIED", "Approval denied by role policy", { role: muskiState.sessionRole, taskId: task.id });
    refreshAll();
    return;
  }

  const apiResult = await callApi(`/approval/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskId: task.id, requestedBy: muskiState.sessionRole })
  });

  task.status = "approved";
  muskiState.approvals.unshift({ id: apiResult?.id || makeId("approval"), taskId: task.id, decision: "approved" });
  logAudit("APPROVED", "Task approved for dispatch", { taskId: task.id, source: apiResult ? "api" : "stub" });
  refreshAll();
};

window.muskiEscalateFirstPending = function muskiEscalateFirstPending() {
  const task = muskiState.queue.find((q) => q.status === "pending");
  if (!task) return;

  const role = muskiState.roles[muskiState.sessionRole];
  if (!role.escalate) {
    logAudit("DENIED", "Escalation denied by role policy", { role: muskiState.sessionRole, taskId: task.id });
    refreshAll();
    return;
  }

  task.status = "escalated";
  logAudit("ESCALATED", "Task escalated to MUSKI governance lane", { taskId: task.id });
  refreshAll();
};

window.muskiDispatchNext = async function muskiDispatchNext() {
  const task = muskiState.queue.find((q) => q.status === "approved");
  if (!task) return;

  const role = muskiState.roles[muskiState.sessionRole];
  if (!role.execute) {
    logAudit("DENIED", "Dispatch denied by execution policy", { role: muskiState.sessionRole, taskId: task.id });
    refreshAll();
    return;
  }

  const dispatch = await callApi("/dispatch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(task)
  });

  task.status = "dispatched";
  muskiState.executions.unshift({
    taskId: task.id,
    executedBy: task.targetAgent,
    result: dispatch?.dispatch?.status || "executed_stub",
    ts: new Date().toISOString()
  });
  logAudit("DISPATCHED", "Task routed to execution agent", { taskId: task.id, source: dispatch ? "api" : "stub" });
  refreshAll();
};

window.muskiRunSafetyCheck = async function muskiRunSafetyCheck() {
  const health = await callApi("/health");
  const blocked = muskiState.queue.filter((q) => q.status === "pending" && q.priority === "high").length;
  logAudit("SAFETY_CHECK", "Boundary + runtime check completed", {
    runtime: health?.status || "stubbed",
    highPriorityPending: blocked
  });
  refreshAll();
};

window.muskiClearLogs = function muskiClearLogs() {
  muskiState.auditLogs = [];
  logAudit("LOG_RESET", "Session audit log cleared", { by: muskiState.sessionRole });
  refreshAll();
};

window.muskiRefresh = function muskiRefresh() {
  logAudit("REFRESH", "Execution monitor refreshed", {});
  refreshAll();
};

seedState();
refreshAll();
