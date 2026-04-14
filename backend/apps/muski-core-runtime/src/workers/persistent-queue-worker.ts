/**
 * Deployment worker entrypoint.
 * This worker invokes the Supabase `job-worker` function on an interval.
 */

const workerIntervalMs = Number(process.env.MUSKI_WORKER_INTERVAL_MS ?? "5000");
const workerEndpoint = process.env.MUSKI_WORKER_ENDPOINT;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!workerEndpoint || !serviceRoleKey) {
  console.error("Missing MUSKI_WORKER_ENDPOINT or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

async function tick() {
  const response = await fetch(workerEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ trigger: "persistent_worker" }),
  });

  const payload = await response.text();
  if (!response.ok) {
    throw new Error(`Worker tick failed (${response.status}): ${payload}`);
  }

  console.log(`[MUSKI-WORKER] ${new Date().toISOString()} ${payload}`);
}

console.log(`[MUSKI-WORKER] booted with interval ${workerIntervalMs}ms`);
setInterval(() => {
  tick().catch((error) => {
    console.error("[MUSKI-WORKER] tick error", error);
  });
}, workerIntervalMs);

void tick();
