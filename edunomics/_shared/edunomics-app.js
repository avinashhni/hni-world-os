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
      <article class="feature-card"><h3>University Intelligence DB</h3><p>Rankings, fees, acceptance and visa metrics.</p><a class="primary-btn" href="/edunomics/universities/">Open</a></article>
      <article class="feature-card"><h3>Course Intelligence DB</h3><p>Degree, prerequisites, tuition, placement outcomes.</p><a class="primary-btn" href="/edunomics/courses/">Open</a></article>
      <article class="feature-card"><h3>Matching Engine</h3><p>Student profile to best-fit course recommendations.</p><a class="primary-btn" href="/edunomics/matching-engine/">Open</a></article>
      <article class="feature-card"><h3>Compare Universities</h3><p>Fees, duration, ROI, and visa success side-by-side.</p><a class="primary-btn" href="/edunomics/compare-universities/">Open</a></article>
      <article class="feature-card"><h3>Admin / Owner Tools</h3><p>Manage universities, courses, and intake cycles.</p><a class="primary-btn" href="/edunomics/admin-tools/">Open</a></article>
      <article class="feature-card"><h3>Intelligence</h3><p>Signals and activity log intelligence layer.</p><a class="primary-btn" href="/edunomics/intelligence/">Open</a></article>
      <article class="feature-card"><h3>Owner Command</h3><p>Escalations and phase-level executive oversight.</p><a class="primary-btn" href="/edunomics/owner/">Open</a></article>
    </section>
  `;

  const screens = {
    home: homeContent,
    students: `<section class="content-grid one">${table('Students Console', ['Student', 'Profile %', 'Stage', 'Counselor', 'Priority'], snapshot.studentProfiles.map((s) => [s.fullName, `${s.profileCompleteness}%`, s.stage, s.counselorId, s.priority]))}</section>`,
    applications: `<section class="content-grid one">${table('Applications Console', ['Application', 'University', 'Course', 'Stage', 'Deadline', 'Documents Pending'], snapshot.applications.map((a) => [a.id, a.universityId, a.courseId, a.stage, a.deadline, String(a.documentsPending)]))}</section>`,
    universities: `<section class="content-grid one">${table('University Intelligence Database', ['University', 'Country', 'Ranking', 'Intake Months', 'Fees', 'Acceptance Rate', 'Visa Success'], snapshot.universityProfiles.map((u) => [u.name, u.country, `#${u.ranking}`, u.intakeMonths.join(', '), `$${u.feesUSD.toLocaleString()}`, `${u.acceptanceRate}%`, `${u.visaSuccessRatio}%`]))}</section>`,
    counselors: `<section class="content-grid one">${table('Counselor Performance', ['Counselor', 'Active Students', 'Capacity', 'Load', 'Conversion'], snapshot.counselorProfiles.map((c) => [c.name, String(c.activeStudents), String(c.capacity), `${Math.round((c.activeStudents / c.capacity) * 100)}%`, `${Math.round(c.conversionRate * 100)}%`]))}</section>`,
    scholarships: `<section class="content-grid one">${table('Scholarships', ['ID', 'Student', 'Provider', 'Amount', 'Stage', 'Decision Date'], snapshot.scholarships.map((s) => [s.id, s.studentId, s.provider, `$${s.amountUSD}`, s.stage, s.decisionDate]))}</section>`,
    visa: `<section class="content-grid one">${table('Visa Cases', ['Case', 'Student', 'Country', 'Stage', 'Checklist', 'Embassy Date'], snapshot.visaCases.map((v) => [v.id, v.studentId, v.country, v.stage, `${v.checklistProgress}%`, v.embassyDate]))}</section>`,
    documents: `<section class="content-grid one">${table('Document Records', ['Document', 'Student', 'Type', 'Verified', 'Due Date', 'Priority'], snapshot.documentRecords.map((d) => [d.id, d.studentId, d.documentType, d.verified ? 'Yes' : 'No', d.dueDate, d.priority]))}</section>`,
    intelligence: `<section class="content-grid two">${table('Intelligence Signals', ['Signal', 'Summary'], [['Dropout Risk', '1 high-risk candidate needs intervention'], ['Visa Delay', 'Embassy slots constrained for Canada'], ['Scholarship Review', '1 application in review stage'], ['Partner SLA', 'All partner SLAs under threshold']])}${table('Activity Log', ['Action', 'Entity', 'Actor', 'Notes'], snapshot.activityLogs.slice(0, 6).map((l) => [l.action, `${l.entityType}:${l.entityId}`, l.actor, l.notes]))}</section>`,

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
    owner: `<section class="content-grid two">${table('Owner Oversight', ['Domain', 'Status', 'Criticality'], [['Student Pipeline', 'Operational', 'High'], ['Applications', 'Operational', 'High'], ['Visa Desk', 'Watch', 'Critical'], ['Counselor Desk', 'Operational', 'Medium'], ['Compliance Docs', 'Watch', 'High']])}${table('Escalations', ['Entity', 'Reason', 'Owner'], [['visaCase:visa-001', 'Urgent embassy slot required', 'owner.office'], ['application:app-002', 'Deadline in 3 days', 'owner.office']])}</section>`
  };

  return screens[screen] || homeContent;
};
