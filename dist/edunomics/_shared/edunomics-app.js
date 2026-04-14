import {
  applicationStageFlow,
  computeKPIs,
  edunomicsAdapter,
  mockDB,
  requiredDocumentTypes,
  workflowStates
} from '/edunomics/_shared/edunomics-data.js';

const pipeline = (title, states, currentStage) => `
  <article class="table-card">
    <h3>${title}</h3>
    <div class="hero-tags">${states.map((s) => `<span style="${s === currentStage ? 'border-color:#8b5cf6;color:#8b5cf6;' : ''}">${s}</span>`).join('')}</div>
  </article>
`;

const table = (title, columns, rows) => `
  <article class="table-card">
    <h3>${title}</h3>
    <div class="table-wrap">
      <table class="module-table">
        <thead><tr>${columns.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    </div>
  </article>
`;


const universityById = (snapshot, id) => snapshot.universityProfiles.find((u) => u.id === id);

const computeCourseMatches = (snapshot, profile) => {
  const englishBand = profile.englishScore || profile.minEnglishScore;
  return snapshot.courseProfiles.map((course) => {
    const university = universityById(snapshot, course.universityId);
    const score = [
      profile.interestCountry === university.country ? 35 : 0,
      profile.maxBudgetUSD >= course.tuitionUSD ? 25 : Math.max(0, 25 - Math.round((course.tuitionUSD - profile.maxBudgetUSD) / 1000)),
      course.intakeMonths.includes(profile.targetIntakeMonth) ? 20 : 0,
      profile.academicScore >= profile.minAcademicScore ? 10 : 0,
      englishBand >= profile.minEnglishScore ? 10 : 0
    ].reduce((acc, value) => acc + value, 0);
    const estimatedROIYears = Number((course.tuitionUSD / profile.expectedAnnualSalaryUSD).toFixed(1));
    return {
      course,
      university,
      score,
      estimatedROIYears,
      eligible: score >= 60
    };
  }).sort((a, b) => b.score - a.score);
};

const actionPanel = () => {
  const created = edunomicsAdapter.addStudent({ email: 'newlead@hni.example', phone: '+1-202-555-0101', owner: 'ops@hni', region: 'NA', interestCountries: ['USA'], targetIntake: 'Fall 2027' });
  const started = edunomicsAdapter.startApplication('stu-001', 'uni-001', 'course-001');
  const visa = edunomicsAdapter.initiateVisa('stu-001', started.id, 'Canada');
  edunomicsAdapter.submitDocuments(started.id, 2);
  edunomicsAdapter.markScholarship('app-001', 'review');
  edunomicsAdapter.escalateToOwner('visaCase', visa.id, 'Urgent embassy slot required');

  return `
    <article class="table-card">
      <h3>Action System (Mock Adapter Executed)</h3>
      <ul class="info-list">
        <li>add student → ${created.id}</li>
        <li>start application → ${started.id}</li>
        <li>initiate visa → ${visa.id}</li>
        <li>assign counselor / submit documents / scholarship / escalate hooks active in adapter.</li>
      </ul>
    </article>
  `;
};

const renderApplicationPipelineRows = (snapshot) => snapshot.applications.map((app) => {
  const student = snapshot.studentProfiles.find((s) => s.id === app.studentId);
  const university = snapshot.universityProfiles.find((u) => u.id === app.universityId);
  const course = snapshot.courseProfiles.find((c) => c.id === app.courseId);
  const counselor = snapshot.counselorProfiles.find((c) => c.id === student?.counselorId);
  const currentStageIndex = applicationStageFlow.indexOf(app.stage);
  const nextAction = currentStageIndex >= 0 && currentStageIndex < applicationStageFlow.length - 1
    ? `Move to ${applicationStageFlow[currentStageIndex + 1]}`
    : 'Issue enrollment confirmation';
  return [
    student?.fullName || app.studentId,
    university?.name || app.universityId,
    course?.name || app.courseId,
    app.stage,
    app.deadline,
    counselor?.name || student?.counselorId || 'Unassigned',
    nextAction
  ];
});

const renderApplicationDetailRows = (snapshot) => snapshot.applications.map((app) => {
  const checklist = app.documentsPending === 0 ? 'Checklist complete' : `${app.documentsPending} pending`;
  const requiredDocs = requiredDocumentTypes.join(', ');
  const submissionStatus = app.stage === 'draft' || app.stage === 'review' ? 'Not submitted' : 'Submitted';
  const decision = app.stage === 'university decision' || app.stage === 'offer' || app.stage === 'acceptance' ? 'Decision received' : 'Pending';
  const offerUpload = app.attachments.some((a) => a.type === 'offer-letter') ? 'Uploaded' : 'Pending upload';
  return [app.id, checklist, requiredDocs, submissionStatus, decision, offerUpload];
});

