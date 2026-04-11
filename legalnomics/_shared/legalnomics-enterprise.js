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
    ],
    advocateNetwork: [
      { id: 'adv-01', advocate: 'Adv. R. Sharma', specialization: 'Labour + Employment', city: 'Mumbai', jurisdiction: 'Bombay High Court', verificationState: 'verified', activeLoad: 9, hearingLoad: 4, verdictReviewLoad: 2, assignedCases: 12, availability: 'Overloaded' },
      { id: 'adv-02', advocate: 'Adv. V. Iyer', specialization: 'Consumer + Civil Recovery', city: 'Delhi', jurisdiction: 'Delhi High Court', verificationState: 'verified', activeLoad: 7, hearingLoad: 3, verdictReviewLoad: 1, assignedCases: 10, availability: 'Near Capacity' },
      { id: 'adv-03', advocate: 'Adv. K. Menon', specialization: 'Compliance + Regulatory', city: 'Bengaluru', jurisdiction: 'Karnataka High Court', verificationState: 'pending_review', activeLoad: 4, hearingLoad: 2, verdictReviewLoad: 0, assignedCases: 5, availability: 'Available' },
      { id: 'adv-04', advocate: 'Adv. A. Khan', specialization: 'Arbitration + Commercial', city: 'Hyderabad', jurisdiction: 'Telangana High Court', verificationState: 'deficient', activeLoad: 3, hearingLoad: 1, verdictReviewLoad: 1, assignedCases: 4, availability: 'Verification Hold' }
    ],
    partnerLawFirms: [
      { id: 'firm-11', partnerName: 'Lex Axis LLP', partnerType: 'Law Firm', onboardingState: 'approved', verificationPipeline: 'compliance_passed', regionMap: 'West / MH', jurisdictionMap: 'Bombay High Court', contact: 'ops@lexaxis.in', status: 'Active', assignmentHistory: 42, productivity: '91%' },
      { id: 'firm-12', partnerName: 'Aegis Legal Partners', partnerType: 'Law Firm', onboardingState: 'pending_review', verificationPipeline: 'documents_under_review', regionMap: 'North / DL', jurisdictionMap: 'Delhi High Court', contact: 'network@aegislegal.in', status: 'Onboarding', assignmentHistory: 11, productivity: '74%' }
    ],
    partnerIndependents: [
      { id: 'ind-31', partnerName: 'Adv. Sneha Rao', partnerType: 'Independent Advocate', onboardingState: 'approved', verificationPipeline: 'verified', regionMap: 'South / KA', jurisdictionMap: 'Karnataka High Court', contact: 'srao@barmail.com', status: 'Active', assignmentHistory: 26, productivity: '88%' },
      { id: 'ind-32', partnerName: 'Adv. D. Sethi', partnerType: 'Independent Advocate', onboardingState: 'rejected', verificationPipeline: 'bar_council_mismatch', regionMap: 'North / PB', jurisdictionMap: 'Punjab & Haryana High Court', contact: 'dsethi@barmail.com', status: 'Blocked', assignmentHistory: 0, productivity: '0%' }
    ],
    corporatePipeline: [
      { id: 'mat-901', corporateClient: 'HNI Industries', bucket: 'Notice', matterPipeline: 'intake_triage', assignedCounsel: 'Adv. R. Sharma', dueDate: '2026-04-20', riskScore: 87, nextAction: 'Draft reply to labour notice', status: 'open' },
      { id: 'mat-902', corporateClient: 'HNI Logistics', bucket: 'Dispute', matterPipeline: 'evidence_packaging', assignedCounsel: 'Adv. V. Iyer', dueDate: '2026-04-18', riskScore: 64, nextAction: 'File response affidavit', status: 'open' },
      { id: 'mat-903', corporateClient: 'HNI Ventures', bucket: 'Compliance', matterPipeline: 'final_review', assignedCounsel: 'Adv. K. Menon', dueDate: '2026-04-14', riskScore: 42, nextAction: 'Submit quarterly compliance report', status: 'resolved' }
    ],
    leadExchange: [
      { id: 'lead-801', intakePool: 'B2B Portal', jurisdiction: 'Maharashtra', specializationNeed: 'Compliance', routingStatus: 'assigned', lane: 'assigned', assignedTo: 'Lex Axis LLP', escalated: 'No', commercialBand: 'Tier A' },
      { id: 'lead-802', intakePool: 'Owner Escalation', jurisdiction: 'Delhi', specializationNeed: 'Employment', routingStatus: 'escalated', lane: 'escalated', assignedTo: 'Escalation Desk', escalated: 'Yes', commercialBand: 'Tier A+' },
      { id: 'lead-803', intakePool: 'Website Intake', jurisdiction: 'Karnataka', specializationNeed: 'Commercial Dispute', routingStatus: 'unassigned', lane: 'unassigned', assignedTo: '-', escalated: 'No', commercialBand: 'Tier B' }
    ],
    onboardingFlow: [
      { id: 'onb-101', entityType: 'New Advocate', entity: 'Adv. K. Menon', documentVerification: 'pending_review', complianceVerification: 'pending_review', reviewState: 'pending_review' },
      { id: 'onb-102', entityType: 'Law Firm', entity: 'Aegis Legal Partners', documentVerification: 'approved', complianceVerification: 'pending_review', reviewState: 'pending_review' },
      { id: 'onb-103', entityType: 'Corporate Client', entity: 'HNI Logistics', documentVerification: 'approved', complianceVerification: 'approved', reviewState: 'approved' },
      { id: 'onb-104', entityType: 'Independent Advocate', entity: 'Adv. D. Sethi', documentVerification: 'rejected', complianceVerification: 'rejected', reviewState: 'rejected' }
    ],
    muskiOwnerSignals: [
      { id: 'sig-1', signal: 'Advocate overload risks', severity: 'high', owner: 'Owner Desk', value: '2 advocates above 85% capacity', status: 'open' },
      { id: 'sig-2', signal: 'Partner readiness', severity: 'medium', owner: 'Partner Ops', value: '1 firm pending compliance gate', status: 'watch' },
      { id: 'sig-3', signal: 'Routing congestion', severity: 'high', owner: 'Lead Exchange', value: '1 escalated / 1 unassigned lead', status: 'open' },
      { id: 'sig-4', signal: 'Corporate matter risk', severity: 'high', owner: 'Corporate Cell', value: '1 matter risk score > 80', status: 'open' },
      { id: 'sig-5', signal: 'Verification bottlenecks', severity: 'medium', owner: 'Verification Ops', value: '2 entities pending review > 24h', status: 'watch' }
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
    { label: 'Partners', href: '/legalnomics/partners/' },
    { label: 'Corporate', href: '/legalnomics/corporate/' },
    { label: 'Lead Exchange', href: '/legalnomics/lead-exchange/' },
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
    if (screen === 'advocate') {
      return {
        columns: ['id', 'advocate', 'specialization', 'city', 'jurisdiction', 'verificationState', 'activeLoad', 'hearingLoad', 'verdictReviewLoad', 'assignedCases', 'availability'],
        rows: DATA.advocateNetwork,
        summary: [
          ['Network advocates', DATA.advocateNetwork.length],
          ['Verified advocates', DATA.advocateNetwork.filter((x) => x.verificationState === 'verified').length],
          ['Near/over capacity', DATA.advocateNetwork.filter((x) => x.activeLoad >= 7).length],
          ['Pending verification', DATA.advocateNetwork.filter((x) => x.verificationState !== 'verified').length]
        ]
      };
    }
    if (screen === 'partners') {
      const partnerRows = [...DATA.partnerLawFirms, ...DATA.partnerIndependents];
      return {
        columns: ['id', 'partnerName', 'partnerType', 'onboardingState', 'verificationPipeline', 'regionMap', 'jurisdictionMap', 'contact', 'status', 'assignmentHistory', 'productivity'],
        rows: partnerRows,
        summary: [
          ['Law firms', DATA.partnerLawFirms.length],
          ['Independent advocates', DATA.partnerIndependents.length],
          ['Onboarding pending', partnerRows.filter((x) => x.onboardingState === 'pending_review').length],
          ['Approved partners', partnerRows.filter((x) => x.onboardingState === 'approved').length]
        ]
      };
    }
    if (screen === 'corporate') {
      return {
        columns: ['id', 'corporateClient', 'bucket', 'matterPipeline', 'assignedCounsel', 'dueDate', 'riskScore', 'nextAction', 'status'],
        rows: DATA.corporatePipeline,
        summary: [
          ['Open matters', DATA.corporatePipeline.filter((x) => x.status === 'open').length],
          ['Resolved matters', DATA.corporatePipeline.filter((x) => x.status === 'resolved').length],
          ['High risk matters', DATA.corporatePipeline.filter((x) => x.riskScore >= 75).length],
          ['Compliance bucket', DATA.corporatePipeline.filter((x) => x.bucket === 'Compliance').length]
        ]
      };
    }
    if (screen === 'leadExchange') {
      return {
        columns: ['id', 'intakePool', 'jurisdiction', 'specializationNeed', 'routingStatus', 'lane', 'assignedTo', 'escalated', 'commercialBand'],
        rows: DATA.leadExchange,
        summary: [
          ['Lead intake pool', DATA.leadExchange.length],
          ['Assigned', DATA.leadExchange.filter((x) => x.lane === 'assigned').length],
          ['Unassigned', DATA.leadExchange.filter((x) => x.lane === 'unassigned').length],
          ['Escalated', DATA.leadExchange.filter((x) => x.lane === 'escalated').length]
        ]
      };
    }
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
    if (screen === 'advocate') {
      return `<section class="module-grid two"><article class="table-card"><h3>Case Assignment Summary</h3><div class="legal-table-wrap"><table class="legal-table"><thead><tr><th>Advocate</th><th>Active Load</th><th>Hearing Load</th><th>Verdict Review</th><th>Capacity State</th></tr></thead><tbody>${DATA.advocateNetwork.map((row) => `<tr><td>${row.advocate}</td><td>${row.activeLoad}</td><td>${row.hearingLoad}</td><td>${row.verdictReviewLoad}</td><td>${row.availability}</td></tr>`).join('')}</tbody></table></div></article><article class="info-card"><h3>Availability + Capacity Indicator</h3><p><strong>Overloaded:</strong> ${DATA.advocateNetwork.filter((x) => x.availability === 'Overloaded').length}</p><p><strong>Near capacity:</strong> ${DATA.advocateNetwork.filter((x) => x.availability === 'Near Capacity').length}</p><p><strong>Available:</strong> ${DATA.advocateNetwork.filter((x) => x.availability === 'Available').length}</p><p><strong>Verification hold:</strong> ${DATA.advocateNetwork.filter((x) => x.availability === 'Verification Hold').length}</p></article></section><section class="table-card"><h3>Onboarding + Verification Flow States</h3><div class="legal-table-wrap"><table class="legal-table"><thead><tr><th>ID</th><th>Entity Type</th><th>Entity</th><th>Document Verification</th><th>Compliance Verification</th><th>Review State</th></tr></thead><tbody>${DATA.onboardingFlow.map((flow) => `<tr><td>${flow.id}</td><td>${flow.entityType}</td><td>${flow.entity}</td><td>${flow.documentVerification}</td><td>${flow.complianceVerification}</td><td>${flow.reviewState}</td></tr>`).join('')}</tbody></table></div></section>`;
    }
    if (screen === 'partners') {
      return `<section class="module-grid two"><article class="table-card"><h3>Law Firm Network</h3><div class="legal-table-wrap"><table class="legal-table"><thead><tr><th>ID</th><th>Law Firm</th><th>Onboarding</th><th>Verification Pipeline</th><th>Region/Jurisdiction</th><th>Status</th><th>Assignments</th><th>Productivity</th></tr></thead><tbody>${DATA.partnerLawFirms.map((firm) => `<tr><td>${firm.id}</td><td>${firm.partnerName}</td><td>${firm.onboardingState}</td><td>${firm.verificationPipeline}</td><td>${firm.regionMap} · ${firm.jurisdictionMap}</td><td>${firm.status}</td><td>${firm.assignmentHistory}</td><td>${firm.productivity}</td></tr>`).join('')}</tbody></table></div></article><article class="table-card"><h3>Independent Advocate Network</h3><div class="legal-table-wrap"><table class="legal-table"><thead><tr><th>ID</th><th>Advocate</th><th>Onboarding</th><th>Verification Pipeline</th><th>Region/Jurisdiction</th><th>Status</th><th>Assignments</th><th>Productivity</th></tr></thead><tbody>${DATA.partnerIndependents.map((adv) => `<tr><td>${adv.id}</td><td>${adv.partnerName}</td><td>${adv.onboardingState}</td><td>${adv.verificationPipeline}</td><td>${adv.regionMap} · ${adv.jurisdictionMap}</td><td>${adv.status}</td><td>${adv.assignmentHistory}</td><td>${adv.productivity}</td></tr>`).join('')}</tbody></table></div></article></section><section class="table-card"><h3>Verification + Assignment History</h3><p class="legal-mini">Pipeline visibility includes pending review, approved, and rejected states with partner productivity snapshots and assignment history.</p></section>`;
    }
    if (screen === 'corporate') {
      const openCount = DATA.corporatePipeline.filter((x) => x.status === 'open').length;
      const resolvedCount = DATA.corporatePipeline.filter((x) => x.status === 'resolved').length;
      return `<section class="module-grid two"><article class="info-card"><h3>Corporate Client Summary Cards</h3><p><strong>Open matters:</strong> ${openCount}</p><p><strong>Resolved matters:</strong> ${resolvedCount}</p><p><strong>Notice bucket:</strong> ${DATA.corporatePipeline.filter((x) => x.bucket === 'Notice').length}</p><p><strong>Dispute bucket:</strong> ${DATA.corporatePipeline.filter((x) => x.bucket === 'Dispute').length}</p><p><strong>Compliance bucket:</strong> ${DATA.corporatePipeline.filter((x) => x.bucket === 'Compliance').length}</p></article><article class="table-card"><h3>Matter Pipeline Buckets</h3><div class="legal-table-wrap"><table class="legal-table"><thead><tr><th>Bucket</th><th>Matters</th><th>High Risk</th></tr></thead><tbody><tr><td>Notices</td><td>${DATA.corporatePipeline.filter((x) => x.bucket === 'Notice').length}</td><td>${DATA.corporatePipeline.filter((x) => x.bucket === 'Notice' && x.riskScore >= 75).length}</td></tr><tr><td>Disputes</td><td>${DATA.corporatePipeline.filter((x) => x.bucket === 'Dispute').length}</td><td>${DATA.corporatePipeline.filter((x) => x.bucket === 'Dispute' && x.riskScore >= 75).length}</td></tr><tr><td>Compliance</td><td>${DATA.corporatePipeline.filter((x) => x.bucket === 'Compliance').length}</td><td>${DATA.corporatePipeline.filter((x) => x.bucket === 'Compliance' && x.riskScore >= 75).length}</td></tr></tbody></table></div></article></section>`;
    }
    if (screen === 'leadExchange') {
      return `<section class="module-grid two"><article class="table-card"><h3>Routing Buckets</h3><div class="legal-table-wrap"><table class="legal-table"><thead><tr><th>Bucket</th><th>Count</th><th>Action</th></tr></thead><tbody><tr><td>Assigned</td><td>${DATA.leadExchange.filter((x) => x.lane === 'assigned').length}</td><td>Monitor execution</td></tr><tr><td>Unassigned</td><td>${DATA.leadExchange.filter((x) => x.lane === 'unassigned').length}</td><td>Run matching engine</td></tr><tr><td>Escalated</td><td>${DATA.leadExchange.filter((x) => x.lane === 'escalated').length}</td><td>Owner + MUSKI escalation</td></tr></tbody></table></div></article><article class="table-card"><h3>Advocate/Partner Matching Logic UI</h3><p><strong>Matching fields:</strong> jurisdiction, specialization need, verification state, active capacity, partner readiness, commercial band.</p><p><strong>Jurisdiction-aware routing:</strong> Court and city compatibility must match before assignment.</p><p><strong>Monetization placeholder:</strong> Tiered commercial bands (A+, A, B) prepared for future revenue routing policy.</p></article></section><section class="table-card"><h3>Owner + MUSKI Integrated Signals</h3><div class="legal-table-wrap"><table class="legal-table"><thead><tr><th>ID</th><th>Signal</th><th>Severity</th><th>Owner</th><th>Current Value</th><th>Status</th></tr></thead><tbody>${DATA.muskiOwnerSignals.map((signal) => `<tr><td>${signal.id}</td><td>${signal.signal}</td><td>${signal.severity}</td><td>${signal.owner}</td><td>${signal.value}</td><td>${signal.status}</td></tr>`).join('')}</tbody></table></div></section>`;
    }
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
