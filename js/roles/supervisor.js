let SUPERVISOR_LIVE_STUDENTS = [];
let SUPERVISOR_STUDENTS_LOADED = false;
let SUPERVISOR_STUDENTS_USER_ID = null;
let SUPERVISOR_LIVE_ATTENDANCE = [];
let SUPERVISOR_ATTENDANCE_LOADED = false;
let SUPERVISOR_ATTENDANCE_USER_ID = null;
let SUPERVISOR_ATTENDANCE_DATE_FILTER = '';
let SUPERVISOR_ATTENDANCE_STUDENT_FILTER = '';
let SUPERVISOR_PROFILE = null;
let SUPERVISOR_PROFILE_LOADED = false;
let SUPERVISOR_PROFILE_USER_ID = null;
let SUPERVISOR_LIVE_SUBMISSIONS = false;
let SUPERVISOR_SUBMISSIONS_USER_ID = null;

function getSupervisorAttendanceDateOptions() {
  const dates = Array.from(new Set((Array.isArray(SUPERVISOR_LIVE_ATTENDANCE) ? SUPERVISOR_LIVE_ATTENDANCE : []).map(item => item.log_date || item.date || '').filter(Boolean))).sort((a, b) => String(b).localeCompare(String(a)));
  return dates;
}

function getSupervisorAttendanceDurationSeconds(startValue, endValue) {
  if (!startValue || !endValue) return 0;
  const startMs = new Date(String(startValue).replace(' ', 'T')).getTime();
  const endMs = new Date(String(endValue).replace(' ', 'T')).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return 0;
  const seconds = Math.max(0, Math.round((endMs - startMs) / 1000));
  return seconds;
}