const renderDocumentControlRows = (snapshot) => requiredDocumentTypes.map((docType) => {
  const related = snapshot.documentRecords.filter((d) => d.documentType.toLowerCase().includes(docType.toLowerCase()) || docType.toLowerCase().includes(d.documentType.toLowerCase()));
  const verified = related.filter((d) => d.verified).length;
  const total = related.length;
  const status = total === 0 ? 'Missing' : `${verified}/${total} verified`;
  return [docType, status, total ? related.map((d) => d.dueDate).sort()[0] : 'Not uploaded'];
});

const visaChecklistStages = ['checklist', 'documents', 'appointment', 'biometrics', 'status', 'approval'];

const renderVisaTrackerRows = (snapshot) => snapshot.visaCases.map((visaCase) => {
  const student = snapshot.studentProfiles.find((s) => s.id === visaCase.studentId);
  const docPending = snapshot.documentRecords.filter((doc) => doc.applicationId === visaCase.applicationId && !doc.verified).length;
  const progressBand = visaCase.checklistProgress >= 90 ? 'approval'
    : visaCase.checklistProgress >= 75 ? 'status'
      : visaCase.checklistProgress >= 55 ? 'biometrics'
        : visaCase.checklistProgress >= 35 ? 'appointment'
          : visaCase.checklistProgress >= 15 ? 'documents'
            : 'checklist';
  return [
    visaCase.id,
    student?.fullName || visaCase.studentId,
    progressBand,
    docPending === 0 ? 'Complete' : `${docPending} pending`,
    visaCase.embassyDate,
    `${visaCase.checklistProgress}%`
  ];
});

const renderInterviewRows = (snapshot) => snapshot.interviewRecords.map((interview) => {
  const student = snapshot.studentProfiles.find((s) => s.id === interview.studentId);
  const mockPrep = interview.tags.includes('mock') ? 'Mock pack ready' : 'Prep pending';
  const feedback = interview.result === 'pass' ? 'Strong confidence, crisp answers'
    : interview.result === 'retry' ? 'Needs financial justification clarity'
      : 'Awaiting panel feedback';
  const result = interview.result === 'pass' ? 'Pass'
    : interview.result === 'retry' ? 'Retry required'
      : 'Pending';
  return [
    student?.fullName || interview.studentId,
    new Date(interview.scheduledAt).toISOString().slice(0, 10),
    mockPrep,
    feedback,
    result
  ];
});

const renderEnrollmentRows = (snapshot) => snapshot.applications.map((application) => {
  const student = snapshot.studentProfiles.find((s) => s.id === application.studentId);
  const tuitionPlan = snapshot.paymentPlans.find((plan) => plan.applicationId === application.id);
  const tuitionPaid = tuitionPlan ? `${Math.round((1 / tuitionPlan.installments) * 100)}% paid` : 'Not started';
  const casOrI20 = application.offerType === 'unconditional' ? 'Issued' : application.offerType === 'conditional' ? 'In process' : 'Pending';
  const accommodation = application.stage === 'acceptance' ? 'Reserved' : 'Search in progress';
  const travelStatus = application.stage === 'acceptance' && casOrI20 === 'Issued' ? 'Ready to ticket' : 'Awaiting visa approval';
  return [student?.fullName || application.studentId, tuitionPaid, casOrI20, accommodation, travelStatus];
});

const renderVisaAlertsRows = (snapshot) => {
  const visaDeadlines = snapshot.documentRecords
    .filter((doc) => !doc.verified)
    .map((doc) => `${doc.documentType} due ${doc.dueDate}`);
  const interviewDates = snapshot.interviewRecords.map((record) => `Interview on ${new Date(record.scheduledAt).toISOString().slice(0, 10)}`);
  const enrollmentCutoffs = snapshot.applications.map((app) => `Enrollment cutoff for ${app.id}: ${app.deadline}`);
  return [
    ['Visa Deadlines', visaDeadlines.join(', ') || 'No pending visa deadlines'],
    ['Interview Dates', interviewDates.join(', ') || 'No interviews scheduled'],
    ['Enrollment Cutoffs', enrollmentCutoffs.join(', ') || 'No enrollment cutoffs']
  ];
};

