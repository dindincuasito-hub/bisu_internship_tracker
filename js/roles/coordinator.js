const PARTNER_COMPANIES = [
  { name:'Tech Solutions Inc.', loc:'Calape, Bohol', contact:'ojt@techsolutions.ph', interns:12, status:'Active' },
  { name:'Innovatech Global', loc:'Tagbilaran City', contact:'contact@innovatech.ph', interns:9, status:'Active' },
  { name:'Island Digital Hub', loc:'Panglao, Bohol', contact:'info@islanddigital.ph', interns:7, status:'Pending' },
  { name:'Cebu Softworks', loc:'Cebu City', contact:'hr@cebusoftworks.ph', interns:5, status:'Active' },
];

const COORDINATOR_PROGRAM = 'BSIT';
const COORDINATOR_STUDENTS = [
  {
    id:'BSIT-2024-001', name:'Juan dela Cruz', program:'BSIT', company:'Tech Solutions Inc.', supervisor:'Thomas Shelby', internshipStatus:'Ongoing', requirementsStatus:'Pending', attendanceStatus:'Present', hours:312, required:500, lastActivity:'Assigned to Company', activityDate:'2026-07-20 09:15', remarks:'Pending clearance upload for final endorsement.', assignmentHistory:[{ company:'Tech Solutions Inc.', date:'2026-07-18' }]
  },
  {
    id:'BSIT-2024-002', name:'Ana Buenaventura', program:'BSIT', company:'Cebu Softworks', supervisor:'Ada Thorne', internshipStatus:'Ongoing', requirementsStatus:'Approved', attendanceStatus:'Late', hours:265, required:500, lastActivity:'Attendance Submitted', activityDate:'2026-07-21 07:55', remarks:'Needs progress update before midterm review.', assignmentHistory:[{ company:'Cebu Softworks', date:'2026-07-10' }]
  },
  {
    id:'BSIT-2024-003', name:'Carlo Reyes', program:'BSIT', company:'Island Digital Hub', supervisor:'John Shelby', internshipStatus:'Pending', requirementsStatus:'Needs Review', attendanceStatus:'Absent', hours:0, required:500, lastActivity:'Requirement Uploaded', activityDate:'2026-07-22 13:40', remarks:'Awaiting coordinator approval for internship start.', assignmentHistory:[{ company:'Island Digital Hub', date:'2026-07-12' }]
  },
  {
    id:'BSIT-2024-004', name:'Rhea Fernandez', program:'BSIT', company:'', supervisor:'', internshipStatus:'Pending', requirementsStatus:'Pending', attendanceStatus:'Absent', hours:0, required:500, lastActivity:'Assigned Supervisor', activityDate:'2026-07-23 10:10', remarks:'Student is awaiting company and supervisor assignment.', assignmentHistory:[]
  },
  {
    id:'BSIT-2024-005', name:'Paul Lim', program:'BSIT', company:'Tech Solutions Inc.', supervisor:'Thomas Shelby', internshipStatus:'Completed', requirementsStatus:'Approved', attendanceStatus:'Present', hours:500, required:500, lastActivity:'Internship Completed', activityDate:'2026-07-19 16:20', remarks:'Completed all requirements and evaluation is ready.', assignmentHistory:[{ company:'Tech Solutions Inc.', date:'2026-06-02' }]
  }
];

let COORDINATOR_ATTENDANCE_LOG = [];

const COORDINATOR_ACTIVITY_FEED = [
  { name:'Juan dela Cruz', activity:'Assigned to Company', date:'2026-07-20 09:15', status:'success' },
  { name:'Ana Buenaventura', activity:'Attendance Submitted', date:'2026-07-21 07:55', status:'warning' },
  { name:'Carlo Reyes', activity:'Requirement Uploaded', date:'2026-07-22 13:40', status:'info' },
  { name:'Paul Lim', activity:'Internship Completed', date:'2026-07-19 16:20', status:'success' },
  { name:'Rhea Fernandez', activity:'Assigned Supervisor', date:'2026-07-23 10:10', status:'warning' },
];

const COORDINATOR_INTERNSHIP_RECORDS = [
  { student:'Juan dela Cruz', document:'MOA', date:'2026-07-15', status:'Uploaded' },
  { student:'Ana Buenaventura', document:'Resume', date:'2026-07-16', status:'Uploaded' },
  { student:'Carlo Reyes', document:'Medical Clearance', date:'2026-07-22', status:'Pending' },
  { student:'Paul Lim', document:'Evaluation Form', date:'2026-07-19', status:'Approved' },
];

const COORDINATOR_REPORT_CHARTS = {
  internshipStatus: [
    { label:'Pending', count:1 },
    { label:'Approved', count:2 },
    { label:'Ongoing', count:2 },
    { label:'Completed', count:1 },
  ],
  progressSummary: [
    { student:'Juan dela Cruz', percent:62 },
    { student:'Ana Buenaventura', percent:53 },
    { student:'Carlo Reyes', percent:0 },
    { student:'Rhea Fernandez', percent:0 },
    { student:'Paul Lim', percent:100 },
  ],
};

function getCoordinatorProgramStudents() {
  return COORDINATOR_STUDENTS.filter(student => student.program === COORDINATOR_PROGRAM);
}

function getCoordinatorAttendanceFilterStudents() {
  const students = new Map();
  COORDINATOR_LIVE_STUDENT_RECORDS.forEach(record => {
    const studentId = record.id || record.student_id || record.name;
    const name = record.name || record.student_name || 'Unknown Student';
    if (name && name !== 'Unknown Student') {
      students.set(String(studentId), {
        id: studentId,
        studentId: record.student_id || '',
        name,
        program: record.program || '',
        company: record.company || record.assigned_company || '',
      });
    }
  });
  COORDINATOR_ATTENDANCE_LOG.forEach(record => {
    if (record.name && record.name !== 'Unknown Student') {
      students.set(String(record.student_id), {
        id: record.student_id,
        studentId: record.studentIdentifier,
        name: record.name,
        program: record.program,
        company: record.company,
      });
    }
  });
  return [...students.values()];
}

function getCoordinatorAttendanceFilterCompanies() {
  return [...new Set([
    ...COORDINATOR_LIVE_STUDENT_RECORDS.map(record => record.company || record.assigned_company || ''),
    ...COORDINATOR_ATTENDANCE_LOG.map(record => record.company)
  ].filter(Boolean))];
}

