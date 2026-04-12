/**
 * AI EDUNOMICS OS data contracts and mock adapter layer.
 * Typed via JSDoc to keep browser-native compatibility.
 */

/** @typedef {'low'|'medium'|'high'|'critical'} Priority */

/**
 * @typedef {Object} BaseRecord
 * @property {string} id
 * @property {string} status
 * @property {string} stage
 * @property {string} owner
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {string[]} tags
 * @property {Priority} priority
 * @property {string} region
 * @property {{name:string,url:string,type:string}[]} attachments
 */

/** @typedef {BaseRecord & {leadSource:string;email:string;phone:string;interestCountries:string[];targetIntake:string}} StudentLead */
/** @typedef {BaseRecord & {studentLeadId:string;fullName:string;profileCompleteness:number;academicScore:number;englishTest:string;counselorId:string}} StudentProfile */
/** @typedef {BaseRecord & {name:string;country:string;ranking:number;intakeMonths:string[];admissionRequirements:string[];feesUSD:number;scholarships:string[];acceptanceRate:number;visaSuccessRatio:number;partnerTier:'strategic'|'growth'|'network'}} UniversityProfile */
/** @typedef {BaseRecord & {universityId:string;name:string;degreeLevel:string;durationMonths:number;tuitionUSD:number;prerequisites:string[];careerOutcome:string;jobPlacementRate:number;intakeMonths:string[]}} CourseProfile */
/** @typedef {BaseRecord & {studentId:string;universityId:string;courseId:string;deadline:string;documentsPending:number;offerType:'none'|'conditional'|'unconditional'}} Application */
/** @typedef {BaseRecord & {applicationId:string;studentId:string;provider:string;amountUSD:number;coverage:'partial'|'full';decisionDate:string}} Scholarship */
/** @typedef {BaseRecord & {studentId:string;applicationId:string;country:string;embassyDate:string;checklistProgress:number}} VisaCase */
/** @typedef {BaseRecord & {studentId:string;applicationId:string;documentType:string;verified:boolean;dueDate:string}} DocumentRecord */
/** @typedef {BaseRecord & {name:string;capacity:number;activeStudents:number;conversionRate:number;specializations:string[]}} CounselorProfile */
/** @typedef {BaseRecord & {name:string;institutionType:string;countries:string[];slaDays:number;successRate:number}} PartnerInstitution */
/** @typedef {BaseRecord & {studentId:string;applicationId:string;currency:string;totalAmount:number;installments:number;dueSchedule:string[]}} PaymentPlan */
/** @typedef {BaseRecord & {name:string;season:'spring'|'summer'|'fall'|'winter';year:number;applicationWindow:string;visaWindow:string;openUniversities:string[]}} IntakeCycle */
/** @typedef {BaseRecord & {studentId:string;counselorId:string;mode:'virtual'|'in-person';result:'pass'|'pending'|'retry';scheduledAt:string}} InterviewRecord */
/** @typedef {BaseRecord & {entityType:string;entityId:string;action:string;actor:string;notes:string}} ActivityLog */

export const workflowStates = {
  studentJourney: ['lead', 'profile created', 'counseling', 'shortlist', 'application', 'offer', 'visa', 'enrolled'],
  applicationFlow: ['draft', 'submitted', 'review', 'conditional offer', 'unconditional offer', 'accepted', 'enrolled'],
  scholarshipFlow: ['eligible', 'applied', 'review', 'awarded', 'rejected'],
  visaFlow: ['docs pending', 'submitted', 'under review', 'approved', 'rejected']
};

const now = new Date().toISOString();

const base = (id, status, stage, owner, priority, region, tags = []) => ({
  id,
  status,
  stage,
  owner,
  createdAt: now,
  updatedAt: now,
  tags,
  priority,
  region,
  attachments: []
});

/** @type {{
 * studentLeads: StudentLead[];
 * studentProfiles: StudentProfile[];
 * universityProfiles: UniversityProfile[];
 * courseProfiles: CourseProfile[];
 * applications: Application[];
 * scholarships: Scholarship[];
 * visaCases: VisaCase[];
 * documentRecords: DocumentRecord[];
 * counselorProfiles: CounselorProfile[];
 * partnerInstitutions: PartnerInstitution[];
 * paymentPlans: PaymentPlan[];
 * intakeCycles: IntakeCycle[];
 * interviewRecords: InterviewRecord[];
 * activityLogs: ActivityLog[];
 * }}
 */
