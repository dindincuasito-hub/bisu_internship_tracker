function getStudentAttendanceStats() {
  const presentDays = ATTENDANCE_LOG.filter(r => r.status === 'Present').length;
  const absences = ATTENDANCE_LOG.filter(r => r.status === 'Absent').length;
  const tardiness = ATTENDANCE_LOG.filter(r => {
    if (!r.timeIn || r.timeIn === '—') return false;
    const [time, period] = r.timeIn.split(' ');
    if (!time) return false;
    let [hour, minute] = time.split(':').map(Number);
    if (period === 'PM' && hour < 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;
    return hour > 8 || (hour === 8 && minute > 0);
  }).length;
  const totalHrs = ATTENDANCE_LOG.reduce((sum, r) => {
    const value = parseFloat(r.hrs);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
  return { presentDays, absences, tardiness, totalHrs };
}

function getTodayAttendanceEntry() {
  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return ATTENDANCE_LOG.find(r => r.date === today) || null;
}

PAGE_RENDERERS.student = {
  dashboard: () => {
    const stats = getStudentAttendanceStats();
    const percent = Math.min(100, Math.round((stats.totalHrs / 500) * 100));
    const remaining = Math.max(0, 500 - stats.totalHrs);
    const todayEntry = getTodayAttendanceEntry();
    const canTimeIn = FACE_REGISTRATION_REGISTERED && (!todayEntry || !todayEntry.timeIn);
    const canTimeOut = FACE_REGISTRATION_REGISTERED && todayEntry && todayEntry.timeIn && !todayEntry.timeOut;
    return `
      <div class="section-head"><div class="flex gap-8"><button class="btn btn-teal" ${canTimeIn ? 'onclick="openFaceModal(\'in\')"' : 'disabled'}>📷 Time In</button><button class="btn btn-outline" ${canTimeOut ? 'onclick="openFaceModal(\'out\')"' : 'disabled'}>🚪 Time Out</button></div></div>
      <div class="stats-row cols4">
        <div class="stat-card blue"><div class="stat-icon">⏱️</div><div class="stat-val">${stats.totalHrs.toFixed(1)}</div><div class="stat-label">Hours Rendered</div><div class="stat-trend up">↑ 8 hrs this week</div></div>
        <div class="stat-card green"><div class="stat-icon">✅</div><div class="stat-val">${STUDENT_TASKS.filter(t => t.status === 'Completed').length}</div><div class="stat-label">Tasks Completed</div><div class="stat-trend">${STUDENT_TASKS.filter(t => t.status === 'Completed').length} completed</div></div>
        <div class="stat-card amber"><div class="stat-icon">📁</div><div class="stat-val">${SUBMISSIONS.length}</div><div class="stat-label">Files Submitted</div><div class="stat-trend">${SUBMISSIONS.filter(s => s.status === 'For Review').length} pending review</div></div>
        <div class="stat-card teal"><div class="stat-icon">📅</div><div class="stat-val">${stats.presentDays}</div><div class="stat-label">Days Present</div><div class="stat-trend">${stats.absences} absences</div></div>
      </div>
      <div class="two-col">
        <div class="card">
          <div class="card-header"><div class="card-title">OJT Monitoring</div><span class="tag tag-blue">${stats.totalHrs.toFixed(1)} / 500 hrs</span></div>
          <div class="card-body">
            <div class="ojt-progress-ring">
              <div class="ring-wrap">
                <svg width="120" height="120" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="50" fill="none" stroke="#EEF3FA" stroke-width="12"/>
                  <circle cx="60" cy="60" r="50" fill="none" stroke="#0A6E74" stroke-width="12" stroke-dasharray="${2 * Math.PI * 50}" stroke-dashoffset="${2 * Math.PI * 50 * (1 - percent / 100)}" stroke-linecap="round"/>
                </svg>
                <div class="ring-center"><div class="ring-pct">${percent}%</div><div class="ring-label">COMPLETE</div></div>
              </div>
              <div>
                <div style="font-size:13px;color:var(--text2);margin-bottom:12px;">OJT completion based on total required hours.</div>
                <div style="margin-bottom:8px;"><span style="font-size:12px;color:var(--text3)">Remaining</span><br><span style="font-size:20px;font-weight:800;color:var(--navy)">${remaining} hrs</span></div>
                <div class="tag tag-amber">⚠️ 9 weeks left</div>
              </div>
            </div>
            <div class="progress-bar-outer"><div class="progress-bar-inner" style="width:${percent}%"></div></div>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Today's Attendance</div><span class="tag ${todayEntry?.timeIn ? 'tag-green' : 'tag-amber'}">${todayEntry?.timeIn ? 'Present' : 'Pending'}</span></div>
          <div class="card-body">
            <div class="log-item"><div class="log-icon in">🟢</div><div><div class="log-time">${todayEntry?.timeIn || '—'}</div><div class="log-date">${todayEntry?.timeIn ? 'Time In — Face Verified ✓' : 'No time in recorded yet'}</div></div><span class="tag ${todayEntry?.timeIn ? 'tag-green' : 'tag-amber'}">${todayEntry?.timeIn ? 'In' : 'Pending'}</span></div>
            ${todayEntry?.faceInImage ? '<div style="text-align:center;margin-bottom:16px;"><img src="' + todayEntry.faceInImage + '" class="attendance-face-thumb" alt="Time in face" title="Time in photo"></div>' : ''}
            <div style="padding:24px 0;text-align:center;color:var(--text3);font-size:13px;">${todayEntry?.timeOut ? 'Time out recorded at ' + todayEntry.timeOut : 'No time-out recorded yet for today'}</div>
            <button class="btn btn-teal" style="width:100%" ${canTimeOut ? 'onclick="openFaceModal(\'out\')"' : 'disabled'}>📷 Record Time Out</button>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">Pending Tasks</div><button class="btn btn-outline btn-sm" onclick="navigateTo('tasks')">View All</button></div>
        <div class="card-body">
          ${STUDENT_TASKS.filter(t => t.status !== 'Completed').length ? taskItems(STUDENT_TASKS.filter(t => t.status !== 'Completed').slice(0,3)) : '<div style="padding:24px 0;text-align:center;color:var(--text3)">No tasks assigned yet.</div>'}
        </div>
      </div>
    `;
  },

  facereg: () => {
    return `
      <div class="row g-4">
        <div class="col-12 col-xl-7">
          <div class="card rounded-4 shadow-sm bg-white">
            <div class="card-body">
              <div class="d-flex align-items-start justify-content-between">
                <div>
                  <h5 class="card-title mb-1">Face Registration</h5>
                  <p class="text-muted mb-0">Register your face once for secure attendance verification.</p>
                </div>
                <span id="face-detection-indicator" class="badge bg-secondary">No Face Detected</span>
              </div>

              <div class="ratio ratio-16x9 rounded-4 overflow-hidden border border-2 border-light mt-4 position-relative">
                <video id="cameraPreview" class="w-100 h-100" playsinline muted autoplay></video>
                <div class="position-absolute top-50 start-50 translate-middle border border-3 border-success rounded" style="width:52%;height:45%;box-shadow:0 0 0 10px rgba(16,185,129,0.08);"></div>
              </div>

              <div class="row gx-2 gy-2 mt-3">
                <div class="col-6">
                  <button id="face-reg-open-btn" class="btn btn-outline-primary w-100" type="button" onclick="openFaceRegistrationCamera()">Open Camera</button>
                </div>
                <div class="col-6">
                  <button id="face-reg-capture-btn" class="btn btn-primary w-100" type="button" onclick="captureFaceForRegistration()" disabled>Capture Face</button>
                </div>
                <div class="col-6">
                  <button id="face-reg-retake-btn" class="btn btn-outline-secondary w-100" type="button" onclick="retakeFaceRegistration()" disabled>Retake</button>
                </div>
                <div class="col-6">
                  <button id="face-reg-save-btn" class="btn btn-success w-100" type="button" onclick="saveFaceRegistration()" disabled>Save Registration</button>
                </div>
                <div class="col-12">
                  <button id="face-reg-cancel-btn" class="btn btn-dark w-100" type="button" onclick="cancelFaceRegistration()">Cancel</button>
                </div>
              </div>
              <div id="face-reg-alert" class="alert alert-info mt-3" role="alert" style="display:none;"></div>

              <div class="mt-4 text-center">
                <img id="face-reg-captured-preview" src="" alt="Captured face preview" class="rounded-4 shadow-sm" style="width:180px;height:180px;object-fit:cover;display:none;background:#f8f9fa;">
              </div>
            </div>
          </div>

          <div id="face-reg-status-card" class="card rounded-4 shadow-sm bg-white mt-3">
            <div class="card-body">
              <div class="d-flex align-items-center gap-3 mb-3">
                <img id="student-face-reg-preview" src="${ROLES.student.photo}" alt="Registered face" class="rounded-4" style="width:92px;height:92px;object-fit:cover;background:#f8f9fa;">
                <div>
                  <h6 class="mb-1">Registration Status</h6>
                  <div class="d-flex align-items-center gap-2">
                    <span id="face-reg-status-badge" class="badge bg-secondary">Not Registered</span>
                    <span id="face-reg-status-text" class="text-muted small">Ready to begin</span>
                  </div>
                </div>
              </div>
              <div class="small text-muted mb-2">Student Name: <strong id="face-reg-student-name">${ROLES.student.name}</strong></div>
              <div class="small text-muted mb-2">Student ID: <strong id="face-reg-student-id">${ROLES.student.nis}</strong></div>
              <div class="small text-muted mb-2">Registered Date: <strong id="face-reg-date">—</strong></div>
              <div class="small text-muted">Registered Time: <strong id="face-reg-time">—</strong></div>
            </div>
          </div>
        </div>

        <div class="col-12 col-xl-5">
          <div class="card rounded-4 shadow-sm bg-white">
            <div class="card-body">
              <h6 class="card-title mb-3">Face Quality</h6>
              <ul class="list-unstyled mb-0">
                <li class="mb-3"><i class="bi bi-check2-circle text-success me-2"></i><span id="face-quality-lighting">Good Lighting</span></li>
                <li class="mb-3"><i class="bi bi-check2-circle text-success me-2"></i><span id="face-quality-centered">Face Centered</span></li>
                <li><i class="bi bi-check2-circle text-success me-2"></i><span id="face-quality-clear">Clear Image</span></li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  timein: () => {
    const todayEntry = getTodayAttendanceEntry();
    const canTimeIn = FACE_REGISTRATION_REGISTERED && (!todayEntry || !todayEntry.timeIn);
    const canTimeOut = FACE_REGISTRATION_REGISTERED && todayEntry && todayEntry.timeIn && !todayEntry.timeOut;
    return `
      <div class="section-head"></div>
      <div class="two-col">
        <div class="card">
          <div class="card-header"><div class="card-title">Record Attendance</div></div>
          <div class="card-body" style="text-align:center">
            <div style="font-size:48px;margin-bottom:16px;">📷</div>
            <div style="font-size:14px;color:var(--text2);margin-bottom:24px;">Use your face to record your time in or time out. Your face data is securely stored and verified in real-time.</div>
            <div style="display:flex;flex-direction:column;gap:12px">
              <button class="btn btn-teal" style="width:100%;justify-content:center;font-size:15px;padding:14px" ${canTimeIn ? 'onclick="openFaceModal(\'in\')"' : 'disabled'}>📷 Time In — Face Scan</button>
              <button class="btn btn-outline" style="width:100%;justify-content:center;font-size:15px;padding:14px" ${canTimeOut ? 'onclick="openFaceModal(\'out\')"' : 'disabled'}>🚪 Time Out — Face Scan</button>
            </div>
            <div style="margin-top:20px;font-size:12px;color:var(--text3)">Today: <strong>${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</strong> | Current Time: <strong id="live-time"></strong></div>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Attendance Log — April 2026</div></div>
          <div class="card-body">
            ${ATTENDANCE_LOG.map(l => '<div class="log-item"><div class="log-icon in" style="width:44px;font-size:11px;font-weight:700;color:var(--green)">' + l.date + '</div><div><div style="font-size:13px;font-weight:600">' + (l.timeIn || '—') + ' → ' + (l.timeOut || '—') + '</div><div style="font-size:11px;color:var(--text3)">' + (l.timeIn && l.timeOut ? 'Face verified' : 'Pending verification') + '</div>' + (l.faceInImage ? '<img src="' + l.faceInImage + '" class="attendance-face-thumb" alt="Time in face">' : '') + (l.faceOutImage ? '<img src="' + l.faceOutImage + '" class="attendance-face-thumb" alt="Time out face">' : '') + '</div><span class="tag tag-teal ml-auto">' + (l.hrs || '-') + ' hrs</span></div>').join('')}
          </div>
        </div>
      </div>
    `;
  },

  tasks: () => `
      <div class="section-head"><span class="tag tag-amber">${STUDENT_TASKS.filter(t => t.status === 'Pending').length} Pending</span></div>
      <div class="card mb-24">
        <div class="card-header"><div class="card-title">Current Tasks</div></div>
        <div class="card-body">
          ${STUDENT_TASKS.length ? taskItems(STUDENT_TASKS) : '<div style="padding:24px 0;text-align:center;color:var(--text3)">No tasks assigned yet.</div>'}
        </div>
      </div>
    `,

  submissions: () => {
    const submissionRows = SUBMISSIONS.map(f => '<div class="log-item"><div class="log-icon in">📄</div><div><div style="font-size:13px;font-weight:600">' + f.name + '</div><div style="font-size:11px;color:var(--text3)">Submitted ' + f.date + '</div></div><span class="tag ' + f.tag + ' ml-auto">' + f.status + '</span></div>').join('');
    return `
      <div class="section-head"></div>
      <div class="two-col mb-24">
        <div class="card">
          <div class="card-header"><div class="card-title">Upload File</div></div>
          <div class="card-body">
            <div class="form-row"><label class="form-label">Task / Document Type</label><select class="form-select" id="submission-task-select">${STUDENT_TASKS.length ? STUDENT_TASKS.map(task => `<option value="${Number(task.id) || 0}">${escapeHtml(task.name)}</option>`).join('') : '<option value="">No assigned tasks</option>'}</select></div>
            <div class="upload-zone" ondragover="event.preventDefault()" ondrop="handleSubmissionDrop(event)" onclick="triggerFilePicker()">
              <div class="upload-icon">📎</div>
              <div class="upload-text">Click or drag file here</div>
              <div class="upload-sub">PDF, DOCX, XLSX — max 50 MB</div>
              <div id="submission-file-name" style="margin-top:12px;color:var(--text3);font-size:13px;">No file selected</div>
            </div>
            <input id="submission-file-input" type="file" accept=".pdf,.doc,.docx,.xlsx" style="display:none" onchange="handleFileInput(event)">
            <button class="btn btn-primary" style="width:100%;margin-top:16px;justify-content:center" onclick="uploadSubmission()">Upload Submission</button>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Submission History</div></div>
          <div class="card-body">
            ${submissionRows}
          </div>
        </div>
      </div>
    `;
  },

  attendance: () => {
    const stats = getStudentAttendanceStats();
    const rows = ATTENDANCE_LOG.length
      ? ATTENDANCE_LOG.map(r => '<tr><td>' + r.date + '</td><td><span style="font-family:\'DM Mono\',monospace;font-size:12px">' + (r.timeIn || '—') + '</span></td><td><span style="font-family:\'DM Mono\',monospace;font-size:12px">' + (r.timeOut || '—') + '</span></td><td>' + (r.hrs || '-') + '</td><td style="color:' + (r.verification === 'Verified' ? 'var(--green)' : r.verification === 'Failed' ? 'var(--red)' : 'var(--text3)') + ';font-size:12px">' + (r.verification || 'Pending') + '</td><td><span class="tag ' + (r.status === 'Present' ? 'tag-green' : 'tag-gray') + '">' + r.status + '</span></td></tr>').join('')
      : '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text3)">No attendance records yet.</td></tr>';
    return `
      <div class="section-head"></div>
      <div class="stats-row cols4 mb-24">
        <div class="stat-card green"><div class="stat-icon">✅</div><div class="stat-val">${stats.presentDays}</div><div class="stat-label">Days Present</div></div>
        <div class="stat-card red"><div class="stat-icon">❌</div><div class="stat-val">${stats.absences}</div><div class="stat-label">Absences</div></div>
        <div class="stat-card amber"><div class="stat-icon">⚠️</div><div class="stat-val">${stats.tardiness}</div><div class="stat-label">Tardiness</div></div>
        <div class="stat-card blue"><div class="stat-icon">⏱️</div><div class="stat-val">${stats.totalHrs.toFixed(1)}</div><div class="stat-label">Total Hours</div></div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">Detailed Log</div></div>
        <table>
          <thead><tr><th>Date</th><th>Time In</th><th>Time Out</th><th>Hours</th><th>Verification</th><th>Status</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  },

  profile: () => {
    const account = currentUser || {};
    const program = account.program || 'Not set';
    const section = account.section || 'Not set';
    const academicYear = account.academic_year || 'Not set';
    return `
      <div class="section-head"></div>
      <div class="two-col mb-24">
        <div class="card">
          <div class="card-header"><div class="card-title">Account Information</div></div>
          <div class="card-body">
            <div class="profile-info-section">
              <div style="text-align:center;margin-bottom:16px;background:var(--surface2);padding:20px;border-radius:12px;color:var(--teal)">${account.face_image ? `<img src="${escapeHtml(account.face_image)}" alt="${escapeHtml(account.name || 'Registered face')}" style="width:96px;height:96px;object-fit:cover;border-radius:50%">` : '<span style="font-size:48px">👤</span>'}</div>
              <div style="text-align:center;margin-bottom:24px">
                <div style="font-size:18px;font-weight:700;color:var(--text)">${escapeHtml(account.name || 'Not set')}</div>
                <div style="font-size:13px;color:var(--text3)">${escapeHtml(program)} • Section ${escapeHtml(section)} • ${escapeHtml(academicYear)}</div>
              </div>
              <div style="border-top:1px solid var(--border);padding-top:16px">
                <div class="info-row"><span style="color:var(--text3);font-size:12px">📧 Email</span><div style="font-weight:600">${escapeHtml(account.email || 'Not set')}</div></div>
                <div class="info-row"><span style="color:var(--text3);font-size:12px">🆔 ID Number</span><div style="font-weight:600">${escapeHtml(account.student_id || 'Not set')}</div></div>
                <div class="info-row"><span style="color:var(--text3);font-size:12px">📱 Contact</span><div style="font-weight:600">${escapeHtml(account.contact || 'Not set')}</div></div>
                <div class="info-row"><span style="color:var(--text3);font-size:12px">👤 Username</span><div style="font-weight:600">${escapeHtml(account.username || 'Not set')}</div></div>
                <div class="info-row"><span style="color:var(--text3);font-size:12px">📍 Address</span><div style="font-weight:600">${escapeHtml(account.address || 'Not set')}</div></div>
              </div>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">OJT Assignment</div></div>
          <div class="card-body">
            <div class="profile-info-section">
              <div style="font-size:48px;text-align:center;margin-bottom:16px;background:var(--surface2);padding:20px;border-radius:12px;color:var(--blue)">🏢</div>
              <div style="text-align:center;margin-bottom:24px">
                <div style="font-size:16px;font-weight:700;color:var(--text)">Tech Solutions Inc.</div>
                <div style="font-size:13px;color:var(--text3)">Host Company</div>
              </div>
              <div style="border-top:1px solid var(--border);padding-top:16px">
                <div class="info-row"><span style="color:var(--text3);font-size:12px">👔 Supervisor</span><div style="font-weight:600">Maria Santos (Supervisor)</div></div>
                <div class="info-row"><span style="color:var(--text3);font-size:12px">🎯 Coordinator</span><div style="font-weight:600">Ma. Elena Santos</div></div>
                <div class="info-row"><span style="color:var(--text3);font-size:12px">📍 Location</span><div style="font-weight:600">TechHub Building, Cebu City</div></div>
                <div class="info-row"><span style="color:var(--text3);font-size:12px">📞 Hotline</span><div style="font-weight:600">(032) 123-4567</div></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="card mb-24">
        <div class="card-header"><div class="card-title">Account Settings</div></div>
        <div class="card-body">
          <div class="form-row">
            <label class="form-label">Change Password</label>
            <div style="display:flex;gap:8px">
              <input class="form-input" id="profile-pass-current" type="password" placeholder="Current password" style="flex:1">
              <button class="btn btn-outline btn-sm" onclick="openChangePasswordModal()">Change</button>
            </div>
          </div>
        </div>
      </div>
    `;
  },
};
