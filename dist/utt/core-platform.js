const UTT_CORE_STORAGE_KEY = 'utt_core_platform_state_v1';

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
      bookingLogs: parsed.bookingLogs || [],
      paymentInvoiceLogs: parsed.paymentInvoiceLogs || [],
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
    customerLayer: form.customerLayer.value,
    paymentGuaranteeRequired: form.paymentGuaranteeRequired.checked,
  };

  uttCoreState.bookingLogs.unshift({
    at: new Date().toISOString(),
    type: 'booking_input_pipeline',
    payload: bookingInput,
    phase2Engine: 'routed',
  });

  uttCoreState.paymentInvoiceLogs.unshift({
    at: new Date().toISOString(),
    paymentStatus: bookingInput.paymentGuaranteeRequired ? 'pending_verification' : 'not_required',
    invoiceStatus: 'phase2_invoice_pipeline_locked',
    bookingRef: `${searchId}:${hotelId}`,
  });

  saveCoreState();
  const result = document.getElementById('uttB2CBookingResult');
  if (result) {
    result.innerHTML = `<div class="muski-log-item"><strong>Booking pipeline submitted</strong><br/>searchId: ${bookingInput.searchId}<br/>selectedHotelId: ${bookingInput.selectedHotelId}<br/>customerId: ${bookingInput.customerId}<br/>customerLayer: ${bookingInput.customerLayer}<br/>paymentGuaranteeRequired: ${bookingInput.paymentGuaranteeRequired}<br/><em>Passed into locked Phase 2 lifecycle/payment/invoice/idempotency engine.</em></div>`;
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
          <td>${JSON.stringify(row.payload || row.mode || row.records || '')}</td>
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
