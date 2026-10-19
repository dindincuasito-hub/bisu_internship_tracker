const STUDENT_ATTENDANCE_EVENTS = [
  { action: 'morning_time_in', field: 'morningTimeIn', legacyField: 'timeIn', type: 'in', label: 'Morning Time In', faceField: 'faceInImage', verificationField: 'morningTimeInVerification', locationField: 'timeInLocationStatus', distanceField: 'timeInDistance' },
  { action: 'morning_time_out', field: 'morningTimeOut', legacyField: 'timeOut', type: 'out', label: 'Morning Time Out', faceField: 'faceOutImage', verificationField: 'morningTimeOutVerification', locationField: 'timeOutLocationStatus', distanceField: 'timeOutDistance' },
  { action: 'afternoon_time_in', field: 'afternoonTimeIn', type: 'in', label: 'Afternoon Time In', faceField: 'afternoonFaceInImage', verificationField: 'afternoonTimeInVerification', locationField: 'afternoonTimeInLocationStatus', distanceField: 'afternoonTimeInDistance' },
  { action: 'afternoon_time_out', field: 'afternoonTimeOut', type: 'out', label: 'Afternoon Time Out', faceField: 'afternoonFaceOutImage', verificationField: 'afternoonTimeOutVerification', locationField: 'afternoonTimeOutLocationStatus', distanceField: 'afternoonTimeOutDistance' },
];

function getStudentAttendanceEventStates(entry) {
  let sequenceBlocked = false;
  return STUDENT_ATTENDANCE_EVENTS.map(event => {
    const timestamp = entry?.[event.field] || (event.legacyField ? entry?.[event.legacyField] : '') || '';
    const completed = Boolean(timestamp);
    const available = !completed && !sequenceBlocked;
    if (!completed) sequenceBlocked = true;
    return {
      ...event,
      timestamp,
      completed,
      available,
      verification: entry?.[event.verificationField] || entry?.verification || 'Pending',
      locationStatus: entry?.[event.locationField] || '',
      distanceMeters: entry?.[event.distanceField],
      faceImage: entry?.[event.faceField] || '',
    };
  });
}

function getNextStudentAttendanceEvent(entry = getTodayAttendanceEntry()) {
  return getStudentAttendanceEventStates(entry).find(event => event.available) || null;
}

function renderStudentAttendanceEventActions(entry) {
  return `<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;width:100%">
    ${getStudentAttendanceEventStates(entry).map(event => {
      const status = event.completed
        ? `Recorded at ${formatAttendanceTime(event.timestamp)}`
        : event.available
          ? (FACE_REGISTRATION_REGISTERED ? 'Ready to record' : 'Register face first')
          : 'Complete the previous event first';
      const enabled = event.available && FACE_REGISTRATION_REGISTERED;
      return `<div style="min-width:0;padding:10px;border:1px solid var(--border);border-radius:8px;text-align:left">
        <div style="font-size:12px;font-weight:700;margin-bottom:4px">${event.label}</div>
        <div style="font-size:11px;color:var(--text3);margin-bottom:8px">${escapeHtml(status)}</div>
        <button class="btn ${event.completed ? 'btn-outline' : 'btn-teal'} btn-sm" style="width:100%" ${enabled ? `onclick="openFaceModal('${event.type}','${event.action}')"` : 'disabled'}>${event.completed ? 'Completed' : 'Record'}</button>
      </div>`;
    }).join('')}
  </div>`;
}

function getStudentAttendanceSeconds(entry) {
  if (Number.isFinite(Number(entry?.totalSeconds))) return Number(entry.totalSeconds);
  if (Number.isFinite(Number(entry?.totalMinutes))) return Number(entry.totalMinutes) * 60;
  if (Number.isFinite(Number(entry?.durationMinutes))) return Number(entry.durationMinutes) * 60;
  return Math.round((Number.parseFloat(entry?.hrs) || 0) * 3600);
}

function getStudentAttendanceMinutes(entry) {
  return Math.round(getStudentAttendanceSeconds(entry) / 60);
}

function getStudentAttendanceHours(entry) {
  return getStudentAttendanceSeconds(entry) / 3600;
}

