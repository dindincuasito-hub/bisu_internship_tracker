const ADMIN_SETTINGS = {
  ojt_hours: 500,
  face_recognition_enabled: true,
  auto_attendance: true,
  max_students_per_supervisor: 15,
  submission_deadline_reminder: 48, // hours
};
function getReportsFilters() {
  return {
    academicYear: document.getElementById('reports-academic-year')?.value || 'All Years',
    program: document.getElementById('reports-program')?.value || 'All Programs',
    company: document.getElementById('reports-company')?.value || 'All Companies',
    coordinator: document.getElementById('reports-coordinator')?.value || 'All Coordinators',
    supervisor: document.getElementById('reports-supervisor')?.value || 'All Supervisors',
    status: document.getElementById('reports-status')?.value || 'All'
  };
}

function getFilteredReportRows() {
  const filters = getReportsFilters();
  return INTERNSHIPS
    .map((internship) => {
      const student = ADMIN_STUDENTS.find((item) => item.name === internship.studentName) || {};
      return {
        ...internship,
        studentId: internship.studentId || student.studentId || '',
        program: internship.program || student.program || 'N/A',
        academicYear: internship.academicYear || 'All Years'
      };
    })
    .filter((item) => {
      const matchesYear = filters.academicYear === 'All Years' || item.academicYear === filters.academicYear;
      const matchesProgram = filters.program === 'All Programs' || item.program === filters.program;
      const matchesCompany = filters.company === 'All Companies' || item.company === filters.company;
      const matchesCoordinator = filters.coordinator === 'All Coordinators' || item.coordinator === filters.coordinator;
      const matchesSupervisor = filters.supervisor === 'All Supervisors' || item.supervisor === filters.supervisor;
      const matchesStatus = filters.status === 'All' || item.status === filters.status;
      return matchesYear && matchesProgram && matchesCompany && matchesCoordinator && matchesSupervisor && matchesStatus;
    });
}

function renderAdminReportsContent() {
  const container = document.getElementById('reports-content-area');
  if (!container) return;

  const rows = getFilteredReportRows();
  const detailRows = rows.length
    ? rows.map((row) => `
        <tr>
          <td>${escapeHtml(row.studentId || '—')}</td>
          <td>${escapeHtml(row.studentName)}</td>
          <td>${escapeHtml(row.program)}</td>
          <td>${escapeHtml(row.company)}</td>
          <td>${escapeHtml(row.coordinator || 'Unassigned')}</td>
          <td>${escapeHtml(row.supervisor || 'Unassigned')}</td>
          <td><span class="tag ${row.status === 'Completed' ? 'tag-green' : row.status === 'Ongoing' ? 'tag-blue' : row.status === 'Approved' ? 'tag-teal' : 'tag-amber'}">${escapeHtml(row.status)}</span></td>
        </tr>`).join('')
    : `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text3)">No internship records match the selected filters.</td></tr>`;

  container.innerHTML = `
    <div style="overflow-x:auto">
      <table class="table" style="margin-bottom:0">
        <thead>
          <tr>
            <th>Student ID</th>
            <th>Student Name</th>
            <th>Program</th>
            <th>Company</th>
            <th>Coordinator</th>
            <th>Supervisor</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>${detailRows}</tbody>
      </table>
    </div>`;
}

function initAdminReportsPage() {
  if (currentPage !== 'reports' || currentRole !== 'admin') return;

  ['reports-academic-year', 'reports-program', 'reports-company', 'reports-coordinator', 'reports-supervisor', 'reports-status'].forEach((id) => {
    const element = document.getElementById(id);
    if (element) {
      element.onchange = renderAdminReportsContent;
    }
  });

  renderAdminReportsContent();
}

function initAdminCompanySearch() {
  const searchInput = document.getElementById('company-search-input');
  if (!searchInput || searchInput.dataset.searchReady === 'true') return;
  searchInput.dataset.searchReady = 'true';
  searchInput.addEventListener('input', (event) => {
    window.__companySearch = event.target.value;
    window.__companyPage = 1;
    clearTimeout(window.__companySearchTimer);
    window.__companySearchTimer = setTimeout(() => loadAdminCompanyPage(1, window.__companySearch), 250);
  });
}

