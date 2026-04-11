async function runHealthCheck() {
  try {
    const res = await fetch("http://localhost:3000/health");
    const data = await res.json();
    alert("MUSKI STATUS: " + data.status);
  } catch (e) {
    alert("Backend not running");
  }
}

async function createTask() {
  try {
    const res = await fetch("http://localhost:3000/task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Run live MUSKI task",
        description: "Triggered from dashboard",
        priority: "high",
        requestedBy: "OWNER",
        targetAgent: "OPS_MANAGER_AI"
      })
    });

    const data = await res.json();
    alert("TASK CREATED: " + (data.success ? "YES" : "NO"));
  } catch (e) {
    alert("Backend not running");
  }
}

async function dispatchTask() {
  alert("Dispatch API next step");
}

async function viewLogs() {
  alert("Logs API next step");
}