const UTT_CORE_STORAGE_KEY = 'utt_core_platform_state_v2';

const LIFECYCLE_STAGES = Object.freeze([
  'SEARCH',
  'SELECT',
  'HOLD',
  'CONFIRM',
  'PAYMENT_SUCCESS',
  'INVOICE_GENERATED',
  'VOUCHER_ISSUED',
]);

const defaultCoreState = {
  marginConfig: {
    mode: 'MODE_A',
    modeALabel: 'Lowest Supplier Price',
    modeBLabel: 'Hidden Supplier Cost + Margin',
    minimalMarginPct: 0,
    marginType: 'PERCENT',
    dynamicMarginPct: 12,
    fixedMarginAmount: 25,
  },
  apiStatus: {
    EXPEDIA: { healthy: true, lastCheck: new Date().toISOString(), message: 'primary_live' },
    HOTELBEDS: { healthy: true, lastCheck: new Date().toISOString(), message: 'secondary_live' },
    WEBBEDS: { healthy: true, lastCheck: new Date().toISOString(), message: 'backup_live' },
  },
  searchCache: {},
  bookings: {},
  payments: {},
  invoices: {},
  idempotency: {},
  emittedEvents: {},
  bookingLogs: [],
  paymentInvoiceLogs: [],
};

function readCoreState() {
  try {
    const raw = localStorage.getItem(UTT_CORE_STORAGE_KEY);
    if (!raw) return structuredClone(defaultCoreState);
    const parsed = JSON.parse(raw);
    return {
      ...structuredClone(defaultCoreState),
      ...parsed,
      marginConfig: { ...defaultCoreState.marginConfig, ...(parsed.marginConfig || {}) },
      apiStatus: { ...defaultCoreState.apiStatus, ...(parsed.apiStatus || {}) },
      searchCache: parsed.searchCache || {},
      bookings: parsed.bookings || {},
      payments: parsed.payments || {},
      invoices: parsed.invoices || {},
      idempotency: parsed.idempotency || {},
      emittedEvents: parsed.emittedEvents || {},
      bookingLogs: Array.isArray(parsed.bookingLogs) ? parsed.bookingLogs : [],
      paymentInvoiceLogs: Array.isArray(parsed.paymentInvoiceLogs) ? parsed.paymentInvoiceLogs : [],
    };
  } catch (_) {
    return structuredClone(defaultCoreState);
  }
}

const uttCoreState = readCoreState();

function saveCoreState() {
  localStorage.setItem(UTT_CORE_STORAGE_KEY, JSON.stringify(uttCoreState));
}

function makeSearchId() {
  return `SRCH-${Date.now()}`;
}

function makeBookingId(searchId, hotelId, customerId) {
  const safeCustomerId = customerId.trim().toUpperCase();
  return `BKG-${btoa(`${searchId}:${hotelId}:${safeCustomerId}`).replace(/=/g, '')}`;
}