export const mockDB = {
  studentLeads: [
    { ...base('lead-001', 'active', 'lead', 'ops@hni', 'high', 'APAC', ['new']), leadSource: 'Website', email: 'aisha@example.com', phone: '+91-9000000001', interestCountries: ['Canada', 'UK'], targetIntake: 'Fall 2026' },
    { ...base('lead-002', 'active', 'counseling', 'ops@hni', 'medium', 'MEA', ['partner']), leadSource: 'Partner', email: 'omar@example.com', phone: '+971-500000001', interestCountries: ['Australia'], targetIntake: 'Spring 2027' }
  ],
  studentProfiles: [
    { ...base('stu-001', 'active', 'shortlist', 'counselor.rina', 'high', 'APAC', ['stem']), studentLeadId: 'lead-001', fullName: 'Aisha Khan', profileCompleteness: 88, academicScore: 3.7, englishTest: 'IELTS 7.5', counselorId: 'cnsl-001' },
    { ...base('stu-002', 'active', 'application', 'counselor.rahul', 'medium', 'MEA', ['business']), studentLeadId: 'lead-002', fullName: 'Omar Nasser', profileCompleteness: 74, academicScore: 3.3, englishTest: 'TOEFL 99', counselorId: 'cnsl-002' }
  ],
  universityProfiles: [
    { ...base('uni-001', 'active', 'onboarded', 'partners.team', 'medium', 'Canada', ['top-200']), name: 'Toronto Metropolitan University', country: 'Canada', ranking: 137, intakeMonths: ['January', 'May', 'September'], admissionRequirements: ['Bachelor 3.0/4.0', 'IELTS 7.0', 'SOP + 2 LOR'], feesUSD: 32000, scholarships: ['International Merit Award', 'Women in AI Grant'], acceptanceRate: 43, visaSuccessRatio: 91, partnerTier: 'strategic' },
    { ...base('uni-002', 'active', 'onboarded', 'partners.team', 'low', 'UK', ['research']), name: 'University of Leeds', country: 'UK', ranking: 82, intakeMonths: ['September', 'January'], admissionRequirements: ['Bachelor 2:1 equivalent', 'IELTS 6.5', 'Academic references'], feesUSD: 41000, scholarships: ['Leeds Global Masters Scholarship'], acceptanceRate: 52, visaSuccessRatio: 89, partnerTier: 'growth' },
    { ...base('uni-003', 'active', 'onboarded', 'partners.team', 'medium', 'Australia', ['employability']), name: 'Deakin University', country: 'Australia', ranking: 197, intakeMonths: ['March', 'July', 'November'], admissionRequirements: ['Bachelor 60%', 'IELTS 6.5', 'CV'], feesUSD: 28500, scholarships: ['Vice Chancellor Scholarship', 'STEM Excellence Award'], acceptanceRate: 64, visaSuccessRatio: 87, partnerTier: 'network' }
  ],
  courseProfiles: [
    { ...base('course-001', 'active', 'open', 'catalog.team', 'medium', 'Canada', ['ai']), universityId: 'uni-001', name: 'MSc Data Science', degreeLevel: 'Masters', durationMonths: 24, tuitionUSD: 32000, prerequisites: ['STEM Bachelor', 'Python basics', 'IELTS 7.0'], careerOutcome: 'Data Scientist / ML Analyst', jobPlacementRate: 86, intakeMonths: ['September', 'January'] },
    { ...base('course-002', 'active', 'open', 'catalog.team', 'medium', 'UK', ['mba']), universityId: 'uni-002', name: 'MBA Global', degreeLevel: 'Masters', durationMonths: 18, tuitionUSD: 41000, prerequisites: ['Bachelor degree', '2+ years work experience', 'IELTS 6.5'], careerOutcome: 'Business Consultant / Product Manager', jobPlacementRate: 82, intakeMonths: ['September'] },
    { ...base('course-003', 'active', 'open', 'catalog.team', 'medium', 'Australia', ['cyber']), universityId: 'uni-003', name: 'Master of Cyber Security', degreeLevel: 'Masters', durationMonths: 24, tuitionUSD: 29800, prerequisites: ['CS/IT background', 'IELTS 6.5', 'Statement of purpose'], careerOutcome: 'Cybersecurity Engineer / SOC Analyst', jobPlacementRate: 84, intakeMonths: ['March', 'July', 'November'] }
  ],
  applications: [
    { ...base('app-001', 'active', 'submitted', 'counselor.rina', 'high', 'Canada', ['priority']), studentId: 'stu-001', universityId: 'uni-001', courseId: 'course-001', deadline: '2026-05-20', documentsPending: 2, offerType: 'conditional' },
    { ...base('app-002', 'active', 'review', 'counselor.rahul', 'medium', 'UK', ['regular']), studentId: 'stu-002', universityId: 'uni-002', courseId: 'course-002', deadline: '2026-06-15', documentsPending: 1, offerType: 'none' }
  ],
  scholarships: [
    { ...base('sch-001', 'active', 'applied', 'scholarship.desk', 'medium', 'Canada', ['merit']), applicationId: 'app-001', studentId: 'stu-001', provider: 'TMU Merit Fund', amountUSD: 8000, coverage: 'partial', decisionDate: '2026-06-05' }
  ],
  visaCases: [
    { ...base('visa-001', 'active', 'submitted', 'visa.ops', 'high', 'Canada', ['sds']), studentId: 'stu-001', applicationId: 'app-001', country: 'Canada', embassyDate: '2026-07-02', checklistProgress: 70 }
  ],
  documentRecords: [
    { ...base('doc-001', 'pending', 'collection', 'docs.team', 'high', 'APAC', ['financial']), studentId: 'stu-001', applicationId: 'app-001', documentType: 'Bank Statement', verified: false, dueDate: '2026-04-25' },
    { ...base('doc-002', 'verified', 'review', 'docs.team', 'medium', 'APAC', ['academic']), studentId: 'stu-001', applicationId: 'app-001', documentType: 'Transcript', verified: true, dueDate: '2026-04-18' }
  ],
  counselorProfiles: [
    { ...base('cnsl-001', 'active', 'available', 'edu.manager', 'high', 'APAC', ['pg']), name: 'Rina Das', capacity: 45, activeStudents: 38, conversionRate: 0.62, specializations: ['STEM', 'Canada'] },
    { ...base('cnsl-002', 'active', 'available', 'edu.manager', 'medium', 'MEA', ['ug']), name: 'Rahul Sen', capacity: 40, activeStudents: 33, conversionRate: 0.54, specializations: ['Business', 'UK'] }
  ],
  partnerInstitutions: [
    { ...base('partner-001', 'active', 'approved', 'partners.team', 'medium', 'Global', ['preferred']), name: 'NorthStar Education Group', institutionType: 'Aggregator', countries: ['Canada', 'UK', 'Australia'], slaDays: 4, successRate: 0.71 }
  ],
  paymentPlans: [
    { ...base('pay-001', 'active', 'scheduled', 'finance.ops', 'medium', 'APAC', ['emi']), studentId: 'stu-001', applicationId: 'app-001', currency: 'USD', totalAmount: 12000, installments: 4, dueSchedule: ['2026-05-10', '2026-06-10', '2026-07-10', '2026-08-10'] }
  ],
  intakeCycles: [
    { ...base('intake-2026-fall', 'active', 'open', 'owner.office', 'critical', 'Global', ['primary']), name: 'Fall Main Intake', season: 'fall', year: 2026, applicationWindow: '2026-03-01 to 2026-07-15', visaWindow: '2026-06-01 to 2026-09-01', openUniversities: ['uni-001', 'uni-002'] },
    { ...base('intake-2027-spring', 'active', 'planning', 'owner.office', 'high', 'Global', ['secondary']), name: 'Spring Strategic Intake', season: 'spring', year: 2027, applicationWindow: '2026-08-01 to 2026-11-30', visaWindow: '2026-11-01 to 2027-02-15', openUniversities: ['uni-001', 'uni-003'] }
  ],
  interviewRecords: [
    { ...base('iv-001', 'active', 'scheduled', 'counselor.rina', 'medium', 'APAC', ['mock']), studentId: 'stu-001', counselorId: 'cnsl-001', mode: 'virtual', result: 'pending', scheduledAt: '2026-04-22T10:00:00Z' }
  ],
  activityLogs: [
    { ...base('log-001', 'active', 'recorded', 'system', 'low', 'Global', ['audit']), entityType: 'application', entityId: 'app-001', action: 'Application submitted', actor: 'counselor.rina', notes: 'Submitted with SOP and transcripts.' }
  ]
};

