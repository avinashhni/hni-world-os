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
  ];

  const missing = [];
  for (const file of routeFiles) {
    if (!existsSync(join(root, file))) {
      missing.push(file);
      continue;
    }
    const content = readFileSync(join(root, file), 'utf8');
    assert(/export function/.test(content), `${file} does not export route function`);
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

function checkDeploymentReadiness() {
  const required = [
    'vercel.json',
    'dist/vercel.json',
    'supabase/001_schema.sql',
    'supabase/002_policies.sql',
    'supabase/functions/create-intake/index.ts',
    'supabase/functions/claim-lead/index.ts',
  ];

  const missing = required.filter((file) => !existsSync(join(root, file)));
  assert(missing.length === 0, `Missing deployment artifacts: ${missing.join(', ')}`);
  return `${required.length} deployment artifacts present`;
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