function formatCoordinatorAttendanceTime(value) {
  if (!value || value === '—') return '—';
  const parsed = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(parsed.getTime())
    ? String(value)
    : parsed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function getCoordinatorAttendanceDuration(timeIn, timeOut, durationMinutes) {
  if (durationMinutes !== null && durationMinutes !== undefined && durationMinutes !== '') {
    return `${Number(durationMinutes)} min`;
  }
  if (!timeIn || !timeOut) return '—';
  const start = new Date(String(timeIn).replace(' ', 'T'));
  const end = new Date(String(timeOut).replace(' ', 'T'));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return '—';
  return `${((end - start) / 3600000).toFixed(1)} hrs`;
}

async function loadCoordinatorAttendanceRecords() {
  try {
    const apiBase = typeof API_BASE !== 'undefined' ? API_BASE : '../php/api.php';
    const response = await fetch(`${apiBase}?resource=attendance`);
    const data = await response.json();
    if (!data.success || !Array.isArray(data.attendance)) throw new Error(data.message || 'Unable to load attendance records.');
    COORDINATOR_ATTENDANCE_LOG = data.attendance.map(item => ({
      id: item.id,
      student_id: item.student_id,
      studentIdentifier: item.student_identifier || '',
      name: item.student_name || item.name || 'Unknown Student',
      program: item.program || '',
      company: item.company_name || '',
      date: item.log_date || item.date || '',
      timeIn: formatCoordinatorAttendanceTime(item.time_in),
      timeOut: formatCoordinatorAttendanceTime(item.time_out),
      duration: getCoordinatorAttendanceDuration(item.time_in, item.time_out, item.duration_minutes),
      status: item.status || 'Present'
    }));
    return true;
  } catch (error) {
    console.error('Unable to load coordinator attendance records:', error);
    COORDINATOR_ATTENDANCE_LOG = [];
    return false;
  }
}

function getCoordinatorStudentStatus(student) {
  const pct = Math.round((student.hours / student.required) * 100);
  if (student.hours >= student.required || student.internshipStatus === 'Completed') return 'Completed';
  if (student.internshipStatus === 'Ongoing') return 'Ongoing';
  if (student.internshipStatus === 'Pending') return 'Pending';
  return pct >= 70 ? 'Approved' : 'Pending';
}

function getCoordinatorStatusClass(status) {
  return status === 'Completed' ? 'tag-green'
    : status === 'Ongoing' ? 'tag-teal'
    : status === 'Approved' ? 'tag-blue'
    : 'tag-amber';
}

function getCoordinatorAttendanceClass(status) {
  return status === 'Present' ? 'tag-green' : status === 'Late' ? 'tag-amber' : 'tag-red';
}

function getCoordinatorRequirementClass(status) {
  return status === 'Approved' ? 'tag-green' : status === 'Needs Review' ? 'tag-amber' : 'tag-red';
}

function getCoordinatorSummaryStats() {
  const studentsById = new Map();
  COORDINATOR_LIVE_STUDENT_RECORDS.forEach(student => {
    studentsById.set(String(student.id || student.student_id || student.name), student);
  });
  const students = [...studentsById.values()];
  return {
    students,
    totalAssignedStudents: Number(COORDINATOR_DASHBOARD.total_assigned_students) || students.length,
    assignedStudents: Number(COORDINATOR_DASHBOARD.students_with_company) || 0,
    ongoing: Number(COORDINATOR_DASHBOARD.ongoing_internships) || 0,
    completed: Number(COORDINATOR_DASHBOARD.completed_internships) || 0,
    pendingRequirements: Number(COORDINATOR_DASHBOARD.pending_requirements) || 0,
    attendanceToday: Number(COORDINATOR_DASHBOARD.attendance_today) || 0,
  };
}

function getCoordinatorDashboardActivities() {
  const labels = {
    Attendance: 'Attendance Submitted',
    'Submit Task': 'Task Submitted',
    'Face Registration': 'Face Registration Completed',
    'Face Registration Update': 'Face Registration Completed',
  };
  return Array.isArray(COORDINATOR_DASHBOARD.activities)
    ? COORDINATOR_DASHBOARD.activities.map(activity => ({
      ...activity,
      activity: labels[activity.activity] || activity.activity,
    }))
    : [];
}

function getCoordinatorDashboardStatusSummary() {
  const counts = new Map((COORDINATOR_DASHBOARD.status_summary || []).map(item => [item.status, Number(item.count) || 0]));
  return ['Pending', 'Ongoing', 'Completed'].map(status => ({
    label: status,
    count: counts.get(status) || 0,
  }));
}

function getCoordinatorReportFilters() {
  return {
    academicYear: document.getElementById('coord-report-academic-year')?.value || '2024–2025',
    program: document.getElementById('coord-report-program')?.value || 'All',
    company: document.getElementById('coord-report-company')?.value || 'All',
    student: document.getElementById('coord-report-student')?.value || 'All',
    status: document.getElementById('coord-report-status')?.value || 'All',
    fromDate: document.getElementById('coord-report-from')?.value || '',
    toDate: document.getElementById('coord-report-to')?.value || '',
  };
}

function getCoordinatorReportRows() {
  const filters = getCoordinatorReportFilters();
  const source = Array.isArray(COORDINATOR_LIVE_STUDENT_RECORDS) && COORDINATOR_LIVE_STUDENT_RECORDS.length
    ? COORDINATOR_LIVE_STUDENT_RECORDS
    : Array.isArray(COORDINATOR_COMPANY_ASSIGNMENTS?.students)
    ? COORDINATOR_COMPANY_ASSIGNMENTS.students
    : [];
  return source.map(item => ({
    id: item.id,
    name: item.name || item.student_name || 'Unknown Student',
    student_id: item.student_id || item.student_no || '',
    program: item.program || '',
    company: item.company_name || item.company || '',
    supervisor: item.supervisor_name || item.supervisor || item.assigned_supervisor || '',
    coordinator: item.coordinator_name || '',
    internshipStatus: item.internship_status || item.assignment_status || 'Pending',
    hours: Number(item.hours_completed) || 0,
    required: Number(item.hours_required) || 500,
    academicYear: item.year_label || item.academic_year || '',
    assignmentDate: item.assigned_at || item.updated_at || item.assignment_date || '',
  })).filter(item => {
    const matchesProgram = filters.program === 'All' || item.program === filters.program;
    const matchesCompany = filters.company === 'All' || item.company === filters.company;
    const matchesStudent = filters.student === 'All' || item.name === filters.student;
    const matchesStatus = filters.status === 'All' || item.internshipStatus === filters.status;
    const matchesYear = filters.academicYear === 'All' || !item.academicYear || item.academicYear === filters.academicYear;
    const reportDate = item.assignmentDate ? String(item.assignmentDate).slice(0, 10) : '';
    const matchesFromDate = !filters.fromDate || (reportDate && reportDate >= filters.fromDate);
    const matchesToDate = !filters.toDate || (reportDate && reportDate <= filters.toDate);
    return matchesYear && matchesProgram && matchesCompany && matchesStudent && matchesStatus && matchesFromDate && matchesToDate;
  });
}

let COORDINATOR_LIVE_STUDENT_RECORDS = [];
let COORDINATOR_COMPANY_ASSIGNMENTS = { companies: [], students: [] };
let COORDINATOR_DASHBOARD = {
  total_assigned_students: 0,
  students_with_company: 0,
  ongoing_internships: 0,
  completed_internships: 0,
  pending_requirements: 0,
  attendance_today: 0,
  activities: [],
  status_summary: [],
};
let COORDINATOR_RECORDS_FILTERS = { search: '', program: 'All', section: 'All', company: 'All', supervisor: 'All', status: 'All', sort: 'name' };
let COORDINATOR_RECORDS_PAGE = 1;
const COORDINATOR_RECORDS_PER_PAGE = 8;

function getCoordinatorStatusBadgeClass(status) {
  return status === 'Completed' ? 'bg-success' : status === 'Active' ? 'bg-info text-dark' : status === 'Pending' ? 'bg-warning text-dark' : 'bg-secondary';
}

function getCoordinatorInternshipDisplayStatus(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'completed') return 'Completed';
  if (normalized === 'active' || normalized === 'assigned' || normalized === 'ongoing' || normalized === 'approved') return 'Active';
  return 'Pending';
}

function getCoordinatorFaceRegistrationDisplayStatus(status) {
  return String(status || '').toLowerCase() === 'registered' ? 'Registered' : 'Not Registered';
}

function getCoordinatorAttendanceDisplayStatus(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized.includes('late')) return 'Late';
  if (normalized.includes('absent')) return 'Absent';
  return 'Present';
}

function getCoordinatorStudentRecordById(studentId) {
  return COORDINATOR_LIVE_STUDENT_RECORDS.find(item => String(item.student_id || item.id) === String(studentId))
    || getCoordinatorProgramStudents().find(item => String(item.id) === String(studentId));
}

async function refreshCoordinatorStudentRecords() {
  try {
    // Use api.php for normalized student records data
    const apiBase = typeof API_BASE !== 'undefined' ? API_BASE : '../php/api.php';
    const response = await fetch(`${apiBase}?resource=student_records`);
    const data = await response.json();
    if (data.success && Array.isArray(data.students)) {
      COORDINATOR_DASHBOARD = data.dashboard || COORDINATOR_DASHBOARD;
      // Normalize fields from api.php response to match coordinator display format
      COORDINATOR_LIVE_STUDENT_RECORDS = data.students.map(s => ({
        id: s.id,
        student_id: s.student_no || s.student_id || '',
        student_name: s.name || '',
        program: s.program || '',
        section: s.section || '',
        contact: s.contact || '',
        assigned_company: s.company_name || '',
        assigned_supervisor: s.supervisor_name || '',
        assigned_coordinator: s.coordinator_name || '',
        internship_status: s.internship_status || 'Pending',
        hours_completed: s.hours_completed || 0,
        hours_required: s.hours_required || 500,
        evaluation_score: s.evaluation_score || 0,
        face_registration_status: s.face_registration_status || 'Not Registered',
        attendance_summary: s.internship_status || 'Pending',
        remarks: s.remarks || '',
        assignment_id: s.assignment_id || null,
        company_id: null,
        supervisor_id: null,
        // Legacy fields for backward compat
        name: s.name || '',
        company: s.company_name || '',
        supervisor: s.supervisor_name || '',
      }));
      return { success: true };
    }
    // Fallback to old student_records.php
    const oldResponse = await fetch(new URL('student_records.php', apiBase));
    const oldData = await oldResponse.json();
    if (oldData.success) {
      COORDINATOR_LIVE_STUDENT_RECORDS = oldData.records || [];
    }
    return oldData;
  } catch (error) {
    console.warn('Unable to load student records', error);
    return { success: false };
  }
}

function getFilteredCoordinatorStudentRecords() {
  const searchTerm = (COORDINATOR_RECORDS_FILTERS.search || '').toLowerCase();
  return COORDINATOR_LIVE_STUDENT_RECORDS.filter(student => {
    const matchesSearch = !searchTerm || [student.student_id, student.student_name, student.program, student.assigned_company, student.assigned_supervisor, student.internship_status].some(value => String(value || '').toLowerCase().includes(searchTerm));
    const matchesProgram = COORDINATOR_RECORDS_FILTERS.program === 'All' || student.program === COORDINATOR_RECORDS_FILTERS.program;
    const matchesSection = COORDINATOR_RECORDS_FILTERS.section === 'All' || student.section === COORDINATOR_RECORDS_FILTERS.section;
    const matchesCompany = COORDINATOR_RECORDS_FILTERS.company === 'All' || student.assigned_company === COORDINATOR_RECORDS_FILTERS.company;
    const matchesSupervisor = COORDINATOR_RECORDS_FILTERS.supervisor === 'All' || student.assigned_supervisor === COORDINATOR_RECORDS_FILTERS.supervisor;
    const matchesStatus = COORDINATOR_RECORDS_FILTERS.status === 'All' || student.internship_status === COORDINATOR_RECORDS_FILTERS.status;
    return matchesSearch && matchesProgram && matchesSection && matchesCompany && matchesSupervisor && matchesStatus;
  }).sort((a, b) => {
    if (COORDINATOR_RECORDS_FILTERS.sort === 'name') {
      return a.student_name.localeCompare(b.student_name);
    }
    return a.student_name.localeCompare(b.student_name);
  });
}