const addLog = (action, entityType, entityId, actor, notes) => {
  mockDB.activityLogs.unshift({
    ...base(`log-${Date.now()}`, 'active', 'recorded', 'system', 'low', 'Global', ['audit']),
    entityType,
    entityId,
    action,
    actor,
    notes
  });
};

export const edunomicsAdapter = {
  getSnapshot() {
    return structuredClone(mockDB);
  },
  addStudent(leadPayload) {
    const lead = {
      ...base(`lead-${Date.now()}`, 'active', 'lead', leadPayload.owner || 'ops@hni', 'high', leadPayload.region || 'Global', ['new']),
      leadSource: leadPayload.leadSource || 'Manual',
      email: leadPayload.email,
      phone: leadPayload.phone,
      interestCountries: leadPayload.interestCountries || [],
      targetIntake: leadPayload.targetIntake || 'TBD'
    };
    mockDB.studentLeads.unshift(lead);
    addLog('Student lead added', 'studentLead', lead.id, lead.owner, `Lead created for ${lead.email}`);
    return lead;
  },
  assignCounselor(studentId, counselorId) {
    const student = mockDB.studentProfiles.find((s) => s.id === studentId);
    if (!student) return null;
    student.counselorId = counselorId;
    student.owner = counselorId;
    student.updatedAt = new Date().toISOString();
    addLog('Counselor assigned', 'studentProfile', student.id, counselorId, `Assigned counselor ${counselorId}`);
    return student;
  },
  startApplication(studentId, universityId, courseId) {
    const app = {
      ...base(`app-${Date.now()}`, 'active', 'draft', 'application.ops', 'high', 'Global', ['new']),
      studentId,
      universityId,
      courseId,
      deadline: new Date(Date.now() + 12096e5).toISOString().slice(0, 10),
      documentsPending: 5,
      offerType: 'none'
    };
    mockDB.applications.unshift(app);
    addLog('Application started', 'application', app.id, 'application.ops', `Draft created for ${studentId}`);
    return app;
  },
  submitDocuments(applicationId, docsSubmitted = 1) {
    const app = mockDB.applications.find((a) => a.id === applicationId);
    if (!app) return null;
    app.documentsPending = Math.max(0, app.documentsPending - docsSubmitted);
    app.updatedAt = new Date().toISOString();
    addLog('Documents submitted', 'application', applicationId, 'docs.team', `${docsSubmitted} docs submitted`);
    return app;
  },
  markScholarship(applicationId, status) {
    const scholarship = mockDB.scholarships.find((s) => s.applicationId === applicationId);
    if (!scholarship) return null;
    scholarship.stage = status;
    scholarship.updatedAt = new Date().toISOString();
    addLog('Scholarship updated', 'scholarship', scholarship.id, 'scholarship.desk', `Status ${status}`);
    return scholarship;
  },
  initiateVisa(studentId, applicationId, country) {
    const visa = {
      ...base(`visa-${Date.now()}`, 'active', 'docs pending', 'visa.ops', 'high', country, ['new']),
      studentId,
      applicationId,
      country,
      embassyDate: 'TBD',
      checklistProgress: 10
    };
    mockDB.visaCases.unshift(visa);
    addLog('Visa initiated', 'visaCase', visa.id, 'visa.ops', `Visa case opened for ${studentId}`);
    return visa;
  },
  escalateToOwner(entityType, entityId, reason) {
    addLog('Escalated to owner', entityType, entityId, 'system', reason);
    return { escalated: true, entityType, entityId, reason };
  }
};

export const computeKPIs = (snapshot) => {
  const enrolled = snapshot.studentProfiles.filter((s) => s.stage === 'enrolled').length;
  const activeApplications = snapshot.applications.length;
  const visaApprovalRate = snapshot.visaCases.length
    ? snapshot.visaCases.filter((v) => v.stage === 'approved').length / snapshot.visaCases.length
    : 0;
  const counselorLoad = snapshot.counselorProfiles.map((c) => ({
    counselor: c.name,
    load: Number((c.activeStudents / c.capacity).toFixed(2))
  }));

  return {
    enrolled,
    activeApplications,
    visaApprovalRate,
    counselorLoad,
    intakeHealth: snapshot.intakeCycles.map((i) => ({ name: i.name, status: i.status, stage: i.stage }))
  };
};
