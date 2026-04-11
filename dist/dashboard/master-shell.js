(function () {
  const MODULE_ROUTES = [
    { href: '/dashboard/', label: 'Owner Dashboard' },
    { href: '/muski/', label: 'MUSKI AI' },
    { href: '/legalnomics/', label: 'AI LEGALNOMICS OS' },
    { href: '/airnomics/', label: 'AI AIRNOMICS OS' },
    { href: '/edunomics/', label: 'AI EDUNOMICS OS' }
  ];

  function renderNav(currentRoute) {
    return MODULE_ROUTES.map((route) => {
      const active = currentRoute === route.href ? 'active' : '';
      return `<a class="shell-nav-link ${active}" href="${route.href}">${route.label}</a>`;
    }).join('');
  }

  function mount(config) {
    const target = document.getElementById(config.mountId || 'app');
    if (!target) return;

    const breadcrumb = (config.breadcrumb || []).join(' > ');
    const chips = (config.chips || []).map((chip) => `<span class="shell-chip">${chip}</span>`).join('');
    const backLink = config.backHref
      ? `<a class="shell-back-link" href="${config.backHref}">← ${config.backLabel || 'Back'}</a>`
      : '';

    target.innerHTML = `
      <div class="shell-layout locked-shell">
        <aside class="shell-sidebar">
          <div class="shell-brand-card">
            <h2>HNI WORLD OS</h2>
            <p>Locked enterprise master shell across all active operating modules.</p>
          </div>
          <div class="shell-nav-group">
            <div class="shell-nav-title">MASTER COMMAND</div>
            ${renderNav(config.currentRoute)}
          </div>
        </aside>

        <main class="shell-main">
          <header class="shell-topbar">
            <div>
              <h1>${config.title}</h1>
              <p>${breadcrumb}</p>
            </div>
            <div class="shell-top-actions">
              ${config.status ? `<span class="shell-chip shell-chip-status">${config.status}</span>` : ''}
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
  }

  window.HNIWorldShell = { mount };
})();