function toCurrency(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

function normalizeHotelLocation(hotel) {
  return hotel.location.toLowerCase().replace(/\s+/g, ' ').trim();
}

function hotelDedupKey(hotel) {
  return `${hotel.name.toLowerCase().trim()}|${normalizeHotelLocation(hotel)}`;
}

function applyPriceEngine(hotel) {
  const cfg = uttCoreState.marginConfig;
  if (cfg.mode === 'MODE_A') {
    const computed = Math.round(hotel.supplierPrice * (1 + (cfg.minimalMarginPct || 0) / 100));
    return {
      ...hotel,
      displayPrice: computed,
      exposedSupplierPrice: hotel.supplierPrice,
      marginApplied: Math.max(computed - hotel.supplierPrice, 0),
      mode: cfg.mode,
    };
  }

  let marginApplied = 0;
  if (cfg.marginType === 'FIXED') {
    marginApplied = Number(cfg.fixedMarginAmount || 0);
  } else {
    marginApplied = Math.round(hotel.supplierPrice * Number(cfg.dynamicMarginPct || 0) / 100);
  }

  return {
    ...hotel,
    displayPrice: hotel.supplierPrice + marginApplied,
    exposedSupplierPrice: null,
    marginApplied,
    mode: cfg.mode,
  };
}

function dedupeByLowestPrice(hotels) {
  const deduped = new Map();
  for (const hotel of hotels) {
    const key = hotelDedupKey(hotel);
    const existing = deduped.get(key);
    if (!existing || hotel.supplierPrice < existing.supplierPrice) {
      deduped.set(key, hotel);
    }
  }
  return [...deduped.values()];
}

function sortByLowestPrice(hotels) {
  return [...hotels].sort((a, b) => a.displayPrice - b.displayPrice);
}

function mapRawToUnified(raw, supplier) {
  return {
    hotelId: `${supplier}-${raw.id}`,
    name: raw.name,
    location: raw.location,
    supplierPrice: raw.price,
    currency: raw.currency,
    supplier,
    rating: raw.rating,
    images: raw.images,
    description: raw.description,
  };
}

function emitOnce(eventKey, payload) {
  if (uttCoreState.emittedEvents[eventKey]) {
    return false;
  }
  uttCoreState.emittedEvents[eventKey] = {
    emittedAt: new Date().toISOString(),
    payload,
  };
  return true;
}

function withIdempotency(tenantId, bookingId, lifecycleStage, execute) {
  const key = `${tenantId}:${bookingId}:${lifecycleStage}`;
  const existing = uttCoreState.idempotency[key];
  if (existing?.status === 'completed') {
    return existing.response;
  }
  if (existing?.status === 'locked') {
    throw new Error(`idempotency_locked:${key}`);
  }

  uttCoreState.idempotency[key] = {
    key,
    status: 'locked',
    lockedAt: new Date().toISOString(),
  };

  try {
    const response = execute();
    uttCoreState.idempotency[key] = {
      key,
      status: 'completed',
      lockedAt: uttCoreState.idempotency[key].lockedAt,
      completedAt: new Date().toISOString(),
      response,
    };
    return response;
  } catch (error) {
    uttCoreState.idempotency[key] = {
      key,
      status: 'failed',
      failedAt: new Date().toISOString(),
      message: error instanceof Error ? error.message : 'execution_failed',
    };
    throw error;
  }
}

function advanceBookingLifecycle(booking, stage) {
  if (!LIFECYCLE_STAGES.includes(stage)) {
    throw new Error(`invalid_lifecycle_stage:${stage}`);
  }
  booking.lifecycleStage = stage;
  booking.lifecycleHistory.push({ stage, at: new Date().toISOString() });

  const eventKey = `${booking.tenantId}:${booking.bookingId}:${stage}`;
  const emitted = emitOnce(eventKey, { bookingId: booking.bookingId, stage });

  uttCoreState.bookingLogs.unshift({
    at: new Date().toISOString(),
    type: emitted ? 'lifecycle_progressed' : 'lifecycle_duplicate_suppressed',
    bookingId: booking.bookingId,
    stage,
  });
}

function ensureBooking(searchId, hotelId, customerId, customerLayer, tenantId) {
  const bookingId = makeBookingId(searchId, hotelId, customerId);
  const existing = uttCoreState.bookings[bookingId];
  if (existing) {
    if (existing.tenantId !== tenantId) {
      throw new Error('tenant_isolation_violation');
    }
    return existing;
  }

  const booking = {
    bookingId,
    tenantId,
    searchId,
    hotelId,
    customerId,
    customerLayer,
    lifecycleStage: 'SEARCH',
    lifecycleHistory: [{ stage: 'SEARCH', at: new Date().toISOString() }],
    hold: {
      status: 'active',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    },
    createdAt: new Date().toISOString(),
  };

  uttCoreState.bookings[bookingId] = booking;
  return booking;
}

function processBookingPipeline(input) {
  const tenantId = 'HNI_GLOBAL';
  const booking = ensureBooking(input.searchId, input.selectedHotelId, input.customerId, input.customerLayer, tenantId);

  withIdempotency(tenantId, booking.bookingId, 'SELECT', () => {
    advanceBookingLifecycle(booking, 'SELECT');
    return { bookingId: booking.bookingId, stage: 'SELECT' };
  });

  withIdempotency(tenantId, booking.bookingId, 'HOLD', () => {
    if (booking.hold.status !== 'active') {
      throw new Error('hold_not_active');
    }
    advanceBookingLifecycle(booking, 'HOLD');
    return { bookingId: booking.bookingId, stage: 'HOLD' };
  });

  withIdempotency(tenantId, booking.bookingId, 'CONFIRM', () => {
    if (booking.hold.status !== 'active') {
      throw new Error('hold_expired_or_closed');
    }
    advanceBookingLifecycle(booking, 'CONFIRM');
    return { bookingId: booking.bookingId, stage: 'CONFIRM' };
  });

  const payment = withIdempotency(tenantId, booking.bookingId, 'PAYMENT_SUCCESS', () => {
    const paymentId = `PAY-${booking.bookingId}`;
    const existingPayment = uttCoreState.payments[paymentId];
    if (existingPayment && existingPayment.status === 'verified') {
      return existingPayment;
    }
    const paymentRecord = {
      paymentId,
      bookingId: booking.bookingId,
      tenantId,
      status: input.paymentGuaranteeRequired ? 'verified' : 'not_required',
      retrySafe: true,
      updatedAt: new Date().toISOString(),
    };
    uttCoreState.payments[paymentId] = paymentRecord;
    advanceBookingLifecycle(booking, 'PAYMENT_SUCCESS');
    return paymentRecord;
  });

  const invoice = withIdempotency(tenantId, booking.bookingId, 'INVOICE_GENERATED', () => {
    const invoiceId = `INV-${booking.bookingId}`;
    const existingInvoice = uttCoreState.invoices[invoiceId];
    if (existingInvoice) {
      if (existingInvoice.customerId !== booking.customerId || existingInvoice.customerName !== booking.customerLayer) {
        throw new Error('invoice_immutable_violation');
      }
      return existingInvoice;
    }

    const invoiceRecord = {
      invoiceId,
      bookingId: booking.bookingId,
      tenantId,
      customerId: booking.customerId,
      customerName: booking.customerLayer,
      immutable: true,
      createdAt: new Date().toISOString(),
    };
    uttCoreState.invoices[invoiceId] = invoiceRecord;
    advanceBookingLifecycle(booking, 'INVOICE_GENERATED');
    return invoiceRecord;
  });

  withIdempotency(tenantId, booking.bookingId, 'VOUCHER_ISSUED', () => {
    advanceBookingLifecycle(booking, 'VOUCHER_ISSUED');
    booking.hold = {
      status: 'consumed',
      expiresAt: booking.hold.expiresAt,
    };
    return { bookingId: booking.bookingId, stage: 'VOUCHER_ISSUED' };
  });

  uttCoreState.paymentInvoiceLogs.unshift({
    at: new Date().toISOString(),
    paymentStatus: payment.status,
    invoiceStatus: invoice.immutable ? 'immutable' : 'mutable',
    bookingRef: booking.bookingId,
  });

  return {
    booking,
    payment,
    invoice,
    replaySafeRestore: {
      bookingId: booking.bookingId,
      restoredFrom: 'persistent_state',
      lifecycleStage: booking.lifecycleStage,
    },
  };
}

function expireActiveHolds() {
  const now = Date.now();
  Object.values(uttCoreState.bookings).forEach((booking) => {
    if (booking.hold?.status !== 'active') return;
    if (booking.lifecycleStage === 'VOUCHER_ISSUED') return;
    if (new Date(booking.hold.expiresAt).getTime() <= now) {
      booking.hold.status = 'expired';
      uttCoreState.bookingLogs.unshift({
        at: new Date().toISOString(),
        type: 'hold_expired',
        bookingId: booking.bookingId,
      });
    }
  });
}

async function mockSupplierCall(supplier, payload) {
  const sampleBySupplier = {
    EXPEDIA: [
      { id: 'NYC-100', name: 'Metro Grand Hotel', location: payload.location, price: 210, currency: 'USD', rating: 4.4, images: ['https://images.unsplash.com/photo-1566073771259-6a8506099945'], description: 'Central access and modern city rooms.' },
      { id: 'NYC-200', name: 'Hudson Suites', location: payload.location, price: 182, currency: 'USD', rating: 4.1, images: ['https://images.unsplash.com/photo-1551882547-ff40c63fe5fa'], description: 'Business-ready stay with family options.' },
    ],
    HOTELBEDS: [
      { id: 'HB-341', name: 'Metro Grand Hotel', location: payload.location, price: 205, currency: 'USD', rating: 4.4, images: ['https://images.unsplash.com/photo-1445019980597-93fa8acb246c'], description: 'Matched listing from Hotelbeds contract net rates.' },
      { id: 'HB-998', name: 'Cityline Inn', location: payload.location, price: 165, currency: 'USD', rating: 3.9, images: ['https://images.unsplash.com/photo-1522798514-97ceb8c4f1c8'], description: 'Budget-first clean rooms near transit.' },
    ],
    WEBBEDS: [
      { id: 'WB-551', name: 'Harbor View Palace', location: payload.location, price: 198, currency: 'USD', rating: 4.2, images: ['https://images.unsplash.com/photo-1571896349842-33c89424de2d'], description: 'Scenic property with breakfast package.' },
      { id: 'WB-998', name: 'Cityline Inn', location: payload.location, price: 169, currency: 'USD', rating: 3.9, images: ['https://images.unsplash.com/photo-1455587734955-081b22074882'], description: 'Backup source inventory for city stays.' },
    ],
  };

  await new Promise((resolve) => setTimeout(resolve, 120));

  const shouldFail = supplier === 'WEBBEDS' && payload.location.toLowerCase().includes('fail-webbeds');
  if (shouldFail) {
    throw new Error('supplier_unavailable');
  }

  return (sampleBySupplier[supplier] || []).map((item) => mapRawToUnified(item, supplier));
}

window.UnifiedHotelSearchService = {
  async search(input) {
    const suppliers = ['EXPEDIA', 'HOTELBEDS', 'WEBBEDS'];
    const failures = [];
    const allHotels = [];

    for (const supplier of suppliers) {
      try {
        const results = await mockSupplierCall(supplier, input);
        allHotels.push(...results);
        uttCoreState.apiStatus[supplier] = { healthy: true, message: 'live', lastCheck: new Date().toISOString() };
      } catch (error) {
        failures.push({ supplier, error: error instanceof Error ? error.message : 'api_error' });
        uttCoreState.apiStatus[supplier] = { healthy: false, message: 'fallback_triggered', lastCheck: new Date().toISOString() };
      }
    }

    const deduped = dedupeByLowestPrice(allHotels);
    const priced = deduped.map(applyPriceEngine);
    const sorted = sortByLowestPrice(priced);

    const searchId = makeSearchId();
    uttCoreState.searchCache[searchId] = {
      searchId,
      query: input,
      createdAt: new Date().toISOString(),
      hotels: sorted,
      failures,
    };

    uttCoreState.bookingLogs.unshift({
      at: new Date().toISOString(),
      type: 'search_completed',
      searchId,
      records: sorted.length,
      failures: failures.length,
    });
    saveCoreState();
    return { searchId, hotels: sorted, failures };
  },

  getSearch(searchId) {
    return uttCoreState.searchCache[searchId] || null;
  },
};

window.uttCoreSubmitSearch = async function uttCoreSubmitSearch(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = {
    location: form.location.value.trim(),
    checkIn: form.checkIn.value,
    checkOut: form.checkOut.value,
    pax: Number(form.pax.value || 1),
    currency: 'USD',
  };

  if (!payload.location || !payload.checkIn || !payload.checkOut) return;

  const { searchId } = await window.UnifiedHotelSearchService.search(payload);
  window.location.href = `/utt/b2c/results/?searchId=${encodeURIComponent(searchId)}`;
};

function getQueryParam(key) {
  return new URLSearchParams(window.location.search).get(key);
}

function getHotel(searchId, hotelId) {
  const cache = window.UnifiedHotelSearchService.getSearch(searchId);
  if (!cache) return null;
  return cache.hotels.find((hotel) => hotel.hotelId === hotelId) || null;
}

window.uttRenderResults = function uttRenderResults() {
  const searchId = getQueryParam('searchId');
  const table = document.getElementById('uttB2CResults');
  const status = document.getElementById('uttB2CResultsStatus');
  if (!table || !status || !searchId) return;

  const cache = window.UnifiedHotelSearchService.getSearch(searchId);
  if (!cache) {
    status.textContent = 'Search not found. Please start again.';
    table.innerHTML = '';
    return;
  }

  status.textContent = `${cache.hotels.length} hotels loaded. Sorted by lowest price.`;
  table.innerHTML = cache.hotels.map((hotel) => `
    <article class="feature-card">
      <img src="${hotel.images[0]}" alt="${hotel.name}" style="width:100%;height:160px;object-fit:cover;border-radius:14px;margin-bottom:12px" />
      <h3>${hotel.name}</h3>
      <p>${hotel.location}</p>
      <p>Rating: ${hotel.rating}</p>
      <p><strong>${toCurrency(hotel.displayPrice, hotel.currency)}</strong></p>
      <div class="button-row">
        <a class="primary-btn" href="/utt/b2c/hotel/?searchId=${encodeURIComponent(searchId)}&hotelId=${encodeURIComponent(hotel.hotelId)}">View Detail</a>
      </div>
    </article>
  `).join('');
};

window.uttRenderHotelDetail = function uttRenderHotelDetail() {
  const searchId = getQueryParam('searchId');
  const hotelId = getQueryParam('hotelId');
  const target = document.getElementById('uttB2CHotelDetail');
  if (!searchId || !hotelId || !target) return;

  const hotel = getHotel(searchId, hotelId);
  if (!hotel) {
    target.innerHTML = '<p class="muski-muted">Hotel not found. Return to results.</p>';
    return;
  }

  target.innerHTML = `
    <section class="content-grid two">
      <article class="info-card">
        <img src="${hotel.images[0]}" alt="${hotel.name}" style="width:100%;height:280px;object-fit:cover;border-radius:14px;margin-bottom:14px" />
        <h3>${hotel.name}</h3>
        <p>${hotel.description}</p>
      </article>
      <article class="info-card">
        <h3>Price Breakdown</h3>
        <ul class="info-list">
          <li>Mode: ${hotel.mode}</li>
          <li>Displayed Price: ${toCurrency(hotel.displayPrice, hotel.currency)}</li>
          <li>Margin Applied: ${toCurrency(hotel.marginApplied, hotel.currency)}</li>
          <li>Supplier: ${hotel.supplier}</li>
          <li>Rating: ${hotel.rating}</li>
        </ul>
        <div class="button-row">
          <a class="primary-btn" href="/utt/b2c/booking/?searchId=${encodeURIComponent(searchId)}&hotelId=${encodeURIComponent(hotel.hotelId)}">Select & Book</a>
        </div>
      </article>
    </section>
  `;
};

window.uttSubmitBooking = function uttSubmitBooking(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const searchId = getQueryParam('searchId');
  const hotelId = getQueryParam('hotelId');
  if (!searchId || !hotelId) return;

  const bookingInput = {
    searchId,
    selectedHotelId: hotelId,
    customerId: form.customerId.value.trim(),
    customerLayer: form.customerLayer.value.trim(),
    paymentGuaranteeRequired: form.paymentGuaranteeRequired.checked,
  };

  if (!bookingInput.customerId || !bookingInput.customerLayer) {
    return;
  }

  expireActiveHolds();

  try {
    const output = processBookingPipeline(bookingInput);
    saveCoreState();

    const result = document.getElementById('uttB2CBookingResult');
    if (result) {
      result.innerHTML = `<div class="muski-log-item"><strong>Booking stabilized</strong><br/>bookingId: ${output.booking.bookingId}<br/>lifecycleStage: ${output.booking.lifecycleStage}<br/>paymentStatus: ${output.payment.status}<br/>invoiceId: ${output.invoice.invoiceId}<br/><em>Lifecycle, idempotency, immutability, payment lock and replay safety enforced from persistent state.</em></div>`;
    }
  } catch (error) {
    const result = document.getElementById('uttB2CBookingResult');
    if (result) {
      result.innerHTML = `<div class="muski-log-item"><strong>Booking blocked</strong><br/><em>${error instanceof Error ? error.message : 'pipeline_error'}</em></div>`;
    }
  }
};

window.uttAdminToggleMode = function uttAdminToggleMode(mode) {
  uttCoreState.marginConfig.mode = mode;
  uttCoreState.bookingLogs.unshift({
    at: new Date().toISOString(),
    type: 'margin_mode_updated',
    mode,
  });
  saveCoreState();
  window.uttRenderAdmin();
};

window.uttAdminSaveMargin = function uttAdminSaveMargin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  uttCoreState.marginConfig.marginType = form.marginType.value;
  uttCoreState.marginConfig.dynamicMarginPct = Number(form.dynamicMarginPct.value || 0);
  uttCoreState.marginConfig.fixedMarginAmount = Number(form.fixedMarginAmount.value || 0);
  uttCoreState.marginConfig.minimalMarginPct = Number(form.minimalMarginPct.value || 0);
  uttCoreState.bookingLogs.unshift({ at: new Date().toISOString(), type: 'margin_config_saved' });
  saveCoreState();
  window.uttRenderAdmin();
};

