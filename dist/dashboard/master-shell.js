(function () {
  const STORAGE_KEYS = {
    role: 'hni_os.role',
    family: 'hni_os.family',
    routeContext: 'hni_os.route_context',
    identity: 'hni_os.identity'
  };

  const ROLE_PERMISSIONS = {
    owner: {
      label: 'Owner',
      canAccess: ['governance', 'dashboard', 'muski', 'legalnomics', 'airnomics', 'edunomics'],
      canSwitchFamilies: ['core', 'legalnomics', 'airnomics', 'edunomics', 'muski']
    },
    governance_admin: {
      label: 'Governance Admin',
      canAccess: ['governance', 'dashboard', 'muski', 'legalnomics', 'airnomics', 'edunomics'],
      canSwitchFamilies: ['core', 'legalnomics', 'airnomics', 'edunomics', 'muski']
    },
    os_director: {
      label: 'OS Director',
      canAccess: ['dashboard', 'muski', 'legalnomics', 'airnomics', 'edunomics'],
      canSwitchFamilies: ['legalnomics', 'airnomics', 'edunomics', 'muski']
    },
    legal_ops: {
      label: 'Legal Ops',
      canAccess: ['muski', 'legalnomics'],
      canSwitchFamilies: ['legalnomics', 'muski']
    },
    air_ops: {
      label: 'Air Ops',
      canAccess: ['muski', 'airnomics'],
      canSwitchFamilies: ['airnomics', 'muski']
    },
    edu_ops: {
      label: 'Edu Ops',
      canAccess: ['muski', 'edunomics'],
      canSwitchFamilies: ['edunomics', 'muski']
    },
    observer: {
      label: 'Observer',
      canAccess: ['dashboard', 'muski'],
      canSwitchFamilies: ['core', 'muski']
    }
  };

  const NAV_SECTIONS = [
    {
      title: 'Central Governance',
      items: [
        { key: 'governance', href: '/dashboard/', label: 'Umbrella Governance', family: 'core', matchPrefixes: ['/dashboard/'] },
        { key: 'muski', href: '/muski/', label: 'MUSKI Command Layer', family: 'muski', matchPrefixes: ['/muski/'] }
      ]
    },
    {
      title: 'OS Families',
      items: [
        { key: 'legalnomics', href: '/legalnomics/', label: 'AI LEGALNOMICS OS', family: 'legalnomics', matchPrefixes: ['/legalnomics/'] },
        { key: 'airnomics', href: '/airnomics/', label: 'AI AIRNOMICS OS', family: 'airnomics', matchPrefixes: ['/airnomics/'] },
        { key: 'edunomics', href: '/edunomics/', label: 'AI EDUNOMICS OS', family: 'edunomics', matchPrefixes: ['/edunomics/'] }
      ]
    }
  ];

  function normalizeRoute(route, fallback = '/') {
    if (!route || typeof route !== 'string') return fallback;
    const [pathOnly, queryHash = ''] = route.split(/(?=[?#])/);
    let normalized = pathOnly.trim();
    if (!normalized.startsWith('/')) normalized = `/${normalized}`;
    normalized = normalized.replace(/\/index\.html$/i, '/');
    normalized = normalized.replace(/\/{2,}/g, '/');
    if (!normalized.endsWith('/')) {
      const lastSegment = normalized.split('/').filter(Boolean).pop() || '';
      if (!lastSegment.includes('.')) normalized = `${normalized}/`;
    }
    return `${normalized}${queryHash}`;
  }

  function readStorage(key, fallback) {
    try {
      return localStorage.getItem(key) || fallback;
    } catch (_) {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (_) {
      // Ignore storage failures in restricted browser contexts.
    }
  }

  function getCurrentRole() {
    const role = readStorage(STORAGE_KEYS.role, 'owner');
    return ROLE_PERMISSIONS[role] ? role : 'owner';
  }

  function setRouteContinuity(currentRoute, family) {
    if (!currentRoute) return;
    const contextRaw = readStorage(STORAGE_KEYS.routeContext, '{}');
    let context;
    try {
      context = JSON.parse(contextRaw);
    } catch (_) {
      context = {};
    }

    context[family || 'core'] = currentRoute;
    writeStorage(STORAGE_KEYS.routeContext, JSON.stringify(context));
    writeStorage(STORAGE_KEYS.family, family || 'core');
  }

  function getContinuityRoute(family, fallback) {
    const contextRaw = readStorage(STORAGE_KEYS.routeContext, '{}');
    try {
      const context = JSON.parse(contextRaw);
      return context[family] || fallback;
    } catch (_) {
      return fallback;
    }
  }

  function getIdentity(role) {
    const fallback = JSON.stringify({
      name: 'HNI Enterprise User',
      id: 'HNI-ID-0001',
      role
    });
    const raw = readStorage(STORAGE_KEYS.identity, fallback);
    try {
      return JSON.parse(raw);
    } catch (_) {
      return JSON.parse(fallback);
    }
  }

  function renderRoleSelector(currentRole) {
    const options = Object.entries(ROLE_PERMISSIONS)
      .map(([key, role]) => `<option value="${key}" ${key === currentRole ? 'selected' : ''}>${role.label}</option>`)
      .join('');

    return `
      <label class="shell-role-control">Role Scope
        <select id="hniRoleSwitcher" class="shell-select">${options}</select>
      </label>
    `;
  }

  function renderNav(currentRoute, rolePolicy) {
    const normalizedCurrentRoute = normalizeRoute(currentRoute, '/');
    return NAV_SECTIONS.map((section) => {
      const links = section.items
        .filter((item) => rolePolicy.canAccess.includes(item.key))
        .map((route) => {
          const active = (route.matchPrefixes || [route.href]).some((prefix) => normalizedCurrentRoute.startsWith(prefix)) ? 'active' : '';
          const continuityHref = normalizeRoute(getContinuityRoute(route.family, route.href), route.href);
          return `<a class="shell-nav-link ${active}" data-family="${route.family}" href="${continuityHref}">${route.label}</a>`;
        })
        .join('');

      if (!links) return '';
      return `<div class="shell-nav-group"><div class="shell-nav-title">${section.title}</div>${links}</div>`;
    }).join('');
  }

  function renderBreadcrumbs(breadcrumb) {
    if (!Array.isArray(breadcrumb) || breadcrumb.length === 0) return '';
    const items = breadcrumb.map((entry) => (typeof entry === 'string' ? { label: entry } : entry));
    return items
      .map((entry, index) => {
        const isLast = index === items.length - 1;
        const safeLabel = entry.label || `Step ${index + 1}`;
        const safeHref = entry.href ? normalizeRoute(entry.href, '/') : '';
        const node = safeHref && !isLast
          ? `<a class="shell-breadcrumb-link" href="${safeHref}">${safeLabel}</a>`
          : `<span>${safeLabel}</span>`;
        return `${node}${!isLast ? '<span class="shell-breadcrumb-sep">›</span>' : ''}`;
      })
      .join('');
  }

  function mount(config) {
    const target = document.getElementById(config.mountId || 'app');
    if (!target) return;

    const currentRole = getCurrentRole();
    const rolePolicy = ROLE_PERMISSIONS[currentRole];
    const activeFamily = config.activeFamily || readStorage(STORAGE_KEYS.family, 'core');
    const identity = getIdentity(currentRole);
    const currentRoute = normalizeRoute(config.currentRoute, '/');
    setRouteContinuity(currentRoute, activeFamily);

    const breadcrumb = renderBreadcrumbs(config.breadcrumb || []);
    const chips = (config.chips || []).map((chip) => `<span class="shell-chip">${chip}</span>`).join('');
    const backLink = config.backHref
      ? `<a class="shell-back-link" href="${normalizeRoute(config.backHref, '/')}">← ${config.backLabel || 'Back'}</a>`
      : '';

    target.innerHTML = `
      <div class="shell-layout locked-shell">
        <aside class="shell-sidebar">
          <div class="shell-brand-card">
            <h2>HNI WORLD OS</h2>
            <p>Umbrella enterprise shell with central governance, shared identity, and role-aware cross-OS continuity.</p>
            <div class="shell-identity">
              <strong>${identity.name}</strong>
              <small>${identity.id} · ${rolePolicy.label}</small>
            </div>
            ${renderRoleSelector(currentRole)}
          </div>
          ${renderNav(currentRoute, rolePolicy)}
        </aside>

        <main class="shell-main">
          <header class="shell-topbar">
            <div>
              <h1>${config.title}</h1>
              <nav class="shell-breadcrumbs" aria-label="Breadcrumb">${breadcrumb}</nav>
            </div>
            <div class="shell-top-actions">
              ${config.status ? `<span class="shell-chip shell-chip-status">${config.status}</span>` : ''}
              <span class="shell-chip">Access: ${rolePolicy.label}</span>
              ${chips}
            </div>
          </header>

          <section class="shell-route-container">
            ${backLink}
            ${config.contentHtml || ''}
          </section>
        </main>
      </div>
    `;

    const roleSwitcher = document.getElementById('hniRoleSwitcher');
    if (roleSwitcher) {
      roleSwitcher.addEventListener('change', function (event) {
        writeStorage(STORAGE_KEYS.role, event.target.value);
        window.location.reload();
      });
    }

    document.querySelectorAll('[data-family]').forEach((link) => {
      link.addEventListener('click', (event) => {
        const family = event.currentTarget.getAttribute('data-family') || 'core';
        if (!rolePolicy.canSwitchFamilies.includes(family)) {
          event.preventDefault();
          alert(`Access denied for ${ROLE_PERMISSIONS[currentRole].label} in ${family.toUpperCase()} family.`);
          return;
        }
        writeStorage(STORAGE_KEYS.family, family);
      });
    });
  }

  window.HNIWorldShell = { mount, ROLE_PERMISSIONS, NAV_SECTIONS };
})();