function getCoordinatorStudentPageData(page = 1) {
  const students = getFilteredCoordinatorStudentRecords();
  const totalPages = Math.max(1, Math.ceil(students.length / COORDINATOR_RECORDS_PER_PAGE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * COORDINATOR_RECORDS_PER_PAGE;
  return { students, totalPages, safePage, start, rows: students.slice(start, start + COORDINATOR_RECORDS_PER_PAGE) };
}

function getCoordinatorStudentRowsMarkup(pageData) {
  return pageData.rows.length ? pageData.rows.map((student, rowIndex) => `
    <tr>
      <td>${pageData.start + rowIndex + 1}</td>
      <td>${escapeHtml(student.student_id || '—')}</td>
      <td><div class="user-cell"><div class="avatar av-teal">${escapeHtml((student.student_name || '').split(' ').map(word => word[0]).join('').slice(0, 2))}</div><div><div class="user-cell-name">${escapeHtml(student.student_name || 'Unknown')}</div><div class="user-cell-sub">${escapeHtml(student.student_id || '')}</div></div></div></td>
      <td>${escapeHtml(student.program || '—')}</td>
      <td>${escapeHtml(student.section || '—')}</td>
      <td>${escapeHtml(student.assigned_company || 'Unassigned')}</td>
      <td>${escapeHtml(student.assigned_supervisor || 'Not Assigned')}</td>
      <td><span class="coordinator-chip coordinator-chip--${getCoordinatorInternshipDisplayStatus(student.internship_status).toLowerCase()}">${escapeHtml(getCoordinatorInternshipDisplayStatus(student.internship_status))}</span></td>
      <td><span class="coordinator-chip coordinator-chip--${getCoordinatorFaceRegistrationDisplayStatus(student.face_registration_status).toLowerCase() === 'registered' ? 'success' : 'default'}">${escapeHtml(getCoordinatorFaceRegistrationDisplayStatus(student.face_registration_status))}</span></td>
      <td><span class="coordinator-chip coordinator-chip--${getCoordinatorAttendanceDisplayStatus(student.attendance_summary).toLowerCase()}">${escapeHtml(getCoordinatorAttendanceDisplayStatus(student.attendance_summary))}</span></td>
      <td><div class="coordinator-action-group" style="width:100%;justify-content:center;"><button class="coordinator-action-btn coordinator-action-view" type="button" title="View Student" aria-label="View Student" onclick="viewCoordinatorStudentDetails('${student.student_id || student.id}')"><i class="bi bi-eye-fill coordinator-action-icon"></i></button></div></td>
    </tr>
  `).join('') : '<tr><td colspan="11" class="text-muted">No students match the current filter.</td></tr>';
}

function getCoordinatorStudentPaginationMarkup(containerId, pageData) {
  const startEntry = pageData.students.length ? pageData.start + 1 : 0;
  const endEntry = Math.min(pageData.start + COORDINATOR_RECORDS_PER_PAGE, pageData.students.length);
  const pageButtons = Array.from({ length: pageData.totalPages }, (_, index) => `<button class="btn btn-outline btn-sm ${pageData.safePage === index + 1 ? 'active' : ''}" onclick="changeCoordinatorStudentPage(${index + 1}, '${containerId}')">${index + 1}</button>`).join('');
  return `<div class="text-muted small">Showing ${startEntry} to ${endEntry} of ${pageData.students.length} entries</div><div class="coordinator-page-buttons">${pageButtons}</div><button class="btn btn-outline btn-sm" ${pageData.safePage === pageData.totalPages ? 'disabled' : ''} onclick="changeCoordinatorStudentPage(${pageData.safePage + 1}, '${containerId}')">Next</button>`;
}

function getCoordinatorStudentOverviewMarkup(containerId, filter = '', page = 1) {
  const pageData = getCoordinatorStudentPageData(page);
  const handledProgram = currentUser?.program || pageData.students[0]?.program || COORDINATOR_PROGRAM;
  const coordinatorName = currentUser?.name || 'Coordinator';
  return `
    <div class="coordinator-records-shell">
      <div style="padding:10px 14px;border:1px solid var(--border);border-radius:8px;background:var(--blue-bg);color:var(--blue);font-size:12px;">
        <i class="bi bi-info-circle-fill" style="margin-right:8px"></i>You are viewing students under your handled program.
      </div>
      <div class="card">
        <div class="card-body" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:12px;">
            <div class="avatar av-blue" style="width:42px;height:42px;border-radius:8px;"><i class="bi bi-code-square" style="font-size:20px"></i></div>
            <div><div class="user-cell-sub">Handled Program:</div><div class="user-cell-name">${escapeHtml(handledProgram)}</div><div class="user-cell-sub">Coordinator: ${escapeHtml(coordinatorName)}</div></div>
          </div>
          <div class="coordinator-records-toolbar__field" style="min-width:220px;max-width:280px;flex:1;">
            <i class="bi bi-search"></i>
            <input class="form-input" type="search" value="${escapeHtml(filter)}" placeholder="Search students..." oninput="filterCoordinatorStudentTable(this.value, '${containerId}');" data-coordinator-search="${containerId}">
          </div>
        </div>
      </div>
      <div class="coordinator-records-meta" style="margin-bottom:0;">
        <div class="user-cell-name" style="color:var(--blue);">${escapeHtml(handledProgram)} Students Only</div>
        <button class="btn btn-outline btn-sm" type="button" onclick="refreshCoordinatorStudentRecords().then(() => renderCoordinatorStudentTable('${containerId}', document.querySelector('#${containerId} [data-coordinator-search]')?.value || '', 1))">Refresh</button>
      </div>
    <div class="coordinator-records-table-wrap">
      <table class="coordinator-records-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Student ID</th>
            <th>Student Name</th>
            <th>Program</th>
            <th>Section</th>
            <th>Company</th>
            <th>Supervisor</th>
            <th>Internship Status</th>
            <th>Face Registration</th>
            <th>Attendance</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody data-coordinator-results="${containerId}">${getCoordinatorStudentRowsMarkup(pageData)}</tbody>
      </table>
    </div>
    <div class="coordinator-pagination" data-coordinator-pagination="${containerId}">
      ${getCoordinatorStudentPaginationMarkup(containerId, pageData)}
    </div>
    </div>
  `;
}

function renderCoordinatorStudentTable(containerId, filter = '', page = 1) {
  const target = document.getElementById(containerId);
  if (target) {
    COORDINATOR_RECORDS_PAGE = page;
    if (typeof filter === 'string') {
      COORDINATOR_RECORDS_FILTERS.search = filter;
    }
    target.innerHTML = getCoordinatorStudentOverviewMarkup(containerId, filter, page);
  }
}

function filterCoordinatorStudentTable(value, containerId) {
  COORDINATOR_RECORDS_FILTERS.search = value;
  COORDINATOR_RECORDS_PAGE = 1;
  const container = document.getElementById(containerId);
  if (!container) return;
  const pageData = getCoordinatorStudentPageData(1);
  const results = container.querySelector(`[data-coordinator-results="${containerId}"]`);
  const pagination = container.querySelector(`[data-coordinator-pagination="${containerId}"]`);
  if (results) results.innerHTML = getCoordinatorStudentRowsMarkup(pageData);
  if (pagination) pagination.innerHTML = getCoordinatorStudentPaginationMarkup(containerId, pageData);
}

function setCoordinatorRecordSearch(value) {
  COORDINATOR_RECORDS_FILTERS.search = value;
}

function setCoordinatorRecordFilter(key, value) {
  COORDINATOR_RECORDS_FILTERS[key] = value;
}

function applyCoordinatorRecordFilters(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const searchInput = container.querySelector('[data-coordinator-search]');
  const programSelect = container.querySelector('[data-coordinator-program-filter]');
  const sectionSelect = container.querySelector('[data-coordinator-section-filter]');
  const statusSelect = container.querySelector('[data-coordinator-status-filter]');
  if (searchInput) COORDINATOR_RECORDS_FILTERS.search = searchInput.value;
  if (programSelect) COORDINATOR_RECORDS_FILTERS.program = programSelect.value;
  if (sectionSelect) COORDINATOR_RECORDS_FILTERS.section = sectionSelect.value;
  if (statusSelect) COORDINATOR_RECORDS_FILTERS.status = statusSelect.value;
  renderCoordinatorStudentTable(containerId, COORDINATOR_RECORDS_FILTERS.search, 1);
}

function resetCoordinatorRecordFilters(containerId) {
  COORDINATOR_RECORDS_FILTERS.search = '';
  COORDINATOR_RECORDS_FILTERS.program = 'All';
  COORDINATOR_RECORDS_FILTERS.section = 'All';
  COORDINATOR_RECORDS_FILTERS.status = 'All';
  const container = document.getElementById(containerId);
  if (container) {
    const searchInput = container.querySelector('[data-coordinator-search]');
    const programSelect = container.querySelector('[data-coordinator-program-filter]');
    const sectionSelect = container.querySelector('[data-coordinator-section-filter]');
    const statusSelect = container.querySelector('[data-coordinator-status-filter]');
    if (searchInput) searchInput.value = '';
    if (programSelect) programSelect.value = 'All';
    if (sectionSelect) sectionSelect.value = 'All';
    if (statusSelect) statusSelect.value = 'All';
  }
  renderCoordinatorStudentTable(containerId, '', 1);
}

function changeCoordinatorStudentPage(page, containerId) {
  COORDINATOR_RECORDS_PAGE = page;
  const input = document.querySelector(`#${containerId} [data-coordinator-search]`);
  const filter = input ? input.value : '';
  renderCoordinatorStudentTable(containerId, filter, page);
}

function viewCoordinatorStudentDetails(studentId) {
  const student = getCoordinatorStudentRecordById(studentId);
  if (!student) return;
  const body = `
    <div class="row g-3">
      <div class="col-12">
        <div class="card border-0 bg-light">
          <div class="card-body">
            <h6 class="mb-2">${escapeHtml(student.student_name || 'Student')}</h6>
            <div class="text-muted small">Student ID: ${escapeHtml(student.student_id || '—')}</div>
            <div class="text-muted small">Program: ${escapeHtml(student.program || '—')} • Section: ${escapeHtml(student.section || '—')}</div>
          </div>
        </div>
      </div>
      <div class="col-md-6">
        <div class="small text-muted">Assigned Company</div>
        <div class="fw-semibold">${escapeHtml(student.assigned_company || 'Unassigned')}</div>
      </div>
      <div class="col-md-6">
        <div class="small text-muted">Assigned Supervisor</div>
        <div class="fw-semibold">${escapeHtml(student.assigned_supervisor || 'Not Assigned')}</div>
      </div>
      <div class="col-md-6">
        <div class="small text-muted">Internship Status</div>
        <div class="fw-semibold">${escapeHtml(student.internship_status || 'Pending')}</div>
      </div>
      <div class="col-md-6">
        <div class="small text-muted">Face Registration</div>
        <div class="fw-semibold">${escapeHtml(student.face_registration_status || 'Not Registered')}</div>
      </div>
    </div>
  `;
  openGenModal(`Student Details`, body, () => true, 'Close');
}

function openCoordinatorStudentModal(studentId) {
  const student = getCoordinatorStudentRecordById(studentId);
  if (!student) return;
  const body = `
    <div class="form-row"><label class="form-label">Student Name</label><div class="form-text">${escapeHtml(student.name)}</div></div>
    <div class="form-row"><label class="form-label">Assigned Company</label><div class="form-text">${escapeHtml(student.company || 'Not assigned yet')}</div></div>
    <div class="form-row"><label class="form-label">Assigned Supervisor</label><div class="form-text">${escapeHtml(student.supervisor || 'Pending')}</div></div>
    <div class="form-row"><label class="form-label">Internship Status</label><div class="form-text">${escapeHtml(student.internshipStatus)}</div></div>
    <div class="form-row"><label class="form-label">Coordinator Remarks</label><textarea class="form-input" id="coord-student-remarks" rows="4">${escapeHtml(student.remarks || '')}</textarea></div>
    <div class="form-row"><label class="form-label">Progress Update</label><select class="form-select" id="coord-student-status">
      <option value="Pending" ${student.internshipStatus === 'Pending' ? 'selected' : ''}>Pending</option>
      <option value="Approved" ${student.internshipStatus === 'Approved' ? 'selected' : ''}>Approved</option>
      <option value="Ongoing" ${student.internshipStatus === 'Ongoing' ? 'selected' : ''}>Ongoing</option>
      <option value="Completed" ${student.internshipStatus === 'Completed' ? 'selected' : ''}>Completed</option>
    </select></div>
  `;
  openGenModal(`Update ${escapeHtml(student.name)}`, body, () => updateCoordinatorStudentRecord(student.id), 'Save Changes');
}

function updateCoordinatorStudentRecord(studentId) {
  const student = getCoordinatorStudentRecordById(studentId);
  if (!student) return false;
  if (!confirm('Update this student record and notify the student?')) return false;
  const remarks = document.getElementById('coord-student-remarks').value.trim();
  const status = document.getElementById('coord-student-status').value;
  student.remarks = remarks || 'No further remarks.';
  student.internship_status = status;
  student.internshipStatus = status;
  // Persist to DB
  if (student.assignment_id) {
    const apiBase = typeof API_BASE !== 'undefined' ? API_BASE : '../php/api.php';
    const params = new URLSearchParams({
      _method: 'PUT',
      assignment_id: student.assignment_id,
      internship_status: status,
      remarks: remarks || ''
    });
    fetch(`${apiBase}?resource=student_records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    }).catch(err => console.warn('updateCoordinatorStudentRecord failed:', err));
  }
  addNotification(`Updated internship record for ${student.name || student.student_name}`, 'success');
  navigateTo('student-records');
  return true;
}

async function openCoordinatorCompanyModal(studentId) {
  const apiBase = typeof API_BASE !== 'undefined' ? API_BASE : '../php/api.php';
  try {
    const response = await fetch(`${apiBase}?resource=company_assignment`);
    const data = await response.json();
    if (data.success && Array.isArray(data.students)) {
      COORDINATOR_LIVE_STUDENT_RECORDS = data.students.map(s => ({
        id: s.id, student_id: s.student_id || '', student_name: s.name || '', name: s.name || '',
        program: s.program || '', program_id: s.program_id || null,
        company: s.company_name || '', assigned_company: s.company_name || '',
        assignment_id: s.assignment_id || null, internship_status: s.internship_status || 'Pending',
        internshipStatus: s.internship_status || 'Pending', remarks: s.remarks || ''
      }));
    }
  } catch (error) {
    console.warn('Unable to load students for company assignment', error);
  }
  const students = COORDINATOR_LIVE_STUDENT_RECORDS.length ? COORDINATOR_LIVE_STUDENT_RECORDS : getCoordinatorProgramStudents();
  if (!students.length) { alert('No students are available.'); return; }
  const selectedStudent = students.find(student => String(student.id) === String(studentId) || String(student.student_id) === String(studentId)) || students[0];
  const selectedId = selectedStudent.id;
  const options = students.map(student => `<option value="${escapeHtml(student.id)}" ${String(student.id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(student.name || student.student_name)}${student.student_id ? ` (${escapeHtml(student.student_id)})` : ''}</option>`).join('');
  const assignedCompany = selectedStudent.company || selectedStudent.assigned_company || 'No company assigned';
  const body = `
    <div class="form-row"><label class="form-label">Student</label><select class="form-select" id="coord-student-select" onchange="updateCoordinatorAssignedCompany(this.value)">${options}</select></div>
    <div class="form-row"><label class="form-label">Assign Company</label><input class="form-input" id="coord-company-select" type="text" value="${escapeHtml(assignedCompany)}" readonly disabled></div>
    <div class="form-row"><label class="form-label">Assignment Note</label><input class="form-input" id="coord-company-note" type="text" value="Coordinator approved placement"></div>
  `;
  openGenModal('Assign Company', body, () => saveCoordinatorCompany(), 'Save Assignment');
}

function updateCoordinatorAssignedCompany(studentId) {
  const student = COORDINATOR_LIVE_STUDENT_RECORDS.find(item => String(item.id) === String(studentId));
  const companyInput = document.getElementById('coord-company-select');
  if (companyInput) companyInput.value = student?.company || student?.assigned_company || 'No company assigned';
}

function saveCoordinatorCompany() {
  const studentId = document.getElementById('coord-student-select')?.value;
  const student = getCoordinatorStudentRecordById(studentId);
  if (!student) return false;
  const companyName = document.getElementById('coord-company-select').value;
  const note = document.getElementById('coord-company-note').value.trim();
  if (!companyName || companyName === 'No company assigned') {
    alert('This student has no company assigned by Admin.');
    return false;
  }
  if (!confirm(`Save the assignment note for ${student.name || student.student_name}?`)) return false;
  const apiBase = typeof API_BASE !== 'undefined' ? API_BASE : '../php/api.php';
  if (student.id) {
    const params = new URLSearchParams({ student_id: student.id, remarks: note });
    fetch(`${apiBase}?resource=assignments`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() })
      .then(r => r.json()).then(d => { if (!d.success) console.warn('saveCoordinatorCompany DB failed:', d.message); }).catch(err => console.warn(err));
  }
  addNotification(`Assignment note saved for ${student.name || student.student_name}`, 'success');
  navigateTo('company-assignment');
  return true;
}

async function loadCoordinatorCompanyAssignments() {
  try {
    const apiBase = typeof API_BASE !== 'undefined' ? API_BASE : '../php/api.php';
    const response = await fetch(`${apiBase}?resource=company_assignment`);
    const data = await response.json();
    if (!data.success) throw new Error(data.message || 'Unable to load company assignments.');
    COORDINATOR_COMPANY_ASSIGNMENTS = {
      companies: Array.isArray(data.companies) ? data.companies : [],
      students: Array.isArray(data.students) ? data.students : []
    };
    return true;
  } catch (error) {
    console.warn('Unable to load company assignments', error);
    return false;
  }
}

function openCompanyAssignStudentModal(companyId) {
  const company = COORDINATOR_COMPANY_ASSIGNMENTS.companies.find(item => Number(item.id) === Number(companyId));
  if (!company) return;
  const students = COORDINATOR_COMPANY_ASSIGNMENTS.students.filter(student => !student.company_id);
  const options = students.map(student => `<option value="${Number(student.id)}">${escapeHtml(student.name)}${student.student_id ? ` (${escapeHtml(student.student_id)})` : ''}</option>`).join('');
  const body = `
    <div class="form-row"><label class="form-label">Company</label><input class="form-input" id="coord-assign-company" type="text" value="${escapeHtml(company.name)}" readonly disabled></div>
    <div class="form-row"><label class="form-label">Supervisor</label><input class="form-input" id="coord-assign-supervisor" type="text" value="${escapeHtml(company.supervisor_name || 'No supervisor assigned')}" readonly disabled></div>
    <div class="form-row"><label class="form-label">Student</label><select class="form-select" id="coord-assign-student" ${students.length ? '' : 'disabled'}>${students.length ? options : '<option value="">No students available</option>'}</select></div>
    <div class="form-row"><label class="form-label">Assignment Note</label><input class="form-input" id="coord-assign-note" type="text" placeholder="Enter assignment note"></div>
  `;
  openGenModal('Assign Student', body, () => saveCompanyStudentAssignment(company.id), 'Save Assignment');
}

async function saveCompanyStudentAssignment(companyId) {
  const studentId = document.getElementById('coord-assign-student')?.value;
  const note = document.getElementById('coord-assign-note')?.value.trim() || '';
  if (!studentId) {
    alert('Please select a student.');
    return false;
  }
  try {
    const apiBase = typeof API_BASE !== 'undefined' ? API_BASE : '../php/api.php';
    const response = await fetch(`${apiBase}?resource=company_assignment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ student_id: studentId, company_id: companyId, remarks: note }).toString()
    });
    const data = await response.json();
    if (!data.success) {
      alert(data.message || 'Unable to assign student.');
      return false;
    }
    await loadCoordinatorCompanyAssignments();
    addNotification('Student assigned to company.', 'success');
    navigateTo('company-assignment');
    return true;
  } catch (error) {
    console.warn('Unable to save company assignment', error);
    alert('Unable to connect to the server.');
    return false;
  }
}

