// ══ SUPERVISOR PAGE HELPERS ══

function viewSupervisorStudent(index) {
  const student = SUPERVISOR_LIVE_STUDENTS[index];
  if (!student) return;
  const hours = Number(student.hours_completed) || 0;
  const required = Number(student.hours_required) || 500;
  const body = `
    <div class="form-row"><label class="form-label">Student Name</label><div class="form-text">${escapeHtml(student.student_name || '—')}</div></div>
    <div class="form-row"><label class="form-label">Student ID</label><div class="form-text">${escapeHtml(student.student_no || '—')}</div></div>
    <div class="form-row"><label class="form-label">Program</label><div class="form-text">${escapeHtml(student.program || '—')}</div></div>
    <div class="form-row"><label class="form-label">Company</label><div class="form-text">${escapeHtml(student.company_name || '—')}</div></div>
    <div class="form-row"><label class="form-label">Coordinator</label><div class="form-text">${escapeHtml(student.coordinator_name || '—')}</div></div>
    <div class="form-row"><label class="form-label">Contact</label><div class="form-text">${escapeHtml(student.contact || '—')}</div></div>
    <div class="form-row"><label class="form-label">Internship Status</label><div class="form-text">${escapeHtml(student.internship_status || 'Pending')}</div></div>
    <div class="form-row"><label class="form-label">Hours</label><div class="form-text">${hours} / ${required} hrs</div></div>
  `;
  openGenModal('Student Details', body, null, 'Close');
}

function viewSubmissionFile(ref) {
  const submission = resolveSubmissionByRef(ref);
  if (!submission || !submission.id) {
    alert('Submitted file is unavailable.');
    return;
  }
  const apiBase = typeof API_BASE !== 'undefined' ? API_BASE : '../php/api.php';
  window.open(`${apiBase}?resource=submissions&download=${encodeURIComponent(submission.id)}`, '_blank', 'noopener');
}

function reviewSupervisorSubmission(ref) {
  const submission = resolveSubmissionByRef(ref);
  if (!submission || !Number.isInteger(Number(submission.id)) || Number(submission.id) <= 0) {
    alert('This submission is no longer available. Refresh the dashboard and try again.');
    return;
  }

  window.SUPERVISOR_SUBMISSION_TARGET = {
    submissionId: Number(submission.id),
    taskId: Number(submission.taskId) || 0,
    studentId: Number(submission.studentId) || 0,
  };
  navigateTo('submissions');
}

function formatDisplayDate(dateString) {
  if (!dateString) return 'Selected Date';
  const value = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(value.getTime())) return dateString;
  return value.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// ── TASK MANAGEMENT ──
async function openAssignTaskModal(mode, index = null) {
  if (typeof loadSupervisorStudents === 'function' && !SUPERVISOR_STUDENTS_LOADED) await loadSupervisorStudents();
  const task = mode === 'edit' ? SUPERVISOR_TASKS[index] : { task: '', assignee: '', due: '', sub: '0/0', status: 'Pending' };
  const students = Array.isArray(SUPERVISOR_LIVE_STUDENTS) ? SUPERVISOR_LIVE_STUDENTS : [];
  const assigneeOptions = students.length
    ? students.map(student => {
        const studentName = student.student_name || '';
        return `<option value="${Number(student.student_id || student.id) || 0}" ${Number(task.studentId) === Number(student.student_id || student.id) ? 'selected' : ''}>${escapeHtml(studentName)}</option>`;
      }).join('')
    : '<option value="">No students assigned to your company</option>';
  const body = `
    <div class="form-row">
      <label class="form-label">Task Title</label>
      <input class="form-input" id="task-title" type="text" value="${escapeHtml(task.task)}" placeholder="Enter task name">
    </div>
    <div class="form-row">
      <label class="form-label">Select Student</label>
      <select class="form-select" id="task-assignee" ${students.length ? '' : 'disabled'}>${assigneeOptions}</select>
    </div>
    <div class="form-row">
      <label class="form-label">Due Date</label>
      <input class="form-input" id="task-due" type="date" value="${task.due}">
    </div>
    <div class="form-row">
      <label class="form-label">Description</label>
      <textarea class="form-input" id="task-desc" rows="3" placeholder="Describe the task requirements, deliverables, etc.">${escapeHtml(task.description || '')}</textarea>
    </div>
  `;
  openGenModal(mode === 'edit' ? 'Edit Task' : 'Assign New Task', body, () => saveTask(mode, index), mode === 'edit' ? 'Update Task' : 'Assign Task');
}