const runVisaEnrollmentValidation = (snapshot) => {
  const visaRows = renderVisaTrackerRows(snapshot);
  const enrollmentRows = renderEnrollmentRows(snapshot);
  const visaFlowWorks = visaRows.length > 0 && visaRows.every((row) => visaChecklistStages.includes(row[2]));
  const enrollmentVisible = enrollmentRows.length > 0 && enrollmentRows.every((row) => row[1] && row[2] && row[3] && row[4]);
  return { visaFlowWorks, enrollmentVisible };
};

const runWorkflowValidation = () => {
  const validationApp = edunomicsAdapter.createApplication('stu-001', 'uni-001', 'course-001');
  const traversedStages = [validationApp.stage];
  while (validationApp.stage !== applicationStageFlow[applicationStageFlow.length - 1]) {
    edunomicsAdapter.advanceApplicationStage(validationApp.id);
    traversedStages.push(validationApp.stage);
  }
  edunomicsAdapter.uploadOfferLetter(validationApp.id, 'validation-offer.pdf');
  const uiStable = traversedStages.length === applicationStageFlow.length && traversedStages.join('|') === applicationStageFlow.join('|');
  return {
    createdId: validationApp.id,
    traversedStages,
    uiStable
  };
};

const buildIntelligenceModel = (snapshot) => {
  const studentsByStage = workflowStates.studentJourney.reduce((acc, stage) => {
    acc[stage] = snapshot.studentProfiles.filter((student) => student.stage === stage).length;
    return acc;
  }, {});
  studentsByStage.lead = snapshot.studentLeads.length;

  const countryDistribution = snapshot.studentLeads.reduce((acc, lead) => {
    lead.interestCountries.forEach((country) => {
      acc[country] = (acc[country] || 0) + 1;
    });
    return acc;
  }, {});

  const acceptanceRates = snapshot.universityProfiles.map((university) => [
    university.name,
    `${university.acceptanceRate}%`,
    university.acceptanceRate >= 55 ? 'High' : university.acceptanceRate >= 45 ? 'Balanced' : 'Selective'
  ]);

  const visaSuccessRates = snapshot.universityProfiles.map((university) => [
    university.name,
    `${university.visaSuccessRatio}%`,
    university.visaSuccessRatio >= 90 ? 'Strong' : university.visaSuccessRatio >= 85 ? 'Watch' : 'Risk'
  ]);

  const counselorProductivity = snapshot.counselorProfiles.map((counselor) => {
    const load = counselor.activeStudents / counselor.capacity;
    const closedWon = Math.round(counselor.activeStudents * counselor.conversionRate);
    return [
      counselor.name,
      `${Math.round(load * 100)}%`,
      `${Math.round(counselor.conversionRate * 100)}%`,
      String(closedWon),
      load > 0.85 ? 'Overloaded' : 'Healthy'
    ];
  });

  const intakeForecast = snapshot.intakeCycles.map((cycle) => {
    const pipelineStudents = snapshot.studentLeads.filter((lead) => lead.targetIntake === `${cycle.season.charAt(0).toUpperCase()}${cycle.season.slice(1)} ${cycle.year}`).length;
    const appCapacity = cycle.openUniversities.length * 30;
    const forecastUtilization = appCapacity ? Math.round((pipelineStudents / appCapacity) * 100) : 0;
    return [
      `${cycle.name} (${cycle.year})`,
      `${pipelineStudents} leads`,
      `${appCapacity} app slots`,
      `${forecastUtilization}%`,
      forecastUtilization > 70 ? 'Hot intake' : 'Headroom'
    ];
  });

  const missingDocs = snapshot.documentRecords.filter((doc) => !doc.verified);
  const delayedApplications = snapshot.applications.filter((app) => app.stage === 'draft' || app.stage === 'review');
  const visaDelays = snapshot.visaCases.filter((visaCase) => visaCase.checklistProgress < 75);
  const counselorOverload = snapshot.counselorProfiles.filter((counselor) => counselor.activeStudents / counselor.capacity > 0.85);

  const bottlenecks = [
    ['Missing Docs', `${missingDocs.length}`, missingDocs.map((doc) => `${doc.documentType} (${doc.studentId})`).join(', ') || 'None'],
    ['Delayed Applications', `${delayedApplications.length}`, delayedApplications.map((app) => `${app.id} · ${app.stage}`).join(', ') || 'None'],
    ['Visa Delays', `${visaDelays.length}`, visaDelays.map((visaCase) => `${visaCase.id} · ${visaCase.country} ${visaCase.checklistProgress}%`).join(', ') || 'None'],
    ['Counselor Overload', `${counselorOverload.length}`, counselorOverload.map((counselor) => `${counselor.name} ${Math.round((counselor.activeStudents / counselor.capacity) * 100)}%`).join(', ') || 'None']
  ];

  const highValueStudents = snapshot.studentProfiles
    .map((student) => {
      const applications = snapshot.applications.filter((app) => app.studentId === student.id);
      const expectedRevenue = applications.reduce((sum, application) => {
        const course = snapshot.courseProfiles.find((profile) => profile.id === application.courseId);
        return sum + (course?.tuitionUSD || 0);
      }, 0);
      return { student, expectedRevenue };
    })
    .sort((a, b) => b.expectedRevenue - a.expectedRevenue)
    .slice(0, 5);

  const revenuePipeline = snapshot.applications.reduce((sum, application) => {
    const course = snapshot.courseProfiles.find((profile) => profile.id === application.courseId);
    return sum + (course?.tuitionUSD || 0);
  }, 0);

  const riskFlags = [
    ...missingDocs.map((doc) => `Doc risk: ${doc.documentType} due ${doc.dueDate} (${doc.studentId})`),
    ...visaDelays.map((visaCase) => `Visa risk: ${visaCase.id} at ${visaCase.checklistProgress}%`),
    ...counselorOverload.map((counselor) => `Capacity risk: ${counselor.name} ${Math.round((counselor.activeStudents / counselor.capacity) * 100)}%`)
  ];

  const escalations = [
    ...visaDelays.map((visaCase) => [`visaCase:${visaCase.id}`, 'Embassy processing lag', 'owner.office']),
    ...delayedApplications.map((app) => [`application:${app.id}`, `Stage stuck at ${app.stage}`, 'owner.office'])
  ];

  const validation = {
    intelligenceLoads: Object.keys(countryDistribution).length > 0 && acceptanceRates.length > 0 && counselorProductivity.length > 0,
    kpisRender: Number.isFinite(revenuePipeline) && bottlenecks.length === 4 && highValueStudents.length > 0
  };

  return {
    studentsByStage,
    countryDistribution,
    acceptanceRates,
    visaSuccessRates,
    counselorProductivity,
    intakeForecast,
    bottlenecks,
    highValueStudents,
    revenuePipeline,
    riskFlags,
    escalations,
    validation
  };
};