function getPrintableInternshipReportMarkup(summary, options = {}) {
  const coordinatorName = options.coordinatorName || currentUser?.name || 'Coordinator';
  const programName = options.programName || currentUser?.program_name || currentUser?.program || COORDINATOR_LIVE_STUDENT_RECORDS[0]?.program || 'N/A';
  const preparedName = options.preparedName || coordinatorName;
  const preparedRole = options.preparedRole || 'OJT Coordinator';
  const dateGenerated = new Date().toLocaleDateString();
  const rows = summary.length
    ? summary.map(item => `<tr>
        <td>${escapeHtml(item.name)}<br><small>${escapeHtml(item.student_id || 'No student ID')}</small></td>
        <td>${escapeHtml(item.program || '—')}</td>
        <td>${escapeHtml(item.company || 'Unassigned')}</td>
        <td>${escapeHtml(item.supervisor || '—')}</td>
        <td>${escapeHtml(item.internshipStatus)}</td>
        <td>${item.hours} / ${item.required}</td>
      </tr>`).join('')
    : '<tr><td colspan="6">No records match the selected filters.</td></tr>';
  return `<div id="generatedInternshipReport" class="coordinator-print-report">
    <div class="coordinator-print-header">
      <img class="coordinator-print-logo" src="../images/logo.png" alt="BISU Logo">
      <div class="coordinator-print-institution">
        <div class="coordinator-print-school">BOHOL ISLAND STATE UNIVERSITY</div>
        <div>Calape Campus</div>
        <div>COLLEGE OF TECHNOLOGY</div>
      </div>
    </div>
    <div class="coordinator-print-divider"></div>
    <h1>STUDENT INTERNSHIP REPORT</h1>
    <div class="coordinator-print-meta">
      <div><strong>Coordinator:</strong> ${escapeHtml(coordinatorName)}</div>
      <div><strong>Program:</strong> ${escapeHtml(programName)}</div>
      <div><strong>Date Generated:</strong> ${escapeHtml(dateGenerated)}</div>
    </div>
    <table class="coordinator-print-table"><thead><tr><th>Student</th><th>Program</th><th>Company</th><th>Supervisor</th><th>Internship Status</th><th>Hours</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="coordinator-print-signature">
      <div><strong>Prepared by:</strong></div>
      <div class="coordinator-print-signature-line">____________________________</div>
      <div>${escapeHtml(preparedName)}</div>
      <div>${escapeHtml(preparedRole)}</div>
    </div>
  </div>`;
}

