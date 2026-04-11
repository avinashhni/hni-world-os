(function () {
  const now = new Date().toISOString();

  const LEGAL_MODELS = {
    legalLead: ['id', 'status', 'priority', 'owner', 'createdAt', 'updatedAt', 'tags', 'source', 'notes', 'attachments', 'issueType', 'urgency', 'city', 'jurisdiction'],
    legalCase: ['id', 'status', 'priority', 'owner', 'createdAt', 'updatedAt', 'tags', 'source', 'notes', 'attachments', 'leadId', 'hearingDate', 'filingProgress', 'pendingOrder'],
    hearing: ['id', 'status', 'priority', 'owner', 'createdAt', 'updatedAt', 'tags', 'source', 'notes', 'attachments', 'caseId', 'nextAction', 'hearingDate'],
    verdict: ['id', 'status', 'priority', 'owner', 'createdAt', 'updatedAt', 'tags', 'source', 'notes', 'attachments', 'caseId', 'recommendation', 'reviewer'],
    challengeReview: ['id', 'status', 'priority', 'owner', 'createdAt', 'updatedAt', 'tags', 'source', 'notes', 'attachments', 'verdictId', 'filingDeadline', 'priorityScore'],
    advocateProfile: ['id', 'status', 'priority', 'owner', 'createdAt', 'updatedAt', 'tags', 'source', 'notes', 'attachments', 'name', 'capacity', 'city', 'specialization'],
    corporateMatter: ['id', 'status', 'priority', 'owner', 'createdAt', 'updatedAt', 'tags', 'source', 'notes', 'attachments', 'matterType', 'assignedCounsel', 'dueDate', 'riskLevel'],
    legalDocument: ['id', 'status', 'priority', 'owner', 'createdAt', 'updatedAt', 'tags', 'source', 'notes', 'attachments', 'caseId', 'matterId', 'advocateId', 'docType', 'verificationState', 'expiryDate'],
    complianceTask: ['id', 'status', 'priority', 'owner', 'createdAt', 'updatedAt', 'tags', 'source', 'notes', 'attachments', 'matterId', 'dueDate'],
    consultationBooking: ['id', 'status', 'priority', 'owner', 'createdAt', 'updatedAt', 'tags', 'source', 'notes', 'attachments', 'leadId', 'slot', 'consultant'],
    partnerLawFirm: ['id', 'status', 'priority', 'owner', 'createdAt', 'updatedAt', 'tags', 'source', 'notes', 'attachments', 'name', 'city', 'tier', 'activeMatters'],
    legalActivityLog: ['id', 'status', 'priority', 'owner', 'createdAt', 'updatedAt', 'tags', 'source', 'notes', 'attachments', 'entityType', 'entityId', 'eventType']
  };

  const WORKFLOWS = {
    b2cIntake: ['new', 'under_review', 'consultation_scheduled', 'advocate_matched', 'active_case', 'closed', 'dropped'],
    advocateCase: ['intake', 'document_review', 'filing_prep', 'hearing_active', 'order_received', 'verdict_review', 'closed'],
    corporateOps: ['new_matter', 'compliance_review', 'counsel_assignment', 'hearing_or_notice_tracking', 'resolution', 'archived'],
    verdictChallenge: ['verdict_uploaded', 'AI_review_pending', 'challenge_recommended', 'no_challenge', 'legal_strategy_review', 'appeal_initiated', 'closed']
  };

  const DATA = {
    legalLead: [
      { id: 'lead-1001', status: 'new', priority: 'high', owner: 'Intake Desk A', createdAt: now, updatedAt: now, tags: ['consumer', 'employment'], source: 'web_form', notes: 'Termination dispute with urgent hearing risk.', attachments: ['doc-2001'], issueType: 'Employment', urgency: 'Urgent', city: 'Mumbai', jurisdiction: 'MH High Court' },
      { id: 'lead-1002', status: 'under_review', priority: 'medium', owner: 'Intake Desk B', createdAt: now, updatedAt: now, tags: ['property'], source: 'partner_referral', notes: 'Property title conflict.', attachments: [], issueType: 'Property', urgency: 'Normal', city: 'Delhi', jurisdiction: 'Delhi HC' }
    ],
    legalCase: [
      { id: 'case-301', status: 'document_review', priority: 'high', owner: 'Adv. Sharma', createdAt: now, updatedAt: now, tags: ['b2c'], source: 'lead-1001', notes: 'Documents staged for filing.', attachments: ['doc-2001', 'doc-2002'], leadId: 'lead-1001', hearingDate: '2026-04-16', filingProgress: '68%', pendingOrder: true },
      { id: 'case-302', status: 'hearing_active', priority: 'medium', owner: 'Adv. Iyer', createdAt: now, updatedAt: now, tags: ['consumer'], source: 'lead-0998', notes: 'Cross examination in progress.', attachments: ['doc-2006'], leadId: 'lead-0998', hearingDate: '2026-04-13', filingProgress: '92%', pendingOrder: false }
    ],
    hearing: [
      { id: 'hear-880', status: 'scheduled', priority: 'high', owner: 'Adv. Sharma', createdAt: now, updatedAt: now, tags: ['case-301'], source: 'court_feed', notes: 'Preliminary admission hearing.', attachments: ['doc-2002'], caseId: 'case-301', nextAction: 'File rejoinder', hearingDate: '2026-04-16' },
      { id: 'hear-881', status: 'completed', priority: 'medium', owner: 'Adv. Iyer', createdAt: now, updatedAt: now, tags: ['case-302'], source: 'court_feed', notes: 'Order reserved.', attachments: [], caseId: 'case-302', nextAction: 'Await order copy', hearingDate: '2026-04-10' }
    ],
    verdict: [
      { id: 'ver-500', status: 'AI_review_pending', priority: 'high', owner: 'Review Cell 1', createdAt: now, updatedAt: now, tags: ['appeal_risk'], source: 'upload_portal', notes: 'Adverse order, likely challenge.', attachments: ['doc-2901'], caseId: 'case-302', recommendation: 'challenge_recommended', reviewer: 'Senior Counsel A' }
    ],
    challengeReview: [
      { id: 'ch-700', status: 'legal_strategy_review', priority: 'high', owner: 'Appellate Desk', createdAt: now, updatedAt: now, tags: ['deadline_72h'], source: 'ver-500', notes: 'Grounds prepared. Await owner sign-off.', attachments: ['doc-2901'], verdictId: 'ver-500', filingDeadline: '2026-04-14', priorityScore: 94 }
    ],
    advocateProfile: [
      { id: 'adv-01', status: 'active', priority: 'high', owner: 'Legalnomics Network', createdAt: now, updatedAt: now, tags: ['employment', 'corporate'], source: 'partner_law_firm', notes: 'Capacity available for 6 matters.', attachments: ['bar-license.pdf'], name: 'Adv. Sharma', capacity: '6 open', city: 'Mumbai', specialization: 'Employment + Corporate' }
    ],
    corporateMatter: [
      { id: 'corp-10', status: 'compliance_review', priority: 'high', owner: 'Corp Cell 2', createdAt: now, updatedAt: now, tags: ['notice'], source: 'enterprise_portal', notes: 'Regulatory notice from labour authority.', attachments: ['doc-4001'], matterType: 'Compliance Notice', assignedCounsel: 'Adv. Sharma', dueDate: '2026-04-20', riskLevel: 'High' }
    ],
    legalDocument: [
      { id: 'doc-2001', status: 'verified', priority: 'high', owner: 'DocOps', createdAt: now, updatedAt: now, tags: ['case-301'], source: 'lead_upload', notes: 'Employment agreement copy.', attachments: ['s3://docs/doc-2001.pdf'], caseId: 'case-301', matterId: '-', advocateId: 'adv-01', docType: 'Agreement', verificationState: 'verified', expiryDate: '2028-04-10' }
    ],
    complianceTask: [
      { id: 'comp-92', status: 'open', priority: 'medium', owner: 'Corp Cell 2', createdAt: now, updatedAt: now, tags: ['corp-10'], source: 'corp-10', notes: 'File compliance response.', attachments: ['doc-4001'], matterId: 'corp-10', dueDate: '2026-04-18' }
    ],
    consultationBooking: [
      { id: 'consult-31', status: 'scheduled', priority: 'medium', owner: 'Consult Desk', createdAt: now, updatedAt: now, tags: ['lead-1002'], source: 'legalLead', notes: 'Initial consult booked', attachments: [], leadId: 'lead-1002', slot: '2026-04-12T10:30:00Z', consultant: 'Counsel Intake 1' }
    ],
    partnerLawFirm: [
      { id: 'firm-22', status: 'active', priority: 'medium', owner: 'Partner Ops', createdAt: now, updatedAt: now, tags: ['tier1'], source: 'onboarding', notes: 'Strong appellate bench.', attachments: ['agreement-firm-22.pdf'], name: 'Lex Frontier LLP', city: 'Mumbai', tier: 'Tier-1', activeMatters: 12 }
    ],
    legalActivityLog: [
      { id: 'log-1', status: 'recorded', priority: 'low', owner: 'System', createdAt: now, updatedAt: now, tags: ['audit'], source: 'workflow_engine', notes: 'Case case-301 moved to document_review', attachments: [], entityType: 'legalCase', entityId: 'case-301', eventType: 'status_change' }
    ]
  };

  const API_CONTRACT = {
    createLead: { method: 'POST', path: '/api/legalnomics/leads' },
    assignAdvocate: { method: 'PATCH', path: '/api/legalnomics/cases/:caseId/assignee' },
    createCase: { method: 'POST', path: '/api/legalnomics/cases' },
    scheduleConsultation: { method: 'POST', path: '/api/legalnomics/consultations' },
    updateHearing: { method: 'PATCH', path: '/api/legalnomics/hearings/:hearingId' },
    uploadVerdict: { method: 'POST', path: '/api/legalnomics/verdicts' },
    markChallengeReview: { method: 'PATCH', path: '/api/legalnomics/challenges/:challengeId' },
    escalateMatter: { method: 'POST', path: '/api/legalnomics/escalations' },
    closeCase: { method: 'PATCH', path: '/api/legalnomics/cases/:caseId/close' },
    archiveMatter: { method: 'PATCH', path: '/api/legalnomics/corporate/:matterId/archive' }
  };

  const ROUTES = [
    { label: 'Home', href: '/legalnomics/' },
    { label: 'Intake', href: '/legalnomics/intake/' },
    { label: 'B2C', href: '/legalnomics/b2c/' },
    { label: 'Advocate', href: '/legalnomics/advocate/' },
    { label: 'Corporate', href: '/legalnomics/corporate/' },
    { label: 'Hearings', href: '/legalnomics/hearings/' },
    { label: 'Verdicts', href: '/legalnomics/verdicts/' },
    { label: 'Challenges', href: '/legalnomics/challenges/' },
    { label: 'Documents', href: '/legalnomics/documents/' },
    { label: 'Intelligence', href: '/legalnomics/intelligence/' },
    { label: 'Owner', href: '/legalnomics/owner/' }
  ];

  const service = {
    createLead(payload) { DATA.legalLead.unshift(payload); },
    assignAdvocate(caseId, owner) { const record = DATA.legalCase.find((row) => row.id === caseId); if (record) record.owner = owner; },
    createCase(payload) { DATA.legalCase.unshift(payload); },
    scheduleConsultation(payload) { DATA.consultationBooking.unshift(payload); },
    updateHearing(hearingId, status) { const record = DATA.hearing.find((row) => row.id === hearingId); if (record) record.status = status; },
    uploadVerdict(payload) { DATA.verdict.unshift(payload); },
    markChallengeReview(challengeId, status) { const record = DATA.challengeReview.find((row) => row.id === challengeId); if (record) record.status = status; },
    escalateMatter(entityId, note) { DATA.legalActivityLog.unshift({ id: `log-${Date.now()}`, status: 'recorded', priority: 'high', owner: 'MUSKI Escalation Bot', createdAt: now, updatedAt: now, tags: [entityId], source: 'manual_action', notes: note, attachments: [], entityType: 'escalation', entityId, eventType: 'escalated' }); },
    closeCase(caseId) { const record = DATA.legalCase.find((row) => row.id === caseId); if (record) record.status = 'closed'; },
    archiveMatter(matterId) { const record = DATA.corporateMatter.find((row) => row.id === matterId); if (record) record.status = 'archived'; }
  };

  function badge(priority) { return `<span class="legal-badge ${String(priority || '').toLowerCase()}">${priority || 'NA'}</span>`; }

  function routeTabs(currentRoute) {
    return `<article class="table-card"><div class="route-tabs">${ROUTES.map((route) => `<a class="route-tab ${route.href === currentRoute ? 'active' : ''}" href="${route.href}">${route.label}</a>`).join('')}</div></article>`;
  }

  function toolbarHtml(screen) {
    return `<article class="table-card"><div class="legal-toolbar"><input id="legalSearch" class="legal-input" placeholder="Search ${screen} records" /><select id="statusFilter" class="legal-select"><option value="all">All Status</option></select><select id="priorityFilter" class="legal-select"><option value="all">All Priority</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select><button id="actionCreateLead" class="secondary-btn">Create Lead</button><button id="actionAssignAdvocate" class="secondary-btn">Assign Advocate</button><button id="actionCreateCase" class="secondary-btn">Create Case</button><button id="actionEscalate" class="secondary-btn">Escalate to MUSKI</button></div><p class="legal-mini">API contract ready for backend binding: ${Object.values(API_CONTRACT).map((item) => `${item.method} ${item.path}`).slice(0, 5).join(' · ')}</p></article>`;
  }

  function screenConfig(screen) {
    if (screen === 'home') {
      return {
        columns: ['id', 'status', 'priority', 'owner', 'source', 'notes'],
        rows: [...DATA.legalCase, ...DATA.corporateMatter],
        summary: [
          ['Open matters', DATA.legalCase.filter((x) => x.status !== 'closed').length + DATA.corporateMatter.filter((x) => x.status !== 'archived').length],
          ['Hearings due', DATA.hearing.filter((x) => x.status === 'scheduled').length],
          ['Verdicts awaiting review', DATA.verdict.filter((x) => String(x.status).includes('review')).length],
          ['Challenge queue', DATA.challengeReview.length],
          ['Lead routing', DATA.legalLead.filter((x) => x.status === 'under_review').length],
          ['Advocate capacity snapshot', DATA.advocateProfile.length],
          ['Corporate matters snapshot', DATA.corporateMatter.length],
          ['Owner review queue', DATA.challengeReview.filter((x) => String(x.status).includes('review')).length]
        ]
      };
    }
    if (screen === 'intake' || screen === 'b2c') {
      return { columns: ['id', 'issueType', 'urgency', 'city', 'jurisdiction', 'status', 'priority', 'owner'], rows: DATA.legalLead, summary: [['Incoming leads', DATA.legalLead.length], ['Consultations', DATA.consultationBooking.length], ['Lead routing', DATA.legalLead.filter((x) => x.status === 'under_review').length], ['Escalations', DATA.legalActivityLog.filter((x) => x.owner.includes('MUSKI')).length]] };
    }
    if (screen === 'advocate') {
      return { columns: ['id', 'status', 'hearingDate', 'filingProgress', 'pendingOrder', 'priority', 'owner'], rows: DATA.legalCase, summary: [['Assigned cases', DATA.legalCase.length], ['Hearing calendar snapshot', DATA.hearing.filter((x) => x.status === 'scheduled').length], ['Document checklist', DATA.legalDocument.length], ['Verdict review queue', DATA.verdict.length]] };
    }
    if (screen === 'corporate') {
      return { columns: ['id', 'matterType', 'assignedCounsel', 'dueDate', 'riskLevel', 'status', 'priority'], rows: DATA.corporateMatter, summary: [['Corporate matters', DATA.corporateMatter.length], ['Compliance tasks', DATA.complianceTask.length], ['High risk', DATA.corporateMatter.filter((x) => x.riskLevel === 'High').length], ['Status pipeline', DATA.corporateMatter.filter((x) => x.status !== 'archived').length]] };
    }
    if (screen === 'hearings') {
      return { columns: ['id', 'caseId', 'hearingDate', 'status', 'owner', 'nextAction', 'priority'], rows: DATA.hearing, summary: [['Upcoming hearings', DATA.hearing.filter((x) => x.status === 'scheduled').length], ['Past hearings', DATA.hearing.filter((x) => x.status === 'completed').length], ['Hearing risk alerts', 1], ['Next action due', DATA.hearing.filter((x) => x.nextAction).length]] };
    }
    if (screen === 'verdicts') {
      return { columns: ['id', 'caseId', 'status', 'recommendation', 'reviewer', 'priority', 'owner'], rows: DATA.verdict, summary: [['Uploaded verdicts', DATA.verdict.length], ['AI review pending', DATA.verdict.filter((x) => x.status === 'AI_review_pending').length], ['Challenge recommended', DATA.verdict.filter((x) => x.recommendation === 'challenge_recommended').length], ['Verdict backlog alerts', DATA.verdict.length]] };
    }
    if (screen === 'challenges') {
      return { columns: ['id', 'verdictId', 'priorityScore', 'filingDeadline', 'status', 'owner', 'priority'], rows: DATA.challengeReview, summary: [['Challenge candidates', DATA.challengeReview.length], ['High priority score', DATA.challengeReview.filter((x) => x.priorityScore > 80).length], ['Owner review queue', DATA.challengeReview.filter((x) => String(x.status).includes('review')).length], ['Challenge readiness', DATA.challengeReview.filter((x) => x.status !== 'closed').length]] };
    }
    if (screen === 'documents') {
      return { columns: ['id', 'docType', 'caseId', 'matterId', 'advocateId', 'verificationState', 'expiryDate'], rows: DATA.legalDocument, summary: [['Document registry', DATA.legalDocument.length], ['Verification pending', DATA.legalDocument.filter((x) => x.status !== 'verified').length], ['Expiry / renewal', DATA.legalDocument.filter((x) => x.expiryDate).length], ['Upload placeholder', 1]] };
    }
    return { columns: ['id', 'status', 'priority', 'owner', 'eventType', 'notes'], rows: DATA.legalActivityLog, summary: [['Total demand', DATA.legalLead.length], ['Partner productivity', DATA.partnerLawFirm.length], ['Hearing load', DATA.hearing.length], ['Verdict queue', DATA.verdict.length], ['Challenge readiness', DATA.challengeReview.length], ['High-priority cases', DATA.legalCase.filter((x) => x.priority === 'high').length], ['Operational bottlenecks', DATA.challengeReview.filter((x) => x.priorityScore > 80).length], ['Legal intelligence notes', DATA.legalActivityLog.length]] };
  }

  function mount(config) {
    const state = { selectedId: null, search: '', status: 'all', priority: 'all' };
    const { rows, columns, summary } = screenConfig(config.screen);

    HNIWorldShell.mount({
      currentRoute: config.currentRoute,
      activeFamily: 'legalnomics',
      title: config.title,
      breadcrumb: config.breadcrumb,
      status: 'AI LEGALNOMICS OS · Operational',
      chips: ['Workflow Engine', 'API Contracts', 'MUSKI Hooks', 'Owner Visibility'],
      backHref: '/legalnomics/',
      backLabel: 'Back to Legalnomics',
      contentHtml: `
      ${routeTabs(config.currentRoute)}
      <section class="hero-card"><h2>${config.heading}</h2><p>${config.description}</p><div class="hero-tags"><span>B2C Intake</span><span>Advocate Workflow</span><span>Corporate Ops</span><span>Verdict + Challenge Control</span></div></section>
      <section class="legal-kpi">${summary.map((entry) => `<article class="stat-card"><h4>${entry[0]}</h4><div class="stat-number">${entry[1]}</div></article>`).join('')}</section>
      ${toolbarHtml(config.screen)}
      <section class="legal-grid"><article class="table-card"><h3>${config.tableTitle}</h3><div class="legal-table-wrap"><table class="legal-table"><thead><tr>${columns.map((col) => `<th>${col}</th>`).join('')}<th>Actions</th></tr></thead><tbody id="legalTableBody"></tbody></table></div></article><aside class="legal-detail" id="legalDetail"></aside></section>
      <section class="module-grid three"><article class="info-card"><h3>MUSKI Integration Hooks</h3><p>Escalation to MUSKI, hearing risk alerts, verdict backlog alerts, and challenge recommendation alerts are wired as operational hooks.</p></article><article class="info-card"><h3>Workflow State Machines</h3><p>B2C: ${WORKFLOWS.b2cIntake.join(' → ')}</p><p>Advocate: ${WORKFLOWS.advocateCase.join(' → ')}</p><p>Corporate: ${WORKFLOWS.corporateOps.join(' → ')}</p><p>Verdict: ${WORKFLOWS.verdictChallenge.join(' → ')}</p></article><article class="info-card"><h3>Data Model Registry</h3><p>Structured schemas available for ${Object.keys(LEGAL_MODELS).length} legal entities with status/priority/ownership timestamps and attachment references.</p></article></section>`
    });

    function filteredRows() {
      const q = state.search.trim().toLowerCase();
      return rows.filter((row) => {
        const matchesStatus = state.status === 'all' || String(row.status).toLowerCase() === state.status;
        const matchesPriority = state.priority === 'all' || String(row.priority).toLowerCase() === state.priority;
        const matchesSearch = !q || columns.some((col) => String(row[col] || '').toLowerCase().includes(q)) || String(row.id).toLowerCase().includes(q);
        return matchesStatus && matchesPriority && matchesSearch;
      });
    }

    function renderTable() {
      const body = document.getElementById('legalTableBody');
      const detail = document.getElementById('legalDetail');
      const records = filteredRows();
      body.innerHTML = records.map((row) => `<tr data-row-id="${row.id}" class="${state.selectedId === row.id ? 'active' : ''}">${columns.map((col) => `<td>${col === 'priority' ? badge(row[col]) : (row[col] ?? '-')}</td>`).join('')}<td><div class="legal-action-row"><button class="secondary-btn" data-action="assign" data-id="${row.id}">Assign</button><button class="secondary-btn" data-action="update" data-id="${row.id}">Update</button></div></td></tr>`).join('');
      const selected = records.find((x) => x.id === state.selectedId) || records[0];
      state.selectedId = selected ? selected.id : null;
      detail.innerHTML = selected ? `<article class="info-card"><h3>Detail · ${selected.id}</h3><p><strong>Status:</strong> ${selected.status}</p><p><strong>Priority:</strong> ${selected.priority}</p><p><strong>Owner:</strong> ${selected.owner}</p><p><strong>Source:</strong> ${selected.source}</p><p><strong>Tags:</strong> ${(selected.tags || []).join(', ') || '-'}</p><p><strong>Notes:</strong> ${selected.notes || '-'}</p><div class="button-row"><button id="actionScheduleConsultation" class="primary-btn">Schedule Consultation</button><button id="actionUpdateHearing" class="secondary-btn">Update Hearing</button><button id="actionUploadVerdict" class="secondary-btn">Upload Verdict</button><button id="actionMarkChallenge" class="secondary-btn">Mark Challenge Review</button><button id="actionCloseCase" class="secondary-btn">Close Case</button><button id="actionArchiveMatter" class="secondary-btn">Archive Matter</button></div></article>` : '<article class="info-card"><h3>No Records</h3><p>No records match current filter state.</p></article>';
    }

    function seedStatusFilter() {
      const filter = document.getElementById('statusFilter');
      const statuses = Array.from(new Set(rows.map((r) => r.status))).sort();
      filter.innerHTML = `<option value="all">All Status</option>${statuses.map((status) => `<option value="${String(status).toLowerCase()}">${status}</option>`).join('')}`;
    }

    seedStatusFilter();
    renderTable();

    document.getElementById('legalSearch').addEventListener('input', (event) => { state.search = event.target.value; renderTable(); });
    document.getElementById('statusFilter').addEventListener('change', (event) => { state.status = event.target.value; renderTable(); });
    document.getElementById('priorityFilter').addEventListener('change', (event) => { state.priority = event.target.value; renderTable(); });

    document.body.addEventListener('click', (event) => {
      const row = event.target.closest('tr[data-row-id]');
      if (row) { state.selectedId = row.getAttribute('data-row-id'); renderTable(); return; }
      const action = event.target.getAttribute('data-action');
      if (action) {
        const id = event.target.getAttribute('data-id');
        if (action === 'assign') service.assignAdvocate(id, 'Adv. Routed via Intelligence');
        if (action === 'update') service.updateHearing(id, 'completed');
        renderTable();
      }
      if (event.target.id === 'actionCreateLead') service.createLead({ id: `lead-${Date.now()}`, status: 'new', priority: 'medium', owner: 'Intake Desk A', createdAt: now, updatedAt: now, tags: ['new'], source: 'manual_console', notes: 'Created from enterprise action system.', attachments: [], issueType: 'General', urgency: 'Normal', city: 'Bengaluru', jurisdiction: 'KA HC' });
      if (event.target.id === 'actionAssignAdvocate') service.assignAdvocate(state.selectedId || 'case-301', 'Adv. Routed via Command');
      if (event.target.id === 'actionCreateCase') service.createCase({ id: `case-${Date.now()}`, status: 'intake', priority: 'medium', owner: 'Unassigned', createdAt: now, updatedAt: now, tags: ['new'], source: 'manual_console', notes: 'Case created from action control.', attachments: [], leadId: state.selectedId || 'lead-manual', hearingDate: '2026-04-18', filingProgress: '0%', pendingOrder: false });
      if (event.target.id === 'actionEscalate') service.escalateMatter(state.selectedId || 'queue', 'Escalated from Legalnomics command panel.');
      if (event.target.id === 'actionScheduleConsultation') service.scheduleConsultation({ id: `consult-${Date.now()}`, status: 'scheduled', priority: 'medium', owner: 'Consult Desk', createdAt: now, updatedAt: now, tags: [state.selectedId || 'manual'], source: 'action_panel', notes: 'Consultation scheduled from detail panel.', attachments: [], leadId: state.selectedId, slot: new Date(Date.now() + 86400000).toISOString(), consultant: 'Auto Allocator' });
      if (event.target.id === 'actionUpdateHearing') service.updateHearing(state.selectedId || 'hear-880', 'completed');
      if (event.target.id === 'actionUploadVerdict') service.uploadVerdict({ id: `ver-${Date.now()}`, status: 'verdict_uploaded', priority: 'high', owner: 'Review Cell', createdAt: now, updatedAt: now, tags: [state.selectedId || 'manual'], source: 'action_panel', notes: 'Verdict uploaded from detail panel.', attachments: ['pending'], caseId: state.selectedId, recommendation: 'AI_review_pending', reviewer: 'Auto Router' });
      if (event.target.id === 'actionMarkChallenge') service.markChallengeReview('ch-700', 'appeal_initiated');
      if (event.target.id === 'actionCloseCase') service.closeCase(state.selectedId || '');
      if (event.target.id === 'actionArchiveMatter') service.archiveMatter(state.selectedId || '');
      renderTable();
    });
  }

  window.HNIWorldLegalnomicsEnterprise = { mount, DATA, WORKFLOWS, API_CONTRACT, LEGAL_MODELS, ROUTES };
})();