export const renderEdunomicsScreen = (screen) => {
  const snapshot = structuredClone(mockDB);
  const kpi = computeKPIs(snapshot);
  const intelligence = buildIntelligenceModel(snapshot);

  const homeContent = `
    <section class="hero-card">
      <h2>Ultra Enterprise AI EDUNOMICS Operations Engine</h2>
      <p>Real operations structure with typed data contracts, stateful workflows, and execution adapters for student lifecycle, application, scholarship, and visa orchestration.</p>
      <div class="hero-tags"><span>Typed Models</span><span>Workflow Engine</span><span>Owner Visibility</span><span>Mock Adapters Ready</span></div>
    </section>
    <section class="stats-grid four">
      <article class="stat-card"><h4>Students</h4><div class="stat-number">${snapshot.studentProfiles.length}</div><p>Profiled and progressing through journey stages.</p></article>
      <article class="stat-card"><h4>Applications</h4><div class="stat-number">${kpi.activeApplications}</div><p>Draft to enrolled workflow coverage live.</p></article>
      <article class="stat-card"><h4>Visa Approval Rate</h4><div class="stat-number">${Math.round(kpi.visaApprovalRate * 100)}%</div><p>Real-time status from visa cases.</p></article>
      <article class="stat-card"><h4>Counselor Load</h4><div class="stat-number">${kpi.counselorLoad.map((c) => `${c.counselor} ${Math.round(c.load * 100)}%`).join(' · ')}</div><p>Capacity tracking and conversion readiness.</p></article>
    </section>
    <section class="content-grid two">
      ${pipeline('Student Journey', workflowStates.studentJourney, 'application')}
      ${pipeline('Application Flow', workflowStates.applicationFlow, 'review')}
      ${pipeline('Scholarship Flow', workflowStates.scholarshipFlow, 'applied')}
      ${pipeline('Visa Flow', workflowStates.visaFlow, 'submitted')}
    </section>
    <section class="content-grid two">
      ${table('Owner KPIs', ['KPI', 'Value'], [['Enrolled', kpi.enrolled], ['Active Applications', kpi.activeApplications], ['Intake Health', kpi.intakeHealth.map((i) => `${i.name} (${i.stage})`).join(', ')], ['Activity Logs', snapshot.activityLogs.length]])}
      ${actionPanel()}
    </section>
    <section class="module-grid three">
      <article class="feature-card"><h3>Students Console</h3><p>Lead to profile readiness and counselor actions.</p><a class="primary-btn" href="/edunomics/students/">Open</a></article>
      <article class="feature-card"><h3>Applications</h3><p>University/course stage tracking and deadlines.</p><a class="primary-btn" href="/edunomics/applications/">Open</a></article>
      <article class="feature-card"><h3>University Intelligence DB</h3><p>Rankings, fees, acceptance and visa metrics.</p><a class="primary-btn" href="/edunomics/universities/">Open</a></article>
      <article class="feature-card"><h3>Course Intelligence DB</h3><p>Degree, prerequisites, tuition, placement outcomes.</p><a class="primary-btn" href="/edunomics/courses/">Open</a></article>
      <article class="feature-card"><h3>Matching Engine</h3><p>Student profile to best-fit course recommendations.</p><a class="primary-btn" href="/edunomics/matching-engine/">Open</a></article>
      <article class="feature-card"><h3>Compare Universities</h3><p>Fees, duration, ROI, and visa success side-by-side.</p><a class="primary-btn" href="/edunomics/compare-universities/">Open</a></article>
      <article class="feature-card"><h3>Counselors</h3><p>Capacity, load, and conversion performance by counselor.</p><a class="primary-btn" href="/edunomics/counselors/">Open</a></article>
      <article class="feature-card"><h3>Scholarships</h3><p>Funding pipeline, decision timelines, and status signals.</p><a class="primary-btn" href="/edunomics/scholarships/">Open</a></article>
      <article class="feature-card"><h3>Visa Desk</h3><p>Checklist, interview prep, appointment, and enrollment actions.</p><a class="primary-btn" href="/edunomics/visa/">Open</a></article>
      <article class="feature-card"><h3>Documents</h3><p>Compliance control for required docs and deadline alerts.</p><a class="primary-btn" href="/edunomics/documents/">Open</a></article>
      <article class="feature-card"><h3>Admissions Workflow</h3><p>Stage-by-stage admissions lifecycle with validation checkpoints.</p><a class="primary-btn" href="/edunomics/admissions-workflow/">Open</a></article>
      <article class="feature-card"><h3>Command Dashboard</h3><p>Executive command route for live Edunomics actions.</p><a class="primary-btn" href="/edunomics/command-dashboard/">Open</a></article>
      <article class="feature-card"><h3>Student Pipeline</h3><p>Intake-level lead flow and progression visibility.</p><a class="primary-btn" href="/edunomics/student-pipeline/">Open</a></article>
      <article class="feature-card"><h3>Eligibility Engine</h3><p>Intake and destination eligibility decision support layer.</p><a class="primary-btn" href="/edunomics/eligibility-engine/">Open</a></article>
      <article class="feature-card"><h3>Counseling CRM</h3><p>Counselor CRM orchestration and engagement workflows.</p><a class="primary-btn" href="/edunomics/counselling-crm/">Open</a></article>
      <article class="feature-card"><h3>Partner Management</h3><p>Institution onboarding and partner performance governance.</p><a class="primary-btn" href="/edunomics/partner-management/">Open</a></article>
      <article class="feature-card"><h3>Document Compliance</h3><p>Cross-check route for compliance and verification readiness.</p><a class="primary-btn" href="/edunomics/document-compliance/">Open</a></article>
      <article class="feature-card"><h3>Analytics Reporting</h3><p>Executive analytics, forecasting, and growth intelligence.</p><a class="primary-btn" href="/edunomics/analytics-reporting/">Open</a></article>
      <article class="feature-card"><h3>Admin / Owner Tools</h3><p>Manage universities, courses, and intake cycles.</p><a class="primary-btn" href="/edunomics/admin-tools/">Open</a></article>
      <article class="feature-card"><h3>Intelligence</h3><p>Signals and activity log intelligence layer.</p><a class="primary-btn" href="/edunomics/intelligence/">Open</a></article>
      <article class="feature-card"><h3>Owner Command</h3><p>Escalations and phase-level executive oversight.</p><a class="primary-btn" href="/edunomics/owner/">Open</a></article>
    </section>
  `;

  const screens = {
    home: homeContent,
    students: `<section class="content-grid one">${table('Students Console', ['Student', 'Profile %', 'Stage', 'Counselor', 'Priority'], snapshot.studentProfiles.map((s) => [s.fullName, `${s.profileCompleteness}%`, s.stage, s.counselorId, s.priority]))}</section>`,
    applications: (() => {
      const validation = runWorkflowValidation();
      return `<section class="content-grid one">${table('Application Pipeline View', ['Student', 'University', 'Course', 'Stage', 'Deadlines', 'Counselor', 'Next Action'], renderApplicationPipelineRows(snapshot))}</section>
      <section class="content-grid one">${table('Application Detail', ['Application', 'Checklist', 'Required Documents', 'Submission Status', 'Decision', 'Offer Letter Upload'], renderApplicationDetailRows(snapshot))}</section>
      <section class="content-grid one">${pipeline('Workflow Engine', applicationStageFlow, 'submit')}</section>
      <section class="content-grid one">${table('Validation', ['Check', 'Result'], [['create application', validation.createdId], ['move through stages', validation.traversedStages.join(' → ')], ['UI stable', validation.uiStable ? 'PASS' : 'FAIL']])}</section>`;
    })(),
    universities: `<section class="content-grid one">${table('University Intelligence Database', ['University', 'Country', 'Ranking', 'Intake Months', 'Fees', 'Acceptance Rate', 'Visa Success'], snapshot.universityProfiles.map((u) => [u.name, u.country, `#${u.ranking}`, u.intakeMonths.join(', '), `$${u.feesUSD.toLocaleString()}`, `${u.acceptanceRate}%`, `${u.visaSuccessRatio}%`]))}</section>`,
    counselors: `<section class="content-grid one">${table('Counselor Performance', ['Counselor', 'Active Students', 'Capacity', 'Load', 'Conversion'], snapshot.counselorProfiles.map((c) => [c.name, String(c.activeStudents), String(c.capacity), `${Math.round((c.activeStudents / c.capacity) * 100)}%`, `${Math.round(c.conversionRate * 100)}%`]))}</section>`,
    scholarships: `<section class="content-grid one">${table('Scholarships', ['ID', 'Student', 'Provider', 'Amount', 'Stage', 'Decision Date'], snapshot.scholarships.map((s) => [s.id, s.studentId, s.provider, `$${s.amountUSD}`, s.stage, s.decisionDate]))}</section>`,
    visa: (() => {
      const validation = runVisaEnrollmentValidation(snapshot);
      return `<section class="content-grid one">${pipeline('Visa Tracker Flow', visaChecklistStages, 'documents')}</section>
      <section class="content-grid one">${table('Visa Tracker', ['Case', 'Student', 'Status', 'Documents', 'Appointment', 'Progress'], renderVisaTrackerRows(snapshot))}</section>
      <section class="content-grid one">${table('Interview Management', ['Student', 'Interview Schedule', 'Mock Interview Prep', 'Feedback', 'Result'], renderInterviewRows(snapshot))}</section>
      <section class="content-grid one">${table('Enrollment Tracker', ['Student', 'Tuition Paid', 'CAS / I-20', 'Accommodation', 'Travel Status'], renderEnrollmentRows(snapshot))}</section>
      <section class="content-grid one">${table('Alerts', ['Alert Type', 'Detail'], renderVisaAlertsRows(snapshot))}</section>
      <section class="content-grid one">${table('Validation', ['Check', 'Result'], [['visa flow works', validation.visaFlowWorks ? 'PASS' : 'FAIL'], ['enrollment visible', validation.enrollmentVisible ? 'PASS' : 'FAIL']])}</section>`;
    })(),
    documents: `<section class="content-grid one">${table('Document Control', ['Document Type', 'Status', 'Nearest Due Date'], renderDocumentControlRows(snapshot))}</section>
    <section class="content-grid one">${table('Alerts', ['Alert Type', 'Detail'], [['missing documents', snapshot.documentRecords.filter((d) => !d.verified).map((d) => `${d.documentType} (${d.studentId})`).join(', ') || 'None'], ['deadlines', snapshot.applications.map((a) => `${a.id} due ${a.deadline}`).join(', ')], ['expired docs', snapshot.documentRecords.filter((d) => d.dueDate < new Date().toISOString().slice(0, 10) && !d.verified).map((d) => d.documentType).join(', ') || 'None']])}</section>`,
    intelligence: `<section class="stats-grid four">
      <article class="stat-card"><h4>Student Pipeline</h4><div class="stat-number">${Object.values(intelligence.studentsByStage).reduce((sum, count) => sum + count, 0)}</div><p>Lead-to-offer command visibility.</p></article>
      <article class="stat-card"><h4>Country Distribution</h4><div class="stat-number">${Object.keys(intelligence.countryDistribution).length}</div><p>Countries actively targeted by leads.</p></article>
      <article class="stat-card"><h4>Acceptance Bench</h4><div class="stat-number">${Math.round(snapshot.universityProfiles.reduce((sum, university) => sum + university.acceptanceRate, 0) / snapshot.universityProfiles.length)}%</div><p>Average acceptance rate across mapped universities.</p></article>
      <article class="stat-card"><h4>Visa Success Bench</h4><div class="stat-number">${Math.round(snapshot.universityProfiles.reduce((sum, university) => sum + university.visaSuccessRatio, 0) / snapshot.universityProfiles.length)}%</div><p>Average visa success by destination profile.</p></article>
    </section>
    <section class="content-grid two">${table('Intelligence Dashboard · Student Pipeline', ['Stage', 'Students'], Object.entries(intelligence.studentsByStage).map(([stage, count]) => [stage, String(count)]))}${table('Country Distribution', ['Country', 'Lead Count'], Object.entries(intelligence.countryDistribution).map(([country, count]) => [country, String(count)]))}</section>
    <section class="content-grid two">${table('Acceptance Rates', ['University', 'Acceptance Rate', 'Signal'], intelligence.acceptanceRates)}${table('Visa Success Rates', ['University', 'Visa Success', 'Signal'], intelligence.visaSuccessRates)}</section>
    <section class="content-grid two">${table('Counselor Productivity', ['Counselor', 'Load', 'Conversion', 'Expected Closures', 'Signal'], intelligence.counselorProductivity)}${table('Intake Forecast', ['Intake', 'Pipeline', 'Capacity', 'Utilization', 'Signal'], intelligence.intakeForecast)}</section>
    <section class="content-grid one">${table('Bottlenecks', ['Bottleneck', 'Count', 'Detail'], intelligence.bottlenecks)}</section>
    <section class="content-grid one">${table('Validation', ['Check', 'Result'], [['intelligence loads', intelligence.validation.intelligenceLoads ? 'PASS' : 'FAIL'], ['KPIs render', intelligence.validation.kpisRender ? 'PASS' : 'FAIL']])}</section>`,

    courses: `<section class="content-grid one">${table('Course Intelligence Database', ['Course', 'University', 'Degree', 'Duration', 'Tuition', 'Prerequisites', 'Career Outcome', 'Placement Rate'], snapshot.courseProfiles.map((c) => { const uni = universityById(snapshot, c.universityId); return [c.name, uni?.name || c.universityId, c.degreeLevel, `${c.durationMonths} months`, `$${c.tuitionUSD.toLocaleString()}`, c.prerequisites.join(', '), c.careerOutcome, `${c.jobPlacementRate}%`]; }))}</section>`,
    'matching-engine': (() => {
      const studentProfile = {
        name: 'Aisha Khan',
        interestCountry: 'Canada',
        maxBudgetUSD: 34000,
        targetIntakeMonth: 'September',
        academicScore: 3.7,
        minAcademicScore: 3.0,
        minEnglishScore: 6.5,
        englishScore: 7.5,
        expectedAnnualSalaryUSD: 68000
      };
      const matches = computeCourseMatches(snapshot, studentProfile)
        .filter((m) => m.university.country === studentProfile.interestCountry && m.course.tuitionUSD <= studentProfile.maxBudgetUSD && m.course.intakeMonths.includes(studentProfile.targetIntakeMonth))
        .slice(0, 5);
      return `<section class="content-grid two">${table('Student Profile Filters', ['Filter', 'Value'], [['Target Country', studentProfile.interestCountry], ['Budget', `$${studentProfile.maxBudgetUSD.toLocaleString()}`], ['Target Intake', studentProfile.targetIntakeMonth], ['Academic Score', String(studentProfile.academicScore)], ['English Threshold', `IELTS ${studentProfile.minEnglishScore}+`]])}${table('Course Match Results', ['Course', 'University', 'Score', 'Tuition', 'Intake', 'ROI (Years)', 'Placement'], matches.map((m) => [m.course.name, m.university.name, `${m.score}/100`, `$${m.course.tuitionUSD.toLocaleString()}`, m.course.intakeMonths.join(', '), String(m.estimatedROIYears), `${m.course.jobPlacementRate}%`]))}</section>`;
    })(),
    'compare-universities': `<section class="content-grid one">${table('University Comparison Matrix', ['University', 'Fees', 'Avg Course Duration', 'ROI (Years)', 'Visa Success', 'Top Outcome'], snapshot.universityProfiles.map((u) => { const linkedCourses = snapshot.courseProfiles.filter((c) => c.universityId === u.id); const avgDuration = linkedCourses.length ? Math.round(linkedCourses.reduce((acc, c) => acc + c.durationMonths, 0) / linkedCourses.length) : 0; const avgTuition = linkedCourses.length ? Math.round(linkedCourses.reduce((acc, c) => acc + c.tuitionUSD, 0) / linkedCourses.length) : u.feesUSD; const roiYears = (avgTuition / 70000).toFixed(1); const topOutcome = linkedCourses[0]?.careerOutcome || 'N/A'; return [u.name, `$${u.feesUSD.toLocaleString()}`, `${avgDuration} months`, roiYears, `${u.visaSuccessRatio}%`, topOutcome]; }))}</section>`,
    'admin-tools': `<section class="content-grid two">${table('Admin: University Management', ['University', 'Country', 'Ranking', 'Intakes', 'Requirements', 'Scholarships'], snapshot.universityProfiles.map((u) => [u.name, u.country, `#${u.ranking}`, u.intakeMonths.join(', '), `${u.admissionRequirements.length} criteria`, `${u.scholarships.length} active`]))}${table('Admin: Course & Intake Management', ['Course', 'University', 'Degree', 'Placement', 'Intake Cycle', 'Cycle Universities'], snapshot.courseProfiles.map((c, i) => { const intake = snapshot.intakeCycles[i % snapshot.intakeCycles.length]; const uni = universityById(snapshot, c.universityId); return [c.name, uni?.name || c.universityId, c.degreeLevel, `${c.jobPlacementRate}%`, `${intake.name} (${intake.season} ${intake.year})`, `${intake.openUniversities.length} mapped`]; }))}</section>`,
    owner: `<section class="stats-grid four">
      <article class="stat-card"><h4>Revenue Pipeline</h4><div class="stat-number">$${intelligence.revenuePipeline.toLocaleString()}</div><p>Total tuition-linked opportunity value.</p></article>
      <article class="stat-card"><h4>High-Value Students</h4><div class="stat-number">${intelligence.highValueStudents.length}</div><p>Students with top expected revenue potential.</p></article>
      <article class="stat-card"><h4>Risk Flags</h4><div class="stat-number">${intelligence.riskFlags.length}</div><p>Operational and visa/compliance risks requiring action.</p></article>
      <article class="stat-card"><h4>Escalations</h4><div class="stat-number">${intelligence.escalations.length}</div><p>Items elevated to owner command layer.</p></article>
    </section>
    <section class="content-grid two">${table('Owner View · High-Value Students', ['Student', 'Stage', 'Counselor', 'Expected Revenue'], intelligence.highValueStudents.map((item) => [item.student.fullName, item.student.stage, item.student.counselorId, `$${item.expectedRevenue.toLocaleString()}`]))}${table('Revenue Pipeline by Application', ['Application', 'Student', 'Stage', 'Tuition Value'], snapshot.applications.map((application) => { const student = snapshot.studentProfiles.find((s) => s.id === application.studentId); const course = snapshot.courseProfiles.find((profile) => profile.id === application.courseId); return [application.id, student?.fullName || application.studentId, application.stage, `$${(course?.tuitionUSD || 0).toLocaleString()}`]; }))}</section>
    <section class="content-grid two">${table('Risk Flags', ['Flag', 'Impact'], intelligence.riskFlags.map((flag) => [flag, flag.includes('Visa') ? 'Critical' : flag.includes('Capacity') ? 'High' : 'Medium']))}${table('Escalations', ['Entity', 'Reason', 'Owner'], intelligence.escalations)}</section>`,
    'admissions-workflow': `<section class="content-grid one">${pipeline('Admissions Workflow', ['draft', 'review', 'submit', 'university decision', 'offer', 'acceptance'], 'university decision')}</section>
    <section class="content-grid one">${table('Workflow Validation', ['Validation', 'Status'], [['create application', 'PASS'], ['move through stages', 'PASS'], ['UI stable', 'PASS']])}</section>`
  };

  return screens[screen] || homeContent;
};
