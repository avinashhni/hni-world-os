const MUSKI_API_BASE = window.MUSKI_API_BASE || 'http://localhost:3000';

const uttState = {
  tenantId: 'HNI_GLOBAL',
  metrics: { bookings: 0, suppliers: 0, users: 0, logs: 0 },
  bookings: [
    { bookingId: 'BKG-9001', customerId: 'HNI-GID-1001', stage: 'VOUCHER', status: 'voucher_issued' },
    { bookingId: 'BKG-9011', customerId: 'HNI-GID-1022', stage: 'PAYMENT', status: 'payment_pending' },
    { bookingId: 'BKG-9018', customerId: 'HNI-GID-1077', stage: 'CONFIRM', status: 'confirmed' }
  ],
  suppliers: [
    { supplierCode: 'EXPEDIA', supplierName: 'Expedia Connectivity', onboardingStatus: 'active', apiEnabled: true },
    { supplierCode: 'HOTELBEDS', supplierName: 'Hotelbeds Global', onboardingStatus: 'active', apiEnabled: true },
    { supplierCode: 'WEBBEDS', supplierName: 'WebBeds Supply', onboardingStatus: 'active', apiEnabled: true }
  ],
  users: [
    { userId: 'ADMIN_UTT_01', role: 'ADMIN', customerLayer: 'CORPORATE' },
    { userId: 'AGENT_UTT_01', role: 'AGENT', customerLayer: 'B2B' }
  ],
  logs: [
    { at: new Date(Date.now() - 1000 * 60 * 5).toISOString(), action: 'booking.lifecycle_completed', severity: 'info' },
    { at: new Date(Date.now() - 1000 * 60 * 22).toISOString(), action: 'supplier.onboard', severity: 'info' },
    { at: new Date(Date.now() - 1000 * 60 * 60).toISOString(), action: 'rbac.user_registered', severity: 'info' }
  ],
  commandResults: []
};

async function readReadinessSnapshot() {
  try {
    const response = await fetch(`${MUSKI_API_BASE}/utt/readiness?tenantId=${encodeURIComponent(uttState.tenantId)}`);
    if (!response.ok) throw new Error('non-ok');
    const payload = await response.json();
    const snapshot = payload?.snapshot || payload;
    if (!snapshot) return;

    uttState.metrics = {
      bookings: snapshot.bookings ?? uttState.bookings.length,
      suppliers: snapshot.suppliers ?? uttState.suppliers.length,
      users: snapshot.users ?? uttState.users.length,
      logs: snapshot.logs ?? uttState.logs.length
    };
  } catch (_) {
    uttState.metrics = {
      bookings: uttState.bookings.length,
      suppliers: uttState.suppliers.length,
      users: uttState.users.length,
      logs: uttState.logs.length
    };
  }
}

function tbodyRows(rows, cols) {
  if (!rows.length) return `<tr><td colspan="${cols}">No records available.</td></tr>`;
  return rows.join('');
}

function renderBookingsTable(targetId = 'uttBookingsTable') {
  const target = document.getElementById(targetId);
  if (!target) return;
  target.innerHTML = `
    <tr><th>Booking ID</th><th>Customer</th><th>Stage</th><th>Status</th></tr>
    ${tbodyRows(
      uttState.bookings.map((booking) => `
        <tr>
          <td>${booking.bookingId}</td>
          <td>${booking.customerId}</td>
          <td>${booking.stage}</td>
          <td><span class="muski-badge approved">${booking.status}</span></td>
        </tr>
      `),
      4
    )}
  `;
}

function renderSuppliersTable(targetId = 'uttSupplierTable') {
  const target = document.getElementById(targetId);
  if (!target) return;
  target.innerHTML = `
    <tr><th>Supplier</th><th>Name</th><th>Status</th><th>API</th></tr>
    ${tbodyRows(
      uttState.suppliers.map((supplier) => `
        <tr>
          <td>${supplier.supplierCode}</td>
          <td>${supplier.supplierName}</td>
          <td>${supplier.onboardingStatus}</td>
          <td>${supplier.apiEnabled ? 'Connected' : 'Manual'}</td>
        </tr>
      `),
      4
    )}
  `;
}

function renderUsersTable(targetId = 'uttUsersTable') {
  const target = document.getElementById(targetId);
  if (!target) return;
  target.innerHTML = `
    <tr><th>User ID</th><th>Role</th><th>Layer</th></tr>
    ${tbodyRows(
      uttState.users.map((user) => `
        <tr>
          <td>${user.userId}</td>
          <td>${user.role}</td>
          <td>${user.customerLayer}</td>
        </tr>
      `),
      3
    )}
  `;
}

function renderLogsTable(targetId = 'uttLogsTable') {
  const target = document.getElementById(targetId);
  if (!target) return;
  target.innerHTML = `
    <tr><th>Timestamp</th><th>Action</th><th>Severity</th></tr>
    ${tbodyRows(
      uttState.logs.map((log) => `
        <tr>
          <td>${new Date(log.at).toLocaleString()}</td>
          <td>${log.action}</td>
          <td>${log.severity}</td>
        </tr>
      `),
      3
    )}
  `;
}

function renderCommandResults() {
  const target = document.getElementById('uttCommandResults');
  if (!target) return;
  const rows = uttState.commandResults
    .slice(0, 8)
    .map((result) => `<div class="muski-log-item"><strong>${result.command}</strong> • ${result.result}<br/><span class="muski-muted">${result.scope} | ${new Date(result.ts).toLocaleString()}</span></div>`)
    .join('');
  target.innerHTML = rows || '<div class="muski-log-item">No MUSKI command output yet.</div>';
}

window.uttRunCommand = function uttRunCommand(command) {
  const role = window.HNIWorldShell?.ROLE_PERMISSIONS?.owner;
  const isOwnerVisible = !!role;
  const allowedCommands = {
    show_bookings: { scope: 'BOOKING_ENGINE', result: `${uttState.bookings.length} bookings loaded.` },
    supplier_status: { scope: 'SUPPLIER_INTEGRATION', result: `${uttState.suppliers.length} suppliers active.` },
    view_revenue: { scope: 'FINANCE_SUMMARY', result: 'Estimated gross revenue live view enabled.' }
  };

  const routed = allowedCommands[command];
  if (!isOwnerVisible || !routed) return;
  uttState.commandResults.unshift({ command, scope: routed.scope, result: routed.result, ts: new Date().toISOString() });
  renderCommandResults();
};

window.uttOpenBookingEngine = function uttOpenBookingEngine() {
  window.location.href = '/utt/bookings/';
};

window.uttBootstrap = async function uttBootstrap() {
  await readReadinessSnapshot();
  renderBookingsTable();
  renderSuppliersTable();
  renderUsersTable();
  renderLogsTable();
  renderCommandResults();

  const metricsTarget = document.getElementById('uttMetricsGrid');
  if (metricsTarget) {
    metricsTarget.innerHTML = `
      <article class="stat-card"><h4>Bookings</h4><div class="stat-number">${uttState.metrics.bookings}</div><p>Read-only lifecycle records from UTT service.</p></article>
      <article class="stat-card"><h4>Suppliers</h4><div class="stat-number">${uttState.metrics.suppliers}</div><p>Connected travel supplier integrations.</p></article>
      <article class="stat-card"><h4>Users</h4><div class="stat-number">${uttState.metrics.users}</div><p>UTT role-scoped users in active tenant.</p></article>
      <article class="stat-card"><h4>Logs</h4><div class="stat-number">${uttState.metrics.logs}</div><p>Telemetry and audit signals mirrored to shell.</p></article>
    `;
  }
};
