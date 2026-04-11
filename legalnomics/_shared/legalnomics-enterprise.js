(function () {
  const now = new Date().toISOString();

  const LEGAL_MODELS = {
    legalLead: ['id', 'status', 'priority', 'owner', 'createdAt', 'updatedAt', 'tags', 'source', 'notes', 'attachments', 'issueType', 'urgency', 'city', 'jurisdiction'],
    legalCase: ['id', 'status', 'priority', 'owner', 'createdAt', 'updatedAt', 'tags', 'source', 'notes', 'attachments', 'leadId', 'hearingDate', 'filingProgress', 'pendingOrder'],
    hearing: ['id', 'status', 'priority', 'owner', 'createdAt', 'updatedAt', 'tags', 'source', 'notes', 'attachments', 'caseId', 'matterId', 'advocate', 'jurisdiction', 'venue', 'court', 'nextAction', 'hearingDate'],
    verdict: ['id', 'status', 'priority', 'owner', 'createdAt', 'updatedAt', 'tags', 'source', 'notes', 'attachments', 'caseId', 'recommendation', 'reviewer'],
    challengeReview: ['id', 'status', 'priority', 'owner', 'createdAt', 'updatedAt', 'tags', 'source', 'notes', 'attachments', 'verdictId', 'filingDeadline', 'priorityScore'],
    advocateProfile: ['id', 'status', 'priority', 'owner', 'createdAt', 'updatedAt', 'tags', 'source', 'notes', 'attachments', 'name', 'capacity', 'city', 'specialization'],
    corporateMatter: ['id', 'status', 'priority', 'owner', 'createdAt', 'updatedAt', 'tags', 'source', 'notes', 'attachments', 'matterType', 'assignedCounsel', 'dueDate', 'riskLevel'],
    legalDocument: ['id', 'status', 'priority', 'owner', 'createdAt', 'updatedAt', 'tags', 'source', 'notes', 'attachments', 'caseId', 'matterId', 'corporate', 'advocateId', 'uploader', 'reviewer', 'docType', 'classification', 'verificationState', 'lifecycleState', 'uploadDate', 'dueDate', 'renewalDate', 'expiryDate'],
    caseFileStack: ['caseOrMatterId', 'pleadings', 'evidence', 'notices', 'contracts', 'orders', 'judgmentsVerdicts', 'appealPapers', 'internalReviewNotes'],
    proceduralChecklist: ['caseOrMatterId', 'filingChecklist', 'documentReadiness', 'hearingPreparation', 'verdictReview', 'challengeAppeal'],
    legalAlert: ['id', 'type', 'severity', 'linkedId', 'owner', 'dueDate', 'status']
  };

  const WORKFLOWS = {
    b2cIntake: ['new', 'under_review', 'consultation_scheduled', 'advocate_matched', 'active_case', 'closed', 'dropped'],
    advocateCase: ['intake', 'document_review', 'filing_prep', 'hearing_active', 'order_received', 'verdict_review', 'closed'],
    corporateOps: ['new_matter', 'compliance_review', 'counsel_assignment', 'hearing_or_notice_tracking', 'resolution', 'archived'],
    verdictChallenge: ['verdict_uploaded', 'AI_review_pending', 'challenge_recommended', 'no_challenge', 'legal_strategy_review', 'appeal_initiated', 'closed']
  };

  const DATA = {
    legalLead: [
      { id: 'lead-1001', status: 'new', priority: 'high', owner: 'Intake Desk A', createdAt: now, updatedAt: now, tags: ['consumer', 'employment'], source: 'web_form', notes: 'Termination dispute with urgent hearing risk.', attachments: ['doc-2001'], issueType: 'Employment', urgency: 'Urgent', city: 'Mumbai', jurisdiction: 'MH High Court' }
    ],
    legalCase: [
      { id: 'case-301', status: 'document_review', priority: 'high', owner: 'Adv. Sharma', createdAt: now, updatedAt: now, tags: ['b2c'], source: 'lead-1001', notes: 'Documents staged for filing.', attachments: ['doc-2001', 'doc-2002'], leadId: 'lead-1001', hearingDate: '2026-04-16', filingProgress: '68%', pendingOrder: true },
      { id: 'case-302', status: 'hearing_active', priority: 'medium', owner: 'Adv. Iyer', createdAt: now, updatedAt: now, tags: ['consumer'], source: 'lead-0998', notes: 'Cross examination in progress.', attachments: ['doc-2006'], leadId: 'lead-0998', hearingDate: '2026-04-13', filingProgress: '92%', pendingOrder: false }
    ],
    corporateMatter: [
      { id: 'corp-10', status: 'compliance_review', priority: 'high', owner: 'Corp Cell 2', createdAt: now, updatedAt: now, tags: ['notice'], source: 'enterprise_portal', notes: 'Regulatory notice from labour authority.', attachments: ['doc-4001'], matterType: 'Compliance Notice', assignedCounsel: 'Adv. Sharma', dueDate: '2026-04-20', riskLevel: 'High' },
      { id: 'corp-11', status: 'new_matter', priority: 'medium', owner: 'Corp Cell 1', createdAt: now, updatedAt: now, tags: ['contract'], source: 'enterprise_portal', notes: 'Vendor dispute and indemnity exposure.', attachments: ['doc-4101'], matterType: 'Commercial Dispute', assignedCounsel: 'Adv. Nair', dueDate: '2026-04-22', riskLevel: 'Medium' }
    ],
    hearing: [
      { id: 'hear-880', status: 'upcoming', priority: 'high', owner: 'Hearing Desk A', createdAt: now, updatedAt: now, tags: ['case-301'], source: 'court_feed', notes: 'Preliminary admission hearing.', attachments: ['doc-2002'], caseId: 'case-301', matterId: '-', advocate: 'Adv. Sharma', jurisdiction: 'Maharashtra', venue: 'Mumbai Bench', court: 'Bombay High Court', nextAction: 'File rejoinder', hearingDate: '2026-04-16' },
      { id: 'hear-881', status: 'order-awaited', priority: 'high', owner: 'Hearing Desk B', createdAt: now, updatedAt: now, tags: ['case-302'], source: 'court_feed', notes: 'Arguments completed.', attachments: [], caseId: 'case-302', matterId: '-', advocate: 'Adv. Iyer', jurisdiction: 'Delhi', venue: 'Principal Bench', court: 'Delhi High Court', nextAction: 'Upload reserved order', hearingDate: '2026-04-10' },
      { id: 'hear-882', status: 'adjourned', priority: 'medium', owner: 'Corporate Hearings', createdAt: now, updatedAt: now, tags: ['corp-10'], source: 'internal_calendar', notes: 'Compliance matter hearing adjourned.', attachments: [], caseId: '-', matterId: 'corp-10', advocate: 'Adv. Sharma', jurisdiction: 'Maharashtra', venue: 'Labour Court Hall 3', court: 'Labour Court Mumbai', nextAction: 'Resubmit annexures', hearingDate: '2026-04-18' }
    ],
    legalDocument: [
      { id: 'doc-2001', status: 'active', priority: 'high', owner: 'DocOps', createdAt: now, updatedAt: now, tags: ['case-301'], source: 'lead_upload', notes: 'Employment agreement copy.', attachments: ['s3://docs/doc-2001.pdf'], caseId: 'case-301', matterId: '-', corporate: 'HNI Consumer', advocateId: 'adv-01', uploader: 'Client Portal', reviewer: 'DocOps Team A', docType: 'Agreement', classification: 'Contract', verificationState: 'verified', lifecycleState: 'final', uploadDate: '2026-04-05', dueDate: '2026-04-14', renewalDate: '2027-04-05', expiryDate: '2028-04-10' },
      { id: 'doc-2002', status: 'active', priority: 'high', owner: 'DocOps', createdAt: now, updatedAt: now, tags: ['case-301'], source: 'advocate_upload', notes: 'Draft rejoinder awaiting reviewer signoff.', attachments: ['s3://docs/doc-2002.pdf'], caseId: 'case-301', matterId: '-', corporate: 'HNI Consumer', advocateId: 'adv-01', uploader: 'Adv. Sharma', reviewer: 'Review Cell 1', docType: 'Pleading', classification: 'Pleadings', verificationState: 'pending', lifecycleState: 'draft', uploadDate: '2026-04-11', dueDate: '2026-04-12', renewalDate: '-', expiryDate: '-' },
      { id: 'doc-2901', status: 'active', priority: 'high', owner: 'Verdict Cell', createdAt: now, updatedAt: now, tags: ['case-302'], source: 'court_upload', notes: 'Certified judgment copy.', attachments: ['s3://docs/doc-2901.pdf'], caseId: 'case-302', matterId: '-', corporate: 'HNI Consumer', advocateId: 'adv-02', uploader: 'Court Clerk', reviewer: 'Senior Counsel A', docType: 'Judgment', classification: 'Judgments / Verdicts', verificationState: 'verified', lifecycleState: 'signed', uploadDate: '2026-04-10', dueDate: '2026-04-15', renewalDate: '-', expiryDate: '-' },
      { id: 'doc-4001', status: 'active', priority: 'medium', owner: 'Corp DocOps', createdAt: now, updatedAt: now, tags: ['corp-10'], source: 'enterprise_portal', notes: 'Compliance order for response.', attachments: ['s3://docs/doc-4001.pdf'], caseId: '-', matterId: 'corp-10', corporate: 'HNI Industries', advocateId: 'adv-01', uploader: 'Corp Legal Admin', reviewer: 'Compliance Cell', docType: 'Order', classification: 'Orders', verificationState: 'deficient', lifecycleState: 'expired', uploadDate: '2026-03-31', dueDate: '2026-04-13', renewalDate: '2026-04-20', expiryDate: '2026-04-12' },
      { id: 'doc-4101', status: 'active', priority: 'medium', owner: 'Corp DocOps', createdAt: now, updatedAt: now, tags: ['corp-11'], source: 'enterprise_portal', notes: 'Master services contract renewed.', attachments: ['s3://docs/doc-4101.pdf'], caseId: '-', matterId: 'corp-11', corporate: 'HNI Industries', advocateId: 'adv-05', uploader: 'Contract Desk', reviewer: 'Corp Counsel', docType: 'Contract', classification: 'Contracts', verificationState: 'verified', lifecycleState: 'renewed', uploadDate: '2026-04-08', dueDate: '2026-04-21', renewalDate: '2027-04-08', expiryDate: '2028-04-08' }
    ],
    caseFileStack: [
      { caseOrMatterId: 'case-301', pleadings: 4, evidence: 6, notices: 1, contracts: 1, orders: 0, judgmentsVerdicts: 0, appealPapers: 0, internalReviewNotes: 3 },
      { caseOrMatterId: 'case-302', pleadings: 3, evidence: 8, notices: 2, contracts: 0, orders: 1, judgmentsVerdicts: 1, appealPapers: 2, internalReviewNotes: 5 },
      { caseOrMatterId: 'corp-10', pleadings: 1, evidence: 2, notices: 5, contracts: 1, orders: 2, judgmentsVerdicts: 0, appealPapers: 0, internalReviewNotes: 2 }
    ],
    proceduralChecklist: [
      { caseOrMatterId: 'case-301', filingChecklist: '3/5', documentReadiness: '6/8', hearingPreparation: '4/7', verdictReview: '0/3', challengeAppeal: '0/4' },
      { caseOrMatterId: 'case-302', filingChecklist: '5/5', documentReadiness: '8/8', hearingPreparation: '7/7', verdictReview: '2/3', challengeAppeal: '2/4' },
      { caseOrMatterId: 'corp-10', filingChecklist: '2/5', documentReadiness: '4/8', hearingPreparation: '1/7', verdictReview: '0/3', challengeAppeal: '0/4' }
    ],
    verdict: [
      { id: 'ver-500', status: 'AI_review_pending', priority: 'high', owner: 'Review Cell 1', createdAt: now, updatedAt: now, tags: ['appeal_risk'], source: 'upload_portal', notes: 'Adverse order, likely challenge.', attachments: ['doc-2901'], caseId: 'case-302', recommendation: 'challenge_recommended', reviewer: 'Senior Counsel A' }
    ],
    challengeReview: [
      { id: 'ch-700', status: 'legal_strategy_review', priority: 'high', owner: 'Appellate Desk', createdAt: now, updatedAt: now, tags: ['deadline_72h'], source: 'ver-500', notes: 'Grounds prepared. Await owner sign-off.', attachments: ['doc-2901'], verdictId: 'ver-500', filingDeadline: '2026-04-14', priorityScore: 94 }
    ],
    legalAlert: [
      { id: 'al-1', type: 'hearing due', severity: 'high', linkedId: 'hear-880', owner: 'Adv. Sharma', dueDate: '2026-04-16', status: 'open' },
      { id: 'al-2', type: 'filing due', severity: 'high', linkedId: 'case-301', owner: 'Adv. Sharma', dueDate: '2026-04-12', status: 'open' },
      { id: 'al-3', type: 'document deficiency', severity: 'high', linkedId: 'doc-4001', owner: 'Compliance Cell', dueDate: '2026-04-13', status: 'open' },
      { id: 'al-4', type: 'verdict review pending', severity: 'high', linkedId: 'ver-500', owner: 'Review Cell 1', dueDate: '2026-04-13', status: 'open' },
      { id: 'al-5', type: 'challenge filing deadline', severity: 'high', linkedId: 'ch-700', owner: 'Appellate Desk', dueDate: '2026-04-14', status: 'open' },
      { id: 'al-6', type: 'compliance deadline', severity: 'medium', linkedId: 'corp-10', owner: 'Corp Cell 2', dueDate: '2026-04-20', status: 'open' }
    ]
  };

  const API_CONTRACT = {
    createLead: { method: 'POST', path: '/api/legalnomics/leads' },
    assignAdvocate: { method: 'PATCH', path: '/api/legalnomics/cases/:caseId/assignee' },
    createCase: { method: 'POST', path: '/api/legalnomics/cases' },
    scheduleConsultation: { method: 'POST', path: '/api/legalnomics/consultations' },
    updateHearing: { method: 'PATCH', path: '/api/legalnomics/hearings/:hearingId' },
    uploadVerdict: { method: 'POST', path: '/api/legalnomics/verdicts' }
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
    { label: 'Owner', href: '/legalnomics/owner/' }
  ];

  function badge(priority) { return `<span class="legal-badge ${String(priority || '').toLowerCase()}">${priority || 'NA'}</span>`; }
  function routeTabs(currentRoute) { return `<article class="table-card"><div class="route-tabs">${ROUTES.map((route) => `<a class="route-tab ${route.href === currentRoute ? 'active' : ''}" href="${route.href}">${route.label}</a>`).join('')}</div></article>`; }
  function daysTo(dateString) { return Math.ceil((new Date(dateString).getTime() - Date.now()) / 86400000); }

  function screenConfig(screen) {
    if (screen === 'documents') {
      return {
        columns: ['id', 'docType', 'classification', 'caseId', 'matterId', 'corporate', 'uploader', 'reviewer', 'verificationState', 'lifecycleState', 'uploadDate', 'dueDate', 'renewalDate'],
        rows: DATA.legalDocument,
        summary: [
          ['Document registry', DATA.legalDocument.length],
          ['Verification pending', DATA.legalDocument.filter((x) => x.verificationState !== 'verified').length],
          ['Renewal/expiry tracking', DATA.legalDocument.filter((x) => x.renewalDate && x.renewalDate !== '-').length],
          ['Document deficiencies', DATA.legalDocument.filter((x) => x.verificationState === 'deficient').length]
        ]
      };
    }
    if (screen === 'hearings') {
      return {
        columns: ['id', 'caseId', 'matterId', 'hearingDate', 'status', 'advocate', 'jurisdiction', 'venue', 'court', 'nextAction', 'priority'],
        rows: DATA.hearing,
        summary: [
          ['Upcoming hearings', DATA.hearing.filter((x) => x.status === 'upcoming').length],
          ['Active hearings', DATA.hearing.filter((x) => x.status === 'active').length],
          ['Order awaited', DATA.hearing.filter((x) => x.status === 'order-awaited').length],
          ['Adjourned', DATA.hearing.filter((x) => x.status === 'adjourned').length]
        ]
      };
    }
    if (screen === 'owner') {
      return {
        columns: ['id', 'type', 'severity', 'linkedId', 'owner', 'dueDate', 'status'],
        rows: DATA.legalAlert,
        summary: [
          ['Documents pending verification', DATA.legalDocument.filter((x) => x.verificationState !== 'verified').length],
          ['Hearings this week', DATA.hearing.filter((x) => daysTo(x.hearingDate) <= 7 && daysTo(x.hearingDate) >= 0).length],
          ['Orders awaiting upload', DATA.caseFileStack.filter((x) => x.orders === 0).length],
          ['Verdict backlog', DATA.verdict.filter((x) => String(x.status).includes('pending')).length]
        ]
      };
    }
    return {
      columns: ['id', 'status', 'priority', 'owner', 'source', 'notes'],
      rows: DATA.legalCase,
      summary: [['Cases', DATA.legalCase.length], ['Hearings', DATA.hearing.length], ['Documents', DATA.legalDocument.length], ['Alerts', DATA.legalAlert.length]]
    };
  }

  function screenToolbar(screen) {
    if (screen === 'documents') {
      return `<article class="table-card"><div class="legal-toolbar"><input id="legalSearch" class="legal-input" placeholder="Search documents / case / matter" /><select id="filterCase" class="legal-select"><option value="all">All Cases</option></select><select id="filterAdvocate" class="legal-select"><option value="all">All Advocates</option></select><select id="filterCorporate" class="legal-select"><option value="all">All Corporates</option></select><select id="filterDocType" class="legal-select"><option value="all">All Document Types</option></select><select id="statusFilter" class="legal-select"><option value="all">All Verification</option></select></div><p class="legal-mini">Filters: case · advocate · corporate · document type · verification status.</p></article>`;
    }
    return `<article class="table-card"><div class="legal-toolbar"><input id="legalSearch" class="legal-input" placeholder="Search records" /><select id="statusFilter" class="legal-select"><option value="all">All Status</option></select><select id="priorityFilter" class="legal-select"><option value="all">All Priority</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></div><p class="legal-mini">API contracts: ${Object.values(API_CONTRACT).map((item) => `${item.method} ${item.path}`).join(' · ')}</p></article>`;
  }

  function additionalPanels(screen) {
    if (screen === 'documents') {
      return `<section class="module-grid two"><article class="table-card"><h3>Case File Stack</h3><div class="legal-table-wrap"><table class="legal-table"><thead><tr><th>Case/Matter</th><th>Pleadings</th><th>Evidence</th><th>Notices</th><th>Contracts</th><th>Orders</th><th>Judgments/Verdicts</th><th>Appeal Papers</th><th>Internal Review Notes</th></tr></thead><tbody>${DATA.caseFileStack.map((row) => `<tr><td>${row.caseOrMatterId}</td><td>${row.pleadings}</td><td>${row.evidence}</td><td>${row.notices}</td><td>${row.contracts}</td><td>${row.orders}</td><td>${row.judgmentsVerdicts}</td><td>${row.appealPapers}</td><td>${row.internalReviewNotes}</td></tr>`).join('')}</tbody></table></div></article><article class="table-card"><h3>Procedural Checklist Engine</h3><div class="legal-table-wrap"><table class="legal-table"><thead><tr><th>Case/Matter</th><th>Filing</th><th>Document readiness</th><th>Hearing prep</th><th>Verdict review</th><th>Challenge/Appeal</th></tr></thead><tbody>${DATA.proceduralChecklist.map((row) => `<tr><td>${row.caseOrMatterId}</td><td>${row.filingChecklist}</td><td>${row.documentReadiness}</td><td>${row.hearingPreparation}</td><td>${row.verdictReview}</td><td>${row.challengeAppeal}</td></tr>`).join('')}</tbody></table></div></article></section>`;
    }
    if (screen === 'hearings') {
      const timeline = [...DATA.hearing].sort((a, b) => new Date(a.hearingDate) - new Date(b.hearingDate));
      const weekCount = DATA.hearing.filter((x) => daysTo(x.hearingDate) <= 7 && daysTo(x.hearingDate) >= 0).length;
      return `<section class="module-grid two"><article class="table-card"><h3>Hearing Timeline View</h3><div class="timeline-stack">${timeline.map((item) => `<div class="timeline-item"><div><strong>${item.hearingDate}</strong> · ${item.id}</div><div>${item.caseId !== '-' ? item.caseId : item.matterId} · ${item.advocate} · ${item.status}</div><div class="legal-mini">Next action: ${item.nextAction}</div></div>`).join('')}</div></article><article class="info-card"><h3>Calendar Summary Panel</h3><p><strong>This week:</strong> ${weekCount} hearings</p><p><strong>Order awaited:</strong> ${DATA.hearing.filter((x) => x.status === 'order-awaited').length}</p><p><strong>Next action tracker:</strong> ${DATA.hearing.filter((x) => x.nextAction).length} hearings with assigned action</p><p><strong>Jurisdictions active:</strong> ${new Set(DATA.hearing.map((x) => x.jurisdiction)).size}</p></article></section><section class="table-card"><h3>Checklist by Hearing Linkage</h3><div class="legal-table-wrap"><table class="legal-table"><thead><tr><th>Case/Matter</th><th>Filing</th><th>Document readiness</th><th>Hearing prep</th><th>Verdict review</th><th>Challenge/Appeal</th></tr></thead><tbody>${DATA.proceduralChecklist.map((row) => `<tr><td>${row.caseOrMatterId}</td><td>${row.filingChecklist}</td><td>${row.documentReadiness}</td><td>${row.hearingPreparation}</td><td>${row.verdictReview}</td><td>${row.challengeAppeal}</td></tr>`).join('')}</tbody></table></div></section>`;
    }
    if (screen === 'owner') {
      const overloaded = [{ advocate: 'Adv. Sharma', queue: 9 }, { advocate: 'Adv. Iyer', queue: 7 }, { advocate: 'Adv. Nair', queue: 6 }];
      return `<section class="module-grid two"><article class="info-card"><h3>Owner Priority Visibility</h3><p>Documents pending verification: ${DATA.legalDocument.filter((x) => x.verificationState !== 'verified').length}</p><p>Hearings approaching this week: ${DATA.hearing.filter((x) => daysTo(x.hearingDate) <= 7 && daysTo(x.hearingDate) >= 0).length}</p><p>Orders awaiting upload: ${DATA.caseFileStack.filter((x) => x.orders === 0).length}</p><p>Verdict backlog: ${DATA.verdict.filter((x) => x.status.includes('pending')).length}</p><p>Challenge deadlines at risk: ${DATA.challengeReview.filter((x) => daysTo(x.filingDeadline) <= 3).length}</p></article><article class="table-card"><h3>Top Overloaded Advocates / Queues</h3><div class="legal-table-wrap"><table class="legal-table"><thead><tr><th>Advocate</th><th>Open Queue</th><th>State</th></tr></thead><tbody>${overloaded.map((x) => `<tr><td>${x.advocate}</td><td>${x.queue}</td><td>${x.queue >= 8 ? 'Critical' : 'Watch'}</td></tr>`).join('')}</tbody></table></div></article></section>`;
    }
    return '';
  }

  function mount(config) {
    const { rows, columns, summary } = screenConfig(config.screen);
    const state = { selectedId: null, search: '', status: 'all', priority: 'all', case: 'all', advocate: 'all', corporate: 'all', docType: 'all' };

    HNIWorldShell.mount({
      currentRoute: config.currentRoute,
      activeFamily: 'legalnomics',
      title: config.title,
      breadcrumb: config.breadcrumb,
      status: 'AI LEGALNOMICS OS · Operational',
      chips: ['Document Control', 'Evidence Stack', 'Hearing Calendar', 'Checklist Engine', 'Deadline Alerts', 'Owner Visibility'],
      backHref: '/legalnomics/',
      backLabel: 'Back to Legalnomics',
      contentHtml: `${routeTabs(config.currentRoute)}<section class="hero-card"><h2>${config.heading}</h2><p>${config.description}</p></section><section class="legal-kpi">${summary.map((entry) => `<article class="stat-card"><h4>${entry[0]}</h4><div class="stat-number">${entry[1]}</div></article>`).join('')}</section>${screenToolbar(config.screen)}<section class="legal-grid"><article class="table-card"><h3>${config.tableTitle}</h3><div class="legal-table-wrap"><table class="legal-table"><thead><tr>${columns.map((col) => `<th>${col}</th>`).join('')}<th>Actions</th></tr></thead><tbody id="legalTableBody"></tbody></table></div></article><aside class="legal-detail" id="legalDetail"></aside></section>${additionalPanels(config.screen)}`
    });

    function seedFilter(id, values, label) {
      const node = document.getElementById(id);
      if (!node) return;
      node.innerHTML = `<option value="all">${label}</option>${values.map((v) => `<option value="${String(v).toLowerCase()}">${v}</option>`).join('')}`;
    }

    seedFilter('statusFilter', Array.from(new Set(rows.map((r) => r.verificationState || r.status))).filter(Boolean), 'All Status');
    seedFilter('filterCase', Array.from(new Set(DATA.legalDocument.map((r) => r.caseId))).filter((x) => x && x !== '-'), 'All Cases');
    seedFilter('filterAdvocate', Array.from(new Set(DATA.legalDocument.map((r) => r.advocateId))).filter(Boolean), 'All Advocates');
    seedFilter('filterCorporate', Array.from(new Set(DATA.legalDocument.map((r) => r.corporate))).filter(Boolean), 'All Corporates');
    seedFilter('filterDocType', Array.from(new Set(DATA.legalDocument.map((r) => r.docType))).filter(Boolean), 'All Document Types');

    function filteredRows() {
      const q = state.search.trim().toLowerCase();
      return rows.filter((row) => {
        const statusValue = row.verificationState || row.status;
        const statusMatch = state.status === 'all' || String(statusValue).toLowerCase() === state.status;
        const priorityMatch = !row.priority || state.priority === 'all' || String(row.priority).toLowerCase() === state.priority;
        const caseMatch = state.case === 'all' || String(row.caseId || '').toLowerCase() === state.case;
        const advMatch = state.advocate === 'all' || String(row.advocateId || '').toLowerCase() === state.advocate;
        const corpMatch = state.corporate === 'all' || String(row.corporate || '').toLowerCase() === state.corporate;
        const docTypeMatch = state.docType === 'all' || String(row.docType || '').toLowerCase() === state.docType;
        const searchMatch = !q || columns.some((col) => String(row[col] || '').toLowerCase().includes(q));
        return statusMatch && priorityMatch && caseMatch && advMatch && corpMatch && docTypeMatch && searchMatch;
      });
    }

    function render() {
      const body = document.getElementById('legalTableBody');
      const detail = document.getElementById('legalDetail');
      const records = filteredRows();
      body.innerHTML = records.map((row) => `<tr data-row-id="${row.id}" class="${state.selectedId === row.id ? 'active' : ''}">${columns.map((col) => `<td>${col === 'priority' ? badge(row[col]) : (row[col] || '-')}</td>`).join('')}<td><div class="legal-action-row"><button class="secondary-btn">Open</button></div></td></tr>`).join('');
      const selected = records.find((x) => x.id === state.selectedId) || records[0];
      state.selectedId = selected ? selected.id : null;
      detail.innerHTML = selected ? `<article class="info-card"><h3>Detail · ${selected.id}</h3><p><strong>Status:</strong> ${selected.status || selected.verificationState}</p><p><strong>Owner:</strong> ${selected.owner || '-'}</p><p><strong>Priority:</strong> ${selected.priority || '-'}</p><p><strong>Notes:</strong> ${selected.notes || '-'}</p></article>` : '<article class="info-card"><h3>No Records</h3></article>';
    }

    render();
    document.getElementById('legalSearch').addEventListener('input', (e) => { state.search = e.target.value; render(); });
    const bind = (id, key) => {
      const node = document.getElementById(id);
      if (!node) return;
      node.addEventListener('change', (e) => { state[key] = e.target.value; render(); });
    };
    bind('statusFilter', 'status');
    bind('priorityFilter', 'priority');
    bind('filterCase', 'case');
    bind('filterAdvocate', 'advocate');
    bind('filterCorporate', 'corporate');
    bind('filterDocType', 'docType');
    document.body.addEventListener('click', (event) => {
      const row = event.target.closest('tr[data-row-id]');
      if (row) { state.selectedId = row.getAttribute('data-row-id'); render(); }
    });
  }

  window.HNIWorldLegalnomicsEnterprise = { mount, DATA, WORKFLOWS, API_CONTRACT, LEGAL_MODELS, ROUTES };
})();
