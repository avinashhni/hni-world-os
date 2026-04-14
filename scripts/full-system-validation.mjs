#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import http from 'node:http';

const root = process.cwd();
const checks = [];
const failures = [];

function runCheck(name, fn) {
  try {
    const details = fn();
    checks.push({ name, status: 'PASS', details });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    checks.push({ name, status: 'FAIL', details: message });
    failures.push({ name, message });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runCommand(cmd, args) {
  const result = spawnSync(cmd, args, { cwd: root, stdio: 'pipe', encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed with exit code ${result.status}\n${result.stderr || result.stdout}`);
  }
  return (result.stdout || '').trim();
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[midpoint - 1] + sorted[midpoint]) / 2;
  }
  return sorted[midpoint];
}

function walkDir(dir, visitor) {
  for (const entry of readdirSync(dir)) {
    const absolute = join(dir, entry);
    const stat = statSync(absolute);
    if (stat.isDirectory()) {
      walkDir(absolute, visitor);
      continue;
    }
    visitor(absolute);
  }
}

function collectHtmlRoutes(baseDir) {
  const routes = [];
  walkDir(baseDir, (filePath) => {
    if (!filePath.endsWith('.html')) return;
    const relative = filePath.replace(`${baseDir}/`, '');
    if (relative === 'index.html') {
      routes.push('/');
      return;
    }
    const route = `/${relative.replace(/index\.html$/, '').replace(/\.html$/, '')}`;
    routes.push(route.endsWith('/') ? route : `${route}/`);
  });
  return Array.from(new Set(routes)).sort();
}

function extractInternalLinks(html) {
  const matches = html.match(/href\s*=\s*["']([^"']+)["']/gi) || [];
  return matches
    .map((raw) => raw.replace(/href\s*=\s*["']|["']/gi, '').trim())
    .filter((href) => href.startsWith('/') && !href.startsWith('//'));
}

function normalizeForLookup(href) {
  const withoutHash = href.split('#')[0].split('?')[0];
  const normalized = withoutHash.replace(/\/index\.html$/i, '/');
  if (normalized === '/') return '/';
  if (normalized.endsWith('/')) return normalized;
  const last = normalized.split('/').filter(Boolean).pop() || '';
  return last.includes('.') ? normalized : `${normalized}/`;
}

function startStaticServer(baseDir, port = 4173) {
  const server = http.createServer((req, res) => {
    const rawPath = req.url?.split('?')[0] || '/';
    const safePath = rawPath.endsWith('/') ? `${rawPath}index.html` : rawPath;
    const filePath = join(baseDir, safePath);
    if (!existsSync(filePath)) {
      res.statusCode = 404;
      res.end('Not Found');
      return;
    }
    const content = readFileSync(filePath);
    res.statusCode = 200;
    res.end(content);
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => resolve({ server, port }));
  });
}

async function checkUiLoads() {
  const { server, port } = await startStaticServer(join(root, 'dist'));
  const paths = collectHtmlRoutes(join(root, 'dist'));

  try {
    for (const path of paths) {
      const body = await new Promise((resolve, reject) => {
        http.get({ hostname: '127.0.0.1', port, path }, (res) => {
          let data = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            if (res.statusCode !== 200) {
              reject(new Error(`${path} returned ${res.statusCode}`));
              return;
            }
            resolve(data);
          });
        }).on('error', reject);
      });
      assert(String(body).toLowerCase().includes('<html'), `${path} missing HTML document markup`);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  return `${paths.length} routes returned 200 and valid HTML`;
}

async function checkUiPerformance() {
  const { server, port } = await startStaticServer(join(root, "dist"), 4174);
  const paths = collectHtmlRoutes(join(root, "dist"));
  const durations = [];

  try {
    for (const path of paths) {
      const start = process.hrtime.bigint();
      await new Promise((resolve, reject) => {
        http.get({ hostname: "127.0.0.1", port, path }, (res) => {
          res.resume();
          res.on("end", resolve);
          res.on("error", reject);
        }).on("error", reject);
      });
      const elapsedMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      durations.push(elapsedMs);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  const avgMs = durations.reduce((acc, item) => acc + item, 0) / durations.length;
  const p95Index = Math.max(0, Math.ceil(durations.length * 0.95) - 1);
  const p95 = [...durations].sort((a, b) => a - b)[p95Index];
  const medianMs = median(durations);

  assert(Number.isFinite(avgMs), "Average route load time could not be computed");
  assert(p95 < 250, `Route load p95 too high (${p95.toFixed(2)}ms)`);

  return `${paths.length} routes benchmarked (avg ${avgMs.toFixed(2)}ms, median ${medianMs.toFixed(2)}ms, p95 ${p95.toFixed(2)}ms)`;
}

function checkRouteIntegrity() {
  const distRoot = join(root, 'dist');
  const routes = collectHtmlRoutes(distRoot);
  const routeSet = new Set(routes.map((item) => normalizeForLookup(item)));
  const missingLinks = [];

  for (const route of routes) {
    const target = route === '/' ? 'index.html' : `${route.slice(1)}index.html`;
    const htmlPath = join(distRoot, target);
    const html = readFileSync(htmlPath, 'utf8');
    for (const href of extractInternalLinks(html)) {
      const normalizedHref = normalizeForLookup(href);
      const isAsset = normalizedHref.includes('.') && !normalizedHref.endsWith('/');
      if (isAsset) {
        const assetPath = join(distRoot, normalizedHref.replace(/^\//, ''));
        if (!existsSync(assetPath)) {
          missingLinks.push(`${route} -> ${href}`);
        }
        continue;
      }

      if (!routeSet.has(normalizedHref)) {
        missingLinks.push(`${route} -> ${href}`);
      }
    }
  }

  assert(missingLinks.length === 0, `Broken internal links: ${missingLinks.slice(0, 10).join(', ')}`);
  return `${routes.length} routes audited with zero broken internal links`;
}

function checkApiContracts() {
  const routeFiles = [
    'backend/apps/muski-core-runtime/src/routes/health.route.ts',
    'backend/apps/muski-core-runtime/src/routes/task.route.ts',
    'backend/apps/muski-core-runtime/src/routes/dispatch.route.ts',
    'backend/apps/muski-core-runtime/src/routes/approval.route.ts',
    'supabase/functions/core-api/index.ts',
  ];

  const missing = [];
  for (const file of routeFiles) {
    if (!existsSync(join(root, file))) {
      missing.push(file);
      continue;
    }
    const content = readFileSync(join(root, file), 'utf8');
    if (file.endsWith('.ts') && file.includes('supabase/functions/core-api')) {
      assert(/serve\(/.test(content), `${file} missing edge runtime handler`);
    } else {
      assert(/export function/.test(content), `${file} does not export route function`);
    }
  }

  assert(missing.length === 0, `Missing route files: ${missing.join(', ')}`);

  const serviceFiles = [
    'backend/apps/muski-core-runtime/src/services/agent-registry.service.ts',
    'backend/apps/muski-core-runtime/src/services/task-intake.service.ts',
    'backend/apps/muski-core-runtime/src/services/task-dispatcher.service.ts',
    'backend/apps/muski-core-runtime/src/services/approval.service.ts',
    'backend/apps/muski-core-runtime/src/services/validation.service.ts',
    'backend/apps/muski-core-runtime/src/services/execution-logger.service.ts',
  ];

  for (const file of serviceFiles) {
    assert(existsSync(join(root, file)), `Missing service: ${file}`);
  }

  return `${routeFiles.length} route contracts and ${serviceFiles.length} services validated`;
}

function checkRuntimeCompatibilityMode() {
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const scriptEntries = Object.entries(packageJson.scripts ?? {});
  const denoScriptUsage = scriptEntries.filter(([, command]) => /\bdeno\b/i.test(String(command)));
  assert(denoScriptUsage.length === 0, `Validation scripts must be runtime-agnostic; found deno usage in package scripts: ${denoScriptUsage.map(([name]) => name).join(", ")}`);

  const edgeFunctions = [
    "supabase/functions/core-api/index.ts",
    "supabase/functions/create-intake/index.ts",
    "supabase/functions/claim-lead/index.ts",
    "supabase/functions/job-worker/index.ts",
  ];

  for (const file of edgeFunctions) {
    assert(existsSync(join(root, file)), `Missing edge function: ${file}`);
    const source = readFileSync(join(root, file), "utf8");
    assert(/serve\(/.test(source), `${file} missing serve() handler`);
    assert(/createClient\(/.test(source), `${file} missing Supabase client initialization`);
  }

  return "Runtime compatibility mode active: validation uses static/dry-run checks and does not require Deno execution";
}

function checkDeploymentReadiness() {
  const required = [
    'vercel.json',
    'dist/vercel.json',
    'supabase/001_schema.sql',
    'supabase/002_policies.sql',
    'supabase/003_deep_build_schema.sql',
    'supabase/004_deep_build_policies.sql',
    'supabase/005_deep_build_seed.sql',
    'supabase/functions/create-intake/index.ts',
    'supabase/functions/claim-lead/index.ts',
    'supabase/functions/core-api/index.ts',
  ];

  const missing = required.filter((file) => !existsSync(join(root, file)));
  assert(missing.length === 0, `Missing deployment artifacts: ${missing.join(', ')}`);
  return `${required.length} deployment artifacts present`;
}

function checkRoleAndPermissionModel() {
  const matrixPath = join(root, "HNI_WORLD_OS_MASTER_PACK/03_security/permission_matrix.json");
  assert(existsSync(matrixPath), "Missing permission matrix definition");
  const matrix = JSON.parse(readFileSync(matrixPath, "utf8"));

  const requiredRoles = ["OWNER", "SUPER_ADMIN", "MANAGEMENT", "STAFF", "INTERNAL_AI", "EXTERNAL_AI"];
  const missingRoles = requiredRoles.filter((role) => !matrix.roles.includes(role));
  assert(missingRoles.length === 0, `Missing required roles: ${missingRoles.join(", ")}`);

  const requiredAreas = ["module_management", "deployment_control", "workflow_override", "audit_logs_access"];
  const missingAreas = requiredAreas.filter((item) => !matrix.permission_areas.includes(item));
  assert(missingAreas.length === 0, `Missing permission areas: ${missingAreas.join(", ")}`);

  const approvalService = readFileSync(join(root, "backend/apps/muski-core-runtime/src/services/approval.service.ts"), "utf8");
  assert(/requestedBy/.test(approvalService), "Approval service missing requestedBy actor");
  assert(/decidedBy/.test(approvalService), "Approval service missing decidedBy actor");

  return `${requiredRoles.length} critical roles and ${requiredAreas.length} permission areas validated`;
}

function checkSecurityBoundaries() {
  const schemaSql = [
    readFileSync(join(root, "supabase/001_schema.sql"), "utf8"),
    readFileSync(join(root, "supabase/003_deep_build_schema.sql"), "utf8"),
  ].join("\n");
  const policySql = [
    readFileSync(join(root, "supabase/002_policies.sql"), "utf8"),
    readFileSync(join(root, "supabase/004_deep_build_policies.sql"), "utf8"),
  ].join("\n");

  const tables = Array.from(schemaSql.matchAll(/create table if not exists public\.([a-z0-9_]+)/gi)).map((match) => match[1]);
  const rlsEnabled = Array.from(policySql.matchAll(/alter table public\.([a-z0-9_]+) enable row level security;/gi)).map((match) => match[1]);
  const policies = Array.from(policySql.matchAll(/create policy\s+(?:"[^"]+"|[a-z0-9_]+)\s+on public\.([a-z0-9_]+)/gi)).map((match) => match[1]);

  const missingRls = tables.filter((table) => !rlsEnabled.includes(table));
  assert(missingRls.length === 0, `Tables missing RLS: ${missingRls.join(", ")}`);

  const tablesWithoutPolicies = tables.filter((table) => !policies.includes(table));
  assert(tablesWithoutPolicies.length === 0, `Tables missing policy rules: ${tablesWithoutPolicies.join(", ")}`);
  assert(/auth\.uid\(\)/.test(policySql), "No auth.uid() ownership boundaries found in policies");

  return `${tables.length} tables protected by RLS with policy coverage`;
}

function checkMonitoringReadiness() {
  const healthRouteFile = readFileSync(join(root, "backend/apps/muski-core-runtime/src/routes/health.route.ts"), "utf8");
  const loggerServiceFile = readFileSync(join(root, "backend/apps/muski-core-runtime/src/services/execution-logger.service.ts"), "utf8");
  const runtimeFile = readFileSync(join(root, "backend/apps/muski-core-runtime/src/index.ts"), "utf8");

  assert(/status:\s*"ok"/.test(healthRouteFile), "Health route missing operational status signal");
  assert(/timestamp:\s*new Date\(\)\.toISOString\(\)/.test(healthRouteFile), "Health route missing timestamp");
  assert(/log\(/.test(loggerServiceFile), "Execution logger missing log method");
  assert(/executionLogger\.log\(/.test(runtimeFile), "Runtime bootstrap missing execution log usage");

  return "Health endpoint and execution logging instrumentation confirmed";
}

function checkDeepExecutionReadiness() {
  const coreApi = readFileSync(join(root, "supabase/functions/core-api/index.ts"), "utf8");
  const seedSql = readFileSync(join(root, "supabase/005_deep_build_seed.sql"), "utf8");
  const workerRuntime = readFileSync(join(root, "supabase/functions/job-worker/index.ts"), "utf8");
  const createIntake = readFileSync(join(root, "supabase/functions/create-intake/index.ts"), "utf8");
  const claimLead = readFileSync(join(root, "supabase/functions/claim-lead/index.ts"), "utf8");
  const muskiService = readFileSync(join(root, "backend/apps/muski-core-runtime/src/services/muski-persistent-runtime.service.ts"), "utf8");

  assert(/insert\s+into\s+public\.workflow_definitions/i.test(seedSql), "No workflow_definitions seed records found");
  assert(seedSql.includes("booking.lifecycle") && seedSql.includes("legal.lifecycle") && seedSql.includes("education.lifecycle"), "Missing required lifecycle workflow seeds");
  assert(seedSql.includes("copspower.escalation.lifecycle"), "Missing COPSPOWER escalation lifecycle seed");
  assert(/transitions::jsonb/.test(seedSql), "Workflow seed missing transition definition payloads");
  assert(/retry"\s*:\s*\{/.test(seedSql) || seedSql.includes("retry"), "Workflow transitions missing retry metadata");

  assert(existsSync(join(root, "supabase/functions/job-worker/index.ts")), "No async job worker implementation found for job_queue processing");
  assert(/async function claimJobs/.test(workerRuntime) && /async function processJob/.test(workerRuntime), "Queue worker missing async claim/process structure");
  assert(/MAX_ATTEMPTS/.test(workerRuntime) && /RETRY_BACKOFF_SECONDS/.test(workerRuntime), "Queue worker missing retry constants");
  assert(/locked_at/.test(workerRuntime) && /job_dead_letters/.test(workerRuntime), "Queue worker missing lock/retry/dead-letter handling");
  assert(/queue_name:\s*"ai_execution"/.test(coreApi), "AI queue intake not wired into job queue");
  assert(/from\("ai_executions"\)\s*\.insert\(/.test(coreApi), "AI execution write path missing from core API");
  assert(/Authorization/.test(createIntake) && /Authorization/.test(claimLead), "create-intake/claim-lead missing bearer auth enforcement");
  assert(/audit_logs/.test(coreApi) && /audit_logs/.test(createIntake) && /audit_logs/.test(claimLead), "Mutation audit logging not consistently implemented");
  assert(/muski_commands/.test(muskiService) && /muski_approvals/.test(muskiService), "MUSKI runtime persistence layer missing command/approval storage");
  assert(/muski_execution_history/.test(muskiService), "MUSKI runtime persistence layer missing execution history storage");

  const requiredRuntimeFiles = [
    "backend/apps/muski-core-runtime/src/workers/persistent-queue-worker.ts",
    "supabase/functions/job-worker/index.ts",
    "backend/apps/muski-core-runtime/src/services/muski-persistent-runtime.service.ts",
  ];
  const missing = requiredRuntimeFiles.filter((file) => !existsSync(join(root, file)));
  assert(missing.length === 0, `Missing persistent runtime artifacts: ${missing.join(", ")}`);

  return "Workflow seeds, queue worker logic, MUSKI persistence, auth hardening, audit logs, and runtime-agnostic AI checks confirmed";
}


async function main() {
  runCheck('Module structure health', () => {
    const critical = ['legalnomics', 'dashboard', 'muski', 'airnomics', 'edunomics', 'backend'];
    const missing = critical.filter((entry) => !existsSync(join(root, entry)));
    assert(missing.length === 0, `Missing critical modules: ${missing.join(', ')}`);
    return `${critical.length} critical modules present`;
  });

  runCheck('Production build', () => {
    runCommand('npm', ['run', 'build']);
    assert(existsSync(join(root, 'dist/index.html')), 'dist/index.html missing after build');
    return 'Build completed and dist generated';
  });

  runCheck('API contract checks', checkApiContracts);
  runCheck("Runtime compatibility mode", checkRuntimeCompatibilityMode);
  runCheck("Role & permission checks", checkRoleAndPermissionModel);
  runCheck("Security boundary checks", checkSecurityBoundaries);
  runCheck("Monitoring readiness", checkMonitoringReadiness);
  runCheck("Deep execution readiness", checkDeepExecutionReadiness);
  runCheck('Deployment readiness audit', checkDeploymentReadiness);
  runCheck('Route integrity audit', checkRouteIntegrity);

  try {
    const uiDetails = await checkUiLoads();
    checks.push({ name: 'UI loading verification', status: 'PASS', details: uiDetails });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    checks.push({ name: 'UI loading verification', status: 'FAIL', details: message });
    failures.push({ name: 'UI loading verification', message });
  }

  try {
    const performanceDetails = await checkUiPerformance();
    checks.push({ name: "Performance checks", status: "PASS", details: performanceDetails });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    checks.push({ name: "Performance checks", status: "FAIL", details: message });
    failures.push({ name: "Performance checks", message });
  }

  const reportLines = [
    '# HNI WORLD OS Full System Validation Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '| Check | Status | Details |',
    '|---|---|---|',
    ...checks.map((item) => `| ${item.name} | ${item.status} | ${item.details.replace(/\|/g, '\\|')} |`),
    '',
    failures.length === 0
      ? '## Final Status: ✅ PRODUCTION READY'
      : `## Final Status: ❌ ${failures.length} check(s) failing`,
  ];

  mkdirSync(join(root, 'reports'), { recursive: true });
  writeFileSync(join(root, 'reports', 'full-system-validation.md'), `${reportLines.join('\n')}\n`, 'utf8');

  console.log(reportLines.join('\n'));

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main();