function getAdminCompanyRowsMarkup(companies, startIndex) {
  return companies.length ? companies.map((company, rowIndex) => {
    const statusClass = company.status === 'Active' ? 'tag-green' : 'tag-gray';
    return `<tr>
      <td>${startIndex + rowIndex + 1}</td>
      <td style="font-weight:600">${escapeHtml(company.name || '—')}</td>
      <td>${escapeHtml(company.address || company.location || '—')}</td>
      <td>${escapeHtml(company.contact_person || company.contact || '—')}</td>
      <td>${escapeHtml(company.contact_phone || company.phone || '—')}</td>
      <td style="font-size:12px">${escapeHtml(company.contact_email || company.email || '—')}</td>
      <td><span class="tag ${statusClass}">${escapeHtml(company.status || 'Active')}</span></td>
      <td><div style="display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:nowrap">
        <button type="button" class="btn btn-outline btn-sm" title="View" aria-label="View" style="display:inline-flex;align-items:center;justify-content:center;padding:5px;width:32px;height:32px;border-radius:8px;transition:all 0.2s ease;" onclick="viewCompany(ADMIN_COMPANY_PAGE_RECORDS[${rowIndex}])"><i class="bi bi-eye-fill" aria-hidden="true"></i></button>
        <button type="button" class="btn btn-outline btn-sm" title="Edit" aria-label="Edit" style="display:inline-flex;align-items:center;justify-content:center;padding:5px;width:32px;height:32px;border-radius:8px;transition:all 0.2s ease;" onclick="editCompany(ADMIN_COMPANY_PAGE_RECORDS[${rowIndex}])"><i class="bi bi-pencil-fill" aria-hidden="true"></i></button>
        <button type="button" class="btn btn-outline btn-sm" title="Delete" aria-label="Delete" style="display:inline-flex;align-items:center;justify-content:center;padding:5px;width:32px;height:32px;border-radius:8px;transition:all 0.2s ease;" onclick="deleteCompany(ADMIN_COMPANY_PAGE_RECORDS[${rowIndex}])"><i class="bi bi-trash-fill" aria-hidden="true"></i></button>
      </div></td>
    </tr>`;
  }).join('') : '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text3)">No companies found.</td></tr>';
}

function getAdminCompanyPaginationMarkup(page, totalPages) {
  return `<div style="font-size:12px;color:var(--text3)">Page ${page} of ${totalPages}</div><div class="flex gap-8"><button class="btn btn-outline btn-sm" onclick="changeCompanyPage(-1)" ${page <= 1 ? 'disabled' : ''}>Previous</button><button class="btn btn-outline btn-sm" onclick="changeCompanyPage(1)" ${page >= totalPages ? 'disabled' : ''}>Next</button></div>`;
}

function updateAdminCompanyPageDom() {
  const results = document.querySelector('[data-company-results]');
  const pagination = document.querySelector('[data-company-pagination]');
  if (!results || !pagination) return false;
  const page = Math.max(1, Number(window.__companyPage || 1));
  const totalPages = Math.max(1, Number(window.__companyTotalPages || 1));
  results.innerHTML = getAdminCompanyRowsMarkup(ADMIN_COMPANY_PAGE_RECORDS, (page - 1) * 8);
  pagination.innerHTML = getAdminCompanyPaginationMarkup(page, totalPages);
  return true;
}

function getAdminGeneratedReportRows() {
  return getFilteredReportRows().map(row => ({
    name: row.studentName || 'Unknown Student',
    student_id: row.studentId || '',
    program: row.program || 'N/A',
    company: row.company || 'Unassigned',
    supervisor: row.supervisor || 'Unassigned',
    internshipStatus: row.status || 'Pending',
    hours: Number(row.hoursCompleted) || 0,
    required: Number(row.hoursRequired) || 500,
  }));
}

function getAdminReportPrintOptions() {
  const filters = getReportsFilters();
  return {
    coordinatorName: filters.coordinator === 'All Coordinators' ? (currentUser?.name || 'Administrator') : filters.coordinator,
    programName: filters.program === 'All Programs' ? 'All Programs' : filters.program,
    preparedName: currentUser?.name || 'Administrator',
    preparedRole: 'System Administrator',
    filename: 'admin_internship_report.xls',
  };
}

function exportAdminInternshipReport() {
  if (typeof exportGeneratedInternshipReport !== 'function') return;
  exportGeneratedInternshipReport(getAdminGeneratedReportRows(), getAdminReportPrintOptions());
}

function printAdminInternshipReport() {
  if (typeof mountGeneratedInternshipReport !== 'function') return;
  mountGeneratedInternshipReport(getAdminGeneratedReportRows(), getAdminReportPrintOptions());
  window.print();
}

