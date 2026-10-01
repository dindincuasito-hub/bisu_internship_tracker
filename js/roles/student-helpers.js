// ══ STUDENT PAGE HELPERS ══

async function loadStudentProfile() {
  try {
    const apiBase = typeof API_BASE !== 'undefined' ? API_BASE : '../php/api.php';
    const response = await fetch(`${apiBase}?resource=profile`);
    const data = await response.json();
    if (!data.success || !data.profile || currentRole !== 'student' || currentPage !== 'profile') return;

    currentUser = { ...currentUser, ...data.profile };
    const content = document.getElementById('content');
    if (content && PAGE_RENDERERS.student?.profile) {
      content.innerHTML = PAGE_RENDERERS.student.profile();
    }
  } catch (error) {
    console.warn('Unable to load student profile', error);
  }
}

// Profile helpers
function openChangePasswordModal() {
  const body = `
    <div class="form-row">
      <label class="form-label">Current Password</label>
      <input class="form-input" id="change-pass-current" type="password" placeholder="Enter current password">
    </div>
    <div class="form-row">
      <label class="form-label">New Password</label>
      <input class="form-input" id="change-pass-new" type="password" placeholder="Enter new password">
    </div>
    <div class="form-row">
      <label class="form-label">Confirm New Password</label>
      <input class="form-input" id="change-pass-confirm" type="password" placeholder="Confirm new password">
    </div>
  `;
  openGenModal('Change Password', body, saveChangePassword, 'Update Password');
}

function saveChangePassword() {
  const current = document.getElementById('change-pass-current')?.value || '';
  const newPass = document.getElementById('change-pass-new')?.value || '';
  const confirm = document.getElementById('change-pass-confirm')?.value || '';

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

  // In a real app, send to server via PHP
  alert('Password updated successfully! ✓');
  addNotification('Your password has been changed.', 'success');
  return true;
}

function saveProfileSettings() {
  const notifTask = document.getElementById('notif-task')?.checked;
  const notifFeedback = document.getElementById('notif-feedback')?.checked;
  const notifAttendance = document.getElementById('notif-attendance')?.checked;

  // Save preferences (in real app, send to server)
  localStorage.setItem('student_notif_prefs', JSON.stringify({
    taskAlerts: notifTask,
    feedbackAlerts: notifFeedback,
    attendanceAlerts: notifAttendance
  }));

  alert('Profile settings saved successfully! ✓');
  addNotification('Your notification preferences have been updated.', 'success');
}

function confirmLogout() {
  if (confirm('Are you sure you want to sign out from all sessions? You will need to log in again.')) {
    doLogout();
  }
}

// Helper to render info rows in profile
function infoRow(label, value) {
  return `<div class="info-row" style="padding:12px 0;border-bottom:1px solid var(--border)">
    <div style="font-size:12px;color:var(--text3);margin-bottom:4px">${label}</div>
    <div style="font-weight:600;font-size:14px">${value}</div>
  </div>`;
}
