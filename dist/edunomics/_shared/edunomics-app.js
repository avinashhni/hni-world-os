import { computeKPIs, edunomicsAdapter, mockDB, workflowStates } from '/edunomics/_shared/edunomics-data.js';

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

export const renderEdunomicsScreen = (screen) => {
  const snapshot = structuredClone(mockDB);
  const kpi = computeKPIs(snapshot);

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
      <article class="feature-card"><h3>Universities</h3><p>Partner and institution profile governance.</p><a class="primary-btn" href="/edunomics/universities/">Open</a></article>
      <article class="feature-card"><h3>Counselors</h3><p>Load, performance, conversion visibility.</p><a class="primary-btn" href="/edunomics/counselors/">Open</a></article>
      <article class="feature-card"><h3>Scholarships</h3><p>Eligibility to award decision tracking.</p><a class="primary-btn" href="/edunomics/scholarships/">Open</a></article>
      <article class="feature-card"><h3>Visa Desk</h3><p>Case checklist, document gap and deadline control.</p><a class="primary-btn" href="/edunomics/visa/">Open</a></article>
      <article class="feature-card"><h3>Documents</h3><p>Verification status and due-date risk.</p><a class="primary-btn" href="/edunomics/documents/">Open</a></article>
      <article class="feature-card"><h3>Intelligence</h3><p>Signals and activity log intelligence layer.</p><a class="primary-btn" href="/edunomics/intelligence/">Open</a></article>
      <article class="feature-card"><h3>Owner Command</h3><p>Escalations and phase-level executive oversight.</p><a class="primary-btn" href="/edunomics/owner/">Open</a></article>
    </section>
  `;

  const screens = {
    home: homeContent,
    students: `<section class="content-grid one">${table('Students Console', ['Student', 'Profile %', 'Stage', 'Counselor', 'Priority'], snapshot.studentProfiles.map((s) => [s.fullName, `${s.profileCompleteness}%`, s.stage, s.counselorId, s.priority]))}</section>`,
    applications: `<section class="content-grid one">${table('Applications Console', ['Application', 'University', 'Course', 'Stage', 'Deadline', 'Documents Pending'], snapshot.applications.map((a) => [a.id, a.universityId, a.courseId, a.stage, a.deadline, String(a.documentsPending)]))}</section>`,
    universities: `<section class="content-grid one">${table('Universities & Partners', ['University', 'Country', 'Tier', 'Visa Success', 'Stage'], snapshot.universityProfiles.map((u) => [u.name, u.country, u.partnerTier, `${u.visaSuccessRate}%`, u.stage]))}</section>`,
    counselors: `<section class="content-grid one">${table('Counselor Performance', ['Counselor', 'Active Students', 'Capacity', 'Load', 'Conversion'], snapshot.counselorProfiles.map((c) => [c.name, String(c.activeStudents), String(c.capacity), `${Math.round((c.activeStudents / c.capacity) * 100)}%`, `${Math.round(c.conversionRate * 100)}%`]))}</section>`,
    scholarships: `<section class="content-grid one">${table('Scholarships', ['ID', 'Student', 'Provider', 'Amount', 'Stage', 'Decision Date'], snapshot.scholarships.map((s) => [s.id, s.studentId, s.provider, `$${s.amountUSD}`, s.stage, s.decisionDate]))}</section>`,
    visa: `<section class="content-grid one">${table('Visa Cases', ['Case', 'Student', 'Country', 'Stage', 'Checklist', 'Embassy Date'], snapshot.visaCases.map((v) => [v.id, v.studentId, v.country, v.stage, `${v.checklistProgress}%`, v.embassyDate]))}</section>`,
    documents: `<section class="content-grid one">${table('Document Records', ['Document', 'Student', 'Type', 'Verified', 'Due Date', 'Priority'], snapshot.documentRecords.map((d) => [d.id, d.studentId, d.documentType, d.verified ? 'Yes' : 'No', d.dueDate, d.priority]))}</section>`,
    intelligence: `<section class="content-grid two">${table('Intelligence Signals', ['Signal', 'Summary'], [['Dropout Risk', '1 high-risk candidate needs intervention'], ['Visa Delay', 'Embassy slots constrained for Canada'], ['Scholarship Review', '1 application in review stage'], ['Partner SLA', 'All partner SLAs under threshold']])}${table('Activity Log', ['Action', 'Entity', 'Actor', 'Notes'], snapshot.activityLogs.slice(0, 6).map((l) => [l.action, `${l.entityType}:${l.entityId}`, l.actor, l.notes]))}</section>`,
    owner: `<section class="content-grid two">${table('Owner Oversight', ['Domain', 'Status', 'Criticality'], [['Student Pipeline', 'Operational', 'High'], ['Applications', 'Operational', 'High'], ['Visa Desk', 'Watch', 'Critical'], ['Counselor Desk', 'Operational', 'Medium'], ['Compliance Docs', 'Watch', 'High']])}${table('Escalations', ['Entity', 'Reason', 'Owner'], [['visaCase:visa-001', 'Urgent embassy slot required', 'owner.office'], ['application:app-002', 'Deadline in 3 days', 'owner.office']])}</section>`
  };

  return screens[screen] || homeContent;
};