function renderStudentAttendanceEventLog(entry) {
  return getStudentAttendanceEventStates(entry).map(event => {
    const gps = event.locationStatus === 'Verified'
      ? `GPS verified${Number.isFinite(Number(event.distanceMeters)) ? ` · ${Math.round(Number(event.distanceMeters))} m` : ''}`
      : (event.locationStatus || 'GPS pending');
    const evidence = event.faceImage
      ? `<img loading="lazy" src="${escapeHtml(event.faceImage)}" class="attendance-face-thumb" alt="${escapeHtml(event.label)} face capture">`
      : '';
    return `<div style="display:grid;grid-template-columns:minmax(120px,1fr) auto;gap:2px 12px;padding:6px 0">
      <strong>${escapeHtml(event.label)}</strong>
      <span>${event.completed ? escapeHtml(formatAttendanceTime(event.timestamp)) : '—'}</span>
      <small style="color:var(--text3)">${event.completed ? `${escapeHtml(event.verification)} · ${escapeHtml(gps)}` : 'Not recorded'}</small>
      <span>${evidence}</span>
    </div>`;
  }).join('');
}

function renderStudentAttendanceEventCell(event) {
  if (!event.completed) return '—';
  const gps = event.locationStatus === 'Verified'
    ? `GPS verified${Number.isFinite(Number(event.distanceMeters)) ? ` · ${Math.round(Number(event.distanceMeters))} m` : ''}`
    : (event.locationStatus || 'GPS pending');
  return `<strong>${escapeHtml(formatAttendanceTime(event.timestamp))}</strong><br><small>${escapeHtml(event.verification)}</small><br><small>${escapeHtml(gps)}</small>`;
}