window.uttRenderAdmin = function uttRenderAdmin() {
  const modeTarget = document.getElementById('uttAdminModeStatus');
  if (modeTarget) {
    modeTarget.textContent = `Current mode: ${uttCoreState.marginConfig.mode}`;
  }

  const apiTarget = document.getElementById('uttAdminApiStatus');
  if (apiTarget) {
    apiTarget.innerHTML = `
      <tr><th>Supplier</th><th>Status</th><th>Message</th><th>Last Check</th></tr>
      ${Object.entries(uttCoreState.apiStatus).map(([supplier, row]) => `
        <tr>
          <td>${supplier}</td>
          <td><span class="muski-badge ${row.healthy ? 'approved' : 'blocked'}">${row.healthy ? 'UP' : 'DOWN'}</span></td>
          <td>${row.message}</td>
          <td>${new Date(row.lastCheck).toLocaleString()}</td>
        </tr>
      `).join('')}
    `;
  }

  const bookingLogsTarget = document.getElementById('uttAdminBookingLogs');
  if (bookingLogsTarget) {
    bookingLogsTarget.innerHTML = `
      <tr><th>Timestamp</th><th>Type</th><th>Data</th></tr>
      ${uttCoreState.bookingLogs.slice(0, 20).map((row) => `
        <tr>
          <td>${new Date(row.at).toLocaleString()}</td>
          <td>${row.type}</td>
          <td>${JSON.stringify(row.bookingId || row.stage || row.payload || row.mode || row.records || '')}</td>
        </tr>
      `).join('') || '<tr><td colspan="3">No logs yet.</td></tr>'}
    `;
  }

  const financeLogsTarget = document.getElementById('uttAdminFinanceLogs');
  if (financeLogsTarget) {
    financeLogsTarget.innerHTML = `
      <tr><th>Timestamp</th><th>Payment</th><th>Invoice</th><th>Reference</th></tr>
      ${uttCoreState.paymentInvoiceLogs.slice(0, 20).map((row) => `
        <tr>
          <td>${new Date(row.at).toLocaleString()}</td>
          <td>${row.paymentStatus}</td>
          <td>${row.invoiceStatus}</td>
          <td>${row.bookingRef}</td>
        </tr>
      `).join('') || '<tr><td colspan="4">No finance logs yet.</td></tr>'}
    `;
  }

  const marginForm = document.getElementById('uttAdminMarginForm');
  if (marginForm) {
    marginForm.marginType.value = uttCoreState.marginConfig.marginType;
    marginForm.dynamicMarginPct.value = uttCoreState.marginConfig.dynamicMarginPct;
    marginForm.fixedMarginAmount.value = uttCoreState.marginConfig.fixedMarginAmount;
    marginForm.minimalMarginPct.value = uttCoreState.marginConfig.minimalMarginPct;
  }
};
