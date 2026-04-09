async function runHealthCheck() {
  const res = await fetch("/api/health");
  const data = await res.json();
  alert("MUSKI STATUS: " + data.status);
}

async function createTask() {
  const payload = {
    title: "Run live MUSKI task",
    description: "Triggered from dashboard",
    priority: "high",
    requestedBy: "OWNER",
    targetAgent: "OPS_MANAGER_AI"
  };

  const res = await fetch("/api/task", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  alert("TASK CREATED: " + (data.success ? "YES" : "NO"));
}

async function dispatchTask() {
  alert("Dispatch triggered (backend wiring next)");
}

async function viewLogs() {
  alert("Logs viewer coming next");
}