async function loadAdminProfile() {
  try {
    const response = await fetch(`${API_BASE}?resource=profile`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || !data.success || !data.profile) {
      throw new Error(data.message || 'Unable to load your profile.');
    }
    if (currentRole !== 'admin' || currentPage !== 'profile') return;

    applyAdminProfile(data.profile);
  } catch (error) {
    setAdminProfileMessage(error.message || 'Unable to load your profile.', true);
  }
}

function applyAdminProfile(profile) {
  if (!profile || typeof profile !== 'object') return;

  currentUser = { ...currentUser, ...profile };

  // The admin profile form intentionally exposes only name and email.  Do not
  // write to fields that are not part of this page; it is rendered dynamically
  // and may also have been replaced while this request was in flight.
  const nameInput = document.getElementById('admin-profile-name');
  const emailInput = document.getElementById('admin-profile-email');
  if (nameInput) nameInput.value = profile.name || '';
  if (emailInput) emailInput.value = profile.email || '';
}

function setAdminProfileMessage(message, isError = false, target = 'admin-profile-message') {
  const element = document.getElementById(target);
  if (!element) return;
  element.textContent = message;
  element.style.color = isError ? 'var(--danger, #c0392b)' : 'var(--success, #237a45)';
}

async function saveAdminProfile() {
  const name = document.getElementById('admin-profile-name')?.value.trim() || '';
  const email = document.getElementById('admin-profile-email')?.value.trim() || '';
  if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setAdminProfileMessage('Enter your name and a valid email address.', true);
    return;
  }

  try {
    const response = await fetch(`${API_BASE}?resource=profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email })
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || 'Unable to save your profile.');
    applyAdminProfile(data.profile || { name, email });
    setAdminProfileMessage(data.message || 'Profile updated successfully.');
  } catch (error) {
    setAdminProfileMessage(error.message || 'Unable to save your profile.', true);
  }
}

async function saveAdminPassword() {
  const currentPassword = document.getElementById('admin-current-password')?.value || '';
  const newPassword = document.getElementById('admin-new-password')?.value || '';
  const confirmPassword = document.getElementById('admin-confirm-password')?.value || '';
  if (!currentPassword || !newPassword || !confirmPassword) {
    setAdminProfileMessage('Complete all password fields.', true, 'admin-password-message');
    return;
  }
  if (newPassword.length < 8) {
    setAdminProfileMessage('New password must be at least 8 characters long.', true, 'admin-password-message');
    return;
  }
  if (newPassword !== confirmPassword) {
    setAdminProfileMessage('New password and confirmation do not match.', true, 'admin-password-message');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}?resource=profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword, confirm_password: confirmPassword })
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || 'Unable to change your password.');
    document.getElementById('admin-current-password').value = '';
    document.getElementById('admin-new-password').value = '';
    document.getElementById('admin-confirm-password').value = '';
    setAdminProfileMessage(data.message || 'Password updated successfully.', false, 'admin-password-message');
  } catch (error) {
    setAdminProfileMessage(error.message || 'Unable to change your password.', true, 'admin-password-message');
  }
}

function initAdminLogsPage() {
  if (currentPage !== 'logs' || currentRole !== 'admin') return;
  loadAdminLogs();
}

async function loadAdminLogs() {
  const content = document.getElementById('admin-logs-content');
  if (!content) return;
  try {
    const params = new URLSearchParams({
      resource: 'activity_logs',
      search: ADMIN_LOGS_QUERY,
      page: String(ADMIN_LOGS_PAGE),
      limit: String(ADMIN_LOGS_PAGE_SIZE)
    });
    const response = await fetch(`${API_BASE}?${params.toString()}`, { cache: 'no-store' });
    const data = await response.json();
    if (!data.success) throw new Error(data.message || 'Unable to load activity logs.');
    renderAdminLogsPage(data.logs || [], Number(data.total) || 0);
  } catch (error) {
    content.innerHTML = '<div style="padding:24px 0;text-align:center;color:var(--text3)">Unable to load activity logs.</div>';
    console.warn('Unable to load activity logs:', error);
  }
}

function renderAdminLogsPage(rows = [], total = 0) {
  const content = document.getElementById('admin-logs-content');
  if (!content) return;
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_LOGS_PAGE_SIZE));
  if (ADMIN_LOGS_PAGE > totalPages) ADMIN_LOGS_PAGE = totalPages;
  const tbody = rows.length
    ? rows.map((row) => `
        <tr>
          <td>${escapeHtml(new Date(row.timestamp).toLocaleString('en-PH', { dateStyle: 'short', timeStyle: 'short' }))}</td>
          <td>${escapeHtml(row.user || 'System')}</td>
          <td>${escapeHtml(row.action || '')}</td>
          <td>${escapeHtml(row.description || '')}</td>
        </tr>`).join('')
    : '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text3)">No activity logs match your search.</td></tr>';

  content.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px">
      <input id="admin-logs-search" class="form-input" type="text" value="${escapeHtml(ADMIN_LOGS_QUERY)}" placeholder="Search by user, action, or description" style="max-width:320px">
      <div style="font-size:12px;color:var(--text3)">${total} log${total === 1 ? '' : 's'}</div>
    </div>
    <div style="overflow-x:auto">
      <table class="table" style="margin-bottom:0">
        <thead>
          <tr>
            <th>Date &amp; Time</th>
            <th>User</th>
            <th>Action</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:12px;flex-wrap:wrap">
      <div style="font-size:12px;color:var(--text3)">Page ${ADMIN_LOGS_PAGE} of ${totalPages}</div>
      <div class="flex gap-8">
        <button class="btn btn-outline btn-sm" onclick="changeAdminLogsPage(-1)" ${ADMIN_LOGS_PAGE <= 1 ? 'disabled' : ''}>Previous</button>
        <button class="btn btn-outline btn-sm" onclick="changeAdminLogsPage(1)" ${ADMIN_LOGS_PAGE >= totalPages ? 'disabled' : ''}>Next</button>
      </div>
    </div>`;
  const search = document.getElementById('admin-logs-search');
  if (search) {
    search.oninput = (event) => {
      ADMIN_LOGS_QUERY = event.target.value;
      ADMIN_LOGS_PAGE = 1;
      loadAdminLogs();
    };
  }
}

function changeAdminLogsPage(delta) {
  ADMIN_LOGS_PAGE = Math.max(1, ADMIN_LOGS_PAGE + delta);
  loadAdminLogs();
}

(() => {
  const adminModule = {
    dashboard: () => `
      <div class="breadcrumb">Admin Panel › Dashboard</div>
      <div style="margin-bottom:16px"><span class="tag tag-green">SY 2024–2025 • Active</span></div>
      <div class="stats-row cols4">
        <div class="stat-card blue"><div class="stat-icon">🎓</div><div class="stat-val">${DASHBOARD_STATS.total_students}</div><div class="stat-label">Total Students</div></div>
        <div class="stat-card green"><div class="stat-icon">🏢</div><div class="stat-val">${DASHBOARD_STATS.total_companies}</div><div class="stat-label">Companies</div></div>
        <div class="stat-card amber"><div class="stat-icon">👩‍💼</div><div class="stat-val">${DASHBOARD_STATS.total_coordinators}</div><div class="stat-label">Coordinators</div></div>
        <div class="stat-card teal"><div class="stat-icon">💼</div><div class="stat-val">${DASHBOARD_STATS.total_supervisors}</div><div class="stat-label">Supervisors</div></div>
      </div>
      <div class="stats-row cols4" style="margin-top:16px">
        <div class="stat-card blue"><div class="stat-icon">🤝</div><div class="stat-val">${DASHBOARD_STATS.ongoing_internships}</div><div class="stat-label">Ongoing Internships</div></div>
        <div class="stat-card amber"><div class="stat-icon">⏳</div><div class="stat-val">${DASHBOARD_STATS.pending_internships}</div><div class="stat-label">Pending Applications</div></div>
        <div class="stat-card green"><div class="stat-icon">✅</div><div class="stat-val">${DASHBOARD_STATS.completed_internships}</div><div class="stat-label">Completed Internships</div></div>
        <div class="stat-card teal"><div class="stat-icon">📚</div><div class="stat-val">${DASHBOARD_STATS.total_programs}</div><div class="stat-label">Programs</div></div>
      </div>
      <div class="two-col">
        <div class="card">
          <div class="card-header"><div class="card-title">Program Summary</div></div>
          <div class="card-body">
            ${PROGRAMS.map(p => `<div class="log-item">
              <div class="avatar av-gold" style="border-radius:8px">${p.code.slice(0, 2)}</div>
              <div><div class="user-cell-name">${p.code}</div><div class="user-cell-sub">Coord: ${p.coord}</div></div>
              <span class="tag tag-blue ml-auto">👥 ${p.students}</span>
            </div>`).join('')}
          </div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Recent Activities</div></div>
          <div class="card-body">
            ${[
              { event: 'New internship application received', time: '8:02 AM', icon: '📁' },
              { event: 'Student account updated', time: '9:15 AM', icon: '🎓' },
              { event: 'Coordinator assigned to program', time: '10:30 AM', icon: '👩‍💼' },
              { event: 'Company profile updated', time: '11:00 AM', icon: '🏢' },
              { event: 'Internship completion cleared', time: '1:45 PM', icon: '✅' }
            ].map(e => `<div class="log-item"><div class="log-icon in" style="width:32px;height:32px">${e.icon}</div><div><div style="font-size:13px">${e.event}</div><div style="font-size:11px;color:var(--text3)">${e.time}</div></div></div>`).join('')}
          </div>
        </div>
      </div>` ,

    academicyear: () => `
      <div class="breadcrumb">Admin Panel › Academic Year</div>
      <div style="margin-bottom:16px;display:flex;justify-content:flex-end"><button type="button" class="btn btn-primary" onclick="openSchoolYearModal()">+ New Academic Year</button></div>
      <div class="card">
        <table>
          <thead><tr><th>Academic Year</th><th>Semester</th><th>Start Date</th><th>End Date</th><th>Students</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            ${SCHOOL_YEARS.length ? SCHOOL_YEARS.map((r, i) => `<tr><td style="font-weight:700">${escapeHtml(r.year)}</td><td>${escapeHtml(r.semester)}</td><td style="font-size:12px">${escapeHtml(r.start)}</td><td style="font-size:12px">${escapeHtml(r.end)}</td><td>${Number(r.students) || 0}</td><td><span class="tag ${r.status === 'Active' ? 'tag-green' : 'tag-gray'}">${escapeHtml(r.status)}</span></td><td class="academic-year-actions"><div class="academic-year-action-group" role="group" aria-label="Actions"><button type="button" class="admin-user-action-btn admin-user-action-view" title="View" aria-label="View" onclick="viewSchoolYear(${i})"><i class="bi bi-eye-fill admin-user-action-icon"></i></button><button type="button" class="admin-user-action-btn admin-user-action-edit" title="Edit" aria-label="Edit" onclick="openSchoolYearModal(${i})"><i class="bi bi-pencil-fill admin-user-action-icon"></i></button><button type="button" class="admin-user-action-btn admin-user-action-deactivate" title="Delete" aria-label="Delete" onclick="deleteSchoolYear(${i})"><i class="bi bi-trash-fill admin-user-action-icon"></i></button></div></td></tr>`).join('') : '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text3)">No academic years found. Add the first school year to get started.</td></tr>'}
          </tbody>
        </table>
      </div>` ,

    programs: () => `
      <div class="breadcrumb">Admin Panel › Programs</div>
      <div style="margin-bottom:16px;display:flex;justify-content:flex-end"><button type="button" class="btn btn-primary" onclick="openProgramModal('add')">+ Add Program</button></div>
      <div class="two-col">
        ${PROGRAMS.map((p, i) => `<div class="card">
          <div class="card-body">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
              <div class="avatar av-blue" style="width:48px;height:48px;border-radius:10px;font-size:13px">${p.code.slice(0, 2)}</div>
              <div><div style="font-size:15px;font-weight:700">${p.code}</div><div style="font-size:11px;color:var(--text2);max-width:200px">${p.name}</div></div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
              <div style="background:var(--surface2);border-radius:8px;padding:10px"><div style="font-size:10px;color:var(--text3)">Required Hours</div><div style="font-size:16px;font-weight:700">${p.req}</div></div>
              <div style="background:var(--surface2);border-radius:8px;padding:10px"><div style="font-size:10px;color:var(--text3)">Students</div><div style="font-size:16px;font-weight:700">${p.students}</div></div>
            </div>
            <div style="font-size:12px;color:var(--text2)">👩‍💼 Coordinator: ${p.coord}</div>
            <div class="flex gap-8" style="margin-top:12px"><button type="button" class="btn btn-outline btn-sm" onclick="openProgramModal('edit', ${i})">Edit</button><button type="button" class="btn btn-teal btn-sm" onclick="viewProgramStudents(${i})">View Students</button></div>
          </div>
        </div>`).join('')}
      </div>` ,

    companies: () => {
      const pageSize = 8;
      const searchQuery = (window.__companySearch || '').trim();
      const totalPages = Math.max(1, Number(window.__companyTotalPages || 1));
      const currentPage = Math.min(Number(window.__companyPage || 1), totalPages);
      const startIndex = (currentPage - 1) * pageSize;
      const pageCompanies = Array.isArray(ADMIN_COMPANY_PAGE_RECORDS) ? ADMIN_COMPANY_PAGE_RECORDS : [];
      const requestKey = `${searchQuery}\u0000${currentPage}`;
      if (window.__companyLoadedKey !== requestKey && !window.__companyPageRequest) {
        loadAdminCompanyPage(currentPage, searchQuery);
      }

      return `
        <div class="breadcrumb">Admin Panel › Companies</div>
        <div style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
          <input id="company-search-input" class="form-input" type="text" value="${escapeHtml(window.__companySearch || '')}" placeholder="Search Company" style="max-width:280px;">
          <button type="button" class="btn btn-primary" onclick="openNewCompanyModal()">+ Add Company</button>
        </div>
        <div class="card">
          <table>
            <thead><tr><th>#</th><th>Company Name</th><th>Address</th><th>Contact Person</th><th>Contact Number</th><th>Email</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody data-company-results>${getAdminCompanyRowsMarkup(pageCompanies, startIndex)}</tbody>
          </table>
        </div>
        <div data-company-pagination style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:12px;flex-wrap:wrap">
          ${getAdminCompanyPaginationMarkup(currentPage, totalPages)}
        </div>
      `;
    },

    students: () => `
      <div class="breadcrumb">Admin Panel › Students</div>
      <div style="margin-bottom:16px;display:flex;justify-content:flex-end"><button type="button" class="btn btn-primary" onclick="openStudentModal('add')">+ Add Student</button></div>
      <div class="card">
        <table>
          <thead><tr><th>Student</th><th>Program</th><th>Year Level</th><th>Email</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            ${ADMIN_STUDENTS.map((s, i) => `<tr>
              <td><div class="user-cell"><div class="avatar av-blue">${s.name.split(' ').slice(-1)[0].slice(0, 2).toUpperCase()}</div><div><div class="user-cell-name">${s.name}</div><div class="user-cell-sub">${s.studentId}</div></div></div></td>
              <td><span class="tag tag-blue">${s.program}</span></td>
              <td>${s.yearLevel}</td>
              <td style="font-size:12px;color:var(--text2)">${s.email}</td>
              <td><span class="tag ${s.status === 'Active' ? 'tag-green' : 'tag-gray'}">${s.status}</span></td>
              <td><div class="flex gap-8"><button type="button" class="btn btn-outline btn-sm" onclick="openStudentModal('edit', ${i})">Edit</button><button type="button" class="btn btn-outline btn-sm" onclick="deleteStudent(${i})">Delete</button></div></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>` ,

    coordinators: () => `
      <div class="breadcrumb">Admin Panel › Coordinators</div>
      <div style="margin-bottom:16px;display:flex;justify-content:flex-end"><button class="btn btn-primary" onclick="openCoordinatorModal('add')">+ Add Coordinator</button></div>
      <div class="card">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Program</th><th>Students</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            ${COORDINATORS.map((c, i) => `<tr>
              <td><div class="user-cell"><div class="avatar av-blue">${c.name.split(' ').filter((_, idx) => idx > 0).map(n => n[0]).join('').slice(0, 2)}</div><div class="user-cell-name">${c.name}</div></div></td>
              <td style="font-size:12px;color:var(--text2)">${c.email}</td>
              <td><span class="tag tag-blue">${c.prog}</span></td>
              <td>${c.students}</td>
              <td><span class="tag ${c.status === 'Active' ? 'tag-green' : 'tag-gray'}">${c.status}</span></td>
              <td><div class="flex gap-8"><button class="btn btn-outline btn-sm" onclick="openCoordinatorModal('edit', ${i})">Edit</button><button class="btn btn-danger btn-sm" onclick="removeCoordinator(${i})">Deactivate</button></div></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>` ,

    supervisors: () => `
      <div class="breadcrumb">Admin Panel › Supervisors</div>
      <div style="margin-bottom:16px;display:flex;justify-content:flex-end"><button class="btn btn-primary" onclick="openSupervisorModal('add')">+ Add Supervisor</button></div>
      <div class="card">
        <table>
          <thead><tr><th>Name</th><th>Company</th><th>Email</th><th>Contact</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            ${SUPERVISORS.map((s, i) => `<tr>
              <td><div class="user-cell"><div class="avatar av-teal">${s.name.split(' ').slice(-1)[0].slice(0, 2).toUpperCase()}</div><div class="user-cell-name">${s.name}</div></div></td>
              <td>${s.company}</td>
              <td style="font-size:12px;color:var(--text2)">${s.email}</td>
              <td style="font-size:12px">${s.contact}</td>
              <td><span class="tag ${s.status === 'Active' ? 'tag-green' : 'tag-gray'}">${s.status}</span></td>
              <td><div class="flex gap-8"><button class="btn btn-outline btn-sm" onclick="openSupervisorModal('edit', ${i})">Edit</button><button class="btn btn-outline btn-sm" onclick="deleteSupervisor(${i})">Delete</button></div></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>` ,

    users: () => `
      <div class="breadcrumb">Admin Panel › User Management</div>
      <div class="card">
        <div class="card-body">
          <div id="admin-user-mgmt-alert"></div>
          <div id="admin-user-mgmt-tab-content">
            <div style="padding:24px 0; color:var(--text3);">Loading user management...</div>
          </div>
        </div>
      </div>` ,

    internships: () => `
      <div class="breadcrumb">Admin Panel › Internship Management</div>
      <div style="margin-bottom:16px;display:flex;justify-content:flex-end"><button class="btn btn-primary" onclick="openInternshipModal('add')">+ Assign Internship</button></div>
      <div class="card">
        <table>
          <thead><tr><th>Student</th><th>Company</th><th>Supervisor</th><th>Coordinator</th><th>Status</th><th>Requirements</th><th>Actions</th></tr></thead>
          <tbody>
            ${INTERNSHIPS.map((i, idx) => `<tr>
              <td style="font-weight:600">${i.studentName}</td>
              <td>${i.company}</td>
              <td>${i.supervisor || 'Unassigned'}</td>
              <td>${i.coordinator || 'Unassigned'}</td>
              <td><span class="tag ${i.status === 'Completed' ? 'tag-green' : i.status === 'Ongoing' ? 'tag-blue' : i.status === 'Approved' ? 'tag-teal' : 'tag-amber'}">${i.status}</span></td>
              <td style="font-size:12px">${Object.entries(i.requirements).filter(([, value]) => value).map(([name]) => name).join(', ') || 'None'}</td>
              <td><div class="flex gap-8"><button class="btn btn-outline btn-sm" onclick="openInternshipModal('edit', ${idx})">Edit</button><button class="btn btn-outline btn-sm" onclick="toggleInternshipRequirement(${idx}, 'Clearance')">Update</button></div></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>` ,

    reports: () => `
      <div class="breadcrumb">Admin Panel › Reports</div>
      <div style="margin-bottom:16px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px"><div></div><div class="flex gap-8"><button class="btn btn-outline" onclick="exportAdminInternshipReport()">📊 Export Excel</button><button class="btn btn-outline" onclick="printAdminInternshipReport()">🖨️ Print Report</button></div></div>
      <div class="card mb-24">
        <div class="card-header"><div class="card-title">Filter Reports</div></div>
        <div class="card-body">
          <div class="two-col reports-filter-grid" style="gap:12px">
            <div class="form-row"><label class="form-label">Academic Year</label><select id="reports-academic-year" class="form-select"><option>All Years</option>${SCHOOL_YEARS.map(y => `<option>${y.year}</option>`).join('')}</select></div>
            <div class="form-row"><label class="form-label">Program</label><select id="reports-program" class="form-select"><option>All Programs</option>${PROGRAMS.map(p => `<option>${p.code}</option>`).join('')}</select></div>
            <div class="form-row"><label class="form-label">Company</label><select id="reports-company" class="form-select"><option>All Companies</option>${ADMIN_COMPANIES.map(c => `<option>${c.name}</option>`).join('')}</select></div>
            <div class="form-row"><label class="form-label">Coordinator</label><select id="reports-coordinator" class="form-select"><option>All Coordinators</option>${COORDINATORS.map(c => `<option>${c.name}</option>`).join('')}</select></div>
            <div class="form-row"><label class="form-label">Supervisor</label><select id="reports-supervisor" class="form-select"><option>All Supervisors</option>${SUPERVISORS.map(s => `<option>${s.name}</option>`).join('')}</select></div>
            <div class="form-row"><label class="form-label">Internship Status</label><select id="reports-status" class="form-select"><option value="All" selected>All</option><option value="Pending">Pending</option><option value="Ongoing">Ongoing</option><option value="Completed">Completed</option></select></div>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">Detailed Internship Report</div></div>
        <div class="card-body" id="reports-content-area"></div>
      </div>` ,

    logs: () => `
      <div class="breadcrumb">Admin Panel › Logs</div>
      <div class="card">
        <div class="card-header"><div class="card-title">Activity Logs</div></div>
        <div class="card-body" id="admin-logs-content"></div>
      </div>` ,

    backup: () => `
      <div class="breadcrumb">Admin Panel › Backup & Security</div>
      <div style="margin-bottom:16px"></div>
      <div class="two-col">
        <div class="card">
          <div class="card-header"><div class="card-title">Database Backup</div></div>
          <div class="card-body">
            <div class="form-row"><label class="form-label">Last Backup</label><div class="form-text">Apr 29, 2026 — 11:30 PM</div></div>
            <div class="form-row"><label class="form-label">Backup Size</label><div class="form-text">245 MB</div></div>
            <div class="form-row"><label class="form-label">Auto Backup Status</label><div class="form-text"><span class="tag tag-green">Enabled (Daily at 2 AM)</span></div></div>
            <button class="btn btn-primary" onclick="createBackup()">⬇️ Create Backup Now</button>
            <button class="btn btn-outline" onclick="restoreBackup()">⬆️ Restore from Backup</button>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Security Monitoring</div></div>
          <div class="card-body">
            <div class="form-row"><label class="form-label">Failed Login Attempts (24h)</label><div class="form-text">3</div></div>
            <div class="form-row"><label class="form-label">Active Sessions</label><div class="form-text">7 users</div></div>
            <div class="form-row"><label class="form-label">SSL Certificate</label><div class="form-text"><span class="tag tag-green">Valid until Dec 2026</span></div></div>
            <button class="btn btn-outline" onclick="viewSecurityLogs()">View Security Logs</button>
            <button class="btn btn-outline" onclick="testSystem()">Test System</button>
          </div>
        </div>
      </div>` ,

    profile: () => `
      <div class="breadcrumb">Admin Panel › Profile</div>
      <div style="margin-bottom:16px"></div>
      <div class="two-col">
        <div class="card">
          <div class="card-header"><div class="card-title">Account Information</div></div>
          <div class="card-body">
            <div class="form-row"><label class="form-label" for="admin-profile-name">Name</label><input class="form-input" id="admin-profile-name" type="text" maxlength="120" value="${escapeHtml(currentUser.name || '')}" required></div>
            <div class="form-row"><label class="form-label" for="admin-profile-email">Email</label><input class="form-input" id="admin-profile-email" type="email" maxlength="160" value="${escapeHtml(currentUser.email || '')}" required></div>
            <div class="form-row"><label class="form-label">Role</label><input class="form-input" type="text" value="Administrator" disabled></div>
            <button class="btn btn-primary" type="button" onclick="saveAdminProfile()">Update Profile</button>
            <div id="admin-profile-message" role="status" aria-live="polite" style="margin-top:12px"></div>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Security</div></div>
          <div class="card-body">
            <div class="form-row"><label class="form-label" for="admin-current-password">Current Password</label><input class="form-input" id="admin-current-password" type="password" autocomplete="current-password"></div>
            <div class="form-row"><label class="form-label" for="admin-new-password">New Password</label><input class="form-input" id="admin-new-password" type="password" autocomplete="new-password" minlength="8"></div>
            <div class="form-row"><label class="form-label" for="admin-confirm-password">Confirm Password</label><input class="form-input" id="admin-confirm-password" type="password" autocomplete="new-password" minlength="8"></div>
            <button class="btn btn-primary" type="button" onclick="saveAdminPassword()">Save Password</button>
            <div id="admin-password-message" role="status" aria-live="polite" style="margin-top:12px"></div>
          </div>
        </div>
      </div>` ,

    notifications: () => `
      <div class="breadcrumb">Admin Panel › Notifications</div>
      <div style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px"><div></div><div style="display:flex;gap:10px;align-items:center"><button type="button" class="btn btn-outline" onclick="markAllAsRead()">Mark All as Read</button><button type="button" class="btn btn-outline btn-sm" onclick="deleteAllNotifications()">Delete All</button></div></div>
      <div class="card">
        ${notifications.length === 0 ? '<div style="text-align:center;padding:40px;color:var(--text3);font-size:13px">No notifications</div>' : notifications.map((n, index) => `
          <div class="log-item ${n.unread ? 'unread' : ''}" onclick="markAsRead(${index})">
            <div class="avatar av-${n.type === 'success' ? 'green' : n.type === 'error' ? 'red' : 'blue'}">${n.message.charAt(0).toUpperCase()}</div>
            <div style="flex:1">
              <div style="font-size:13px;font-weight:600">${n.message}</div>
              <div style="font-size:11px;color:var(--text3)">${new Date(n.timestamp).toLocaleString()}</div>
            </div>
            ${n.unread ? '<div class="notif-dot"></div>' : ''}
          </div>
        `).join('')}
      </div>`
  };
  // Merge with any existing admin renderers without overwriting other keys
  if (typeof PAGE_RENDERERS === 'undefined') PAGE_RENDERERS = { common: {} };
  PAGE_RENDERERS.admin = Object.assign({}, PAGE_RENDERERS.admin || {}, adminModule);
})();