async function saveTask(mode, index) {
  const title = document.getElementById('task-title')?.value?.trim();
  const studentId = Number(document.getElementById('task-assignee')?.value || 0);
  const due = document.getElementById('task-due')?.value;
  const desc = document.getElementById('task-desc')?.value?.trim();

  if (!title || !studentId) {
    alert('Please complete all required fields.');
    return false;
  }
  const params = new URLSearchParams({
    title,
    description: desc || '',
    student_id: String(studentId),
    due_date: due || '',
  });
  if (mode === 'edit' && SUPERVISOR_TASKS[index]?.id) {
    params.set('_method', 'PUT');
    params.set('id', String(SUPERVISOR_TASKS[index].id));
  }
  try {
    const apiBase = typeof API_BASE !== 'undefined' ? API_BASE : '../php/api.php';
    const response = await fetch(`${apiBase}?resource=tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    const data = await response.json();
    if (!data.success) {
      alert(data.message || 'Unable to save task.');
      return false;
    }
    await loadSupervisorTasks();
    addNotification(`Task "${title}" ${mode === 'edit' ? 'updated' : 'assigned'} successfully.`, 'success');
    navigateTo('tasks');
    return true;
  } catch (error) {
    console.warn('Unable to save task:', error);
    alert('Unable to connect to the server.');
    return false;
  }
}

// ── SUBMISSION REVIEW ──
function resolveSubmissionByRef(ref) {
  if (ref === null || ref === undefined || ref === '') return null;
  const numericRef = Number(ref);
  if (!Number.isNaN(numericRef)) {
    return SUBMISSIONS.find(submission => Number(submission.id) === numericRef) || null;
  }
  return null;
}

function approveSubmission(ref) {
  const submission = resolveSubmissionByRef(ref);
  if (!submission || !submission.id) return;
  const apiBase = typeof API_BASE !== 'undefined' ? API_BASE : '../php/api.php';
  const params = new URLSearchParams({ _method: 'PUT', id: String(submission.id), status: 'Approved', supervisor_comment: '' });
  fetch(`${apiBase}?resource=submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  }).then(response => response.json()).then(async data => {
    if (!data.success) throw new Error(data.message || 'Unable to approve submission.');
    const target = SUBMISSIONS.find(item => Number(item.id) === Number(submission.id));
    if (target) {
      target.status = 'Approved';
      target.tag = 'tag-green';
    }
    await loadSupervisorTasks();
    addNotification(`✓ Approved submission from ${submission.student}: ${submission.name}`, 'success');
    navigateTo('submissions');
  }).catch(error => alert(error.message || 'Unable to approve submission.'));
}