function getStudentAttendanceStats() {
  const presentDays = ATTENDANCE_LOG.filter(r => r.status === 'Present' || r.status === 'Late' || getStudentAttendanceEventStates(r).some(event => event.completed)).length;
  const absences = ATTENDANCE_LOG.filter(r => r.status === 'Absent').length;
  const tardiness = ATTENDANCE_LOG.filter(r => r.status === 'Late').length;
  const totalHrs = ATTENDANCE_LOG.reduce((sum, r) => sum + getStudentAttendanceHours(r), 0);
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
    const hasAttendance = getStudentAttendanceEventStates(todayEntry).some(event => event.completed);
    return `
      <div class="section-head">${renderStudentAttendanceEventActions(todayEntry)}</div>
      <div class="stats-row cols4">
        <div class="stat-card blue"><div class="stat-icon">⏱️</div><div class="stat-val">${stats.totalHrs.toFixed(2)}</div><div class="stat-label">Hours Rendered</div><div class="stat-trend up">↑ 8 hrs this week</div></div>
        <div class="stat-card green"><div class="stat-icon">✅</div><div class="stat-val">${STUDENT_TASKS.filter(t => t.status === 'Completed').length}</div><div class="stat-label">Tasks Completed</div><div class="stat-trend">${STUDENT_TASKS.filter(t => t.status === 'Completed').length} completed</div></div>
        <div class="stat-card amber"><div class="stat-icon">📁</div><div class="stat-val">${SUBMISSIONS.length}</div><div class="stat-label">Files Submitted</div><div class="stat-trend">${SUBMISSIONS.filter(s => s.status === 'For Review').length} pending review</div></div>
        <div class="stat-card teal"><div class="stat-icon">📅</div><div class="stat-val">${stats.presentDays}</div><div class="stat-label">Days Present</div><div class="stat-trend">${stats.absences} absences</div></div>
      </div>
      <div class="two-col">
        <div class="card">
          <div class="card-header"><div class="card-title">OJT Monitoring</div><span class="tag tag-blue">${stats.totalHrs.toFixed(2)} / 500 hrs</span></div>
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
          <div class="card-header"><div class="card-title">Today's Attendance</div><span class="tag ${hasAttendance ? 'tag-green' : 'tag-amber'}">${hasAttendance ? 'In Progress' : 'Pending'}</span></div>
          <div class="card-body">
            ${getStudentAttendanceEventStates(todayEntry).map(event => `<div class="log-item"><div class="log-icon in">${event.completed ? '✓' : '•'}</div><div><div class="log-time">${escapeHtml(event.label)}</div><div class="log-date">${event.completed ? `Recorded at ${escapeHtml(formatAttendanceTime(event.timestamp))}` : 'Not recorded'}</div></div><span class="tag ${event.completed ? 'tag-green' : 'tag-amber'}">${event.completed ? 'Done' : 'Pending'}</span></div>`).join('')}
            ${(todayEntry?.faceInImage || todayEntry?.faceOutImage || todayEntry?.afternoonFaceInImage || todayEntry?.afternoonFaceOutImage) ? `<div style="display:flex;justify-content:center;gap:8px;flex-wrap:wrap;margin-top:12px">${[todayEntry.faceInImage,todayEntry.faceOutImage,todayEntry.afternoonFaceInImage,todayEntry.afternoonFaceOutImage].filter(Boolean).map((image,index)=>`<img src="${escapeHtml(image)}" class="attendance-face-thumb" alt="Attendance event ${index + 1} face">`).join('')}</div>` : ''}
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

              <div class="face-capture-stage mt-4">
                <video id="cameraPreview" playsinline muted autoplay></video>
                <div class="face-capture-guide" aria-hidden="true"></div>
                <div class="face-capture-instruction">Position your face inside the circle</div>
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
                <img id="face-reg-captured-preview" src="" alt="Captured face preview" class="rounded-circle shadow-sm" style="width:180px;height:180px;object-fit:cover;display:none;background:#f8f9fa;">
              </div>
            </div>
          </div>

          <div id="face-reg-status-card" class="card rounded-4 shadow-sm bg-white mt-3">
            <div class="card-body">
              <div class="d-flex align-items-center gap-3 mb-3">
                <img id="student-face-reg-preview" src="${ROLES.student.photo}" alt="Registered face" class="rounded-circle" style="width:92px;height:92px;object-fit:cover;background:#f8f9fa;">
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
    return `
      <div class="section-head"></div>
      <div class="two-col">
        <div class="card">
          <div class="card-header"><div class="card-title">Record Attendance</div></div>
          <div class="card-body" style="text-align:center">
            <div style="font-size:48px;margin-bottom:16px;">📷</div>
            <div style="font-size:14px;color:var(--text2);margin-bottom:24px;">Use your face to record your time in or time out. Your face data is securely stored and verified in real-time.</div>
            ${renderStudentAttendanceEventActions(todayEntry)}
            <div style="margin-top:20px;font-size:12px;color:var(--text3)">Today: <strong>${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</strong> | Current Time: <strong id="live-time"></strong></div>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title">Attendance Log</div></div>
          <div class="card-body">
            ${ATTENDANCE_LOG.length ? ATTENDANCE_LOG.map(entry => `<div class="log-item">
              <div class="log-icon in" style="width:64px;font-size:11px;font-weight:700;color:var(--green)">${escapeHtml(entry.date)}</div>
              <div style="flex:1;min-width:0">${renderStudentAttendanceEventLog(entry)}</div>
              <span class="tag tag-teal ml-auto">${getStudentAttendanceHours(entry).toFixed(2)} hrs</span>
            </div>`).join('') : '<div class="text-muted" style="padding:24px;text-align:center">No attendance records yet.</div>'}
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
      ? ATTENDANCE_LOG.map(r => {
        const events = getStudentAttendanceEventStates(r);
        return `<tr><td>${escapeHtml(r.date)}</td>${events.map(event => `<td><span style="font-family:'DM Mono',monospace;font-size:12px">${renderStudentAttendanceEventCell(event)}</span></td>`).join('')}<td>${getStudentAttendanceHours(r).toFixed(2)}</td><td><div style="display:flex;gap:6px;flex-wrap:wrap">${events.map(event => event.faceImage ? `<img loading="lazy" src="${escapeHtml(event.faceImage)}" class="attendance-face-thumb" alt="${escapeHtml(event.label)} face capture">` : '').join('') || '—'}</div></td><td>${escapeHtml(r.status || 'Present')}</td></tr>`;
      }).join('')
      : '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text3)">No attendance records yet.</td></tr>';
    return `
      <div class="section-head"></div>
      <div class="stats-row cols4 mb-24">
        <div class="stat-card green"><div class="stat-icon">✅</div><div class="stat-val">${stats.presentDays}</div><div class="stat-label">Days Present</div></div>
        <div class="stat-card red"><div class="stat-icon">❌</div><div class="stat-val">${stats.absences}</div><div class="stat-label">Absences</div></div>
        <div class="stat-card amber"><div class="stat-icon">⚠️</div><div class="stat-val">${stats.tardiness}</div><div class="stat-label">Tardiness</div></div>
        <div class="stat-card blue"><div class="stat-icon">⏱️</div><div class="stat-val">${stats.totalHrs.toFixed(2)}</div><div class="stat-label">Total Hours</div></div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">Detailed Log</div></div>
        <table>
          <thead><tr><th>Date</th><th>Morning Time In</th><th>Morning Time Out</th><th>Afternoon Time In</th><th>Afternoon Time Out</th><th>Total Hours</th><th>Face Captures</th><th>Status</th></tr></thead>
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