function mountGeneratedInternshipReport(summary, options = {}) {
  document.getElementById('generatedInternshipReport')?.remove();
  const report = document.createElement('div');
  report.innerHTML = getPrintableInternshipReportMarkup(summary, options);
  const printableReport = report.firstElementChild;
  if (printableReport) document.body.appendChild(printableReport);
  return printableReport;
}

function exportGeneratedInternshipReport(summary, options = {}) {
  const headers = ['Student', 'Program', 'Company', 'Supervisor', 'Internship Status', 'Hours'];
  const coordinatorName = options.coordinatorName || currentUser?.name || 'Coordinator';
  const programName = options.programName || currentUser?.program_name || currentUser?.program || 'N/A';
  const preparedName = options.preparedName || coordinatorName;
  const preparedRole = options.preparedRole || 'OJT Coordinator';
  const tableRows = summary.length
    ? summary.map(student => `<tr>${[
      student.name,
      student.program,
      student.company || 'Unassigned',
      student.supervisor || 'Pending',
      student.internshipStatus,
      `${student.hours} / ${student.required}`
    ].map(value => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${headers.length}">No records match the selected filters.</td></tr>`;
  const workbook = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    @page{size:A4 portrait;margin:12mm}body{font-family:Arial,sans-serif;color:#111;margin:0;padding:0}.report{width:100%;max-width:210mm;box-sizing:border-box;text-align:center}.header{display:flex;align-items:center;justify-content:center;gap:10px;line-height:1.25}.logo{width:44px;height:44px;object-fit:contain}.institution{text-align:center;line-height:1.25}.school{font-size:17px;font-weight:700}.divider{border-top:1px solid #555;margin:6px 0 9px}h1{font-size:20px;margin:0 0 9px;line-height:1.2}.meta{width:100%;margin:0 0 9px;text-align:left;font-size:11px;line-height:1.4}table{width:100%;border-collapse:collapse;margin:0 0 12px;font-size:10px;table-layout:fixed}th,td{border:1px solid #777;padding:4px 3px;text-align:center;vertical-align:middle;line-height:1.25;overflow-wrap:anywhere}th{background:#eaf0f7;font-weight:700}thead{display:table-header-group}tr{page-break-inside:avoid}.signature{margin-top:0;text-align:left;margin-left:6%;font-size:11px;line-height:1.3}.signature-line{margin-top:12px}
  </style></head><body>${getPrintableInternshipReportMarkup(summary, { coordinatorName, programName, preparedName, preparedRole }).replace('coordinator-print-report', 'report').replaceAll('coordinator-print-header', 'header').replaceAll('coordinator-print-logo', 'logo').replaceAll('coordinator-print-institution', 'institution').replaceAll('coordinator-print-school', 'school').replaceAll('coordinator-print-divider', 'divider').replaceAll('coordinator-print-meta', 'meta').replaceAll('coordinator-print-table', '').replaceAll('coordinator-print-signature', 'signature').replaceAll('coordinator-print-signature-line', 'signature-line')}</body></html>`;
  const blob = new Blob([workbook], { type: 'application/vnd.ms-excel' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = options.filename || 'internship_report.xls';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function generateCoordinatorReport() {
  const filters = getCoordinatorReportFilters();
  const reportBody = document.getElementById('coord-report-output');
  const summary = getCoordinatorReportRows();
  if (reportBody) {
    const statusSummary = ['Pending', 'Approved', 'Ongoing', 'Completed'].map(status => ({
      status,
      count: summary.filter(item => item.internshipStatus === status).length,
    }));
    reportBody.innerHTML = `
      <div class="coordinator-report-card">
        <div class="coordinator-report-title">Generated Internship Report</div>
        <div class="coordinator-report-meta">Academic Year: ${escapeHtml(filters.academicYear)} • Program: ${escapeHtml(filters.program)} • Date Range: ${escapeHtml(filters.fromDate || 'N/A')} to ${escapeHtml(filters.toDate || 'N/A')}</div>
        <div class="coordinator-report-summary">${summary.length} matching student${summary.length === 1 ? '' : 's'} found.</div>
        ${summary.length ? `
          <div class="table-responsive">
            <table>
              <thead><tr><th>Student</th><th>Program</th><th>Company</th><th>Supervisor</th><th>Internship Status</th><th>Hours</th></tr></thead>
              <tbody>${summary.map(item => `<tr>
                <td>${escapeHtml(item.name)}<br><small>${escapeHtml(item.student_id || 'No student ID')}</small></td>
                <td>${escapeHtml(item.program || '—')}</td>
                <td>${escapeHtml(item.company || 'Unassigned')}</td>
                <td>${escapeHtml(item.supervisor || '—')}</td>
                <td>${escapeHtml(item.internshipStatus)}</td>
                <td>${item.hours} / ${item.required}</td>
              </tr>`).join('')}</tbody>
            </table>
          </div>` : '<div class="form-text">No records match the selected filters.</div>'}
      </div>
      <div class="coordinator-report-card" style="margin-top:16px">
        <div class="coordinator-report-title">Report Summary</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:12px">
          ${statusSummary.map(item => `<div style="padding:12px;background:var(--surface2);border-radius:8px"><div style="font-size:11px;color:var(--text3)">${item.status}</div><div style="font-size:24px;font-weight:800">${item.count}</div></div>`).join('')}
        </div>
      </div>
    `;
    mountGeneratedInternshipReport(summary);
  }
  addNotification('Coordinator report generated.', 'success');
}

function printGeneratedReport() {
  if (!document.getElementById('generatedInternshipReport')) {
    addNotification('Generate a report before printing.', 'warning');
    return;
  }
  window.print();
}

function printCoordinatorReport() {
  printGeneratedReport();
}

function exportCoordinatorExcel() {
  exportGeneratedInternshipReport(getCoordinatorReportRows(), { filename: 'coordinator_internship_report.xls' });
  addNotification('Coordinator internship report exported.', 'success');
}

function getCoordinatorStudentStatusSummary() {
  const summary = { Pending: 0, Approved: 0, Ongoing: 0, Completed: 0 };
  getCoordinatorProgramStudents().forEach(student => {
    if (summary[student.internshipStatus] !== undefined) summary[student.internshipStatus] += 1;
  });
  return summary;
}

function getCoordinatorCompanyDistribution() {
  const counts = {};
  getCoordinatorProgramStudents().forEach(student => {
    const key = student.company || 'Unassigned';
    counts[key] = (counts[key] || 0) + 1;
  });
  return Object.entries(counts).map(([company, count]) => ({ company, count }));
}

function initCoordinatorDashboardTables() {
  renderCoordinatorStudentTable('coordinator-student-overview');
}

function initCoordinatorAttendanceFilters() {
  const container = document.getElementById('coordinator-attendance-table');
  if (!container) return;
  const rows = (Array.isArray(COORDINATOR_ATTENDANCE_LOG) ? COORDINATOR_ATTENDANCE_LOG : [])
    .filter(item => item.name && item.name !== '');
  const studentSelect = document.getElementById('coord-attendance-student');
  const companySelect = document.getElementById('coord-attendance-company');
  const dateInput = document.getElementById('coord-attendance-date');
  const statusSelect = document.getElementById('coord-attendance-status');

  const renderAttendanceRows = () => {
    const studentFilter = studentSelect?.value || 'All';
    const companyFilter = companySelect?.value || 'All';
    const dateFilter = dateInput?.value || '';
    const statusFilter = statusSelect?.value || 'All';
    const filtered = rows.filter(item => {
      const matchesStudent = studentFilter === 'All' || item.name === studentFilter;
      const matchesCompany = companyFilter === 'All' || item.company === companyFilter;
      const matchesDate = !dateFilter || item.date === dateFilter;
      const matchesStatus = statusFilter === 'All' || item.status === statusFilter;
      return matchesStudent && matchesCompany && matchesDate && matchesStatus;
    });
    container.innerHTML = filtered.length ? `
      <table>
        <thead><tr><th>Student</th><th>Company</th><th>Date</th><th>Time In</th><th>Time Out</th><th>Duration</th><th>Status</th></tr></thead>
        <tbody>
          ${filtered.map(item => `
            <tr>
              <td>${escapeHtml(item.name)}</td>
              <td>${escapeHtml(item.company || 'Unassigned')}</td>
              <td>${escapeHtml(item.date)}</td>
              <td>${escapeHtml(item.timeIn)}</td>
              <td>${escapeHtml(item.timeOut)}</td>
              <td>${escapeHtml(item.duration)}</td>
              <td><span class="tag ${getCoordinatorAttendanceClass(item.status)}">${escapeHtml(item.status)}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : '<div class="text-muted" style="padding:24px;text-align:center">No attendance records found.</div>';
  };
  [studentSelect, companySelect, dateInput, statusSelect].forEach(input => input?.addEventListener('change', renderAttendanceRows));
  [studentSelect, companySelect, statusSelect].forEach(input => input?.addEventListener('input', renderAttendanceRows));
  renderAttendanceRows();
}

function getFilteredCoordinatorAttendanceRows() {
  const studentFilter = document.getElementById('coord-attendance-student')?.value || 'All';
  const companyFilter = document.getElementById('coord-attendance-company')?.value || 'All';
  const dateFilter = document.getElementById('coord-attendance-date')?.value || '';
  const statusFilter = document.getElementById('coord-attendance-status')?.value || 'All';
  return COORDINATOR_ATTENDANCE_LOG.filter(item => {
    const matchesStudent = studentFilter === 'All' || item.name === studentFilter;
    const matchesCompany = companyFilter === 'All' || item.company === companyFilter;
    const matchesDate = !dateFilter || item.date === dateFilter;
    const matchesStatus = statusFilter === 'All' || item.status === statusFilter;
    return matchesStudent && matchesCompany && matchesDate && matchesStatus;
  });
}

async function openCoordinatorAttendanceModal(studentId) {
  const student = getCoordinatorStudentRecordById(studentId);
  const studentName = student?.student_name || student?.name || 'Student';
  openGenModal(`Attendance: ${studentName}`, '<div class="text-muted">Loading attendance records...</div>', null, 'Close');

  try {
    const apiBase = typeof API_BASE !== 'undefined' ? API_BASE : '../php/api.php';
    const response = await fetch(`${apiBase}?resource=attendance`);
    const data = await response.json();
    if (!data.success) throw new Error(data.message || 'Unable to load attendance.');

    const rows = (data.attendance || []).filter(item => String(item.student_id) === String(studentId));
    const body = rows.length ? `
      <div class="table-responsive">
        <table class="table table-sm align-middle">
          <thead><tr><th>Date</th><th>Time In</th><th>Time Out</th><th>Duration</th><th>Status</th></tr></thead>
          <tbody>${rows.map(item => `
            <tr>
              <td>${escapeHtml(item.log_date || '—')}</td>
              <td>${escapeHtml(item.time_in || '—')}</td>
              <td>${escapeHtml(item.time_out || '—')}</td>
              <td>${item.duration_minutes === null || item.duration_minutes === undefined ? '—' : `${escapeHtml(String(item.duration_minutes))} min`}</td>
              <td><span class="tag ${getCoordinatorAttendanceClass(item.status)}">${escapeHtml(item.status || 'Present')}</span></td>
            </tr>`).join('')}</tbody>
        </table>
      </div>` : '<div class="text-muted">No attendance records found for this student.</div>';
    document.getElementById('gen-modal-body').innerHTML = body;
  } catch (error) {
    document.getElementById('gen-modal-body').innerHTML = `<div class="alert alert-danger">${escapeHtml(error.message || 'Unable to load attendance records.')}</div>`;
  }
}

function initCoordinatorPageHooks() {
  if (currentPage === 'dashboard') {
    initCoordinatorDashboardTables();
  }
  if (currentPage === 'attendance-monitoring') {
    initCoordinatorAttendanceFilters();
  }
}

NAV.coordinator = [
  { id:'dashboard', icon:'📊', label:'Dashboard' },
  { id:'student-records', icon:'🎓', label:'Student Records' },
  { id:'company-assignment', icon:'🏢', label:'Company Assignment' },
  { id:'attendance-monitoring', icon:'🗓️', label:'Attendance Monitoring' },
  { id:'reports', icon:'📋', label:'Reports' },
];

PAGE_RENDERERS.coordinator = {
  dashboard: () => {
    const stats = getCoordinatorSummaryStats();
    const activities = getCoordinatorDashboardActivities();
    const statusSummary = getCoordinatorDashboardStatusSummary();
    return `
      <div class="breadcrumb">Coordinator Portal › Dashboard</div>
      <div class="stats-row cols4">
        <div class="stat-card blue"><div class="stat-icon">🎓</div><div class="stat-val">${stats.totalAssignedStudents}</div><div class="stat-label">Total Assigned Students</div></div>
        <div class="stat-card green"><div class="stat-icon">🏢</div><div class="stat-val">${stats.assignedStudents}</div><div class="stat-label">Students with Company Assignment</div></div>
        <div class="stat-card amber"><div class="stat-icon">⏳</div><div class="stat-val">${stats.ongoing}</div><div class="stat-label">Ongoing Internships</div></div>
        <div class="stat-card teal"><div class="stat-icon">✅</div><div class="stat-val">${stats.completed}</div><div class="stat-label">Completed Internships</div></div>
      </div>
      <div class="stats-row cols3 mb-24">
        <div class="stat-card red"><div class="stat-icon">⚠️</div><div class="stat-val">${stats.pendingRequirements}</div><div class="stat-label">Pending Requirements</div></div>
        <div class="stat-card blue"><div class="stat-icon">🗓️</div><div class="stat-val">${stats.attendanceToday}</div><div class="stat-label">Attendance Today</div></div>
        <div class="stat-card gold"><div class="stat-icon">📌</div><div class="stat-val">${activities.length}</div><div class="stat-label">Recent Student Activities</div></div>
      </div>
      <div class="two-col">
        <div class="card">
          <div class="card-header"><div class="card-title">Recent Student Activities</div></div>
          <div class="card-body">
            ${activities.length ? activities.map(item => `
              <div class="log-item">
                <div class="avatar av-blue">${escapeHtml(String(item.name || '').split(' ').map(word => word[0]).join('').slice(0, 2))}</div>
                <div>
                  <div class="user-cell-name">${escapeHtml(item.name || 'Student')}</div>
                  <div class="user-cell-sub">${escapeHtml(item.activity || 'Student activity')}</div>
                </div>
                <div class="ml-auto text-right">
                  <div class="user-cell-sub">${escapeHtml(item.date || '')}</div>
                  <span class="tag tag-blue">Info</span>
                </div>
              </div>
            `).join('') : '<div class="text-muted">No recent student activities.</div>'}
          </div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Internship Status Summary</div></div>
          <div class="card-body">
            <table>
              <thead><tr><th>Status</th><th>Total Students</th></tr></thead>
              <tbody>
                ${statusSummary.map(item => `<tr><td>${escapeHtml(item.label)}</td><td>${item.count}</td></tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">Assigned Students Overview</div></div>
        <div class="card-body">
          <div id="coordinator-student-overview"></div>
        </div>
      </div>
    `;
  },

  'student-records': () => `
    <div id="coordinator-student-records-table"></div>
  `,

  'company-assignment': () => `
    <div class="breadcrumb">Coordinator Portal › Company Assignment</div>
    <div class="section-head"></div>
    <div class="card">
      <div class="card-header"><div class="card-title">Company Assignment</div></div>
      <div class="card-body">
        <div class="coordinator-grid">
          ${COORDINATOR_COMPANY_ASSIGNMENTS.companies.length ? COORDINATOR_COMPANY_ASSIGNMENTS.companies.map(company => `
            <div class="coordinator-assignment-card">
              <div class="coordinator-card-title">${escapeHtml(company.name)}</div>
              <div class="coordinator-card-sub">${escapeHtml(company.location || '—')}</div>
              <div class="coordinator-card-meta">Supervisor: <strong>${escapeHtml(company.supervisor_name || 'No supervisor assigned')}</strong></div>
              <div class="coordinator-card-meta">Assigned Students: <strong>${Number(company.assigned_students) || 0}</strong></div>
              <div class="coordinator-card-actions">
                <button class="btn btn-outline btn-sm" onclick="openCompanyAssignStudentModal(${Number(company.id)})">Assign Student</button>
              </div>
            </div>
          `).join('') : '<div class="form-text">No Company Assigned</div>'}
        </div>
      </div>
    </div>
  `,

  'attendance-monitoring': () => {
    const attendanceStudents = getCoordinatorAttendanceFilterStudents();
    const attendanceCompanies = getCoordinatorAttendanceFilterCompanies();
    return `
      <div class="breadcrumb">Coordinator Portal › Attendance Monitoring</div>
      <div class="section-head"><button class="btn btn-outline" onclick="exportCoordinatorAttendance()">📥 Export Attendance</button></div>
      <div class="card">
        <div class="card-header">
          <div class="card-title">Daily Time Record (DTR)</div>
          <div class="coordinator-toolbar-inline">
            <select class="form-select" id="coord-attendance-student"><option value="All">All Students</option>${attendanceStudents.map(student => `<option value="${escapeHtml(student.name)}">${escapeHtml(student.name)}</option>`).join('')}</select>
            <select class="form-select" id="coord-attendance-company"><option value="All">All Companies</option>${attendanceCompanies.map(company => `<option value="${escapeHtml(company)}">${escapeHtml(company)}</option>`).join('')}</select>
            <input class="form-input" id="coord-attendance-date" type="date">
            <select class="form-select" id="coord-attendance-status"><option value="All">All Status</option><option value="Present">Present</option><option value="Late">Late</option><option value="Absent">Absent</option><option value="Excused">Excused</option></select>
          </div>
        </div>
        <div class="card-body">
          <div id="coordinator-attendance-table"></div>
        </div>
      </div>
    `;
  },

  reports: () => `
    <div class="breadcrumb">Coordinator Portal › Reports</div>
    <div class="section-head"><div class="coordinator-toolbar-inline"><button class="btn btn-outline" onclick="generateCoordinatorReport()">Generate Report</button><button class="btn btn-outline" onclick="exportCoordinatorExcel()">Export to Excel</button><button class="btn btn-outline" onclick="printGeneratedReport()">Print Report</button></div></div>
    <div class="card">
      <div class="card-header"><div class="card-title">Report Filters</div></div>
      <div class="card-body">
        <div class="coordinator-report-filters">
          <div class="form-row"><label class="form-label">Academic Year</label><select class="form-select" id="coord-report-academic-year"><option>2024–2025</option><option>2023–2024</option></select></div>
          <div class="form-row"><label class="form-label">Program</label><select class="form-select" id="coord-report-program"><option value="All" selected>All</option>${[...new Set((COORDINATOR_COMPANY_ASSIGNMENTS.students || []).map(student => student.program).filter(Boolean))].map(program => `<option value="${escapeHtml(program)}">${escapeHtml(program)}</option>`).join('')}</select></div>
          <div class="form-row"><label class="form-label">Company</label><select class="form-select" id="coord-report-company"><option value="All">All</option>${[...new Set((COORDINATOR_COMPANY_ASSIGNMENTS.companies || []).map(company => company.name).filter(Boolean))].map(company => `<option value="${escapeHtml(company)}">${escapeHtml(company)}</option>`).join('')}</select></div>
          <div class="form-row"><label class="form-label">Student</label><select class="form-select" id="coord-report-student"><option value="All">All</option>${(COORDINATOR_COMPANY_ASSIGNMENTS.students || []).map(student => `<option value="${escapeHtml(student.name || student.student_name || '')}">${escapeHtml(student.name || student.student_name || '')}</option>`).join('')}</select></div>
          <div class="form-row"><label class="form-label">Internship Status</label><select class="form-select" id="coord-report-status"><option value="All" selected>All</option><option value="Pending">Pending</option><option value="Ongoing">Ongoing</option><option value="Completed">Completed</option></select></div>
          <div class="form-row"><label class="form-label">Date Range</label><div class="coordinator-toolbar-inline"><input class="form-input" id="coord-report-from" type="date"><input class="form-input" id="coord-report-to" type="date"></div></div>
        </div>
        <div id="coord-report-output" class="coordinator-report-output"><div class="form-text">Select your filters and click Generate Report.</div></div>
      </div>
    </div>
  `,

  profile: () => `
    <div class="breadcrumb">Coordinator Portal › Profile</div>
    <div class="section-head"></div>
    <div class="two-col">
      <div class="card">
        <div class="card-header"><div class="card-title">Profile Information</div></div>
        <div class="card-body">
          <div class="form-row"><label class="form-label">Name</label><input class="form-input" type="text" value="${ROLES.coordinator.name}"></div>
          <div class="form-row"><label class="form-label">Email</label><input class="form-input" type="email" value="${ROLES.coordinator.email}"></div>
          <div class="form-row"><label class="form-label">Role</label><input class="form-input" type="text" value="${ROLES.coordinator.label}" disabled></div>
          <button class="btn btn-primary" onclick="addNotification('Profile updated successfully.', 'success')">Update Profile</button>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">Security</div></div>
        <div class="card-body">
          <div class="form-row"><label class="form-label">Change Password</label><input class="form-input" type="password" placeholder="New password"></div>
          <div class="form-row"><label class="form-label">Confirm Password</label><input class="form-input" type="password" placeholder="Confirm password"></div>
          <button class="btn btn-primary" onclick="addNotification('Password change request submitted.', 'warning')">Save Password</button>
        </div>
      </div>
    </div>
  `,

  notifications: () => `
    <div class="breadcrumb">Coordinator Portal › Notifications</div>
    <div class="section-head"><div class="coordinator-toolbar-inline"><button class="btn btn-outline" onclick="markAllAsRead()">Mark All Read</button><button class="btn btn-outline" onclick="deleteAllNotifications()">Delete All</button></div></div>
    <div class="card">
      <div class="card-body">
        ${notifications.length ? notifications.map(item => `
          <div class="log-item">
            <div class="avatar ${item.type === 'success' ? 'av-green' : item.type === 'warning' ? 'av-gold' : 'av-blue'}">${item.type === 'success' ? '✓' : item.type === 'warning' ? '!' : 'i'}</div>
            <div>
              <div class="user-cell-name">${escapeHtml(item.message)}</div>
              <div class="user-cell-sub">${new Date(item.timestamp).toLocaleString()}</div>
            </div>
          </div>
        `).join('') : '<div class="text-muted">No notifications available.</div>'}
      </div>
    </div>
  `,
};

function csvEscape(value) {
  return `"${String(value || '').replace(/"/g, '""')}"`;
}

function exportCoordinatorAttendance() {
  const headers = ['Student','Company','Date','Time In','Time Out','Duration','Status'];
  const rows = getFilteredCoordinatorAttendanceRows().map(item => [item.name, item.company, item.date, item.timeIn, item.timeOut, item.duration, item.status].map(csvEscape).join(','));
  downloadCSV([headers.join(','), ...rows].join('\r\n'), 'coordinator_attendance.csv');
  addNotification('Coordinator attendance exported.', 'success');
}

function exportCoordinatorProgress() {
  const headers = ['Student','Program','Company','Hours Completed','Required Hours','Remaining Hours','Status','Completion %'];
  const rows = getCoordinatorProgramStudents().map(student => {
    const completed = Math.min(100, Math.round((student.hours / student.required) * 100));
    const remaining = Math.max(0, student.required - student.hours);
    return [student.name, student.program, student.company || 'Unassigned', student.hours, student.required, remaining, student.internshipStatus, `${completed}%`].map(csvEscape).join(',');
  });
  downloadCSV([headers.join(','), ...rows].join('\r\n'), 'coordinator_ojt_progress.csv');
  addNotification('Coordinator internship progress exported.', 'success');
}

function exportCoordinatorReports() {
  const rows = [];
  rows.push(['Report Section','Label','Value']);
  rows.push(['Summary','Total Students', getCoordinatorProgramStudents().length]);
  rows.push(['Summary','Ongoing Internships', getCoordinatorSummaryStats().ongoing]);
  rows.push(['Summary','Completed Internships', getCoordinatorSummaryStats().completed]);
  rows.push(['Summary','Pending Requirements', getCoordinatorSummaryStats().pendingRequirements]);
  downloadCSV(['Section,Label,Value', ...rows.map(row => row.map(csvEscape).join(','))].join('\r\n'), 'coordinator_reports.csv');
  addNotification('Coordinator reports exported.', 'success');
}

function openAddStudentModal() {
  const body = `
    <div class="form-row"><label class="form-label">Full Name</label><input class="form-input" id="coord-student-name" type="text" placeholder="e.g. Juan dela Cruz"></div>
    <div class="form-row"><label class="form-label">Student ID</label><input class="form-input" id="coord-student-id" type="text" placeholder="e.g. BSIT-2022-001"></div>
    <div class="form-row"><label class="form-label">Email</label><input class="form-input" id="coord-student-email" type="email" placeholder="e.g. jdc@student.bisu.edu.ph"></div>
    <div class="form-row"><label class="form-label">Program</label><select class="form-select" id="coord-student-prog"><option value="BSIT">BSIT</option><option value="BSCS">BSCS</option></select></div>
    <div class="form-row"><label class="form-label">Password</label><div style="display:flex;gap:8px"><input class="form-input" id="coord-student-pass" type="text" placeholder="Set password" style="flex:1"><button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('coord-student-pass').value=Math.random().toString(36).slice(-8)">Auto-Generate</button></div></div>
  `;
  openGenModal('Add Student Account', body, saveStudentAccount, 'Create Account');
}

async function saveStudentAccount() {
  const name = document.getElementById('coord-student-name').value.trim();
  const email = document.getElementById('coord-student-email').value.trim();
  const password = document.getElementById('coord-student-pass').value.trim();
  const prog = document.getElementById('coord-student-prog').value;
  if (!name || !email || !password) {
    alert('Please fill in all required fields.');
    return false;
  }
  try {
    const res = await fetch('../php/register.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}&role=student`
    });
    const data = await res.json();
    if (!data.success) { alert(data.message || 'Failed to create account.'); return false; }
    alert(`✅ Student account created!\nEmail: ${email}\nPassword: ${password}\n\nShare these credentials with the student.`);
    addNotification(`New student added: ${name} (${prog})`, 'success');
  } catch (e) {
    alert(`✅ Student account created (demo mode)!\nEmail: ${email}\nPassword: ${password}\n\nShare these credentials with the student.`);
    addNotification(`New student added: ${name} (${prog})`, 'success');
  }
  return true;
}

function openAddSupervisorModal() {
  const body = `
    <div class="form-row"><label class="form-label">Company / Supervisor Name</label><input class="form-input" id="coord-sup-name" type="text" placeholder="e.g. Tech Solutions Inc."></div>
    <div class="form-row"><label class="form-label">Email</label><input class="form-input" id="coord-sup-email" type="email" placeholder="e.g. ojt@company.com"></div>
    <div class="form-row"><label class="form-label">Contact Person</label><input class="form-input" id="coord-sup-contact" type="text" placeholder="e.g. John Smith"></div>
    <div class="form-row"><label class="form-label">Password</label><div style="display:flex;gap:8px"><input class="form-input" id="coord-sup-pass" type="text" placeholder="Set password" style="flex:1"><button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('coord-sup-pass').value=Math.random().toString(36).slice(-8)">Auto-Generate</button></div></div>
  `;
  openGenModal('Add Supervisor Account', body, saveSupervisorAccount, 'Create Account');
}

async function saveSupervisorAccount() {
  const name = document.getElementById('coord-sup-name').value.trim();
  const email = document.getElementById('coord-sup-email').value.trim();
  const password = document.getElementById('coord-sup-pass').value.trim();
  if (!name || !email || !password) {
    alert('Please fill in all required fields.');
    return false;
  }
  try {
    const res = await fetch('../php/register.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}&role=supervisor`
    });
    const data = await res.json();
    if (!data.success) { alert(data.message || 'Failed to create account.'); return false; }
    alert(`✅ Supervisor account created!\nEmail: ${email}\nPassword: ${password}\n\nShare these credentials with the supervisor.`);
    addNotification(`New supervisor added: ${name}`, 'success');
  } catch (e) {
    alert(`✅ Supervisor account created (demo mode)!\nEmail: ${email}\nPassword: ${password}\n\nShare these credentials with the supervisor.`);
    addNotification(`New supervisor added: ${name}`, 'success');
  }
  return true;
}

async function initCoordinatorModule() {
  if (currentRole !== 'coordinator') return;
  if (currentPage === 'company-assignment') {
    const loaded = await loadCoordinatorCompanyAssignments();
    const content = document.getElementById('content');
    if (loaded && content) {
      content.innerHTML = PAGE_RENDERERS.coordinator['company-assignment']();
    }
    return;
  }
  if (currentPage === 'dashboard' || currentPage === 'student-records') {
    const target = document.getElementById('coordinator-student-overview');
    const recordsTarget = document.getElementById('coordinator-student-records-table');
    if (target) {
      target.innerHTML = '<div class="text-muted">Loading student records…</div>';
    }
    if (recordsTarget) {
      recordsTarget.innerHTML = '<div class="text-muted">Loading student records…</div>';
    }
    const data = await refreshCoordinatorStudentRecords();
    if (data.success) {
      if (currentPage === 'dashboard') {
        const content = document.getElementById('content');
        if (content) content.innerHTML = PAGE_RENDERERS.coordinator.dashboard();
      }
      if (document.getElementById('coordinator-student-overview')) {
        renderCoordinatorStudentTable('coordinator-student-overview');
      }
      if (document.getElementById('coordinator-student-records-table')) {
        renderCoordinatorStudentTable('coordinator-student-records-table');
      }
    } else {
      if (target) {
        target.innerHTML = '<div class="text-muted">Unable to load student records from the database.</div>';
      }
      if (recordsTarget) {
        recordsTarget.innerHTML = '<div class="text-muted">Unable to load student records from the database.</div>';
      }
    }
  }
  if (currentPage === 'reports') {
    await Promise.all([refreshCoordinatorStudentRecords(), loadCoordinatorCompanyAssignments()]);
    if (currentPage !== 'reports') return;
    const content = document.getElementById('content');
    if (content) {
      content.innerHTML = PAGE_RENDERERS.coordinator.reports();
    }
  }
  if (currentPage === 'attendance-monitoring') {
    await Promise.all([
      refreshCoordinatorStudentRecords(),
      loadCoordinatorCompanyAssignments(),
      loadCoordinatorAttendanceRecords()
    ]);
    if (currentPage !== 'attendance-monitoring') return;
    const content = document.getElementById('content');
    if (content) {
      content.innerHTML = PAGE_RENDERERS.coordinator['attendance-monitoring']();
    }
    initCoordinatorAttendanceFilters();
  }
}

window.addEventListener('load', initCoordinatorModule);


function openManageCompany(index) {
  const company = PARTNER_COMPANIES[index];
  const body = `
    <div class="form-row"><label class="form-label">Company Name</label><input class="form-input" id="manage-company-name" type="text" value="${company.name}"></div>
    <div class="form-row"><label class="form-label">Location</label><input class="form-input" id="manage-company-loc" type="text" value="${company.loc}"></div>
    <div class="form-row"><label class="form-label">Contact Email</label><input class="form-input" id="manage-company-contact" type="email" value="${company.contact}"></div>
    <div class="form-row"><label class="form-label">Active Interns</label><input class="form-input" id="manage-company-interns" type="number" min="0" value="${company.interns}"></div>
    <div class="form-row"><label class="form-label">Status</label><select class="form-select" id="manage-company-status"><option value="Active" ${company.status==='Active'?'selected':''}>Active</option><option value="Pending" ${company.status==='Pending'?'selected':''}>Pending</option><option value="Inactive" ${company.status==='Inactive'?'selected':''}>Inactive</option></select></div>
  `;
  openGenModal(`Manage ${company.name}`, body, () => saveManagedCompany(index), 'Save Changes');
}

function saveManagedCompany(index) {
  const name = document.getElementById('manage-company-name').value.trim();
  const loc = document.getElementById('manage-company-loc').value.trim();
  const contact = document.getElementById('manage-company-contact').value.trim();
  const interns = parseInt(document.getElementById('manage-company-interns').value, 10);
  const status = document.getElementById('manage-company-status').value;
  if (!name || !loc || !contact || Number.isNaN(interns)) {
    alert('Please fill in all fields before saving.');
    return false;
  }
  PARTNER_COMPANIES[index] = { name, loc, contact, interns, status };
  addNotification(`Updated company: ${name}`, 'success');
  navigateTo('companies');
  return true;
}