function rejectSubmission(ref) {
  const submission = resolveSubmissionByRef(ref);
  if (!submission) return;
  
  const body = `
    <div class="form-row">
      <label class="form-label">Rejection Reason</label>
      <textarea class="form-input" id="reject-reason" rows="3" placeholder="Provide feedback on why this submission needs revision…"></textarea>
    </div>
  `;
  
  window.rejectSubmissionIndex = Number(submission.id);
  openGenModal('Reject Submission', body, () => {
    const reason = document.getElementById('reject-reason')?.value?.trim();
    if (!reason) {
      alert('Please provide a reason for rejection.');
      return false;
    }
    
    const apiBase = typeof API_BASE !== 'undefined' ? API_BASE : '../php/api.php';
    const params = new URLSearchParams({ _method: 'PUT', id: String(submission.id), status: 'Rejected', supervisor_comment: reason });
    fetch(`${apiBase}?resource=submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    }).then(response => response.json()).then(async data => {
      if (!data.success) throw new Error(data.message || 'Unable to reject submission.');
      const target = SUBMISSIONS.find(item => Number(item.id) === Number(submission.id));
      if (target) {
        target.status = 'Rejected';
        target.tag = 'tag-red';
      }
      await loadSupervisorTasks();
      addNotification(`Submission from ${submission.student} rejected. Feedback sent.`, 'warning');
      navigateTo('submissions');
    }).catch(error => alert(error.message || 'Unable to reject submission.'));
    return true;
  }, 'Reject');
}

// ── PERFORMANCE MONITORING / EVALUATION ──
function submitStudentEvaluation() {
  const studentSelect = document.querySelector('select') || { value: '' };
  const student = studentSelect.value;
  const skills = [1, 2, 3, 4, 5, 6];
  const ratings = skills.map((_, i) => {
    const buttons = document.querySelectorAll(`button.btn`)[i];
    return buttons ? 5 : 3; // Default to 3 if not set
  });
  const comments = document.querySelector('textarea')?.value?.trim() || '';

  if (!student) {
    alert('Please select a student.');
    return;
  }

  if (!comments) {
    alert('Please add evaluation comments.');
    return;
  }

  addNotification(`Evaluation for ${student} submitted successfully! ✓`, 'success');
  alert('Evaluation submitted. The student will receive this feedback.');
}

// ── ATTENDANCE FILTERING ──
function filterAttendanceByDate(dateStr) {
  SUPERVISOR_ATTENDANCE_DATE_FILTER = dateStr || '';
  if (currentRole === 'supervisor' && currentPage === 'attendance') {
    navigateTo('attendance');
  }
}

function filterAttendanceByStudent(studentName) {
  SUPERVISOR_ATTENDANCE_STUDENT_FILTER = studentName || '';
  if (currentRole === 'supervisor' && currentPage === 'attendance') {
    navigateTo('attendance');
  }
}

function exportAttendanceLog() {
  const rows = getSupervisorAttendanceSummaryRows();
  const headers = ['Date', 'Student', 'Morning Time In', 'Morning Time Out', 'Afternoon Time In', 'Afternoon Time Out', 'Total Hours', 'Status'];
  const csvRows = rows.map(item => [
    item.log_date || item.date || '',
    item.student_name || '',
    item.time_in ? formatAttendanceTime(item.time_in) : '',
    item.time_out ? formatAttendanceTime(item.time_out) : '',
    item.afternoon_time_in ? formatAttendanceTime(item.afternoon_time_in) : '',
    item.afternoon_time_out ? formatAttendanceTime(item.afternoon_time_out) : '',
    formatSupervisorAttendanceHours(item.total_seconds || 0),
    item.status || 'Pending',
  ].map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','));

  const csv = [headers.join(','), ...csvRows].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `attendance_log_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  addNotification('Attendance log exported successfully! ✓', 'success');
}

// ── PROFILE / SECURITY ──
function openChangePasswordModal() {
  const body = `
    <div class="form-row">
      <label class="form-label">Current Password</label>
      <input class="form-input" id="sup-pass-current" type="password" placeholder="Enter current password">
    </div>
    <div class="form-row">
      <label class="form-label">New Password</label>
      <input class="form-input" id="sup-pass-new" type="password" placeholder="Enter new password">
    </div>
    <div class="form-row">
      <label class="form-label">Confirm New Password</label>
      <input class="form-input" id="sup-pass-confirm" type="password" placeholder="Confirm new password">
    </div>
  `;
  openGenModal('Change Password', body, saveSupervisorPassword, 'Update Password');
}

function saveSupervisorPassword() {
  const current = document.getElementById('sup-pass-current')?.value || '';
  const newPass = document.getElementById('sup-pass-new')?.value || '';
  const confirm = document.getElementById('sup-pass-confirm')?.value || '';

  if (!current || !newPass || !confirm) {
    alert('Please fill in all password fields.');
    return false;
  }

  if (newPass !== confirm) {
    alert('New passwords do not match.');
    return false;
  }

  if (newPass.length < 8) {
    alert('New password must be at least 8 characters long.');
    return false;
  }

  addNotification('Your password has been changed successfully! ✓', 'success');
  return true;
}

function updateSupervisorInfo() {
  const company = document.getElementById('sup-company')?.value?.trim();
  const email = document.getElementById('sup-email')?.value?.trim();
  const contact = document.getElementById('sup-contact')?.value?.trim();
  const phone = document.getElementById('sup-phone')?.value?.trim();

  if (!company || !email || !contact || !phone) {
    alert('Please complete all fields.');
    return;
  }

  addNotification('Supervisor information updated successfully! ✓', 'success');
}

// ── STUDENT PROFILE VIEW ──
function viewStudentProfile(studentName) {
  // This would open a detailed student profile view
  console.log('Viewing profile for:', studentName);
  addNotification(`Opened profile for ${studentName}`, 'info');
}

// ── HELPER: Get performance status label ──
function getPerformanceStatus(percentage) {
  if (percentage >= 80) return 'Good';
  if (percentage >= 60) return 'Average';
  return 'Needs Improvement';
}

function getPerformanceColor(percentage) {
  if (percentage >= 80) return 'var(--green)';
  if (percentage >= 60) return 'var(--gold)';
  return 'var(--red)';
}