function normalizeSupervisorAttendanceRows(rows) {
  const grouped = new Map();

  (Array.isArray(rows) ? rows : []).forEach(row => {
    const key = `${row.student_id ?? row.studentId ?? row.student_name ?? 'unknown'}|${row.log_date ?? row.date ?? ''}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        id: row.id || null,
        student_id: row.student_id ?? row.studentId ?? null,
        student_name: row.student_name || row.studentName || 'Unknown Student',
        log_date: row.log_date || row.date || '',
        date: row.log_date || row.date || '',
        time_in: row.time_in || '',
        time_out: row.time_out || '',
        afternoon_time_in: row.afternoon_time_in || '',
        afternoon_time_out: row.afternoon_time_out || '',
        verification_status: row.verification_status || 'Pending',
        time_in_location_status: row.time_in_location_status || 'Pending',
        time_out_location_status: row.time_out_location_status || 'Pending',
        afternoon_time_in_location_status: row.afternoon_time_in_location_status || 'Pending',
        afternoon_time_out_location_status: row.afternoon_time_out_location_status || 'Pending',
        time_out_verification_status: row.time_out_verification_status || row.verification_status || 'Pending',
        afternoon_time_in_verification_status: row.afternoon_time_in_verification_status || 'Pending',
        afternoon_time_out_verification_status: row.afternoon_time_out_verification_status || 'Pending',
        status: row.status || 'Pending',
        morning_seconds: 0,
        afternoon_seconds: 0,
        total_seconds: 0,
      });
    }

    const target = grouped.get(key);
    const fieldPairs = [
      ['time_in', row.time_in],
      ['time_out', row.time_out],
      ['afternoon_time_in', row.afternoon_time_in],
      ['afternoon_time_out', row.afternoon_time_out],
      ['verification_status', row.verification_status],
      ['time_out_verification_status', row.time_out_verification_status],
      ['afternoon_time_in_verification_status', row.afternoon_time_in_verification_status],
      ['afternoon_time_out_verification_status', row.afternoon_time_out_verification_status],
      ['time_in_location_status', row.time_in_location_status],
      ['time_out_location_status', row.time_out_location_status],
      ['afternoon_time_in_location_status', row.afternoon_time_in_location_status],
      ['afternoon_time_out_location_status', row.afternoon_time_out_location_status],
      ['status', row.status],
      ['student_name', row.student_name || row.studentName || 'Unknown Student'],
    ];

    fieldPairs.forEach(([field, value]) => {
      if (value === null || value === undefined || value === '') return;
      if (!target[field] || Number(row.id || 0) >= Number(target.id || 0)) {
        target[field] = value;
      }
    });

    if (!target.id || Number(row.id || 0) >= Number(target.id || 0)) {
      target.id = row.id || target.id;
    }
  });

  return Array.from(grouped.values()).map(item => {
    const morningSeconds = getSupervisorAttendanceDurationSeconds(item.time_in, item.time_out);
    const afternoonSeconds = getSupervisorAttendanceDurationSeconds(item.afternoon_time_in, item.afternoon_time_out);
    const totalSeconds = morningSeconds + afternoonSeconds;
    item.morning_seconds = morningSeconds;
    item.afternoon_seconds = afternoonSeconds;
    item.total_seconds = totalSeconds;
    item.total_minutes = Math.round(totalSeconds / 60);
    item.status = item.status || (totalSeconds > 0 ? 'Present' : 'Absent');
    item.log_date = item.log_date || item.date || '';
    return item;
  });
}

function getSupervisorFilteredAttendance() {
  const rows = Array.isArray(SUPERVISOR_LIVE_ATTENDANCE) ? SUPERVISOR_LIVE_ATTENDANCE : [];
  return rows.filter(item => {
    const date = item.log_date || item.date || '';
    const name = item.student_name || '';
    const matchesDate = !SUPERVISOR_ATTENDANCE_DATE_FILTER || date === SUPERVISOR_ATTENDANCE_DATE_FILTER;
    const matchesStudent = !SUPERVISOR_ATTENDANCE_STUDENT_FILTER || name === SUPERVISOR_ATTENDANCE_STUDENT_FILTER;
    return matchesDate && matchesStudent;
  });
}

function formatSupervisorAttendanceHours(seconds) {
  if (seconds === null || seconds === undefined || seconds === '' || Number(seconds) <= 0) {
    return '—';
  }
  const totalHours = Number(seconds) / 3600;
  return `${totalHours.toFixed(2)} hrs`;
}

function getSupervisorAttendanceSummaryRows() {
  return getSupervisorFilteredAttendance();
}

function buildSupervisorAttendanceTableRow(item) {
  return `<tr>
    <td style="font-weight:600">${escapeHtml(item.student_name || 'Unknown Student')}</td>
    <td style="font-family:'DM Mono',monospace;font-size:11px">${renderSupervisorAttendanceEvent(item,'time_in')}</td>
    <td style="font-family:'DM Mono',monospace;font-size:11px">${renderSupervisorAttendanceEvent(item,'time_out')}</td>
    <td style="font-family:'DM Mono',monospace;font-size:11px">${renderSupervisorAttendanceEvent(item,'afternoon_time_in')}</td>
    <td style="font-family:'DM Mono',monospace;font-size:11px">${renderSupervisorAttendanceEvent(item,'afternoon_time_out')}</td>
    <td>${formatSupervisorAttendanceHours(item.total_seconds || 0)}</td>
    <td><span class="tag ${item.status === 'Present' ? 'tag-green' : item.status === 'Absent' ? 'tag-red' : 'tag-amber'}">${escapeHtml(item.status || 'Pending')}</span></td>
  </tr>`;
}

function renderSupervisorAttendanceEvent(item, timeField) {
  if (!item[timeField]) return '—';
  return escapeHtml(formatAttendanceTime(item[timeField]));
}

function getSupervisorVisibleSubmissions() {
  return SUPERVISOR_LIVE_SUBMISSIONS ? SUBMISSIONS.filter(submission => submission.id) : [];
}

function getSupervisorVisibleTasks() {
  return SUPERVISOR_TASKS;
}

function getSupervisorPendingTaskCount() {
  return SUPERVISOR_TASKS.filter(task => task.status !== 'Completed').length;
}

async function loadSupervisorTasks() {
  const apiBase = typeof API_BASE !== 'undefined' ? API_BASE : '../php/api.php';
  try {
    const response = await fetch(`${apiBase}?resource=tasks&_=${Date.now()}`, { cache: 'no-store' });
    const data = await response.json();
    if (!data.success || !Array.isArray(data.tasks)) throw new Error(data.message || 'Unable to load tasks.');
    SUPERVISOR_TASKS.length = 0;
    data.tasks.forEach(task => SUPERVISOR_TASKS.push({
      id: Number(task.id) || 0,
      task: task.title || '',
      description: task.description || '',
      studentId: Number(task.student_id) || 0,
      assignee: task.assignee_type === 'all' ? 'All Interns' : task.student_name || '',
      due: task.due_date || '',
      sub: `${Number(task.submission_count) || 0}/${Number(task.submission_count) || 0}`,
      status: ['Pending', 'Ongoing', 'Completed', 'Rejected / Needs Revision'].includes(task.status) ? task.status : 'Pending'
    }));
  } catch (error) {
    SUPERVISOR_TASKS.length = 0;
    console.warn('Unable to load supervisor tasks:', error);
  }
}

async function loadSupervisorProfile() {
  const apiBase = typeof API_BASE !== 'undefined' ? API_BASE : '../php/api.php';
  try {
    const response = await fetch(`${apiBase}?resource=profile`);
    const data = await response.json();
    if (!data.success || !data.profile) throw new Error(data.message || 'Unable to load profile.');
    SUPERVISOR_PROFILE = data.profile;
    SUPERVISOR_PROFILE_LOADED = true;
    SUPERVISOR_PROFILE_USER_ID = currentUser?.id || null;
    if (currentRole === 'supervisor' && currentPage === 'profile') navigateTo('profile');
  } catch (error) {
    console.warn('Unable to load supervisor profile:', error);
  }
}

async function loadSupervisorStudents() {
  const apiBase = typeof API_BASE !== 'undefined' ? API_BASE : '../php/api.php';
  try {
    const response = await fetch(`${apiBase}?resource=assignments`);
    const data = await response.json();
    if (!data.success || !Array.isArray(data.assignments)) throw new Error(data.message || 'Unable to load students.');
    SUPERVISOR_LIVE_STUDENTS = data.assignments;
    SUPERVISOR_STUDENTS_LOADED = true;
    SUPERVISOR_STUDENTS_USER_ID = currentUser?.id || null;
    if (currentRole === 'supervisor' && ['dashboard', 'interns', 'tasks', 'submissions'].includes(currentPage)) navigateTo(currentPage);
  } catch (error) {
    console.warn('Unable to load supervisor students:', error);
  }
}

async function loadSupervisorAttendance() {
  const apiBase = typeof API_BASE !== 'undefined' ? API_BASE : '../php/api.php';
  try {
    const response = await fetch(`${apiBase}?resource=attendance`);
    const data = await response.json();
    if (!data.success || !Array.isArray(data.attendance)) throw new Error(data.message || 'Unable to load attendance.');
    SUPERVISOR_LIVE_ATTENDANCE = normalizeSupervisorAttendanceRows(data.attendance);
    if (!SUPERVISOR_ATTENDANCE_DATE_FILTER) {
      const dates = getSupervisorAttendanceDateOptions();
      SUPERVISOR_ATTENDANCE_DATE_FILTER = dates[0] || '';
    }
    SUPERVISOR_ATTENDANCE_LOADED = true;
    SUPERVISOR_ATTENDANCE_USER_ID = currentUser?.id || null;
    if (currentRole === 'supervisor' && currentPage === 'attendance') navigateTo('attendance');
  } catch (error) {
    console.warn('Unable to load supervisor attendance:', error);
  }
}

async function loadSupervisorSubmissions() {
  const apiBase = typeof API_BASE !== 'undefined' ? API_BASE : '../php/api.php';
  try {
    const response = await fetch(`${apiBase}?resource=submissions`);
    const data = await response.json();
    if (!data.success || !Array.isArray(data.submissions)) throw new Error(data.message || 'Unable to load submissions.');
    SUBMISSIONS.length = 0;
    data.submissions.forEach(item => SUBMISSIONS.push({
      id: item.id,
      taskId: Number(item.task_id) || 0,
      studentId: Number(item.student_id) || 0,
      student: item.student_name || '',
      name: item.file_name || 'Submitted file',
      task: item.task_title || '',
      date: item.submitted_at || '',
      dueDate: item.due_date || '',
      isLate: Boolean(Number(item.is_late)),
      status: item.status || 'For Review',
      file_path: item.file_path || '',
      tag: item.status === 'Approved' ? 'tag-green' : item.status === 'Rejected' ? 'tag-red' : 'tag-amber'
    }));
    SUPERVISOR_LIVE_SUBMISSIONS = true;
    SUPERVISOR_SUBMISSIONS_USER_ID = currentUser?.id || null;
    if (currentRole === 'supervisor' && ['dashboard', 'submissions'].includes(currentPage)) navigateTo(currentPage);
    if (currentRole === 'supervisor' && currentPage === 'submissions') {
      setTimeout(applySupervisorSubmissionNotificationTarget, 150);
    }
  } catch (error) {
    console.warn('Unable to load supervisor submissions:', error);
  }
}

PAGE_RENDERERS.supervisor =  {
    dashboard: () => `
      <div class="breadcrumb">Supervisor Portal › Dashboard</div>
      <div class="section-head"><span class="tag tag-green">${ROLES.supervisor.label}</span></div>
      <div class="stats-row cols4">
        <div class="stat-card blue"><div class="stat-icon">👥</div><div class="stat-val">${SUPERVISOR_LIVE_STUDENTS.length}</div><div class="stat-label">Total Interns</div></div>
        <div class="stat-card green"><div class="stat-icon">✅</div><div class="stat-val">${SUPERVISOR_LIVE_ATTENDANCE.filter(item => item.status === 'Present').length}</div><div class="stat-label">Present Today</div></div>
        <div class="stat-card amber"><div class="stat-icon">📋</div><div class="stat-val">${getSupervisorPendingTaskCount()}</div><div class="stat-label">Pending Tasks</div></div>
        <div class="stat-card teal"><div class="stat-icon">📁</div><div class="stat-val">${getSupervisorVisibleSubmissions().length}</div><div class="stat-label">Submissions</div><div class="stat-trend amber">${getSupervisorVisibleSubmissions().filter(s => s.status === 'For Review').length} for review</div></div>
      </div>
      <div class="two-col">
        <div class="card">
          <div class="card-header"><div class="card-title">Recent Submissions</div><span class="tag tag-amber">${getSupervisorVisibleSubmissions().filter(s => s.status === 'For Review').length} Pending</span></div>
          <div class="card-body">
            ${getSupervisorVisibleSubmissions().length ? getSupervisorVisibleSubmissions().slice(0, 3).map(s=>`<div class="log-item">
              <div class="avatar av-blue">${escapeHtml((s.student || '').split(' ').map(n=>n[0]).join(''))}</div>
              <div><div class="user-cell-name">${escapeHtml(s.student || '')}</div><div class="user-cell-sub">📄 ${escapeHtml(s.name || '')}</div></div>
              <div style="margin-left:auto;text-align:right">
                <div style="font-size:11px;color:var(--text3)">${escapeHtml(s.date || '')}</div>
                <button type="button" class="btn btn-outline btn-sm" style="margin-top:4px" onclick="reviewSupervisorSubmission(${Number(s.id) || 0})">Review</button>
              </div>
            </div>`).join('') : '<div style="padding:24px 0;text-align:center;color:var(--text3)">No submissions because no students are assigned to your company yet.</div>'}
          </div>
        </div>
      </div>`,

    interns: () => `
      <div class="breadcrumb">Supervisor Portal › Student List</div>
      <div class="section-head"></div>
      <div class="card">
        <table>
          <thead><tr><th>Student</th><th>Program</th><th>Hours</th><th>Tasks Done</th><th>Actions</th></tr></thead>
          <tbody>${SUPERVISOR_LIVE_STUDENTS.length ? SUPERVISOR_LIVE_STUDENTS.map(s=>{
            const initials = (s.student_name || '').split(' ').map(n=>n[0]).join('').slice(0, 2);
            const hours = Number(s.hours_completed) || 0;
            const required = Number(s.hours_required) || 500;
            const performance = Math.min(100, Math.round((hours / Math.max(required, 1)) * 100));
            return `<tr>
              <td><div class="user-cell"><div class="avatar av-teal">${escapeHtml(initials)}</div><div class="user-cell-name">${escapeHtml(s.student_name || '')}</div></div></td>
              <td><span class="tag tag-blue">${escapeHtml(s.program || 'Unassigned')}</span></td>
              <td><span style="font-family:'DM Mono',monospace;font-size:12px">${hours}/${required} hrs</span></td>
              <td><span class="tag tag-teal">${escapeHtml(s.internship_status || 'Pending')}</span></td>
              <td><button class="btn btn-outline btn-sm" type="button" onclick="viewSupervisorStudent(${SUPERVISOR_LIVE_STUDENTS.indexOf(s)})">View</button></td>
            </tr>`;
          }).join('') : '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text3)">No students assigned to your company.</td></tr>'}</tbody>
        </table>
      </div>`,

    tasks: () => `
      <div class="breadcrumb">Supervisor Portal › Task Management</div>
      <div class="section-head"><button type="button" class="btn btn-primary" data-action="openAssignTaskModal" data-mode="add" onclick="openAssignTaskModal('add')">+ Assign Task</button></div>
      <div class="card mb-24">
        <div class="card-header"><div class="card-title">Current Tasks</div></div>
        <table>
          <thead><tr><th>Task</th><th>Assigned To</th><th>Due</th><th>Submissions</th><th>Status</th><th></th></tr></thead>
          <tbody>${SUPERVISOR_LIVE_STUDENTS.length && getSupervisorVisibleTasks().length ? getSupervisorVisibleTasks().map(t=>{ const i = SUPERVISOR_TASKS.indexOf(t); const tagClass = t.status === 'Completed' ? 'tag-green' : t.status === 'Ongoing' ? 'tag-teal' : 'tag-amber'; return `<tr><td style="font-weight:600">${escapeHtml(t.task)}</td><td style="font-size:12px">${escapeHtml(t.assignee)}</td><td><span class="tag tag-blue">${escapeHtml(t.due || 'No due date')}</span></td><td style="font-family:'DM Mono',monospace;font-size:12px">${escapeHtml(t.sub)}</td><td><span class="tag ${tagClass}">${escapeHtml(t.status)}</span></td><td><button type="button" class="btn btn-outline btn-sm" data-action="openAssignTaskModal" data-mode="edit" data-index="${i}" onclick="openAssignTaskModal('edit', ${i})">Edit</button></td></tr>`; }).join('') : '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text3)">No tasks assigned to students in your company.</td></tr>'}</tbody>
        </table>
      </div>`,

    submissions: () => `
      <div class="breadcrumb">Supervisor Portal › Submission Review</div>
      <div class="section-head"><span class="tag tag-amber">${getSupervisorVisibleSubmissions().filter(s => s.status === 'For Review').length} For Review</span></div>
      <div class="card mb-24">
        <div class="card-header"><div class="card-title">Pending Submissions</div></div>
        <table>
          <thead><tr><th>Student</th><th>File</th><th>Task</th><th>Due Date</th><th>Submitted</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>${getSupervisorVisibleSubmissions().length ? getSupervisorVisibleSubmissions().map((s, i)=>`<tr data-submission-id="${Number(s.id) || 0}">
              <td><div class="user-cell"><div class="avatar av-blue">${escapeHtml(s.student || '').split(' ').map(n=>n[0]).join('')}</div><div class="user-cell-name">${escapeHtml(s.student)}</div></div></td>
              <td style="font-size:12px">📄 ${escapeHtml(s.name)}</td>
              <td style="font-size:12px">${escapeHtml(s.task)}</td>
              <td style="font-size:12px">${escapeHtml(s.dueDate || 'No due date')}</td>
              <td style="font-size:12px">${escapeHtml(s.date)}</td>
              <td><span class="tag ${s.status==='Approved'?'tag-green':s.status==='Rejected'?'tag-red':'tag-amber'}">${s.isLate && s.status === 'For Review' ? 'LATE / ' : ''}${escapeHtml(s.status)}</span></td>
              <td><div class="flex gap-8" style="flex-wrap:wrap">
                ${s.status==='For Review'?`
                  <button type="button" class="btn btn-teal btn-sm" onclick="approveSubmission(${Number(s.id) || 0})">✓ Approve</button>
                  <button type="button" class="btn btn-danger btn-sm" onclick="rejectSubmission(${Number(s.id) || 0})">✗ Reject</button>
                ` : ''}
                <button type="button" class="btn btn-outline btn-sm" onclick="viewSubmissionFile(${Number(s.id) || 0})">View File</button>
              </div></td>
            </tr>`).join('') : '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text3)">No submitted files are available for your company.</td></tr>'}</tbody>
        </table>
      </div>`,

    evaluation: () => `
      <div class="breadcrumb">Supervisor Portal › Performance Monitoring</div>
      <div class="section-head"></div>
      <div class="card mb-24">
        <div class="card-header"><div class="card-title">Quick Performance Summary</div></div>
        <div class="card-body">
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:20px">
            ${[
              {name:'Juan dela Cruz',prog:62,status:'Average'},
              {name:'Paolo Mendoza',prog:92,status:'Good'},
              {name:'Lisa Ocampo',prog:54,status:'Needs Improvement'},
              {name:'Ryan Torres',prog:78,status:'Good'},
            ].map(s=>`<div style="padding:16px;border-radius:12px;border:1px solid var(--border)">
              <div style="font-weight:600;font-size:13px;margin-bottom:8px">${s.name}</div>
              <div class="progress-bar-outer" style="margin-bottom:8px"><div class="progress-bar-inner" style="width:${s.prog}%;background:${s.prog>=80?'var(--green)':s.prog>=60?'var(--gold)':'var(--red)'}"></div></div>
              <div style="display:flex;align-items:center;justify-content:space-between;font-size:12px">
                <span style="color:var(--text3)">${s.prog}% Complete</span>
                <span class="tag ${s.status==='Good'?'tag-green':s.status==='Average'?'tag-amber':'tag-red'}">${s.status}</span>
              </div>
            </div>`).join('')}
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">Detailed Evaluation</div></div>
        <div class="card-body">
          <div class="form-row"><label class="form-label">Select Intern for Detailed Evaluation</label><select class="form-select"><option>Juan dela Cruz</option><option>Paolo Mendoza</option><option>Lisa Ocampo</option><option>Ryan Torres</option></select></div>
          <div style="border-top:1px solid var(--border);padding-top:16px;margin-top:16px">
            ${['Technical Skills','Communication','Teamwork & Collaboration','Work Ethics & Professionalism','Problem Solving','Initiative & Creativity'].map((sk,i)=>`<div style="margin-bottom:20px"><div class="form-label" style="margin-bottom:10px">${sk}</div><div class="flex gap-6">${[1,2,3,4,5].map(n=>`<button class="btn btn-outline btn-sm" style="padding:8px 12px;${n<=4?'background:var(--navy);color:#fff;border-color:var(--navy);':''}">${'⭐'.repeat(n)}</button>`).join('')}</div></div>`).join('')}
            <div class="form-row"><label class="form-label">Comments / Remarks</label><textarea class="form-input" rows="4" placeholder="Write your evaluation remarks here…"></textarea></div>
            <button class="btn btn-primary" onclick="submitStudentEvaluation()">Submit Evaluation</button>
          </div>
        </div>
      </div>`,

    attendance: () => `
      <div class="breadcrumb">Supervisor Portal › Attendance View</div>
      <div class="section-head"><button class="btn btn-outline" onclick="exportAttendanceLog()">📥 Export Log</button></div>
      <div class="card mb-24">
        <div class="card-header"><div class="card-title">Attendance Filters</div></div>
        <div class="card-body">
          <div class="attendance-filter">
            <div style="display:flex;gap:8px;align-items:center;flex:1">
              <label style="font-size:12px;color:var(--text3);font-weight:600">Filter by Date:</label>
              <input type="date" class="form-input" style="width:auto;font-size:12px" value="${escapeHtml(SUPERVISOR_ATTENDANCE_DATE_FILTER || '')}" onchange="filterAttendanceByDate(this.value)">
            </div>
            <div style="display:flex;gap:8px;align-items:center;flex:1">
              <label style="font-size:12px;color:var(--text3);font-weight:600">Filter by Student:</label>
              <select class="form-select" style="font-size:12px" onchange="filterAttendanceByStudent(this.value)"><option value="">All Students</option>${SUPERVISOR_LIVE_STUDENTS.map(student => `<option value="${escapeHtml(student.student_name || '')}" ${SUPERVISOR_ATTENDANCE_STUDENT_FILTER === (student.student_name || '') ? 'selected' : ''}>${escapeHtml(student.student_name || '')}</option>`).join('')}</select>
            </div>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">Face Recognition Attendance Log${SUPERVISOR_ATTENDANCE_DATE_FILTER ? ` — ${formatDisplayDate(SUPERVISOR_ATTENDANCE_DATE_FILTER)}` : ''}</div></div>
        <table>
          <thead><tr><th>Student</th><th>Morning Time In</th><th>Morning Time Out</th><th>Afternoon Time In</th><th>Afternoon Time Out</th><th>Total Hours</th><th>Status</th></tr></thead>
          <tbody>${getSupervisorAttendanceSummaryRows().length ? getSupervisorAttendanceSummaryRows().map(buildSupervisorAttendanceTableRow).join('') : '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text3)">No attendance records for students assigned to your company.</td></tr>'}</tbody>
        </table>
      </div>`,

    notifications: () => `
      <div class="breadcrumb">Supervisor Portal › Notifications</div>
      <div class="section-head"><div style="display:flex;gap:10px;align-items:center"><button class="btn btn-outline" onclick="markAllAsRead()">Mark all read</button><button class="btn btn-outline btn-sm" onclick="deleteAllNotifications()">Delete all</button></div></div>
      <div class="card">
        <div class="card-body">
          ${notifications.length ? notifications.map(n=>`<div class="log-item" style="margin-bottom:12px;padding:12px;border-radius:12px;background:${n.unread?'rgba(10,110,116,0.08)':'var(--surface2)'}"><div style="font-size:14px;font-weight:700">${n.type === 'success' ? '✅' : n.type === 'warning' ? '⚠️' : 'ℹ️'} ${n.message}</div><div style="font-size:12px;color:var(--text3);margin-top:4px">${n.timestamp.toLocaleString()}</div></div>`).join('') : '<div style="padding:24px;text-align:center;color:var(--text3)">No notifications available.</div>'}
        </div>
      </div>`,

    profile: () => {
      const profile = SUPERVISOR_PROFILE || currentUser || {};
      const companyName = profile.company_name || profile.company || 'Not Assigned';
      const companyEmail = profile.company_email || profile.email || 'Not set';
      const companyPhone = profile.company_phone || profile.contact || 'Not set';
      const contactPerson = profile.company_contact_person || 'Not set';
      const profileInitials = String(profile.name || ROLES.supervisor.name).trim().split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase() || ROLES.supervisor.initials;
      return `
      <div class="breadcrumb">Supervisor Portal › Profile</div>
      <div class="profile-hero">
        <div class="profile-hero-left">
          <div class="profile-avatar-large">${escapeHtml(profileInitials)}</div>
          <div>
            <div class="profile-name">${escapeHtml(profile.name || ROLES.supervisor.name)}</div>
            <div class="profile-role">${ROLES.supervisor.label}</div>
          </div>
        </div>
        <div class="profile-hero-meta">
          <span class="tag tag-teal">Host Company</span>
          <span class="tag tag-blue">Active</span>
        </div>
      </div>
      <div class="profile-overview-card card mb-24">
        <div class="card-body">
          <div class="profile-overview-grid">
            <div>
              <div class="profile-overview-label">Company</div>
              <div class="profile-overview-value">${escapeHtml(companyName)}</div>
            </div>
            <div>
              <div class="profile-overview-label">Contact Person</div>
              <div class="profile-overview-value">${escapeHtml(contactPerson)}</div>
            </div>
            <div>
              <div class="profile-overview-label">Email</div>
              <div class="profile-overview-value">${escapeHtml(companyEmail)}</div>
            </div>
            <div>
              <div class="profile-overview-label">Phone</div>
              <div class="profile-overview-value">${escapeHtml(companyPhone)}</div>
            </div>
          </div>
        </div>
      </div>
      <div class="two-col mb-24">
        <div class="card">
          <div class="card-header"><div class="card-title">Company Information</div></div>
          <div class="card-body">
            <div class="form-row">
              <label class="form-label">Company Name</label>
              <input class="form-input" id="sup-company" type="text" value="${escapeHtml(companyName)}" disabled>
            </div>
            <div class="form-row">
              <label class="form-label">Email Address</label>
              <input class="form-input" id="sup-email" type="email" value="${escapeHtml(companyEmail)}" disabled>
            </div>
            <div class="form-row">
              <label class="form-label">Contact Person</label>
              <input class="form-input" id="sup-contact" type="text" value="${escapeHtml(contactPerson)}" disabled>
            </div>
            <div class="form-row">
              <label class="form-label">Phone / Hotline</label>
              <input class="form-input" id="sup-phone" type="tel" value="${escapeHtml(companyPhone)}" disabled>
            </div>
            <div class="form-row">
              <label class="form-label">Role</label>
              <input class="form-input" type="text" value="${ROLES.supervisor.label}" disabled style="background:var(--surface2);color:var(--text3)">
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Security & Access</div></div>
          <div class="card-body">
            <div style="text-align:center;margin-bottom:20px">
              <div style="font-size:32px;margin-bottom:12px">🔒</div>
              <div style="font-size:14px;font-weight:600;margin-bottom:4px">Password Protection</div>
              <div style="font-size:12px;color:var(--text3)">Last changed: 30 days ago</div>
            </div>
            <button class="btn btn-primary" onclick="openChangePasswordModal()" style="width:100%;justify-content:center">🔑 Change Password</button>
            <div style="margin-top:16px;padding:16px;background:var(--blue-bg);border-radius:8px;font-size:12px;color:var(--blue)">
              <div style="font-weight:600;margin-bottom:4px">✓ Secure Password Tips</div>
              <div>• Use at least 8 characters</div>
              <div>• Mix uppercase, lowercase, numbers, and symbols</div>
              <div>• Avoid using personal information</div>
              <div>• Change password regularly</div>
            </div>
          </div>
        </div>
      </div>
      `;
    }
  };
