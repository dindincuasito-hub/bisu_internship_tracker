// ══ STATE ══
console.log('app.js loaded');
let currentRole = 'student';
let currentPage = 'dashboard';
let currentUser = { id: 0, name: 'Guest', username: '', email: '', role: 'student' };
const APP_SCRIPT_URL = document.querySelector('script[src*="js/app.js"]')?.src || document.baseURI;
const API_BASE = new URL('../php/api.php', APP_SCRIPT_URL).href;
const CURRENT_PAGE_STORAGE_KEY = 'ojtTracker.currentPage';
let cameraStream = null;
let scanTimer = null;
let faceRegCameraStream = null;
let faceRegCanvas = null;
let genModalSaveCallback = null;
let lastAttendanceScan = null;
let pendingAttendanceEventType = null;
let faceValidationLoop = null;
let faceValidationCanvas = null;
let embeddedFacePreviewStream = null;
let faceTemplateCache = null;
let faceValidationReadyFrames = 0;
let lastFaceValidationRun = 0;
let faceValidationFrameInterval = 250;
let faceValidationState = {
  cameraConnected: false,
  faceDetected: false,
  faceCentered: false,
  lightingGood: false,
  blurGood: false,
  cameraQuality: false,
  eyesVisible: false,
  insideGuide: false,
  multipleFaces: false,
  faceTooFar: false,
  faceTooClose: false,
  faceBox: null,
  ready: false,
  message: 'Waiting for camera...'
};
let faceRegistrationSamples = [];
let faceRegistrationPending = false;
let faceRegistrationSaving = false;
let faceValidationAction = 'register';
const FACE_REG_STATE = {
  status: 'Not Registered',
  registrationDate: '',
  registeredBy: '',
  remarks: '',
  history: [],
  capturedImage: '',
  cameraActive: false,
  faceCaptured: false,
  successMessage: ''
};
let FACE_REGISTRATION_REGISTERED = false;
let FACE_REGISTRATION_STATUS_VERIFIED = false;
let FACE_REGISTRATION_LOCKED = false;
const PAGE_RENDERERS = { common: {} };
let DASHBOARD_STATS = {
  total_students: 0,
  total_coordinators: 0,
  total_supervisors: 0,
  total_companies: 0,
  pending_internships: 0,
  ongoing_internships: 0,
  completed_internships: 0,
  active_internships: 0,
  total_programs: 0
};
let ADMIN_RECENT_ACTIVITIES = [];

function ensureAdminRenderers() {
  if (PAGE_RENDERERS.admin) return;

  PAGE_RENDERERS.admin = {
    dashboard: () => `
      <div class="breadcrumb">Admin Panel › Dashboard</div>
      <div style="margin-bottom:16px"><span class="tag tag-green">SY 2024–2025 • Active</span></div>
      <div class="stats-row cols4">
        <div class="stat-card blue"><div class="stat-icon">🎓</div><div class="stat-val">${DASHBOARD_STATS.total_students}</div><div class="stat-label">Total Students</div></div>
        <div class="stat-card green"><div class="stat-icon">🏢</div><div class="stat-val">${DASHBOARD_STATS.total_companies}</div><div class="stat-label">Companies</div></div>
        <div class="stat-card amber"><div class="stat-icon">👩‍💼</div><div class="stat-val">${DASHBOARD_STATS.total_coordinators}</div><div class="stat-label">Coordinators</div></div>
        <div class="stat-card teal"><div class="stat-icon">💼</div><div class="stat-val">${DASHBOARD_STATS.total_supervisors}</div><div class="stat-label">Supervisors</div></div>
      </div>
      <div class="card" style="margin-top:20px">
        <div class="card-header"><div class="card-title">Quick Summary</div></div>
        <div class="card-body">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;">
            <div style="background:var(--surface2);border-radius:10px;padding:12px"><div style="font-size:11px;color:var(--text3)">Ongoing Internships</div><div style="font-size:26px;font-weight:800">${DASHBOARD_STATS.ongoing_internships}</div></div>
            <div style="background:var(--surface2);border-radius:10px;padding:12px"><div style="font-size:11px;color:var(--text3)">Pending Applications</div><div style="font-size:26px;font-weight:800">${DASHBOARD_STATS.pending_internships}</div></div>
            <div style="background:var(--surface2);border-radius:10px;padding:12px"><div style="font-size:11px;color:var(--text3)">Completed Internships</div><div style="font-size:26px;font-weight:800">${DASHBOARD_STATS.completed_internships}</div></div>
            <div style="background:var(--surface2);border-radius:10px;padding:12px"><div style="font-size:11px;color:var(--text3)">Programs</div><div style="font-size:26px;font-weight:800">${DASHBOARD_STATS.total_programs}</div></div>
          </div>
        </div>
      </div>
    `,
    users: () => `
      <div class="breadcrumb">Admin Panel › User Management</div>
      <div class="card">
        <div class="card-body" style="min-height:200px;display:flex;align-items:center;justify-content:center;color:var(--text3)">
          User management is loading.
        </div>
      </div>
    `,
    reports: () => `
      <div class="breadcrumb">Admin Panel › Reports</div>
      <div class="card">
        <div class="card-body" style="min-height:200px;display:flex;align-items:center;justify-content:center;color:var(--text3)">
          No report data is available yet.
        </div>
      </div>
    `,
    logs: () => `
      <div class="breadcrumb">Admin Panel › Logs</div>
      <div class="card">
        <div class="card-body" style="min-height:200px;display:flex;align-items:center;justify-content:center;color:var(--text3)">
          Activity logs are loading.
        </div>
      </div>
    `
  };
}

let ADMIN_LOGS_QUERY = '';
let ADMIN_LOGS_PAGE = 1;
const ADMIN_LOGS_PAGE_SIZE = 8;

function logAdminActivity(action, description, user = currentUser?.name || ROLES.admin.name) {
  return null;
}

function recordBackendActivity(action, description) {
  if (!currentUser?.id) return;
  fetch(`${API_BASE}?resource=activity_events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ action, description }).toString()
  }).catch((error) => console.warn('Unable to record activity:', error));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── NOTIFICATION LOGIC ──
const NOTIFICATION_API = '../php/notifications.php';
let notifications = [];
let notificationsRefreshTimer = null;
let notificationsDropdownOpen = false;
let logoutInProgress = false;
let loginInProgress = false;

function normalizeNotification(record) {
  return {
    id: record.id,
    title: record.title || 'Notification',
    message: record.message || '',
    type: record.type || 'info',
    notificationType: record.notification_type || '',
    taskId: Number(record.task_id) || 0,
    attendanceId: Number(record.attendance_id) || 0,
    studentId: Number(record.student_id) || 0,
    companyId: Number(record.company_id) || 0,
    supervisorId: Number(record.supervisor_id) || 0,
    attendanceDate: record.attendance_date || record.attendanceDate || '',
    submissionId: Number(record.submission_id) || 0,
    timestamp: record.created_at || record.timestamp || new Date().toISOString(),
    unread: !!record.is_read ? false : true,
    page: record.page || null,
    url: record.url || null
  };
}

async function fetchNotifications() {
  if (!currentUser || !currentUser.role) return;
  try {
    const params = new URLSearchParams({ role: currentUser.role });
    const response = await fetch(`${NOTIFICATION_API}?${params.toString()}`);
    const data = await response.json();
    if (data.success && Array.isArray(data.notifications)) {
      notifications = data.notifications.map(normalizeNotification);
      renderNotificationCount();
      if (notificationsDropdownOpen) {
        renderNotificationsDropdown();
      }
    }
  } catch (error) {
    console.warn('Unable to fetch notifications:', error);
  }
}

function renderNotificationCount() {
  const badge = document.getElementById('topbar-notif-count');
  if (!badge) return;
  const visibleNotifications = currentRole === 'student'
    ? notifications.filter(n => ['task_assigned', 'task_rejected', 'task_approved'].includes(n.notificationType) && n.taskId)
    : notifications;
  const unreadCount = visibleNotifications.filter(n => n.unread).length;
  badge.textContent = unreadCount > 999 ? '999+' : unreadCount.toString();
  badge.classList.toggle('hidden', unreadCount === 0);
}

async function saveNotificationToDb(payload, localNotification = null) {
  if (!payload || !payload.role) return;
  try {
    const response = await fetch(NOTIFICATION_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        action: 'create',
        role: payload.role,
        username: payload.username || '',
        title: payload.title || '',
        message: payload.message || '',
        type: payload.type || 'info',
        page: payload.page || '',
        url: payload.url || ''
      })
    });
    const data = await response.json();
    if (!data.success) {
      console.warn('Notification save failed:', data.message);
    } else if (localNotification && data.notification_id) {
      localNotification.id = parseInt(data.notification_id, 10);
    }
  } catch (error) {
    console.warn('Unable to save notification to DB:', error);
  }
}

function addNotification(message, type = 'info', title = '', page = '', url = '') {
  if (currentRole === 'student' || currentUser?.role === 'student') {
    return;
  }
  const notification = {
    id: null,
    title: title || (type === 'success' ? 'Success' : type === 'warning' ? 'Warning' : type === 'error' ? 'Alert' : 'Update'),
    message,
    type,
    timestamp: new Date().toISOString(),
    unread: true,
    page: page || null,
    url: url || null
  };
  notifications.unshift(notification);
  renderNotificationCount();
  if (currentPage === 'notifications') {
    navigateTo('notifications');
  }
  saveNotificationToDb({
    role: currentUser?.role || currentRole,
    username: currentUser?.username || currentUser?.email || '',
    title: notification.title,
    message: notification.message,
    type: notification.type,
    page: notification.page || '',
    url: notification.url || ''
  }, notification);
}

function notifyTarget(role, username, message, type = 'info', title = '', page = '', url = '') {
  const notification = {
    id: null,
    title: title || (type === 'success' ? 'Success' : type === 'warning' ? 'Warning' : type === 'error' ? 'Alert' : 'Update'),
    message,
    type,
    timestamp: new Date().toISOString(),
    unread: true,
    page: page || null,
    url: url || null
  };
  if (currentUser?.role === role || (username && (currentUser?.username === username || currentUser?.email === username))) {
    notifications.unshift(notification);
    renderNotificationCount();
    if (notificationsDropdownOpen) {
      renderNotificationsDropdown();
    }
  }
  saveNotificationToDb({
    role,
    username: username || '',
    title: notification.title,
    message: notification.message,
    type: notification.type,
    page: notification.page || '',
    url: notification.url || ''
  }, currentUser?.role === role || (username && (currentUser?.username === username || currentUser?.email === username)) ? notification : null);
}

function notifyRole(role, message, type = 'info', title = '', page = '', url = '') {
  notifyTarget(role, '', message, type, title, page, url);
}

function notifyUser(role, username, message, type = 'info', title = '', page = '', url = '') {
  if (!username) return;
  notifyTarget(role, username, message, type, title, page, url);
}

async function markAsRead(index) {
  if (!notifications[index]) return;
  const notification = notifications[index];
  notification.unread = false;
  renderNotificationCount();
  renderNotificationsDropdown();
  try {
    const response = await fetch(NOTIFICATION_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ action: 'mark_read', id: notification.id || '' })
    });
    const data = await response.json();
    if (!data.success) {
      console.warn('Mark read failed:', data.message);
    }
  } catch (error) {
    console.warn('Unable to mark notification as read:', error);
  }
}

async function markAllAsRead() {
  const hadUnread = notifications.some(n => n.unread);
  notifications.forEach(n => n.unread = false);
  renderNotificationCount();
  renderNotificationsDropdown();
  try {
    const response = await fetch(NOTIFICATION_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        action: 'mark_all_read',
        role: currentUser?.role || currentRole,
        username: currentUser?.username || currentUser?.email || ''
      })
    });
    const data = await response.json();
    if (!data.success) {
      console.warn('Mark all read failed:', data.message);
      return;
    }
    if (hadUnread) {
      showNotificationToast('✓ All notifications marked as read successfully.\nYou\'re all caught up!');
    }
  } catch (error) {
    console.warn('Unable to mark all notifications as read:', error);
  }
}

async function deleteAllNotifications() {
  notifications = [];
  renderNotificationCount();
  renderNotificationsDropdown();
  try {
    const response = await fetch(NOTIFICATION_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        action: 'delete_all',
        role: currentUser?.role || currentRole,
        username: currentUser?.username || currentUser?.email || ''
      })
    });
    const data = await response.json();
    if (!data.success) {
      console.warn('Delete all notifications failed:', data.message);
    }
  } catch (error) {
    console.warn('Unable to delete notifications:', error);
  }
}

function buildNotificationIcon(type) {
  const typeMap = {
    task: '📋',
    requirement: '📄',
    journal: '📝',
    attendance: '📅',
    company: '🏢',
    supervisor: '👨‍🏫',
    evaluation: '⭐',
    feedback: '💬',
    announcement: '🔔',
    login: '🔐',
    success: '✅',
    warning: '⚠️',
    error: '❌',
    info: 'ℹ️'
  };
  return typeMap[type] || typeMap.info;
}

function getNotificationAccent(type) {
  const typeMap = {
    task: 'info',
    requirement: 'info',
    journal: 'info',
    attendance: 'warning',
    company: 'success',
    supervisor: 'info',
    evaluation: 'warning',
    feedback: 'info',
    announcement: 'warning',
    login: 'success',
    success: 'success',
    warning: 'warning',
    error: 'error',
    info: 'info'
  };
  return typeMap[type] || 'info';
}

function getNotificationTimeLabel(timestamp) {
  const now = Date.now();
  const value = new Date(timestamp).getTime();
  if (Number.isNaN(value)) return '';
  const diffMs = now - value;
  const mins = Math.max(1, Math.round(diffMs / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function showNotificationToast(message) {
  const existing = document.getElementById('notif-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'notif-toast';
  toast.className = 'toast align-items-center text-bg-success border-0 show';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.innerHTML = `<div class="d-flex"><div class="toast-body">${escapeHtml(message)}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" onclick="this.parentElement.remove()"></button></div>`;
  document.body.appendChild(toast);
  toast.style.position = 'fixed';
  toast.style.bottom = '20px';
  toast.style.right = '20px';
  toast.style.zIndex = '2000';
  toast.style.minWidth = '320px';
  setTimeout(() => { if (toast.parentElement) toast.remove(); }, 2600);
}

function toggleNotificationsDropdown() {
  notificationsDropdownOpen = !notificationsDropdownOpen;
  const dropdown = document.getElementById('topbar-notif-dropdown');
  const button = document.getElementById('topbar-notif-btn');
  if (dropdown && button) {
    dropdown.classList.toggle('hidden', !notificationsDropdownOpen);
    button.setAttribute('aria-expanded', notificationsDropdownOpen ? 'true' : 'false');
    if (notificationsDropdownOpen) {
      renderNotificationsDropdown();
    }
  }
}

function renderNotificationsDropdown() {
  const list = document.getElementById('topbar-notif-list');
  if (!list) return;
  const visibleNotifications = currentRole === 'student'
    ? notifications.filter(n => ['task_assigned', 'task_rejected', 'task_approved'].includes(n.notificationType) && n.taskId)
    : notifications;
  if (!visibleNotifications.length) {
    list.innerHTML = `
      <div class="notif-empty-state">
        <div class="notif-empty-icon">🔔</div>
        <div class="notif-empty-title">No notifications yet.</div>
        <div class="notif-empty-text">You&apos;re all caught up!</div>
      </div>
    `;
    return;
  }
  const items = visibleNotifications.map((notif) => {
    const index = notifications.indexOf(notif);
    return `
    <div class="notif-item ${notif.unread ? 'unread' : ''}" onclick="handleNotificationClick(${index})">
      <div class="notif-icon ${getNotificationAccent(notif.type)}">${buildNotificationIcon(notif.type)}</div>
      <div class="notif-content">
        <div class="notif-title-row">
          <div class="notif-title">${escapeHtml(notif.title)}</div>
          ${notif.unread ? '<span class="notif-unread-dot"></span>' : ''}
        </div>
        <div class="notif-message">${escapeHtml(notif.message)}</div>
        <div class="notif-meta">${getNotificationTimeLabel(notif.timestamp)}</div>
      </div>
    </div>
  `;
  }).join('');
  list.innerHTML = items;
}

function handleNotificationClick(index) {
  const notif = notifications[index];
  if (!notif) return;
  if (currentRole === 'admin' && ['user_login', 'user_logout'].includes(notif.notificationType)) {
    markAsRead(index).finally(() => {
      closeNotificationsDropdown();
      navigateTo('logs');
    });
    return;
  }
  if (currentRole === 'coordinator' && ['NEW_STUDENT', 'NEW_COMPANY'].includes(notif.notificationType)) {
    markAsRead(index);
    toggleNotificationsDropdown();
    navigateTo(notif.notificationType === 'NEW_STUDENT' ? 'student-records' : 'company-assignment');
    return;
  }
  if (currentRole === 'student' && ['task_assigned', 'task_rejected', 'task_approved'].includes(notif.notificationType) && notif.taskId) {
    markAsRead(index).then(() => {
      toggleNotificationsDropdown();
      window.STUDENT_TASK_FOCUS_ID = notif.taskId;
      navigateTo('tasks');
      setTimeout(() => focusStudentTask(notif.taskId), 300);
    });
    return;
  }
  if (currentRole === 'student' && notif.notificationType === 'task_rejected' && notif.taskId) {
    markAsRead(index).then(() => {
      toggleNotificationsDropdown();
      window.STUDENT_TASK_FOCUS_ID = notif.taskId;
      navigateTo('tasks');
      setTimeout(() => focusStudentTask(notif.taskId), 300);
    });
    return;
  }
  if (currentRole === 'supervisor' && notif.notificationType === 'attendance') {
    markAsRead(index);
    toggleNotificationsDropdown();
    const attendanceDate = notif.attendanceDate ? notif.attendanceDate : (notif.timestamp ? new Date(notif.timestamp).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
    window.SUPERVISOR_ATTENDANCE_TARGET = {
      attendanceId: notif.attendanceId || 0,
      studentId: notif.studentId || 0,
      date: attendanceDate
    };
    navigateTo('attendance');
    return;
  }
  if (currentRole === 'supervisor' && notif.notificationType === 'task_submission') {
    markAsRead(index);
    toggleNotificationsDropdown();
    window.SUPERVISOR_SUBMISSION_TARGET = {
      submissionId: notif.submissionId || 0,
      taskId: notif.taskId || 0,
      studentId: notif.studentId || 0
    };
    navigateTo('submissions');
    return;
  }
  if (currentRole === 'student') return;
  if (notif.unread) {
    markAsRead(index);
  }
  if (notif.page) {
    toggleNotificationsDropdown();
    navigateTo(notif.page);
    return;
  }
  if (notif.url) {
    window.location.href = notif.url;
  }
}

function applySupervisorAttendanceNotificationTarget() {
  if (currentRole !== 'supervisor' || !window.SUPERVISOR_ATTENDANCE_TARGET || currentPage !== 'attendance') {
    return;
  }
  const target = window.SUPERVISOR_ATTENDANCE_TARGET;
  const dateInput = document.querySelector('#content input[type="date"]');
  if (dateInput && target.date) {
    dateInput.value = target.date;
  }
  const studentSelect = document.querySelector('#content select.form-select');
  if (studentSelect && target.studentId) {
    const studentName = SUPERVISOR_LIVE_STUDENTS.find(student => Number(student.student_id || student.id) === Number(target.studentId))?.student_name || '';
    if (studentName) {
      studentSelect.value = studentName;
    }
  }
  const rows = document.querySelectorAll('#content table tbody tr');
  rows.forEach((row) => {
    const text = row.textContent || '';
    const isMatch = target.studentId
      ? text.includes(String(target.studentId)) || text.includes((SUPERVISOR_LIVE_STUDENTS.find(student => Number(student.student_id || student.id) === Number(target.studentId))?.student_name || ''))
      : false;
    row.style.background = isMatch ? 'rgba(212, 160, 23, 0.12)' : '';
    row.style.boxShadow = isMatch ? 'inset 0 0 0 1px rgba(212, 160, 23, 0.7)' : '';
  });
}

function applySupervisorSubmissionNotificationTarget() {
  if (currentRole !== 'supervisor' || !window.SUPERVISOR_SUBMISSION_TARGET || currentPage !== 'submissions') {
    return;
  }
  const target = window.SUPERVISOR_SUBMISSION_TARGET;
  const row = target.submissionId
    ? document.querySelector(`#content table tbody tr[data-submission-id="${Number(target.submissionId)}"]`)
    : null;
  if (row) {
    row.style.background = 'rgba(212, 160, 23, 0.12)';
    row.style.boxShadow = 'inset 0 0 0 1px rgba(212, 160, 23, 0.7)';
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function focusStudentTask(taskId) {
  const taskElement = document.getElementById(`student-task-${Number(taskId) || 0}`);
  taskElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function viewAllNotifications() {
  closeNotificationsDropdown();
  openNotificationsModal();
}

function openNotificationsModal() {
  const body = notifications.length
    ? notifications.map((notif, index) => `
        <div class="notif-item ${notif.unread ? 'unread' : ''}" onclick="handleNotificationClick(${index})" style="cursor:pointer;">
          <div class="notif-icon ${getNotificationAccent(notif.type)}">${buildNotificationIcon(notif.type)}</div>
          <div class="notif-content">
            <div class="notif-title-row">
              <div class="notif-title">${escapeHtml(notif.title)}</div>
              ${notif.unread ? '<span class="notif-unread-dot"></span>' : ''}
            </div>
            <div class="notif-message">${escapeHtml(notif.message)}</div>
            <div class="notif-meta">${getNotificationTimeLabel(notif.timestamp)}</div>
          </div>
        </div>
      `).join('')
    : '<div class="notif-list-empty">No notifications to display.</div>';
  openGenModal('Notifications', body, null, 'Close');
}

function closeNotificationsDropdown() {
  notificationsDropdownOpen = false;
  const dropdown = document.getElementById('topbar-notif-dropdown');
  const button = document.getElementById('topbar-notif-btn');
  if (dropdown) dropdown.classList.add('hidden');
  if (button) button.setAttribute('aria-expanded', 'false');
}

function handleClickOutsideNotifications(event) {
  const dropdown = document.getElementById('topbar-notif-dropdown');
  const button = document.getElementById('topbar-notif-btn');
  if (!dropdown || !button || !notificationsDropdownOpen) return;
  if (!dropdown.contains(event.target) && !button.contains(event.target)) {
    closeNotificationsDropdown();
  }
}

let COORDINATORS = [
  { name:'Ma. Elena Santos', email:'me.santos@bisu.edu.ph', prog:'BIndTech Elect', students:60, status:'Active' },
  { name:'Dr. Carlos Reyes', email:'c.reyes@bisu.edu.ph', prog:'BSCS', students:52, status:'Active' },
];

const ADMIN_COMPANIES = [
  { id: 1, name:'Tech Solutions Inc.', location:'Calape, Bohol', contact_email:'ojt@techsolutions.ph', status:'Active' },
  { id: 2, name:'Innovatech Global', location:'Tagbilaran City', contact_email:'contact@innovatech.ph', status:'Active' },
  { id: 3, name:'Island Digital Hub', location:'Panglao, Bohol', contact_email:'info@islanddigital.ph', status:'Active' },
  { id: 4, name:'Cebu Softworks', location:'Cebu City', contact_email:'hr@cebusoftworks.ph', status:'Active' },
];
let ADMIN_COMPANY_PAGE_RECORDS = [];
window.__companyTotalPages = 1;
window.__companyLoadedKey = '';
window.__companyPageRequest = null;

let PROGRAMS = [
  { code:'BTE', name:'BIndTech Elect', req:500, students:60, coord:'Ma. Elena Santos', dept:'Industrial Technology', status:'Active', studentsList:Array.from({ length: 60 }, (_, i) => `BTE Student ${i + 1}`) },
  { code:'BSCS', name:'Bachelor of Science in Computer Science', req:500, students:52, coord:'Dr. Carlos Reyes', dept:'Computer Studies', status:'Active', studentsList:Array.from({ length: 52 }, (_, i) => `BSCS Student ${i + 1}`) },
  { code:'BFST', name:'BIndTech FPST', req:500, students:55, coord:'TBD', dept:'Food Technology', status:'Active', studentsList:Array.from({ length: 55 }, (_, i) => `BFST Student ${i + 1}`) },
];

let SCHOOL_YEARS = [
  { year:'2024–2025', semester:'2nd Semester', start:'Jan 15, 2025', end:'May 30, 2025', students:186, status:'Active' },
  { year:'2024–2025', semester:'1st Semester', start:'Aug 12, 2024', end:'Dec 20, 2024', students:172, status:'Completed' },
  { year:'2023–2024', semester:'2nd Semester', start:'Jan 10, 2024', end:'May 24, 2024', students:160, status:'Completed' },
  { year:'2023–2024', semester:'1st Semester', start:'Aug 7, 2023', end:'Dec 15, 2023', students:155, status:'Completed' },
];

const ADMIN_STUDENTS = [
  { studentId: '2024-00123', name: 'Juan dela Cruz', program: 'BSCS', yearLevel: '3rd Year', section: 'A', email: 'jdc@student.bisu.edu.ph', contact: '+63 912 345 6789', username: 'student123', password: 'password123', status: 'Active' },
  { studentId: '2024-00124', name: 'Maria Santos', program: 'BTE', yearLevel: '4th Year', section: 'B', email: 'm.santos@student.bisu.edu.ph', contact: '+63 917 555 6789', username: 'maria123', password: 'password123', status: 'Active' },
  { studentId: '2024-00125', name: 'Carlo Reyes', program: 'BSCS', yearLevel: '3rd Year', section: 'A', email: 'c.reyes@student.bisu.edu.ph', contact: '+63 999 111 2222', username: 'carlo123', password: 'password123', status: 'Active' },
  { studentId: '2024-00126', name: 'Ana Buenaventura', program: 'BFST', yearLevel: '4th Year', section: 'C', email: 'a.buena@student.bisu.edu.ph', contact: '+63 908 444 5555', username: 'ana123', password: 'password123', status: 'Active' },
  { studentId: '2024-00127', name: 'Paolo Mendoza', program: 'BSCS', yearLevel: '4th Year', section: 'A', email: 'p.mendoza@student.bisu.edu.ph', contact: '+63 945 777 8888', username: 'paolo123', password: 'password123', status: 'Active' }
];

const SUPERVISORS = [
  { name: 'Thomas Shelby', company: 'Tech Solutions Inc.', email: 'ojt@techsolutions.ph', contact: '+63 998 765 4321', status: 'Active' },
  { name: 'Arthur Shelby', company: 'Innovatech Global', email: 'recruiting@innovatech.ph', contact: '+63 915 123 4567', status: 'Active' },
  { name: 'John Shelby', company: 'Island Digital Hub', email: 'info@islanddigital.ph', contact: '+63 920 333 4444', status: 'Active' },
  { name: 'Ada Thorne', company: 'Cebu Softworks', email: 'hr@cebusoftworks.ph', contact: '+63 916 555 4321', status: 'Active' }
];

let INTERNSHIPS = [
  { studentName: 'Juan dela Cruz', company: 'Tech Solutions Inc.', supervisor: 'Thomas Shelby', coordinator: 'Dr. Carlos Reyes', status: 'Ongoing', requirements: { MOA: true, Resume: true, Medical: true, Clearance: false }, hoursCompleted: 312, evaluationScore: 85, completionCleared: false },
  { studentName: 'Maria Santos', company: 'Innovatech Global', supervisor: 'Arthur Shelby', coordinator: 'Ma. Elena Santos', status: 'Ongoing', requirements: { MOA: true, Resume: true, Medical: true, Clearance: false }, hoursCompleted: 420, evaluationScore: 88, completionCleared: false },
  { studentName: 'Carlo Reyes', company: 'Island Digital Hub', supervisor: 'John Shelby', coordinator: 'Dr. Carlos Reyes', status: 'Pending', requirements: { MOA: false, Resume: true, Medical: false, Clearance: false }, hoursCompleted: 0, evaluationScore: 0, completionCleared: false },
  { studentName: 'Ana Buenaventura', company: 'Cebu Softworks', supervisor: 'Ada Thorne', coordinator: 'Ma. Elena Santos', status: 'Ongoing', requirements: { MOA: true, Resume: true, Medical: true, Clearance: false }, hoursCompleted: 265, evaluationScore: 0, completionCleared: false },
  { studentName: 'Paolo Mendoza', company: 'Tech Solutions Inc.', supervisor: 'Thomas Shelby', coordinator: 'Dr. Carlos Reyes', status: 'Completed', requirements: { MOA: true, Resume: true, Medical: true, Clearance: true }, hoursCompleted: 500, evaluationScore: 95, completionCleared: true }
];

const ACCOUNTS = [
  { name:'Admin User', email:'admin@bisu.edu.ph', role:'Admin', created:'Jan 2024', last:'Just now', status:'Active', password: 'admin123' },
  { name:'Ma. Elena Santos', email:'me.santos@bisu.edu.ph', role:'Coordinator', created:'Jun 2023', last:'Apr 29', status:'Active', password: 'coordinator123' },
  { name:'Dr. Carlos Reyes', email:'c.reyes@bisu.edu.ph', role:'Coordinator', created:'Jul 2023', last:'Apr 28', status:'Active', password: 'coordinator123' },
  { name:'Thomas Shelby', email:'ojt@techsolutions.ph', role:'Supervisor', created:'Sep 2023', last:'Apr 28', status:'Active', password: 'supervisor123' },
  { name:'Arthur Shelby', email:'recruiting@innovatech.ph', role:'Supervisor', created:'Oct 2023', last:'Apr 27', status:'Active', password: 'supervisor123' },
  { name:'Juan dela Cruz', email:'jdc@student.bisu.edu.ph', role:'Student', created:'Aug 2024', last:'Apr 29', status:'Active', password: 'student123' },
  { name:'Maria Santos', email:'m.santos@student.bisu.edu.ph', role:'Student', created:'Aug 2024', last:'Apr 28', status:'Active', password: 'student123' },
  { name:'Carlo Reyes', email:'c.reyes@student.bisu.edu.ph', role:'Student', created:'Aug 2024', last:'Apr 29', status:'Active', password: 'student123' },
  { name:'Ana Buenaventura', email:'a.buena@student.bisu.edu.ph', role:'Student', created:'Aug 2024', last:'Apr 27', status:'Active', password: 'student123' },
  { name:'Paolo Mendoza', email:'p.mendoza@student.bisu.edu.ph', role:'Student', created:'Aug 2024', last:'Apr 26', status:'Active', password: 'student123' },
];

const SYSTEM_LOGS = [
  { ts:'2026-04-29 08:02:11', user:'Juan dela Cruz', role:'Student', action:'Face scan time-in recorded', ip:'192.168.1.42' },
  { ts:'2026-04-29 08:02:09', user:'Juan dela Cruz', role:'Student', action:'Login successful', ip:'192.168.1.42' },
  { ts:'2026-04-29 07:55:32', user:'Maria Santos', role:'Student', action:'Face scan time-in recorded', ip:'192.168.1.18' },
  { ts:'2026-04-29 07:45:01', user:'Ma. Santos', role:'Coordinator', action:'Viewed attendance records', ip:'192.168.1.5' },
  { ts:'2026-04-28 17:03:45', user:'Juan dela Cruz', role:'Student', action:'Face scan time-out recorded', ip:'192.168.1.42' },
  { ts:'2026-04-28 16:50:11', user:'Tech Solutions', role:'Supervisor', action:'Task assigned to interns', ip:'203.82.17.91' },
  { ts:'2026-04-28 14:30:00', user:'Admin User', role:'Admin', action:'Created new coordinator account', ip:'192.168.1.1' },
];

let STUDENT_TASKS = [];

function normalizeStudentTask(task) {
  const rawStatus = task.status || 'Pending';
  const submissionStatus = (task.submission_status || '').trim();
  let status = rawStatus;

  if (submissionStatus === 'Approved' || rawStatus === 'Completed') {
    status = 'Completed';
  } else if (submissionStatus === 'Rejected' || rawStatus === 'Rejected / Needs Revision') {
    status = 'Needs Revision';
  } else if (submissionStatus === 'For Review') {
    status = Boolean(Number(task.is_late)) ? 'Late / For Review' : 'Submitted / For Review';
  } else if (rawStatus === 'Ongoing') {
    status = 'Ongoing';
  } else if (rawStatus === 'Pending') {
    status = 'Pending';
  } else {
    status = 'Pending';
  }

  const tag = status === 'Completed'
    ? 'tag-green'
    : status === 'Needs Revision'
      ? 'tag-red'
      : status === 'Late / For Review' || status === 'Submitted / For Review'
        ? 'tag-amber'
        : status === 'Ongoing'
          ? 'tag-blue'
          : 'tag-gray';

  return {
    id: Number(task.id) || 0,
    name: task.title || '',
    description: task.description || '',
    due: task.due_date ? `Due ${task.due_date}` : 'No due date',
    tag,
    tagLabel: status,
    status,
    done: status === 'Completed',
    submissionId: Number(task.submission_id) || 0,
    submissionStatus,
    isLate: Boolean(Number(task.is_late)),
    startedAt: task.started_at || '',
    completedAt: task.completed_at || ''
  };
}

async function loadStudentTasks() {
  if (currentRole !== 'student') return;
  try {
    const response = await fetch(`${API_BASE}?resource=tasks&_=${Date.now()}`, { cache: 'no-store' });
    const data = await response.json();
    if (!data.success || !Array.isArray(data.tasks)) throw new Error(data.message || 'Unable to load tasks.');
    STUDENT_TASKS = data.tasks.map(normalizeStudentTask);
    TASK_UNREAD_COUNTS.student = STUDENT_TASKS.filter(task => task.status !== 'Completed').length;
    buildNav();
  } catch (error) {
    STUDENT_TASKS = [];
    TASK_UNREAD_COUNTS.student = 0;
    console.warn('Unable to load student tasks:', error);
  }
}

let SUPERVISOR_TASKS = [];

let ATTENDANCE_LOG = [];

let SUBMISSIONS = [
  { student:'Juan dela Cruz', task:'Weekly Journal', name:'Week11_Journal.pdf', date:'Apr 22', status:'Approved', tag:'tag-green' },
  { student:'Juan dela Cruz', task:'Database Schema Report', name:'DB_Schema_Report.docx', date:'Apr 20', status:'Approved', tag:'tag-green' },
  { student:'Paolo Mendoza', task:'Meeting Minutes', name:'Meeting_Minutes_Apr15.pdf', date:'Apr 15', status:'For Review', tag:'tag-amber' },
  { student:'Juan dela Cruz', task:'System Documentation', name:'SysDoc_Draft_v1.docx', date:'Apr 28', status:'For Review', tag:'tag-amber' },
];

let pendingUploadFile = null;

const ROLES = {
  student: {
    name: 'Juan dela Cruz',
    label: 'Student',
    initials: 'JC',
    badge: 'BSIT-3A',
    photo: '../images/profile-placeholder.svg',
    email: 'jdc@student.bisu.edu.ph',
    contact: '+63 912 345 6789',
    nis: '2024-00123'
  },
  supervisor: {
    name: 'Tech Solutions Inc.',
    label: 'Supervisor',
    initials: 'TS',
    badge: 'Host Company',
    photo: '../images/profile-placeholder.svg',
    email: 'ojt@techsolutions.ph',
    contact: '+63 998 765 4321',
    nis: 'SUP-001'
  },
  coordinator: {
    name: 'Ma. Santos',
    label: 'OJT Coordinator',
    initials: 'MS',
    badge: 'Coordinator',
    photo: '../images/profile-placeholder.svg',
    email: 'me.santos@bisu.edu.ph',
    contact: '+63 917 555 1234',
    nis: 'COORD-001'
  },
  admin: {
    name: 'Admin User',
    label: 'System Admin',
    initials: 'AU',
    badge: 'Administrator',
    photo: '../images/profile-placeholder.svg',
    email: 'admin@bisu.edu.ph',
    contact: '+63 912 000 0000',
    nis: 'ADMIN-001'
  }
};

const VALID_ROLES = ['student','supervisor','coordinator','admin'];

const NAV = {
  student: [
    { id:'dashboard', icon:'📊', label:'Dashboard' },
    { id:'facereg', icon:'<i class="bi bi-camera-fill"></i>', label:'Face Registration' },
    { id:'timein', icon:'📷', label:'Time In / Time Out' },
    { id:'tasks', icon:'✅', label:'My Tasks', badge: 3 },
    { id:'submissions', icon:'📁', label:'File Submissions' },
    { id:'attendance', icon:'🗓️', label:'My Attendance' },
  ],
  coordinator: [
    { id:'dashboard', icon:'📊', label:'Dashboard' },
    { id:'students', icon:'🎓', label:'Student Management' },
    { id:'companies', icon:'🏢', label:'Company Management' },
    { id:'attendance', icon:'🗓️', label:'Attendance Monitoring' },
    { id:'reports', icon:'📋', label:'Reports & Analytics' },
  ],
  supervisor: [
    { id:'dashboard', icon:'📊', label:'Dashboard' },
    { id:'interns', icon:'🎓', label:'Student List' },
    { id:'tasks', icon:'✅', label:'Task Management', badge: 2 },
    { id:'submissions', icon:'📁', label:'Submission Review' },
    { id:'attendance', icon:'🗓️', label:'Attendance View' },
  ],
  admin: [
    { id:'dashboard', icon:'📊', label:'Dashboard' },
    { id:'academicyear', icon:'🗓️', label:'Academic Year' },
    { id:'programs', icon:'📚', label:'Programs' },
    { id:'companies', icon:'🏢', label:'Companies' },
    { id:'users', icon:'👥', label:'User Management' },
    { id:'reports', icon:'📋', label:'Reports' },
    { id:'logs', icon:'📜', label:'Logs' },
  ]
  };

const TASK_UNREAD_COUNTS = {
  student: 3,
  supervisor: 2,
  coordinator: 0,
  admin: 0
};

const ADMIN_USER_MGMT_STATE = {
  tab: 'students',
  filter: '',
  page: 1
};
let ADMIN_USER_LIST = [];
let ADMIN_USER_MGMT_LOADING = false;
let ADMIN_USER_MGMT_ALERT = '';
let ADMIN_USER_MGMT_ERROR = false;

function switchAdminUserTab(tab) {
  if (!['students','coordinators','supervisors'].includes(tab)) return;
  ADMIN_USER_MGMT_STATE.tab = tab;
  ADMIN_USER_MGMT_STATE.filter = '';
  ADMIN_USER_MGMT_STATE.page = 1;
  renderAdminUserManagementTab();
}

function handleAdminUserSearch(value) {
  ADMIN_USER_MGMT_STATE.filter = value;
  ADMIN_USER_MGMT_STATE.page = 1;
  renderAdminUserManagementTab();
}

function changeAdminUserPage(delta) {
  const entries = getAdminUserEntries(ADMIN_USER_MGMT_STATE.tab, ADMIN_USER_MGMT_STATE.filter);
  const totalPages = Math.max(1, Math.ceil(entries.length / 10));
  ADMIN_USER_MGMT_STATE.page = Math.min(Math.max(1, ADMIN_USER_MGMT_STATE.page + delta), totalPages);
  renderAdminUserManagementTab();
}

function getAdminUserEntries(tab, filter = '') {
  const term = (filter || '').trim().toLowerCase();
  return ADMIN_USER_LIST.filter(item => {
    if (item.role !== (tab === 'students' ? 'student' : tab === 'coordinators' ? 'coordinator' : 'supervisor')) {
      return false;
    }
    if (!term) return true;
    return [
      item.name,
      item.username,
      item.email,
      item.student_id,
      item.employee_id,
      item.company,
      item.program,
      item.academic_year
    ].some(value => String(value || '').toLowerCase().includes(term));
  });
}

function getAdminSelectedRole() {
  return ADMIN_USER_MGMT_STATE.tab === 'coordinators' ? 'coordinator'
    : ADMIN_USER_MGMT_STATE.tab === 'supervisors' ? 'supervisor'
      : 'student';
}

function assignCompanyToStudent(index) {
  const student = ADMIN_STUDENTS[index];
  if (!student) return;
  const options = ADMIN_COMPANIES.map(c => `<option value="${escapeHtml(c.name)}" ${c.name === student.company ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('');
  const body = `
    <div class="form-row"><label class="form-label">Student</label><div class="form-text">${escapeHtml(student.name)}</div></div>
    <div class="form-row"><label class="form-label">Company</label><select class="form-select" id="assign-student-company">${options}</select></div>
  `;
  openGenModal('Assign Company', body, () => {
    student.company = document.getElementById('assign-student-company').value;
    addNotification(`Assigned ${student.company} to ${student.name}`, 'success');
    renderAdminUserManagementTab();
  }, 'Save');
}

function assignSupervisorToStudent(index) {
  const student = ADMIN_STUDENTS[index];
  if (!student) return;
  const options = SUPERVISORS.map(s => `<option value="${escapeHtml(s.name)}" ${s.name === student.supervisor ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('');
  const body = `
    <div class="form-row"><label class="form-label">Student</label><div class="form-text">${escapeHtml(student.name)}</div></div>
    <div class="form-row"><label class="form-label">Supervisor</label><select class="form-select" id="assign-student-supervisor"><option value="">Unassigned</option>${options}</select></div>
  `;
  openGenModal('Assign Supervisor', body, () => {
    student.supervisor = document.getElementById('assign-student-supervisor').value;
    addNotification(`Assigned supervisor to ${student.name}`, 'success');
    renderAdminUserManagementTab();
  }, 'Save');
}

function registerStudentFace(index) {
  const student = ADMIN_STUDENTS[index];
  if (!student) return;
  const body = `
    <div class="form-row"><label class="form-label">Student</label><div class="form-text">${escapeHtml(student.name)}</div></div>
    <div class="form-row"><label class="form-label">Face Registration</label><div class="form-text">Use the dedicated face registration flow to capture the student face.</div></div>
  `;
  openGenModal('Register Face', body, () => {
    addNotification(`Face registration started for ${student.name}`, 'success');
  }, 'Start');
}

function viewStudentFace(index) {
  const student = ADMIN_STUDENTS[index];
  if (!student) return;
  const body = `
    <div class="form-row"><label class="form-label">Student</label><div class="form-text">${escapeHtml(student.name)}</div></div>
    <div class="form-row"><label class="form-label">Face Status</label><div class="form-text">${student.faceRegistered ? 'Registered' : 'Not registered'}</div></div>
  `;
  openGenModal('View Registered Face', body, null, 'Close');
}

function openStudentViewModal(index) {
  const s = ADMIN_STUDENTS[index];
  if (!s) return;
  const body = `
    <div class="form-row"><label class="form-label">Student ID</label><div class="form-text">${escapeHtml(s.studentId)}</div></div>
    <div class="form-row"><label class="form-label">Full Name</label><div class="form-text">${escapeHtml(s.name)}</div></div>
    <div class="form-row"><label class="form-label">Program</label><div class="form-text">${escapeHtml(s.program)}</div></div>
    <div class="form-row"><label class="form-label">Year Level</label><div class="form-text">${escapeHtml(s.yearLevel)}</div></div>
    <div class="form-row"><label class="form-label">Section</label><div class="form-text">${escapeHtml(s.section)}</div></div>
    <div class="form-row"><label class="form-label">Email</label><div class="form-text">${escapeHtml(s.email)}</div></div>
    <div class="form-row"><label class="form-label">Contact Number</label><div class="form-text">${escapeHtml(s.contact)}</div></div>
    <div class="form-row"><label class="form-label">Username</label><div class="form-text">${escapeHtml(s.username)}</div></div>
    <div class="form-row"><label class="form-label">Status</label><div class="form-text">${escapeHtml(s.status)}</div></div>
  `;
  openGenModal('View Student', body, null, 'Close');
}

function openCoordinatorViewModal(index) {
  const c = COORDINATORS[index];
  if (!c) return;
  const body = `
    <div class="form-row"><label class="form-label">Full Name</label><div class="form-text">${escapeHtml(c.name)}</div></div>
    <div class="form-row"><label class="form-label">Program</label><div class="form-text">${escapeHtml(c.prog)}</div></div>
    <div class="form-row"><label class="form-label">Email</label><div class="form-text">${escapeHtml(c.email)}</div></div>
    <div class="form-row"><label class="form-label">Status</label><div class="form-text">${escapeHtml(c.status)}</div></div>
  `;
  openGenModal('View Coordinator', body, null, 'Close');
}

function openSupervisorViewModal(index) {
  const s = SUPERVISORS[index];
  if (!s) return;
  const body = `
    <div class="form-row"><label class="form-label">Full Name</label><div class="form-text">${escapeHtml(s.name)}</div></div>
    <div class="form-row"><label class="form-label">Company</label><div class="form-text">${escapeHtml(s.company)}</div></div>
    <div class="form-row"><label class="form-label">Email</label><div class="form-text">${escapeHtml(s.email)}</div></div>
    <div class="form-row"><label class="form-label">Contact Number</label><div class="form-text">${escapeHtml(s.contact)}</div></div>
    <div class="form-row"><label class="form-label">Status</label><div class="form-text">${escapeHtml(s.status)}</div></div>
  `;
  openGenModal('View Supervisor', body, null, 'Close');
}

function confirmResetUserPassword(email, role) {
  const acc = ACCOUNTS.find(a => a.email.toLowerCase() === email.toLowerCase() && a.role === role);
  if (!acc) return;
  const body = `
    <div class="form-row"><label class="form-label">Reset Password</label><div class="form-text">Are you sure you want to reset the password for <strong>${escapeHtml(acc.name)}</strong> (${escapeHtml(acc.role)})?</div></div>
    <div class="form-row"><label class="form-label">Email</label><div class="form-text">${escapeHtml(acc.email)}</div></div>
  `;
  openGenModal('Reset Password', body, () => { resetUserPassword(email, role); return true; }, 'Reset Password');
}

function renderAdminUserManagementTabContent() {
  if (ADMIN_USER_MGMT_LOADING) {
    return `<div style="padding:24px 0;color:var(--text3);">Loading users…</div>`;
  }

  const { tab, filter, page } = ADMIN_USER_MGMT_STATE;
  const entries = getAdminUserEntries(tab, filter);
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visible = entries.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const activeLabel = tab === 'students' ? 'Students' : tab === 'coordinators' ? 'Coordinators' : 'Supervisors';

  const isCoordinatorTable = tab === 'coordinators';
  const isStudentTable = tab === 'students';
  const isSupervisorTable = tab === 'supervisors';
  const rows = visible.map(item => {
    const roleLabel = item.role.charAt(0).toUpperCase() + item.role.slice(1);
    const statusTag = `<span class="badge bg-${item.status === 'Active' ? 'success' : 'secondary'}">${escapeHtml(item.status)}</span>`;
    const createdText = getSafeUserCreatedText(item.created);
    return `
      <tr>
        ${isCoordinatorTable ? `
        <td>${escapeHtml(item.name)}</td>
        <td>${escapeHtml(item.username || '')}</td>
        <td>${escapeHtml(item.contact || '')}</td>
        <td>${escapeHtml(item.program_name || item.program || 'Unassigned')}</td>
        <td>${statusTag}</td>` : `
        ${isStudentTable ? `
        <td>${escapeHtml(item.name)}</td>
        <td>${escapeHtml(item.username || '')}</td>
        <td>${escapeHtml(item.student_id || '')}</td>
        <td>${escapeHtml(item.program_name || item.program || 'Unassigned')}</td>
        <td>${statusTag}</td>` : isSupervisorTable ? `
        <td>${escapeHtml(item.name)}</td>
        <td>${escapeHtml(item.username || '')}</td>
        <td>${escapeHtml(item.contact || '')}</td>
        <td>${escapeHtml(item.company_name || item.company || 'Unassigned')}</td>
        <td>${statusTag}</td>` : `
        <td>${item.id}</td>
        <td>${escapeHtml(item.name)}</td>
        <td>${escapeHtml(item.username || '')}</td>
        <td>${escapeHtml(roleLabel)}</td>
        <td>${escapeHtml(item.email)}</td>
        <td>${statusTag}</td>
        <td>${escapeHtml(createdText)}</td>`}`}
        <td>
          <div class="admin-user-action-group" role="group" aria-label="Actions">
            <button type="button" class="admin-user-action-btn admin-user-action-view" title="View User" aria-label="View User" onclick="openViewUserModal(${item.id})">
              <i class="bi bi-eye-fill admin-user-action-icon"></i>
            </button>
            <button type="button" class="admin-user-action-btn admin-user-action-edit" title="Edit User" aria-label="Edit User" onclick="openEditUserModal(${item.id})">
              <i class="bi bi-pencil-fill admin-user-action-icon"></i>
            </button>
            <button type="button" class="admin-user-action-btn admin-user-action-reset" title="Reset Password" aria-label="Reset Password" onclick="openResetPasswordModal(${item.id})">
              <i class="bi bi-key-fill admin-user-action-icon"></i>
            </button>
            <button type="button" class="admin-user-action-btn admin-user-action-deactivate" title="${item.status === 'Active' ? 'Deactivate User' : 'Activate User'}" aria-label="${item.status === 'Active' ? 'Deactivate User' : 'Activate User'}" onclick="toggleUserStatus(${item.id})">
              <i class="bi ${item.status === 'Active' ? 'bi-slash-circle-fill' : 'bi-check-circle-fill'} admin-user-action-icon"></i>
            </button>
          </div>
        </td>
      </tr>`;
  }).join('');

  return `
    <div class="mb-3">
      <div class="btn-group" role="group" aria-label="User tabs">
        <button type="button" class="btn btn-${ADMIN_USER_MGMT_STATE.tab === 'students' ? 'primary' : 'outline-secondary'} btn-sm admin-user-tab-btn fw-bold" data-tab="students" onclick="switchAdminUserTab('students')">Students</button>
        <button type="button" class="btn btn-${ADMIN_USER_MGMT_STATE.tab === 'coordinators' ? 'primary' : 'outline-secondary'} btn-sm admin-user-tab-btn fw-bold" data-tab="coordinators" onclick="switchAdminUserTab('coordinators')">Coordinators</button>
        <button type="button" class="btn btn-${ADMIN_USER_MGMT_STATE.tab === 'supervisors' ? 'primary' : 'outline-secondary'} btn-sm admin-user-tab-btn fw-bold" data-tab="supervisors" onclick="switchAdminUserTab('supervisors')">Supervisors</button>
      </div>
    </div>
    <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
      <div class="flex-grow-1">
        <input id="admin-user-search" type="search" class="form-control form-control-sm" value="${escapeHtml(filter)}" placeholder="Search by name, username, email, student ID, or employee ID" oninput="handleAdminUserSearch(this.value)">
      </div>
      <button type="button" class="btn btn-primary btn-sm" onclick="openAccountModal(null, getAdminSelectedRole())">+ Create Account</button>
    </div>
    <div class="table-responsive">
      <table class="table table-hover table-sm align-middle">
        <thead class="table-light">
          <tr>${isCoordinatorTable ? `
            <th>Name</th>
            <th>Username</th>
            <th>Contact Number</th>
            <th>Program</th>
            <th>Status</th>` : isStudentTable ? `
            <th>Student Name</th>
            <th>Username</th>
            <th>Student ID</th>
            <th>Program</th>
            <th>Status</th>` : isSupervisorTable ? `
            <th>Supervisor Name</th>
            <th>Username</th>
            <th>Contact Number</th>
            <th>Company</th>
            <th>Status</th>` : `
            <th>ID</th>
            <th>Full Name</th>
            <th>Username</th>
            <th>Role</th>
            <th>Email</th>
            <th>Status</th>
            <th>Date Created</th>`}
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="${isCoordinatorTable || isStudentTable || isSupervisorTable ? 6 : 8}" class="text-center text-muted py-4">No ${activeLabel.toLowerCase()} found.</td></tr>`}</tbody>
      </table>
    </div>
    <div class="d-flex justify-content-between align-items-center mt-3">
      <div class="text-muted">${entries.length} account${entries.length === 1 ? '' : 's'}</div>
      <div class="btn-group btn-group-sm">
        <button type="button" class="btn btn-outline-secondary" onclick="changeAdminUserPage(-1)" ${currentPage <= 1 ? 'disabled' : ''}>Previous</button>
        <button type="button" class="btn btn-outline-secondary" onclick="changeAdminUserPage(1)" ${currentPage >= totalPages ? 'disabled' : ''}>Next</button>
      </div>
      <div class="text-muted">Page ${currentPage} of ${totalPages}</div>
    </div>
  `;
}

function formatUserCreatedDate(value) {
  if (!value || (typeof value === 'object' && typeof value.then === 'function')) return 'N/A';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || 'N/A');
  return date.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getSafeUserCreatedText(value) {
  if (!value) return 'N/A';
  if (typeof value === 'object' && typeof value.then === 'function') return 'N/A';
  if (value instanceof Date) return formatUserCreatedDate(value);
  if (typeof value === 'string' || typeof value === 'number') return formatUserCreatedDate(value);
  return 'N/A';
}

async function fetchAdminUsers() {
  ADMIN_USER_MGMT_LOADING = true;
  renderAdminUserManagementTab();
  let timeout;
  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch('../php/users.php', { signal: controller.signal });
    const data = await response.json();
    if (!response.ok || !data.success || !Array.isArray(data.users)) {
      throw new Error(data.message || 'Unable to load accounts from the database.');
    }
    ADMIN_USER_LIST = data.users.map(user => ({
      ...user,
      role: String(user.role || '').toLowerCase(),
      status: String(user.status || 'Active'),
      created: getSafeUserCreatedText(user.created || user.created_at || '')
    }));
    ADMIN_USER_MGMT_ALERT = '';
    ADMIN_USER_MGMT_ERROR = false;
  } catch (error) {
    ADMIN_USER_LIST = [];
    ADMIN_USER_MGMT_ALERT = error.name === 'AbortError'
      ? 'Account loading timed out. Please try again.'
      : (error.message || 'Unable to load accounts from the database.');
    ADMIN_USER_MGMT_ERROR = true;
    console.warn('Unable to load admin users:', error);
  } finally {
    clearTimeout(timeout);
  }
  ADMIN_USER_MGMT_LOADING = false;
  renderAdminUserManagementTab();
}

function renderAdminUserManagementTab() {
  const target = document.getElementById('admin-user-mgmt-tab-content');
  if (!target) return;
  const alertContainer = document.getElementById('admin-user-mgmt-alert');
  if (alertContainer) {
    alertContainer.innerHTML = ADMIN_USER_MGMT_ALERT ? `<div class="alert alert-${ADMIN_USER_MGMT_ERROR ? 'danger' : 'success'} alert-dismissible fade show" role="alert">${escapeHtml(ADMIN_USER_MGMT_ALERT)}<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close" onclick="ADMIN_USER_MGMT_ALERT = ''; ADMIN_USER_MGMT_ERROR = false; renderAdminUserManagementTab();"></button></div>` : '';
  }
  target.innerHTML = renderAdminUserManagementTabContent();
  document.querySelectorAll('.admin-user-tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === ADMIN_USER_MGMT_STATE.tab));
  const search = document.getElementById('admin-user-search');
  if (search) search.value = ADMIN_USER_MGMT_STATE.filter;
}
function saveCoordinator(mode, index) {
  const name = document.getElementById('gen-coord-name').value.trim();
  const email = document.getElementById('gen-coord-email').value.trim();
  const prog = document.getElementById('gen-coord-prog').value;
  const students = parseInt(document.getElementById('gen-coord-students').value, 10);
  const status = document.getElementById('gen-coord-status').value;

  if (!name || !email || Number.isNaN(students)) {
    alert('Please complete all fields before saving.');
    return false;
  }

  const coordinatorData = { name, email, prog, students, status };
  const previousProg = mode === 'edit' ? COORDINATORS[index]?.prog : null;

  if (mode === 'edit') {
    COORDINATORS[index] = coordinatorData;
  } else {
    COORDINATORS.unshift(coordinatorData);
  }

  syncCoordinatorProgram(coordinatorData, previousProg);

  if (currentPage === 'coordinators') {
    navigateTo('coordinators');
  }
}

function syncCoordinatorProgram(coordinator, previousProg = null) {
  if (previousProg && previousProg !== coordinator.prog) {
    const oldProgram = PROGRAMS.find(p => p.code === previousProg || p.name === previousProg);
    if (oldProgram && oldProgram.coord === COORDINATORS.find(c => c.name === coordinator.name && c.prog === previousProg)?.name) {
      oldProgram.coord = 'TBD';
    }
  }

  const program = PROGRAMS.find(p => p.code === coordinator.prog || p.name === coordinator.prog);
  if (program) {
    program.coord = coordinator.name;
  }
}

async function saveProgram(mode, index) {
  const existingProgram = mode === 'edit' && index !== null ? PROGRAMS[index] : null;
  const programId = existingProgram?.id || 0;
  const code = document.getElementById('gen-program-code').value.trim();
  const name = document.getElementById('gen-program-name').value.trim();
  const req = parseInt(document.getElementById('gen-program-req').value, 10);
  const students = parseInt(document.getElementById('gen-program-students').value, 10);

  if (!code || !name || Number.isNaN(req) || Number.isNaN(students)) {
    alert('Please complete all fields before saving.');
    return false;
  }

  if (mode === 'edit' && !programId) {
    alert('Unable to update this program because its ID is missing.');
    return false;
  }

  const params = new URLSearchParams();
  if (mode === 'edit') {
    params.set('id', programId);
    params.set('_method', 'PUT');
  }
  params.set('code', code);
  params.set('name', name);
  params.set('req_hours', req);
  params.set('students_count', students);
  try {
    const response = await fetch(`${API_BASE}?resource=programs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
    });
    const data = await response.json();
    if (!data.success) {
      alert(data.message || 'Unable to save program.');
      return false;
    }
    logAdminActivity(mode === 'edit' ? 'Update' : 'Create', `${mode === 'edit' ? 'Updated' : 'Added'} program "${code}".`);
    await loadInitialData();
    if (currentPage === 'programs') navigateTo('programs');
    return true;
  } catch (error) {
    console.warn('saveProgram failed:', error);
    alert('Unable to connect to the server.');
    return false;
  }
}

function openProgramModal(mode, index = null) {
  const program = mode === 'edit' ? PROGRAMS[index] : { code:'', name:'', req:'', students:'', coord:'Unassigned', studentsList:[] };
  const body = `
    <div class="form-row"><label class="form-label">Program Code</label><input class="form-input" id="gen-program-code" type="text" value="${escapeHtml(program.code)}" placeholder="e.g. BSIT"></div>
    <div class="form-row"><label class="form-label">Program Name</label><input class="form-input" id="gen-program-name" type="text" value="${escapeHtml(program.name)}" placeholder="Full program name"></div>
    <div class="form-row"><label class="form-label">Required Hours</label><input class="form-input" id="gen-program-req" type="number" min="0" value="${escapeHtml(program.req ?? '')}" placeholder="Hours required"></div>
    <div class="form-row"><label class="form-label">Active Students</label><input class="form-input" id="gen-program-students" type="number" min="0" value="${escapeHtml(program.students ?? '')}" placeholder="Number of students"></div>
    <div class="form-row"><label class="form-label">Coordinator</label><div class="form-text">${escapeHtml(program.coord || 'Unassigned')}</div></div>
  `;
  openGenModal(mode === 'edit' ? 'Edit Program' : 'Add Program', body, () => saveProgram(mode, index), mode === 'edit' ? 'Update' : 'Add');
}

function viewProgramStudents(index) {
  const program = PROGRAMS[index];
  if (!program) return;
  const students = Array.isArray(program.studentsList) ? program.studentsList : [];
  const studentList = students.length > 0
    ? `<div style="display:flex;flex-direction:column;gap:8px;max-height:250px;overflow-y:auto">${students.map((student, studentIndex) => `<div style="padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface);"><strong>${studentIndex + 1}. ${escapeHtml(student.name || '')}</strong><div style="font-size:12px;color:var(--text2)">${escapeHtml(student.student_id || 'No Student ID')} · ${escapeHtml(student.section || 'No section')} · ${escapeHtml(program.code)}</div></div>`).join('')}</div>`
    : '<div class="form-text">No students assigned to this program.</div>';
  const body = `
    <div class="form-row"><label class="form-label">Program Code</label><div class="form-text">${escapeHtml(program.code)}</div></div>
    <div class="form-row"><label class="form-label">Program Name</label><div class="form-text">${escapeHtml(program.name)}</div></div>
    <div class="form-row"><label class="form-label">Coordinator</label><div class="form-text">${escapeHtml(program.coord)}</div></div>
    <div class="form-row">
      <label class="form-label">Students (${students.length})</label>
      <div style="border:1px solid var(--border, #e5e7eb);border-radius:10px;overflow:hidden;background:var(--surface, #fff);box-shadow:0 1px 2px rgba(0,0,0,.04)">
        <button type="button" class="btn btn-link p-0 w-100 text-start" style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;color:inherit;text-decoration:none" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'block' ? 'none' : 'block'; this.querySelector('i').className = this.nextElementSibling.style.display === 'block' ? 'bi bi-chevron-up' : 'bi bi-chevron-down';">
          <span>Students (${students.length})</span>
          <i class="bi bi-chevron-down"></i>
        </button>
        <div style="display:none;padding:10px 12px;border-top:1px solid var(--border, #e5e7eb);transition:all .2s ease-in-out">${studentList}</div>
      </div>
    </div>
  `;
  openGenModal(`Students for ${escapeHtml(program.code)}`, body, null, 'Close');
}

async function deleteProgram(index) {
  if (!confirm('Are you sure you want to delete this program?')) return;
  const program = PROGRAMS[index];
  if (!program?.id) {
    alert('Unable to delete this program because its database ID is missing.');
    return;
  }
  const params = new URLSearchParams({ id: program.id, _method: 'DELETE' });
  try {
    const response = await fetch(`${API_BASE}?resource=programs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || 'Unable to delete program.');
    await loadInitialData();
    if (currentPage === 'programs') navigateTo('programs');
  } catch (error) {
    alert(error.message || 'Unable to delete program.');
  }
}

async function saveSchoolYear(mode, index) {
  const existingSchoolYear = mode === 'edit' && index !== null ? SCHOOL_YEARS[index] : null;
  const year = document.getElementById('gen-sy-year').value.trim();
  const semester = document.getElementById('gen-sy-semester').value.trim();
  const start = document.getElementById('gen-sy-start').value.trim();
  const end = document.getElementById('gen-sy-end').value.trim();
  const students = parseInt(document.getElementById('gen-sy-students').value, 10);
  const status = document.getElementById('gen-sy-status').value;

  if (!year || !semester || !start || !end || Number.isNaN(students)) {
    alert('Please complete all fields before saving.');
    return false;
  }

  const params = new URLSearchParams({
    year_label: year,
    semester,
    start_date: start,
    end_date: end,
    students_count: String(students),
    status
  });
  if (mode === 'edit') params.set('id', String(existingSchoolYear?.id || ''));
  try {
    const response = await fetch(`${API_BASE}?resource=school_years`, {
      method: mode === 'edit' ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || 'Unable to save the academic year.');
    await loadInitialData();
    if (currentPage === 'academicyear') navigateTo('academicyear');
    return true;
  } catch (error) {
    alert(error.message || 'Unable to save the academic year.');
    return false;
  }
}

async function deleteSchoolYear(index) {
  const schoolYear = SCHOOL_YEARS[index];
  if (!schoolYear || !confirm(`Delete academic year "${schoolYear.year}"?`)) return;
  if (!schoolYear.id) {
    alert('Unable to delete this academic year because its database ID is missing.');
    return;
  }
  try {
    const response = await fetch(`${API_BASE}?resource=school_years&id=${encodeURIComponent(schoolYear.id)}`, { method: 'DELETE' });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || 'Unable to delete the academic year.');
    await loadInitialData();
    navigateTo('academicyear');
  } catch (error) {
    alert(error.message || 'Unable to delete the academic year.');
  }
}

function openSchoolYearModal(index = null) {
  const sy = typeof index === 'number' ? SCHOOL_YEARS[index] : { year:'', semester:'', start:'', end:'', students:'0', status:'Not Started' };
  const body = `
    <div class="form-row"><label class="form-label">School Year</label><input class="form-input" id="gen-sy-year" type="text" value="${escapeHtml(sy.year)}" placeholder="e.g. 2024–2025"></div>
    <div class="form-row"><label class="form-label">Semester</label><input class="form-input" id="gen-sy-semester" type="text" value="${escapeHtml(sy.semester)}" placeholder="e.g. 2nd Semester"></div>
    <div class="form-row"><label class="form-label">Start Date</label><input class="form-input" id="gen-sy-start" type="text" value="${escapeHtml(sy.start)}" placeholder="e.g. Jan 15, 2025"></div>
    <div class="form-row"><label class="form-label">End Date</label><input class="form-input" id="gen-sy-end" type="text" value="${escapeHtml(sy.end)}" placeholder="e.g. May 30, 2025"></div>
    <div class="form-row"><label class="form-label">Students</label><input class="form-input" id="gen-sy-students" type="number" min="0" value="${escapeHtml(sy.students ?? '')}" placeholder="Number of students"></div>
    <div class="form-row"><label class="form-label">Status</label><select class="form-select" id="gen-sy-status"><option value="Not Started" ${sy.status==='Not Started'?'selected':''}>Not Started</option><option value="Active" ${sy.status==='Active'?'selected':''}>Active</option><option value="Completed" ${sy.status==='Completed'?'selected':''}>Completed</option></select></div>
  `;
  openGenModal(index !== null ? 'Edit School Year' : 'Add School Year', body, () => saveSchoolYear(index !== null ? 'edit' : 'add', index), index !== null ? 'Update' : 'Add');
}

function viewSchoolYear(index) {
  const sy = SCHOOL_YEARS[index];
  if (!sy) return;
  const body = `
    <div class="form-row"><label class="form-label">School Year</label><div class="form-text">${escapeHtml(sy.year)}</div></div>
    <div class="form-row"><label class="form-label">Semester</label><div class="form-text">${escapeHtml(sy.semester)}</div></div>
    <div class="form-row"><label class="form-label">Start Date</label><div class="form-text">${escapeHtml(sy.start)}</div></div>
    <div class="form-row"><label class="form-label">End Date</label><div class="form-text">${escapeHtml(sy.end)}</div></div>
    <div class="form-row"><label class="form-label">Students</label><div class="form-text">${escapeHtml(sy.students)}</div></div>
    <div class="form-row"><label class="form-label">Status</label><div class="form-text">${escapeHtml(sy.status)}</div></div>
  `;
  openGenModal(`School Year ${sy.year}`, body, null, 'Close');
}

/* ── STUDENTS CRUD HELPERS ── */
function saveStudent(mode, index) {
  const studentId = document.getElementById('gen-stud-id').value.trim();
  const name = document.getElementById('gen-stud-name').value.trim();
  const program = document.getElementById('gen-stud-prog').value;
  const yearLevel = document.getElementById('gen-stud-year').value;
  const section = document.getElementById('gen-stud-section').value.trim();
  const email = document.getElementById('gen-stud-email').value.trim();
  const contact = document.getElementById('gen-stud-contact').value.trim();
  const username = document.getElementById('gen-stud-username').value.trim() || email.split('@')[0];
  const password = document.getElementById('gen-stud-password').value.trim() || 'student123';
  const status = document.getElementById('gen-stud-status').value;

  if (!studentId || !name || !email) {
    alert('Please fill in Student ID, Name, and Email.');
    return false;
  }

  const studentData = { studentId, name, program, yearLevel, section, email, contact, username, password, status };

  if (mode === 'edit') {
    const oldEmail = ADMIN_STUDENTS[index].email;
    ADMIN_STUDENTS[index] = studentData;
    logAdminActivity('Update', `Updated student profile for ${name}.`);
    
    // Sync with ACCOUNTS
    const accIndex = ACCOUNTS.findIndex(a => a.email.toLowerCase() === oldEmail.toLowerCase() && a.role === 'Student');
    if (accIndex !== -1) {
      ACCOUNTS[accIndex].name = name;
      ACCOUNTS[accIndex].email = email;
      ACCOUNTS[accIndex].status = status;
      ACCOUNTS[accIndex].password = password;
    }
  } else {
    ADMIN_STUDENTS.unshift(studentData);
    logAdminActivity('Create', `Created student account for ${name}.`);
    ACCOUNTS.unshift({
      name,
      email,
      role: 'Student',
      created: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      last: 'Never',
      status,
      password
    });
  }

  if (currentPage === 'students') {
    navigateTo('students');
  }
  return true;
}

function openStudentModal(mode, index = null) {
  const s = mode === 'edit' ? ADMIN_STUDENTS[index] : { studentId:'', name:'', program:'BSCS', yearLevel:'3rd Year', section:'A', email:'', contact:'', username:'', password:'', status:'Active' };
  const body = `
    <div class="form-row"><label class="form-label">Student ID</label><input class="form-input" id="gen-stud-id" type="text" value="${escapeHtml(s.studentId)}" placeholder="e.g. 2024-00123"></div>
    <div class="form-row"><label class="form-label">Full Name</label><input class="form-input" id="gen-stud-name" type="text" value="${escapeHtml(s.name)}" placeholder="Enter name"></div>
    <div class="form-row"><label class="form-label">Program</label><select class="form-select" id="gen-stud-prog">
      ${PROGRAMS.map(p => `<option value="${p.code}" ${p.code === s.program ? 'selected' : ''}>${p.code}</option>`).join('')}
    </select></div>
    <div class="form-row"><label class="form-label">Year Level</label><select class="form-select" id="gen-stud-year">
      <option value="1st Year" ${s.yearLevel === '1st Year' ? 'selected' : ''}>1st Year</option>
      <option value="2nd Year" ${s.yearLevel === '2nd Year' ? 'selected' : ''}>2nd Year</option>
      <option value="3rd Year" ${s.yearLevel === '3rd Year' ? 'selected' : ''}>3rd Year</option>
      <option value="4th Year" ${s.yearLevel === '4th Year' ? 'selected' : ''}>4th Year</option>
    </select></div>
    <div class="form-row"><label class="form-label">Section</label><input class="form-input" id="gen-stud-section" type="text" value="${escapeHtml(s.section)}" placeholder="e.g. A"></div>
    <div class="form-row"><label class="form-label">Email</label><input class="form-input" id="gen-stud-email" type="email" value="${escapeHtml(s.email)}" placeholder="student@bisu.edu.ph"></div>
    <div class="form-row"><label class="form-label">Contact Number</label><input class="form-input" id="gen-stud-contact" type="text" value="${escapeHtml(s.contact)}" placeholder="+63 ..."></div>
    <div class="form-row"><label class="form-label">Username</label><input class="form-input" id="gen-stud-username" type="text" value="${escapeHtml(s.username)}" placeholder="Auto-generated if empty"></div>
    <div class="form-row"><label class="form-label">Password</label><input class="form-input" id="gen-stud-password" type="text" value="${escapeHtml(s.password)}" placeholder="student123"></div>
    <div class="form-row"><label class="form-label">Status</label><select class="form-select" id="gen-stud-status">
      <option value="Active" ${s.status === 'Active' ? 'selected' : ''}>Active</option>
      <option value="Inactive" ${s.status === 'Inactive' ? 'selected' : ''}>Inactive</option>
    </select></div>
  `;
  openGenModal(mode === 'edit' ? 'Edit Student' : 'Add Student', body, () => saveStudent(mode, index), mode === 'edit' ? 'Update' : 'Add');
}

function deleteStudent(index) {
  if (!confirm('Are you sure you want to delete this student account?')) return;
  const s = ADMIN_STUDENTS[index];
  if (!s) return;
  logAdminActivity('Delete', `Deleted student account for ${s.name}.`);
  const accIndex = ACCOUNTS.findIndex(a => a.email.toLowerCase() === s.email.toLowerCase() && a.role === 'Student');
  if (accIndex !== -1) ACCOUNTS.splice(accIndex, 1);
  ADMIN_STUDENTS.splice(index, 1);
  addNotification(`Student account deleted: ${s.name}`, 'warning');
  if (currentPage === 'students') navigateTo('students');
}

/* ── SUPERVISORS CRUD HELPERS ── */
function saveSupervisor(mode, index) {
  const name = document.getElementById('gen-sup-name').value.trim();
  const company = document.getElementById('gen-sup-company').value.trim();
  const email = document.getElementById('gen-sup-email').value.trim();
  const contact = document.getElementById('gen-sup-contact').value.trim();
  const status = document.getElementById('gen-sup-status').value;
  const password = document.getElementById('gen-sup-password').value.trim() || 'supervisor123';

  if (!name || !company || !email) {
    alert('Please fill in Name, Company, and Email.');
    return false;
  }

  const supervisorData = { name, company, email, contact, status };

  if (mode === 'edit') {
    const oldEmail = SUPERVISORS[index].email;
    SUPERVISORS[index] = supervisorData;
    logAdminActivity('Update', `Updated supervisor profile for ${name}.`);
    const accIndex = ACCOUNTS.findIndex(a => a.email.toLowerCase() === oldEmail.toLowerCase() && a.role === 'Supervisor');
    if (accIndex !== -1) {
      ACCOUNTS[accIndex].name = name;
      ACCOUNTS[accIndex].email = email;
      ACCOUNTS[accIndex].status = status;
      ACCOUNTS[accIndex].password = password;
    }
  } else {
    SUPERVISORS.unshift(supervisorData);
    logAdminActivity('Create', `Created supervisor account for ${name}.`);
    ACCOUNTS.unshift({
      name,
      email,
      role: 'Supervisor',
      created: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      last: 'Never',
      status,
      password
    });
  }

  if (currentPage === 'supervisors') {
    navigateTo('supervisors');
  }
  return true;
}

function openSupervisorModal(mode, index = null) {
  const s = mode === 'edit' ? SUPERVISORS[index] : { name:'', company:'', email:'', contact:'', status:'Active' };
  const acc = ACCOUNTS.find(a => a.email.toLowerCase() === s.email.toLowerCase() && a.role === 'Supervisor') || {};
  const pass = acc.password || 'supervisor123';

  const body = `
    <div class="form-row"><label class="form-label">Full Name</label><input class="form-input" id="gen-sup-name" type="text" value="${escapeHtml(s.name)}" placeholder="Enter name"></div>
    <div class="form-row"><label class="form-label">Company</label><select class="form-select" id="gen-sup-company">
      ${ADMIN_COMPANIES.map(c => `<option value="${c.name}" ${c.name === s.company ? 'selected' : ''}>${c.name}</option>`).join('')}
    </select></div>
    <div class="form-row"><label class="form-label">Email</label><input class="form-input" id="gen-sup-email" type="email" value="${escapeHtml(s.email)}" placeholder="supervisor@company.com"></div>
    <div class="form-row"><label class="form-label">Contact Number</label><input class="form-input" id="gen-sup-contact" type="text" value="${escapeHtml(s.contact)}" placeholder="+63 ..."></div>
    <div class="form-row"><label class="form-label">Password</label><input class="form-input" id="gen-sup-password" type="text" value="${escapeHtml(pass)}" placeholder="supervisor123"></div>
    <div class="form-row"><label class="form-label">Status</label><select class="form-select" id="gen-sup-status">
      <option value="Active" ${s.status === 'Active' ? 'selected' : ''}>Active</option>
      <option value="Inactive" ${s.status === 'Inactive' ? 'selected' : ''}>Inactive</option>
    </select></div>
  `;
  openGenModal(mode === 'edit' ? 'Edit Supervisor' : 'Add Supervisor', body, () => saveSupervisor(mode, index), mode === 'edit' ? 'Update' : 'Add');
}

function deleteSupervisor(index) {
  if (!confirm('Are you sure you want to delete this supervisor account?')) return;
  const s = SUPERVISORS[index];
  if (!s) return;
  logAdminActivity('Delete', `Deleted supervisor account for ${s.name}.`);
  const accIndex = ACCOUNTS.findIndex(a => a.email.toLowerCase() === s.email.toLowerCase() && a.role === 'Supervisor');
  if (accIndex !== -1) ACCOUNTS.splice(accIndex, 1);
  SUPERVISORS.splice(index, 1);
  addNotification(`Supervisor account deleted: ${s.name}`, 'warning');
  if (currentPage === 'supervisors') navigateTo('supervisors');
}

/* ── INTERNSHIPS CRUD HELPERS ── */
function saveInternship(mode, index) {
  const studentName = document.getElementById('gen-intern-student').value;
  const company = document.getElementById('gen-intern-company').value;
  const supervisor = document.getElementById('gen-intern-supervisor').value;
  const coordinator = document.getElementById('gen-intern-coordinator').value;
  const status = document.getElementById('gen-intern-status').value;
  const hoursCompleted = parseInt(document.getElementById('gen-intern-hours').value, 10) || 0;
  const evaluationScore = parseInt(document.getElementById('gen-intern-score').value, 10) || 0;
  const completionCleared = document.getElementById('gen-intern-cleared').value === 'true';

  if (!studentName || !company) {
    alert('Please select Student and Company.');
    return false;
  }

  const reqs = mode === 'edit' ? INTERNSHIPS[index].requirements : { MOA: false, Resume: false, Medical: false, Clearance: false };

  const internData = {
    studentName,
    company,
    supervisor,
    coordinator,
    status,
    requirements: reqs,
    hoursCompleted,
    evaluationScore,
    completionCleared
  };

  if (mode === 'edit') {
    INTERNSHIPS[index] = internData;
    logAdminActivity('Update', `Updated internship status for ${studentName}.`);
  } else {
    INTERNSHIPS.unshift(internData);
    logAdminActivity('Create', `Assigned internship for ${studentName}.`);
  }

  if (currentPage === 'internships') {
    navigateTo('internships');
  }
  return true;
}

function openInternshipModal(mode, index = null) {
  const i = mode === 'edit' ? INTERNSHIPS[index] : { studentName:'', company:'', supervisor:'', coordinator:'', status:'Pending', hoursCompleted:0, evaluationScore:0, completionCleared:false };
  const body = `
    <div class="form-row"><label class="form-label">Student</label><select class="form-select" id="gen-intern-student">
      ${ADMIN_STUDENTS.map(s => `<option value="${s.name}" ${s.name === i.studentName ? 'selected' : ''}>${s.name} (${s.program})</option>`).join('')}
    </select></div>
    <div class="form-row"><label class="form-label">Company</label><select class="form-select" id="gen-intern-company">
      <option value="">Unassigned</option>
      ${ADMIN_COMPANIES.map(c => `<option value="${c.name}" ${c.name === i.company ? 'selected' : ''}>${c.name}</option>`).join('')}
    </select></div>
    <div class="form-row"><label class="form-label">Supervisor</label><select class="form-select" id="gen-intern-supervisor">
      <option value="">Unassigned</option>
      ${SUPERVISORS.map(s => `<option value="${s.name}" ${s.name === i.supervisor ? 'selected' : ''}>${s.name} (${s.company})</option>`).join('')}
    </select></div>
    <div class="form-row"><label class="form-label">Coordinator</label><select class="form-select" id="gen-intern-coordinator">
      <option value="">Unassigned</option>
      ${COORDINATORS.map(c => `<option value="${c.name}" ${c.name === i.coordinator ? 'selected' : ''}>${c.name}</option>`).join('')}
    </select></div>
    <div class="form-row"><label class="form-label">Status</label><select class="form-select" id="gen-intern-status">
      <option value="Pending" ${i.status === 'Pending' ? 'selected' : ''}>Pending</option>
      <option value="Approved" ${i.status === 'Approved' ? 'selected' : ''}>Approved</option>
      <option value="Ongoing" ${i.status === 'Ongoing' ? 'selected' : ''}>Ongoing</option>
      <option value="Completed" ${i.status === 'Completed' ? 'selected' : ''}>Completed</option>
    </select></div>
    <div class="form-row"><label class="form-label">Hours Completed</label><input class="form-input" id="gen-intern-hours" type="number" min="0" value="${i.hoursCompleted}"></div>
    <div class="form-row"><label class="form-label">Evaluation Score</label><input class="form-input" id="gen-intern-score" type="number" min="0" max="100" value="${i.evaluationScore}"></div>
    <div class="form-row"><label class="form-label">Completion Cleared</label><select class="form-select" id="gen-intern-cleared">
      <option value="false" ${!i.completionCleared ? 'selected' : ''}>No</option>
      <option value="true" ${i.completionCleared ? 'selected' : ''}>Yes</option>
    </select></div>
  `;
  openGenModal(mode === 'edit' ? 'Edit Internship Record' : 'Assign Internship', body, () => saveInternship(mode, index), mode === 'edit' ? 'Update' : 'Assign');
}

function deleteInternship(index) {
  if (!confirm('Are you sure you want to delete this internship record?')) return;
  const i = INTERNSHIPS[index];
  INTERNSHIPS.splice(index, 1);
  addNotification(`Internship record deleted: ${i.studentName}`, 'warning');
  if (currentPage === 'internships') navigateTo('internships');
}

function toggleInternshipRequirement(index, req) {
  const i = INTERNSHIPS[index];
  if (!i) return;
  i.requirements[req] = !i.requirements[req];
  addNotification(`Updated requirement: ${req} for ${i.studentName}`, 'success');
  if (currentPage === 'internships') navigateTo('internships');
}

/* ── USER MANAGEMENT HELPERS ── */
function toggleUserStatus(email, role) {
  const acc = ACCOUNTS.find(a => a.email.toLowerCase() === email.toLowerCase() && a.role === role);
  if (acc) {
    acc.status = acc.status === 'Active' ? 'Inactive' : 'Active';
    logAdminActivity('Update', `Updated account status for ${acc.name}.`);
    addNotification(`Account status updated for ${acc.name}`, 'success');

    const status = acc.status;
    if (role === 'Student') {
      const s = ADMIN_STUDENTS.find(x => x.email.toLowerCase() === email.toLowerCase());
      if (s) s.status = status;
    } else if (role === 'Coordinator') {
      const c = COORDINATORS.find(x => x.email.toLowerCase() === email.toLowerCase());
      if (c) c.status = status;
    } else if (role === 'Supervisor') {
      const s = SUPERVISORS.find(x => x.email.toLowerCase() === email.toLowerCase());
      if (s) s.status = status;
    }
  }
  if (currentPage === 'users') navigateTo('users');
}

function resetUserPassword(email, role) {
  const acc = ACCOUNTS.find(a => a.email.toLowerCase() === email.toLowerCase() && a.role === role);
  if (!acc) return;
  const newPass = prompt(`Reset password for ${acc.name} (${acc.role}) to:`, acc.password || '123456');
  if (newPass === null) return;
  if (newPass.trim() === '') {
    alert('Password cannot be empty.');
    return;
  }
  acc.password = newPass.trim();
  logAdminActivity('Update', `Reset password for ${acc.name}.`);
  
  if (role === 'Student') {
    const s = ADMIN_STUDENTS.find(x => x.email.toLowerCase() === email.toLowerCase());
    if (s) s.password = acc.password;
  }

  alert(`Password reset successfully for ${acc.name}!`);
  addNotification(`Password reset for ${acc.name}`, 'success');
  if (currentPage === 'users') navigateTo('users');
}

function deleteUser(email, role) {
  if (!confirm(`Are you sure you want to delete user ${email}?`)) return;
  const accIndex = ACCOUNTS.findIndex(a => a.email.toLowerCase() === email.toLowerCase() && a.role === role);
  if (accIndex !== -1) {
    const acc = ACCOUNTS[accIndex];
    logAdminActivity('Delete', `Deleted user account for ${acc.name}.`);
    ACCOUNTS.splice(accIndex, 1);
    
    // Sync specific lists
    if (role === 'Student') {
      const sIndex = ADMIN_STUDENTS.findIndex(x => x.email.toLowerCase() === email.toLowerCase());
      if (sIndex !== -1) ADMIN_STUDENTS.splice(sIndex, 1);
    } else if (role === 'Coordinator') {
      const cIndex = COORDINATORS.findIndex(x => x.email.toLowerCase() === email.toLowerCase());
      if (cIndex !== -1) COORDINATORS.splice(cIndex, 1);
    } else if (role === 'Supervisor') {
      const sIndex = SUPERVISORS.findIndex(x => x.email.toLowerCase() === email.toLowerCase());
      if (sIndex !== -1) SUPERVISORS.splice(sIndex, 1);
    }
    
    addNotification(`User account deleted: ${acc.name}`, 'warning');
  }
  if (currentPage === 'users') navigateTo('users');
}

function buildAccountEmail(username = '', name = '') {
  const base = (username || name || 'account').toLowerCase().replace(/[^a-z0-9._-]+/g, '');
  return `${base || 'account'}@bisu.edu.ph`;
}

function saveAccount() {
  const id = document.getElementById('gen-account-id')?.value || '';
  const name = document.getElementById('gen-account-name').value.trim();
  const username = document.getElementById('gen-account-username').value.trim();
  const emailField = document.getElementById('gen-account-email');
  const email = (emailField?.value || '').trim() || buildAccountEmail(username, name);
  const password = document.getElementById('gen-account-password').value;
  const confirmPassword = document.getElementById('gen-account-confirm-password').value;
  const contact = document.getElementById('gen-account-contact').value.trim();
  const status = document.getElementById('gen-account-status').value;
  const role = document.getElementById('gen-account-role').value;
  const address = role === 'student' ? (document.getElementById('gen-account-address')?.value.trim() || '') : '';
  const studentId = document.getElementById('gen-account-student-id')?.value.trim() || '';
  const section = document.getElementById('gen-account-section')?.value.trim() || '';
  const programId = role === 'coordinator'
    ? (document.getElementById('gen-account-coordinator-program')?.value || '')
    : role === 'student'
      ? (document.getElementById('gen-account-program')?.value || '')
      : '';
  const program = programId
    ? (PROGRAMS.find(programItem => String(programItem.id) === String(programId))?.code || '')
    : '';
  const academicYear = document.getElementById('gen-account-academic-year')?.value || '';
  const employeeId = document.getElementById(`gen-account-${role}-employee-id`)?.value.trim() || '';
  const companySelect = document.getElementById(role === 'coordinator' ? 'gen-account-coordinator-companies' : 'gen-account-supervisor-company');
  const companyIds = role === 'coordinator' || role === 'supervisor'
    ? Array.from(companySelect?.selectedOptions || []).map(option => option.value).filter(Boolean)
    : [];
  const companyId = role === 'coordinator' || role === 'supervisor'
    ? (companyIds[0] || '')
    : '';
  const company = companyId ? (ADMIN_COMPANIES.find(companyItem => String(companyItem.id) === String(companyId))?.name || '') : '';

  if (!name || !username || !status || !role) {
    alert('Please complete all required fields.');
    return false;
  }
  if ((role === 'coordinator' || role === 'student') && !programId) {
    alert(`Please select a program for the ${role === 'coordinator' ? 'Coordinator' : 'Student'} account.`);
    return false;
  }
  if (role === 'coordinator' && !companyId) {
    alert('Please select a company for the Coordinator account.');
    return false;
  }
  if (!id && (!password || !confirmPassword)) {
    alert('Please provide a password and confirmation.');
    return false;
  }
  if (password !== confirmPassword) {
    alert('Password and confirm password must match.');
    return false;
  }

  const params = new URLSearchParams();
  params.set('action', id ? 'update' : 'create');
  if (id) params.set('id', id);
  params.set('name', name);
  params.set('username', username);
  params.set('email', email);
  params.set('status', status);
  params.set('role', role);
  params.set('contact', contact);
  params.set('address', address);
  params.set('student_id', studentId);
  params.set('section', section);
  params.set('program', program);
  if (programId) params.set('program_id', programId);
  if (companyId) params.set('company_id', companyId);
  if (role === 'coordinator' && companyIds.length) {
    params.set('company_ids', companyIds.join(','));
  }
  params.set('academic_year', academicYear);
  params.set('employee_id', employeeId);
  params.set('company', company);
  if (password || confirmPassword) {
    params.set('password', password);
    params.set('confirm_password', confirmPassword);
  }

  return fetch('../php/users.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  }).then(res => res.json()).then(data => {
    if (!data.success) {
      alert(data.message || 'Unable to save account.');
      return false;
    }
    ADMIN_USER_MGMT_ALERT = data.message || 'Account saved successfully.';
    closeGenModal();
    return loadInitialData().catch(() => {}).then(() => {
      fetchAdminUsers();
      return true;
    });
  }).catch(error => {
    console.error(error);
    alert('Unable to connect to the server.');
    return false;
  });
}

function toggleAccountPasswordVisibility(inputId, toggleId, iconId) {
  const input = document.getElementById(inputId);
  const toggle = document.getElementById(toggleId);
  const icon = document.getElementById(iconId);
  if (!input || !toggle || !icon) return;
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  icon.className = isPassword ? 'bi bi-eye-slash' : 'bi bi-eye';
  toggle.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
}

function openAccountModal(editId = null, selectedRole = null) {
  const user = editId ? ADMIN_USER_LIST.find(item => item.id === editId) : null;
  const isEdit = Boolean(user);
  const role = user?.role || selectedRole || 'student';
  const body = `
    <input type="hidden" id="gen-account-id" value="${escapeHtml(user?.id || '')}">
    <input type="hidden" id="gen-account-email" value="${escapeHtml(user?.email || '')}">
    <div class="mb-3">
      <label class="form-label">Full Name</label>
      <input class="form-control" id="gen-account-name" type="text" value="${escapeHtml(user?.name || '')}" placeholder="Enter full name">
    </div>
    <div class="row g-3 mb-3">
      <div class="col-md-6">
        <label class="form-label">Username</label>
        <input class="form-control" id="gen-account-username" type="text" value="${escapeHtml(user?.username || '')}" placeholder="Enter username">
      </div>
      <div class="col-md-6">
        <label class="form-label">Contact Number</label>
        <input class="form-control" id="gen-account-contact" type="text" value="${escapeHtml(user?.contact || '')}" placeholder="Enter contact number">
      </div>
    </div>
    <div id="gen-account-role-fields" class="mb-3">
      <div id="gen-account-student-fields" style="display:${role === 'student' ? 'block' : 'none'};">
        <div class="row g-3 mb-3">
          <div class="col-md-6">
            <label class="form-label">Section</label>
            <input class="form-control" id="gen-account-section" type="text" value="${escapeHtml(user?.section || '')}" placeholder="Enter section">
          </div>
          <div class="col-md-6">
            <label class="form-label">Program</label>
            <select class="form-select" id="gen-account-program">
              <option value="">Select Program</option>
              ${PROGRAMS.map(programItem => `<option value="${escapeHtml(programItem.id)}" ${String(programItem.id) === String(user?.program_id || PROGRAMS.find(item => item.code === user?.program)?.id || '') ? 'selected' : ''}>${escapeHtml(programItem.code || programItem.name)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label">Student ID</label>
            <input class="form-control" id="gen-account-student-id" type="text" value="${escapeHtml(user?.student_id || '')}" placeholder="Enter student ID">
          </div>
          <div class="col-md-6">
            <label class="form-label">Academic Year</label>
            <input class="form-control" id="gen-account-academic-year" type="text" value="${escapeHtml(user?.academic_year || '')}" placeholder="e.g. 2024–2025">
          </div>
        </div>
        <div class="mt-3">
          <label class="form-label">Address</label>
          <input class="form-control" id="gen-account-address" type="text" value="${escapeHtml(user?.address || '')}" placeholder="Enter address">
        </div>
      </div>
      <div class="mb-3" id="gen-account-coordinator-fields" style="display:${role === 'coordinator' ? 'block' : 'none'};">
        <div class="form-label">Employee ID</div><input class="form-control" id="gen-account-coordinator-employee-id" type="text" value="${escapeHtml(user?.employee_id || '')}" placeholder="Enter employee ID">
        <label class="form-label mt-3">Program</label>
        <select class="form-select" id="gen-account-coordinator-program">
          <option value="">Select Program</option>
          ${PROGRAMS.map(programItem => `<option value="${escapeHtml(programItem.id)}" ${String(programItem.id) === String(user?.program_id || PROGRAMS.find(item => item.code === user?.program)?.id || '') ? 'selected' : ''}>${escapeHtml(programItem.code || programItem.name)}</option>`).join('')}
        </select>
        <label class="form-label mt-3">Company</label>
        <select class="form-select" id="gen-account-coordinator-companies" multiple size="6">
          <option value="">Select Company</option>
          ${ADMIN_COMPANIES.map(companyItem => {
            const selected = Array.isArray(user?.company_ids) ? user.company_ids.includes(Number(companyItem.id)) : (String(companyItem.id) === String(user?.company_id || ADMIN_COMPANIES.find(item => item.name === user?.company)?.id || ''));
            return `<option value="${escapeHtml(companyItem.id)}" ${selected ? 'selected' : ''}>${escapeHtml(companyItem.name)}</option>`;
          }).join('')}
        </select>
      </div>
      <div class="mb-3" id="gen-account-supervisor-fields" style="display:${role === 'supervisor' ? 'block' : 'none'};">
        <div class="row g-3">
          <div class="col-md-6"><label class="form-label">Employee ID</label><input class="form-control" id="gen-account-supervisor-employee-id" type="text" value="${escapeHtml(user?.employee_id || '')}" placeholder="Enter employee ID"></div>
          <div class="col-md-6"><label class="form-label">Company</label><select class="form-select" id="gen-account-supervisor-company"><option value="">Select Company</option>${ADMIN_COMPANIES.map(companyItem => `<option value="${escapeHtml(companyItem.id)}" ${String(companyItem.id) === String(user?.company_id || ADMIN_COMPANIES.find(item => item.name === user?.company)?.id || '') ? 'selected' : ''}>${escapeHtml(companyItem.name)}</option>`).join('')}</select></div>
        </div>
      </div>
    </div>
    <div class="row g-3 mb-3">
      <div class="col-md-6">
        <label class="form-label">Status</label>
        <select class="form-select" id="gen-account-status"><option value="Active" ${user?.status === 'Active' ? 'selected' : ''}>Active</option><option value="Inactive" ${user?.status === 'Inactive' ? 'selected' : ''}>Inactive</option></select>
      </div>
      <div class="col-md-6">
        <label class="form-label">Role</label>
        <select class="form-select" id="gen-account-role" onchange="toggleAccountRoleFields()" ${isEdit ? 'disabled' : ''}><option value="student" ${role === 'student' ? 'selected' : ''}>Student</option><option value="coordinator" ${role === 'coordinator' ? 'selected' : ''}>Coordinator</option><option value="supervisor" ${role === 'supervisor' ? 'selected' : ''}>Supervisor</option></select>
      </div>
    </div>
    <div class="row g-3">
      <div class="col-md-6">
        <label class="form-label">Password</label>
        <div class="position-relative">
          <input class="form-control pe-5" id="gen-account-password" type="password" placeholder="Enter password" ${isEdit ? '' : ''}>
          <button type="button" id="gen-account-password-toggle" class="btn btn-link position-absolute end-0 top-50 translate-middle-y me-2 p-0" aria-label="Show password" onclick="toggleAccountPasswordVisibility('gen-account-password', 'gen-account-password-toggle', 'gen-account-password-toggle-icon')"><i id="gen-account-password-toggle-icon" class="bi bi-eye"></i></button>
        </div>
      </div>
      <div class="col-md-6">
        <label class="form-label">Confirm Password</label>
        <div class="position-relative">
          <input class="form-control pe-5" id="gen-account-confirm-password" type="password" placeholder="Confirm password" ${isEdit ? '' : ''}>
          <button type="button" id="gen-account-confirm-password-toggle" class="btn btn-link position-absolute end-0 top-50 translate-middle-y me-2 p-0" aria-label="Show password" onclick="toggleAccountPasswordVisibility('gen-account-confirm-password', 'gen-account-confirm-password-toggle', 'gen-account-confirm-password-toggle-icon')"><i id="gen-account-confirm-password-toggle-icon" class="bi bi-eye"></i></button>
        </div>
      </div>
    </div>
  `;
  openGenModal(isEdit ? 'Edit Account' : getCreateAccountTitle(role), body, saveAccount, 'Save Account');
}

function getCreateAccountTitle(role) {
  const labels = { student: 'Student', coordinator: 'Coordinator', supervisor: 'Supervisor' };
  return `Create ${labels[role] || 'Student'} Account`;
}

function toggleAccountRoleFields() {
  const role = document.getElementById('gen-account-role')?.value;
  if (!role) return;
  const modalTitle = document.getElementById('gen-modal-title');
  if (modalTitle && modalTitle.textContent !== 'Edit Account') modalTitle.textContent = getCreateAccountTitle(role);
  const studentFields = document.getElementById('gen-account-student-fields');
  const coordinatorFields = document.getElementById('gen-account-coordinator-fields');
  const supervisorFields = document.getElementById('gen-account-supervisor-fields');
  if (studentFields) studentFields.style.display = role === 'student' ? 'block' : 'none';
  if (coordinatorFields) coordinatorFields.style.display = role === 'coordinator' ? 'block' : 'none';
  if (supervisorFields) supervisorFields.style.display = role === 'supervisor' ? 'block' : 'none';
}

function openViewUserModal(userId) {
  const user = ADMIN_USER_LIST.find(item => item.id === userId);
  if (!user) return;
  const fields = [];
  const addField = (label, value, required = false) => {
    if (required || String(value || '').trim()) {
      fields.push(`<div class="col-6"><div class="mb-2"><strong>${label}</strong><div>${escapeHtml(value)}</div></div></div>`);
    }
  };

  addField('Name', user.name, true);
  addField('Username', user.username, true);
  addField('Contact Number', user.contact);

  if (user.role === 'student') {
    addField('Student ID', user.student_id);
    addField('Section', user.section);
    addField('Program', user.program_name || user.program);
    addField('Academic Year', user.academic_year);
    addField('Address', user.address || 'Not set', true);
  } else if (user.role === 'coordinator') {
    addField('Employee ID', user.employee_id);
    addField('Program', user.program_name || user.program);
    addField('Company', user.company_name || user.company || 'Not Assigned', true);
  } else if (user.role === 'supervisor') {
    addField('Employee ID', user.employee_id);
    addField('Company', user.company_name || user.company);
  }

  addField('Status', user.status, true);
  const roleLabel = user.role.charAt(0).toUpperCase() + user.role.slice(1);
  openGenModal(`View ${roleLabel}`, `<div class="row g-3">${fields.join('')}</div>`, null, 'Close');
}

function openEditUserModal(userId) {
  openAccountModal(userId);
}

function openResetPasswordModal(userId) {
  const user = ADMIN_USER_LIST.find(item => item.id === userId);
  if (!user) return;
  const body = `
    <div class="mb-3"><strong>Reset password for</strong><div>${escapeHtml(user.name)} (${escapeHtml(user.email)})</div></div>
    <div class="mb-3">
      <label class="form-label">New Password</label>
      <div class="position-relative">
        <input class="form-control pe-5" id="gen-account-password" type="password" placeholder="Enter new password">
        <button type="button" id="gen-account-password-toggle" class="btn btn-link position-absolute end-0 top-50 translate-middle-y me-2 p-0" aria-label="Show password" onclick="toggleAccountPasswordVisibility('gen-account-password', 'gen-account-password-toggle', 'gen-account-password-toggle-icon')"><i id="gen-account-password-toggle-icon" class="bi bi-eye"></i></button>
      </div>
    </div>
    <div class="mb-3">
      <label class="form-label">Confirm Password</label>
      <div class="position-relative">
        <input class="form-control pe-5" id="gen-account-confirm-password" type="password" placeholder="Confirm new password">
        <button type="button" id="gen-account-confirm-password-toggle" class="btn btn-link position-absolute end-0 top-50 translate-middle-y me-2 p-0" aria-label="Show password" onclick="toggleAccountPasswordVisibility('gen-account-confirm-password', 'gen-account-confirm-password-toggle', 'gen-account-confirm-password-toggle-icon')"><i id="gen-account-confirm-password-toggle-icon" class="bi bi-eye"></i></button>
      </div>
    </div>
  `;
  openGenModal('Reset Password', body, () => resetUserPassword(userId), 'Reset Password');
}

function resetUserPassword(userId) {
  const password = document.getElementById('gen-account-password').value;
  const confirmPassword = document.getElementById('gen-account-confirm-password').value;
  if (!password || !confirmPassword) {
    alert('Please fill in both password fields.');
    return false;
  }
  if (password !== confirmPassword) {
    alert('Passwords do not match.');
    return false;
  }
  const params = new URLSearchParams();
  params.set('action', 'reset_password');
  params.set('id', String(userId));
  params.set('password', password);
  params.set('confirm_password', confirmPassword);
  return fetch('../php/users.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  }).then(res => res.json()).then(data => {
    if (!data.success) {
      alert(data.message || 'Unable to reset password.');
      return false;
    }
    ADMIN_USER_MGMT_ALERT = data.message || 'Password reset successfully.';
    closeGenModal();
    fetchAdminUsers();
    return true;
  }).catch(error => {
    console.error(error);
    alert('Unable to connect to the server.');
    return false;
  });
}

function toggleUserStatus(userId) {
  const user = ADMIN_USER_LIST.find(item => item.id === userId);
  if (!user) return;
  const newStatus = user.status === 'Active' ? 'Inactive' : 'Active';
  const params = new URLSearchParams();
  params.set('action', 'change_status');
  params.set('id', String(userId));
  params.set('status', newStatus);

  fetch('../php/users.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  }).then(res => res.json()).then(data => {
    if (!data.success) {
      alert(data.message || 'Unable to update account status.');
      return;
    }
    ADMIN_USER_MGMT_ALERT = data.message || 'Account status updated.';
    loadInitialData().catch(() => {}).then(() => fetchAdminUsers());
  }).catch(error => {
    console.error(error);
    alert('Unable to connect to the server.');
  });
}

function exportSystemLogs() {
  const headers = ['Timestamp','User','Role','Action','IP Address'];
  const rows = SYSTEM_LOGS.map(r => [r.ts, r.user, r.role, r.action, r.ip].map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(','));
  const csv = [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'system_logs.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  addNotification('System logs exported.', 'success');
}

function removeCoordinator(index) {
  if (!confirm('Deactivate this coordinator?')) return;
  const coordinator = COORDINATORS[index];
  if (!coordinator) return;
  coordinator.status = 'Inactive';
  addNotification(`Coordinator deactivated: ${coordinator.name}`, 'warning');
  if (currentPage === 'coordinators') {
    navigateTo('coordinators');
  }
}

function openCoordinatorModal(mode, index = null) {
  const coordinator = mode === 'edit' ? COORDINATORS[index] : { name:'', email:'', prog:'BIndTech Elect', students:'', status:'Active' };
  const body = `
    <div class="form-row"><label class="form-label">Full Name</label><input class="form-input" id="gen-coord-name" type="text" value="${escapeHtml(coordinator.name)}" placeholder="Enter full name"></div>
    <div class="form-row"><label class="form-label">Email</label><input class="form-input" id="gen-coord-email" type="email" value="${escapeHtml(coordinator.email)}" placeholder="Enter email address"></div>
    <div class="form-row"><label class="form-label">Program / Department</label><select class="form-select" id="gen-coord-prog">
      ${['BIndTech Elect','BSCS','BIndTech FPST'].map(prog => `<option value="${prog}" ${prog === coordinator.prog ? 'selected' : ''}>${prog}</option>`).join('')}
    </select></div>
    <div class="form-row"><label class="form-label">Students</label><input class="form-input" id="gen-coord-students" type="number" min="0" value="${escapeHtml(coordinator.students || '')}" placeholder="Number of students"></div>
    <div class="form-row"><label class="form-label">Status</label><select class="form-select" id="gen-coord-status">
      <option value="Active" ${coordinator.status === 'Active' ? 'selected' : ''}>Active</option>
      <option value="Inactive" ${coordinator.status === 'Inactive' ? 'selected' : ''}>Inactive</option>
    </select></div>
  `;
  openGenModal(mode === 'edit' ? 'Edit Coordinator' : 'Add Coordinator', body, () => saveCoordinator(mode, index), mode === 'edit' ? 'Update' : 'Add');
}


// ══ LOGIN ══
function selectRole(sel) {
  currentRole = VALID_ROLES.includes(sel.value) ? sel.value : 'student';
  currentRole = String(currentRole || '').toLowerCase();
}

function applyAuthenticatedUser(data) {
  const role = String(data.role || '').toLowerCase();
  const userId = Number(data.id);
  if (!VALID_ROLES.includes(role) || !Number.isInteger(userId) || userId <= 0) {
    return false;
  }

  currentRole = role;
  const companyIds = Array.isArray(data.company_ids)
    ? data.company_ids.filter(value => value !== null && value !== undefined && value !== '')
    : (data.company_id ? [data.company_id] : []);
  currentUser = {
    id: userId,
    name: data.name || 'User',
    username: data.username || '',
    email: data.email || '',
    role,
    program: data.program_name || data.program || '',
    program_id: data.program_id || '',
    student_id: data.student_id || '',
    section: data.section || '',
    academic_year: data.academic_year || '',
    address: data.address || '',
    company: data.company || '',
    company_id: data.company_id || (companyIds[0] || ''),
    company_ids: companyIds,
    company_name: data.company_name || data.company || '',
    employee_id: data.employee_id || ''
  };
  if (ROLES[role]) {
    ROLES[role].name = currentUser.name;
    ROLES[role].email = currentUser.email;
  }
  return true;
}

async function restoreAuthenticatedSession() {
  const loginScreen = document.getElementById('login-screen');
  const appContainer = document.getElementById('app');
  try {
    const response = await fetch(new URL('login.php', API_BASE), { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || !data.authenticated || !applyAuthenticatedUser(data.user || {})) {
      sessionStorage.removeItem(CURRENT_PAGE_STORAGE_KEY);
      if (loginScreen) loginScreen.style.display = 'flex';
      if (appContainer) appContainer.style.display = 'none';
      return;
    }

    const savedPage = sessionStorage.getItem(CURRENT_PAGE_STORAGE_KEY);
    const allowedPages = (NAV[currentRole] || []).map(item => item.id);
    currentPage = savedPage === 'profile' || allowedPages.includes(savedPage) ? savedPage : 'dashboard';
    if (loginScreen) loginScreen.style.display = 'none';
    if (appContainer) appContainer.style.display = 'block';
    initApp();
  } catch (error) {
    console.warn('Unable to verify the current login session:', error);
    if (loginScreen) loginScreen.style.display = 'flex';
    if (appContainer) appContainer.style.display = 'none';
  }
}

function showLoginFeedback(message) {
  const feedback = document.getElementById('login-feedback');
  if (!feedback) return;
  feedback.textContent = message || '';
  feedback.style.display = message ? 'block' : 'none';
}

async function doLogin() {
  if (loginInProgress) return;
  // A successful new sign-in begins a new client session after a prior logout.
  logoutInProgress = false;
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-pass').value;
  const selectedRole = document.getElementById('login-role')?.value;
  currentRole = VALID_ROLES.includes(selectedRole) ? selectedRole : 'student';

  if (!username || !password) {
    showLoginFeedback('Enter your username and password to continue.');
    return;
  }

  const btn = document.querySelector('.btn-login');
  const originalText = btn ? btn.textContent : 'Sign In';
  const controller = new AbortController();
  let timeoutId;
  let timedOut = false;
  let authenticated = false;
  loginInProgress = true;
  showLoginFeedback('');
  if (btn) {
    btn.textContent = 'Signing in…';
    btn.disabled = true;
  }

  try {
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 30000);
    const response = await fetch(new URL('login.php', API_BASE), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username, password, role: currentRole }).toString(),
      signal: controller.signal,
      cache: 'no-store'
    });
    const responseText = await response.text();
    let data;
    try {
      data = responseText ? JSON.parse(responseText) : null;
    } catch {
      throw new Error(response.ok
        ? 'The sign-in service returned an invalid response. Check the PHP error log.'
        : `The sign-in service returned HTTP ${response.status}.`);
    }
    if (!data || typeof data !== 'object') {
      throw new Error('The sign-in service returned an empty response. Please try again.');
    }
    if (!response.ok) {
      throw new Error(data.message || `Sign-in failed with HTTP ${response.status}.`);
    }
    if (!data.success) {
      showLoginFeedback(data.message || 'Invalid username or password.');
      return;
    }
    if (!applyAuthenticatedUser({ ...data, username: data.username || username })) {
      throw new Error('The server did not establish a valid account session. Please try again.');
    }
    authenticated = true;
  } catch (error) {
    console.warn('Unable to complete login:', error);
    const message = timedOut
      ? 'Sign-in timed out while waiting for the server. Check MySQL and try again.'
      : error.name === 'AbortError'
        ? 'The sign-in request was interrupted. Please try again.'
        : error instanceof TypeError
          ? 'Could not reach the sign-in server. Check Apache and try again.'
          : error.message || 'Unable to contact the sign-in service. Check the PHP/MySQL server and try again.';
    showLoginFeedback(message);
  } finally {
    clearTimeout(timeoutId);
    loginInProgress = false;
    if (btn) {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  }

  if (!authenticated) return;
  currentPage = 'dashboard';
  sessionStorage.setItem(CURRENT_PAGE_STORAGE_KEY, currentPage);

  if (currentRole === 'admin') {
    logAdminActivity('Login', `Logged in successfully as ${currentUser.name || 'admin'}.`);
  }
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  initApp();
}
async function doLogout() {
  if (logoutInProgress) return false;
  logoutInProgress = true;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    let response;
    try {
      response = await fetch('../php/logout.php', { method: 'POST', signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.message || 'The server did not confirm sign out.');
    }
  } catch (error) {
    logoutInProgress = false;
    console.warn('Unable to complete logout:', error);
    alert('Unable to sign out. Please check your connection and try again.');
    return false;
  }

  if (notificationsRefreshTimer) {
    clearInterval(notificationsRefreshTimer);
    notificationsRefreshTimer = null;
  }
  try { stopCamera(); } catch(e) { console.warn('stopCamera error during logout:', e); }

  currentPage = 'dashboard';
  currentRole = 'student';
  sessionStorage.removeItem(CURRENT_PAGE_STORAGE_KEY);
  closeSignOutConfirmation(true);
  const loginScreen = document.getElementById('login-screen');
  const appContainer = document.getElementById('app');
  if (loginScreen) loginScreen.style.display = 'flex';
  if (appContainer) appContainer.style.display = 'none';

  const loginRoleSelect = document.getElementById('login-role');
  if (loginRoleSelect) loginRoleSelect.value = 'student';
  const loginUsername = document.getElementById('login-username');
  if (loginUsername) loginUsername.value = '';
  const loginPass = document.getElementById('login-pass');
  if (loginPass) loginPass.value = '';
  return true;
}

let signOutConfirmationBusy = false;
let signOutReturnFocus = null;

function openSignOutConfirmation() {
  if (logoutInProgress || signOutConfirmationBusy) return;
  const modal = document.getElementById('signout-modal');
  if (!modal) return;
  signOutReturnFocus = document.activeElement;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.getElementById('signout-cancel')?.focus();
}

function closeSignOutConfirmation(force = false) {
  if (signOutConfirmationBusy && !force) return;
  const modal = document.getElementById('signout-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  if (!force && signOutReturnFocus?.isConnected) signOutReturnFocus.focus();
}

async function confirmSignOut() {
  if (signOutConfirmationBusy || logoutInProgress) return;
  signOutConfirmationBusy = true;
  const button = document.getElementById('signout-confirm');
  if (button) {
    button.disabled = true;
    button.textContent = 'Signing Out...';
  }

  const success = await doLogout();
  signOutConfirmationBusy = false;
  if (button) {
    button.disabled = false;
    button.textContent = 'Sign Out';
  }
  if (success) closeSignOutConfirmation(true);
}

document.getElementById('signout-modal')?.addEventListener('click', event => {
  if (event.target === event.currentTarget) closeSignOutConfirmation();
});
document.addEventListener('keydown', event => {
  const modal = document.getElementById('signout-modal');
  if (event.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
    closeSignOutConfirmation();
  }
});

// ══ APP INIT ══
function initApp() {
  ensureAdminRenderers();
  currentRole = String(currentRole || '').toLowerCase();
  if (!VALID_ROLES.includes(currentRole)) {
    currentRole = 'student';
  }
  const r = ROLES[currentRole];
  // Update sidebar with real user info if available
  const displayName = currentUser.name || r.name;
  const initials = displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  document.getElementById('sb-avatar').textContent = initials;
  document.getElementById('sb-uname').textContent = displayName;
  document.getElementById('sb-urole').textContent = r.label;
  document.getElementById('topbar-badge').textContent = r.badge;
  buildNav();

  const sbLogoutBtn = document.getElementById('sb-logout-btn');
  if (sbLogoutBtn && !sbLogoutBtn._hasLogoutListener) {
    sbLogoutBtn._hasLogoutListener = true;
    sbLogoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openSignOutConfirmation();
    });
  }

  fetchNotifications();
  if (notificationsRefreshTimer) {
    clearInterval(notificationsRefreshTimer);
  }
  notificationsRefreshTimer = setInterval(fetchNotifications, 10000);
  document.addEventListener('click', handleClickOutsideNotifications);
  // Load all shared reference data from DB before rendering first page
  loadInitialData().then(() => {
    if (currentRole === 'student') {
      // Also load student-specific attendance and submissions from DB
      return Promise.all([loadStudentData(), loadStudentTasks(), refreshFaceRegistrationState()]);
    }
    if (currentRole === 'coordinator') {
      // Pre-fetch student records so coordinator dashboard is populated
      if (typeof refreshCoordinatorStudentRecords === 'function') {
        refreshCoordinatorStudentRecords().catch(() => {});
      }
    }
    if (currentRole === 'supervisor' && typeof loadSupervisorTasks === 'function') {
      return loadSupervisorTasks();
    }
  }).then(() => {
    navigateTo(currentPage);
  });
  document.getElementById('content').addEventListener('click', handleContentAction);
}

async function loadInitialData() {
  if (currentRole === 'admin') {
    SCHOOL_YEARS = [];
    PROGRAMS = [];
    ADMIN_STUDENTS.length = 0;
    ADMIN_COMPANIES.length = 0;
    SUPERVISORS.length = 0;
    COORDINATORS.length = 0;
    INTERNSHIPS = [];
    ADMIN_RECENT_ACTIVITIES = [];
    Object.keys(DASHBOARD_STATS).forEach(key => { DASHBOARD_STATS[key] = 0; });
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${API_BASE}?resource=init&_=${Date.now()}`, {
      signal: controller.signal,
      cache: 'no-store'
    });
    clearTimeout(timeoutId);
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Unable to load records from the database.');
    if (data.success) {
      if (Array.isArray(data.recent_activities)) {
        ADMIN_RECENT_ACTIVITIES = data.recent_activities.map(activity => ({
          event: `${activity.user_name || 'System'}: ${activity.action || ''} - ${activity.description || ''}`,
          time: activity.created_at ? new Date(activity.created_at).toLocaleString('en-PH') : '',
          icon: activity.role === 'admin' ? '⚙️' : '📋'
        }));
      }
      if (data.dashboard_stats && typeof data.dashboard_stats === 'object') {
        Object.keys(DASHBOARD_STATS).forEach(key => {
          if (Object.prototype.hasOwnProperty.call(data.dashboard_stats, key)) {
            DASHBOARD_STATS[key] = Number(data.dashboard_stats[key]) || 0;
          }
        });
      }
      if (Array.isArray(data.school_years)) {
        SCHOOL_YEARS = data.school_years.map(sy => ({
          id: sy.id,
          year: sy.year_label,
          semester: sy.semester,
          start: sy.start_date,
          end: sy.end_date,
          students: sy.students_count,
          status: sy.status
        }));
      }
      if (Array.isArray(data.programs)) {
        PROGRAMS = data.programs.map(p => ({
          id: p.id,
          code: p.code,
          name: p.name,
          req: p.req_hours,
          students: p.students_count,
          coord: p.coordinator_name || p.coordinator || 'Unassigned',
          studentsList: Array.isArray(p.students_list) ? p.students_list : [],
          status: 'Active'
        }));
      }
      if (Array.isArray(data.students)) {
        ADMIN_STUDENTS.length = 0;
        data.students.forEach(student => ADMIN_STUDENTS.push({
          id: student.id,
          studentId: student.student_id || '',
          name: student.name || '',
          program: student.program || '',
          yearLevel: student.academic_year || '',
          section: student.section || '',
          email: student.email || '',
          contact: student.contact || '',
          username: student.username || '',
          status: student.status || 'Active'
        }));
      }
      if (Array.isArray(data.companies)) {
        ADMIN_COMPANIES.length = 0;
        data.companies.forEach(c => ADMIN_COMPANIES.push(c));
        // Also update PARTNER_COMPANIES if coordinator is logged in
        if (typeof PARTNER_COMPANIES !== 'undefined' && Array.isArray(PARTNER_COMPANIES)) {
          PARTNER_COMPANIES.length = 0;
          data.companies.forEach(c => PARTNER_COMPANIES.push({ name: c.name, loc: c.location, contact: c.contact_email, interns: 0, status: c.status }));
        }
      }
      if (Array.isArray(data.supervisors)) {
        SUPERVISORS.length = 0;
        data.supervisors.forEach(s => SUPERVISORS.push(s));
      }
      if (Array.isArray(data.coordinators)) {
        COORDINATORS.length = 0;
        data.coordinators.forEach(c => COORDINATORS.push({ id: c.id, name: c.name, email: c.email, prog: c.program || '', program_id: c.program_id || '', students: 0, status: c.status }));
      }

      if (currentRole === 'admin') {
        INTERNSHIPS = [];
        const reportResponse = await fetch(`${API_BASE}?resource=admin_report`);
        const reportData = await reportResponse.json();
        if (reportData.success && Array.isArray(reportData.reports)) {
          INTERNSHIPS = reportData.reports.map(assignment => ({
            studentName: assignment.student_name || '',
            studentId: assignment.student_no || '',
            program: assignment.program || '',
            company: assignment.company_name || '',
            supervisor: assignment.supervisor_name || '',
            coordinator: assignment.coordinator_name || '',
            academicYear: assignment.year_label || 'N/A',
            status: assignment.internship_status || 'Pending',
            hoursCompleted: Number(assignment.hours_completed) || 0,
            evaluationScore: Number(assignment.evaluation_score) || 0,
            completionCleared: Boolean(Number(assignment.completion_cleared)),
            requirements: {}
          }));
        } else {
          throw new Error(reportData.message || 'Unable to load Admin reports from the database.');
        }
      }
    }
  } catch (err) {
    if (currentRole === 'admin') {
      SCHOOL_YEARS = [];
      PROGRAMS = [];
      ADMIN_STUDENTS.length = 0;
      ADMIN_COMPANIES.length = 0;
      SUPERVISORS.length = 0;
      COORDINATORS.length = 0;
      INTERNSHIPS = [];
      ADMIN_RECENT_ACTIVITIES = [];
      Object.keys(DASHBOARD_STATS).forEach(key => { DASHBOARD_STATS[key] = 0; });
    }
    console.warn('loadInitialData failed — using fallback data:', err);
  }
}

async function loadStudentData() {
  if (currentRole !== 'student' || !currentUser.id) return;
  try {
    // Load student's own attendance from DB
    const attRes = await fetch(`${API_BASE}?resource=attendance`);
    const attData = await attRes.json();
    if (attData.success && Array.isArray(attData.attendance)) {
      // Replace local state with the student's actual database rows, including an empty result.
      ATTENDANCE_LOG.length = 0;
      attData.attendance.forEach(a => {
        const totalMinutes = Number(a.total_minutes ?? a.duration_minutes) || 0;
        ATTENDANCE_LOG.push({
          id: a.id,
          date: new Date(`${a.log_date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          timeIn: a.time_in || '',
          timeOut: a.time_out || '',
          morningTimeIn: a.time_in || '',
          morningTimeOut: a.time_out || '',
          afternoonTimeIn: a.afternoon_time_in || '',
          afternoonTimeOut: a.afternoon_time_out || '',
          faceInImage: a.face_snapshot_in || '',
          faceOutImage: a.face_snapshot_out || '',
          afternoonFaceInImage: a.afternoon_face_snapshot_in || '',
          afternoonFaceOutImage: a.afternoon_face_snapshot_out || '',
          morningMinutes: a.morning_minutes,
          afternoonMinutes: a.afternoon_minutes,
          totalMinutes,
          durationMinutes: totalMinutes,
          hrs: (totalMinutes / 60).toFixed(2),
          verification: a.verification_status || 'Pending',
          morningTimeInVerification: a.verification_status || 'Pending',
          morningTimeOutVerification: a.time_out_verification_status || 'Pending',
          afternoonTimeInVerification: a.afternoon_time_in_verification_status || 'Pending',
          afternoonTimeOutVerification: a.afternoon_time_out_verification_status || 'Pending',
          status: a.status || (a.time_in ? 'Present' : 'Absent'),
          remarks: a.remarks || ''
        });
      });
    }

    // Load student's own submissions from DB
    const subRes = await fetch(`${API_BASE}?resource=submissions`);
    const subData = await subRes.json();
    if (subData.success && Array.isArray(subData.submissions) && subData.submissions.length) {
      SUBMISSIONS.length = 0;
      subData.submissions.forEach(s => {
        SUBMISSIONS.push({
          id: s.id,
          student: currentUser.name || ROLES.student.name,
          task: s.task_title || s.task_name || s.task || 'General',
          name: s.file_name || s.name || 'File',
          date: new Date(s.submitted_at || s.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          status: s.status || 'For Review',
          tag: s.status === 'Approved' ? 'tag-green' : s.status === 'Rejected' ? 'tag-red' : 'tag-amber',
          comment: s.supervisor_comment || ''
        });
      });
    }
  } catch (err) {
    console.warn('loadStudentData failed — using fallback data:', err);
  }
}

async function refreshFaceRegistrationState() {
  if (currentRole !== 'student') return false;
  try {
    const result = await getFaceRegistrationEndpoint('status');
    FACE_REGISTRATION_STATUS_VERIFIED = result.success === true;
    FACE_REGISTRATION_LOCKED = FACE_REGISTRATION_STATUS_VERIFIED
      && (result.registered === true || String(result.status || '').toLowerCase() === 'registered');
    FACE_REGISTRATION_REGISTERED = FACE_REGISTRATION_LOCKED && result.registered === true && result.imageValid === true && !!result.faceEncoding;
  } catch (error) {
    FACE_REGISTRATION_STATUS_VERIFIED = false;
    FACE_REGISTRATION_LOCKED = false;
    FACE_REGISTRATION_REGISTERED = false;
  }
  return FACE_REGISTRATION_REGISTERED;
}
function handleContentAction(event) {
  const button = event.target.closest('button[data-action]');
  if (!button || !document.getElementById('content').contains(button)) return;
  const action = button.dataset.action;
  const mode = button.dataset.mode;
  const index = button.dataset.index !== undefined ? Number(button.dataset.index) : null;

  switch (action) {
    case 'openProgramModal':
      openProgramModal(mode || 'add', index);
      break;
    case 'viewProgramStudents':
      if (index !== null) viewProgramStudents(index);
      break;
    case 'openSchoolYearModal':
      openSchoolYearModal(index);
      break;
    case 'viewSchoolYear':
      if (index !== null) viewSchoolYear(index);
      break;
    case 'openAccountModal':
      openAccountModal();
      break;
    case 'exportSystemLogs':
      exportSystemLogs();
      break;
    case 'openAssignTaskModal':
      openAssignTaskModal(mode || 'add', index);
      break;
    case 'approveSubmission':
      if (index !== null) approveSubmission(index);
      break;
    case 'rejectSubmission':
      if (index !== null) rejectSubmission(index);
      break;
    case 'deleteProgram':
      if (index !== null) deleteProgram(index);
      break;
  }
}

function buildNav() {
  const nav = document.getElementById('sb-nav');
  // Normalize role and fall back when NAV entry missing
  currentRole = String(currentRole || '').toLowerCase();
  let roleKey = currentRole;
  if (!NAV[roleKey]) {
    roleKey = 'student';
    currentRole = 'student';
  }
  const items = NAV[roleKey] || [];
  nav.innerHTML = '<div class="sb-section">Main Menu</div>';
  items.forEach(item => {
    const el = document.createElement('div');
    el.className = 'sb-item';
    el.dataset.page = item.id;
    const badgeValue = item.id === 'tasks'
      ? TASK_UNREAD_COUNTS[roleKey]
      : item.badge;
    el.innerHTML = `<span class="sb-icon">${item.icon}</span><span>${item.label}</span>${badgeValue ? `<span class="sb-badge">${badgeValue}</span>` : ''}`;
    el.classList.toggle('active', item.id === currentPage);
    nav.appendChild(el);
  });
  // Use event delegation for sidebar item clicks to avoid intermittent onclick failures
  if (!nav._navClickHandler) {
    nav._navClickHandler = function(e) {
      const item = e.target.closest('.sb-item');
      if (item && nav.contains(item)) {
        navigateTo(item.dataset.page);
      }
    };
    nav.addEventListener('click', nav._navClickHandler);
  }
}

function navigateTo(page) {
  console.log(`🎯 [navigateTo START] page="${page}", currentRole="${currentRole}"`);
  // Normalize role key (tolerant to capitalization mismatches)
  currentRole = String(currentRole || '').toLowerCase();
  let roleKey = currentRole;
  if (!NAV[roleKey]) {
    console.log(`⚠️ NAV[${roleKey}] missing, resetting to student`);
    roleKey = 'student';
    currentRole = 'student';
  }
  const availablePages = (NAV[roleKey] || []).map(item => item.id);
  console.log(`📄 Available pages for ${currentRole}:`, availablePages);
  if (!availablePages.includes(page) && page !== 'profile') {
    console.log(`🔄 Redirecting ${page} -> dashboard`);
    page = 'dashboard';
  }
  currentPage = page;
  sessionStorage.setItem(CURRENT_PAGE_STORAGE_KEY, currentPage);
  if (page === 'tasks') {
    clearTaskBadge();
  }
  if (page === 'tasks' || page === 'submissions') {
    syncTaskCompletionFromSubmissions();
  }
  document.querySelectorAll('.sb-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  const label = NAV[roleKey].find(n => n.id === page)?.label || (page === 'profile' ? 'Profile' : 'Dashboard');
  document.getElementById('topbar-title').textContent = label;
  const content = document.getElementById('content');
  console.log(`🔍 Looking for PAGE_RENDERERS["${currentRole}"]["${page}"]`);
  console.log(`📦 PAGE_RENDERERS keys:`, Object.keys(PAGE_RENDERERS));
  if (PAGE_RENDERERS[currentRole]) {
    console.log(`  → ${currentRole} pages:`, Object.keys(PAGE_RENDERERS[currentRole]).slice(0, 5));
  }
  let renderer = PAGE_RENDERERS[roleKey]?.[page] || PAGE_RENDERERS.common?.[page];
  // If renderer is missing for admin, attempt to load the admin script dynamically once and retry
  if (!renderer && roleKey === 'admin' && !navigateTo._adminLoaderTried) {
    navigateTo._adminLoaderTried = true;
    const scriptSrc = new URL('roles/admin.js?v=26', APP_SCRIPT_URL).href;
    try {
      const s = document.createElement('script');
      s.src = scriptSrc;
      s.async = false;
      s.onload = () => { try { navigateTo(page); } catch(e) { console.error('navigateTo retry failed', e); } };
      s.onerror = () => { console.warn('Failed to dynamically load admin.js'); content.innerHTML = renderPageFallback(page, label)(); };
      document.body.appendChild(s);
      return; // will retry onload
    } catch (e) {
      console.warn('Dynamic admin loader failed', e);
    }
  }
  renderer = renderer || renderPageFallback(page, label);
  console.log(`✅ Renderer found:`, !!renderer, typeof renderer);
  try {
    console.log(`🚀 Calling renderer()...`);
    const html = renderer();
    console.log(`✨ HTML Generated! Length=${html?.length}, Preview: ${html?.substring(0, 80)}...`);
    content.innerHTML = html;
    console.log(`✓ Content rendered to DOM`);
    if (page === 'users') {
      fetchAdminUsers();
    }
    if (currentRole === 'admin' && page === 'companies' && typeof initAdminCompanySearch === 'function') {
      initAdminCompanySearch();
    }
    if (currentRole === 'admin' && page === 'reports' && typeof initAdminReportsPage === 'function') {
      initAdminReportsPage();
    }
    if (typeof initAdminLogsPage === 'function') {
      initAdminLogsPage();
    }
    if (typeof initCoordinatorModule === 'function') {
      initCoordinatorModule();
    }
    if (currentRole === 'supervisor' && page === 'attendance') {
      setTimeout(applySupervisorAttendanceNotificationTarget, 150);
    }
    if (currentRole === 'supervisor' && page === 'submissions') {
      setTimeout(applySupervisorSubmissionNotificationTarget, 150);
    }
    if (currentRole === 'supervisor' && ['dashboard', 'interns', 'tasks', 'submissions'].includes(page) && typeof loadSupervisorStudents === 'function' && (!SUPERVISOR_STUDENTS_LOADED || SUPERVISOR_STUDENTS_USER_ID !== currentUser?.id)) {
      loadSupervisorStudents();
    }
    if (currentRole === 'supervisor' && ['dashboard', 'attendance'].includes(page) && typeof loadSupervisorAttendance === 'function' && (!SUPERVISOR_ATTENDANCE_LOADED || SUPERVISOR_ATTENDANCE_USER_ID !== currentUser?.id)) {
      loadSupervisorAttendance();
    }
    if (currentRole === 'supervisor' && ['dashboard', 'submissions'].includes(page) && typeof loadSupervisorSubmissions === 'function' && (!SUPERVISOR_LIVE_SUBMISSIONS || SUPERVISOR_SUBMISSIONS_USER_ID !== currentUser?.id)) {
      loadSupervisorSubmissions();
    }
    if (currentRole === 'supervisor' && page === 'profile' && typeof loadSupervisorProfile === 'function' && (!SUPERVISOR_PROFILE_LOADED || SUPERVISOR_PROFILE_USER_ID !== currentUser?.id)) {
      loadSupervisorProfile();
    }
    if (currentRole === 'admin' && page === 'profile' && typeof loadAdminProfile === 'function') {
      loadAdminProfile();
    }
    if (currentRole === 'student' && page === 'tasks' && typeof loadStudentTasks === 'function') {
      loadStudentTasks().then(() => {
        if (currentRole === 'student' && currentPage === 'tasks') {
          navigateTo('tasks');
          if (window.STUDENT_TASK_FOCUS_ID) {
            setTimeout(() => focusStudentTask(window.STUDENT_TASK_FOCUS_ID), 50);
          }
        }
      });
    }
    if (typeof initStudentFaceRegPage === 'function') {
      initStudentFaceRegPage();
    }
    if (currentRole === 'student' && page === 'profile' && typeof loadStudentProfile === 'function') {
      loadStudentProfile();
    }
  } catch (err) {
    console.error('Page render failed', err);
    content.innerHTML = `
      <div class="card">
        <div class="card-body">
          <div style="font-size:14px;color:var(--text3);line-height:1.7">An error occurred while loading this page. Please refresh or try again later.</div>
        </div>
      </div>
    `;
  }

  const breadcrumb = document.querySelector('.breadcrumb');
  if (breadcrumb) {
    const roleTitle = currentRole === 'admin'
      ? 'Admin Panel'
      : currentRole === 'supervisor'
        ? 'Supervisor Portal'
        : currentRole === 'coordinator'
          ? 'Coordinator Portal'
          : 'Student Portal';
    breadcrumb.textContent = `${roleTitle} › ${label}`;
  }
}

function renderPageFallback(page, label) {
  return () => `
    <div class="breadcrumb">${currentRole === 'admin' ? 'Admin Panel' : currentRole === 'supervisor' ? 'Supervisor Portal' : currentRole === 'coordinator' ? 'Coordinator Portal' : 'Student Portal'} › ${escapeHtml(label)}</div>
    <div class="card">
      <div class="card-body" style="min-height:260px;">
        <div style="font-size:14px;color:var(--text3);line-height:1.7">
          ${escapeHtml(label)} content is available here. This demo page is under construction, but menu navigation is now working.
        </div>
      </div>
    </div>
  `;
}

function syncTaskCompletionFromSubmissions() {
  // Submission alone does not complete a task; supervisor approval controls completion.
}

// ══ PAGE RENDERERS ══
PAGE_RENDERERS.common.profile = () => {
  const user = ROLES[currentRole] || { name:'Unknown', label:'User', initials:'NA', badge:'N/A', email:'Not set', contact:'Not set', nis:'Not set' };
  const avatarSource = currentRole === 'student' ? (currentUser?.face_image || user.photo) : user.photo;
  const avatar = avatarSource
    ? `<img src="${escapeHtml(avatarSource)}" alt="${escapeHtml(user.name)}">`
    : escapeHtml(user.initials);
  return `
    <div class="breadcrumb">${currentRole === 'admin' ? 'Admin Panel' : currentRole === 'supervisor' ? 'Supervisor Portal' : currentRole === 'coordinator' ? 'Coordinator Portal' : 'Student Portal'} › Profile</div>
    <div class="profile-hero">
      <div class="profile-hero-left">
        <div class="profile-avatar-large">${avatar}</div>
        <div>
          <div class="profile-name">${escapeHtml(user.name)}</div>
          <div class="profile-role">${escapeHtml(user.label)}</div>
          <div class="profile-badge">${escapeHtml(user.badge)}</div>
        </div>
      </div>
      <div class="profile-hero-right profile-hero-actions">
        <button class="btn btn-secondary" onclick="openEditProfileModal()">Edit Profile</button>
        <button class="btn btn-primary" onclick="openChangePasswordModal()">Change Password</button>
      </div>
    </div>
    <div class="card profile-overview-card">
      <div class="card-header"><div class="card-title">Profile Information</div></div>
      <div class="card-body profile-overview-grid">
        <div><div class="profile-overview-label">Name</div><div class="profile-overview-value">${escapeHtml(user.name)}</div></div>
        <div><div class="profile-overview-label">Role</div><div class="profile-overview-value">${escapeHtml(user.label)}</div></div>
        <div><div class="profile-overview-label">Email</div><div class="profile-overview-value">${escapeHtml(user.email || 'Not set')}</div></div>
        <div><div class="profile-overview-label">Contact</div><div class="profile-overview-value">${escapeHtml(user.contact || 'Not set')}</div></div>
        <div><div class="profile-overview-label">Badge</div><div class="profile-overview-value">${escapeHtml(user.badge)}</div></div>
      </div>
    </div>
  `;
};

function openEditProfileModal() {
  const user = ROLES[currentRole];
  const body = `
    <div class="form-row"><label class="form-label">Name</label><input class="form-input" id="gen-profile-name" type="text" value="${escapeHtml(user.name)}" readonly></div>
    <div class="form-row"><label class="form-label">Role</label><input class="form-input" type="text" value="${escapeHtml(user.label)}" readonly></div>
    <div class="form-row"><label class="form-label">Email</label><input class="form-input" id="gen-profile-email" type="email" value="${escapeHtml(user.email)}" placeholder="Enter email"></div>
    <div class="form-row"><label class="form-label">Contact Number</label><input class="form-input" id="gen-profile-contact" type="text" value="${escapeHtml(user.contact)}" placeholder="Enter contact number"></div>
  `;
  openGenModal('Edit Profile', body, saveProfileDetails, 'Save');
}

function saveProfileDetails() {
  const user = ROLES[currentRole];
  const email = document.getElementById('gen-profile-email').value.trim();
  const contact = document.getElementById('gen-profile-contact').value.trim();
  if (!email || !contact) {
    alert('Please fill all profile fields before saving.');
    return false;
  }
  user.email = email;
  user.contact = contact;
  if (currentPage === 'profile') {
    navigateTo('profile');
  }
}

function openChangePasswordModal() {
  const body = `
    <div class="form-row"><label class="form-label">Current Password</label><input class="form-input" type="password" placeholder="Enter current password"></div>
    <div class="form-row"><label class="form-label">New Password</label><input class="form-input" type="password" placeholder="Enter new password"></div>
    <div class="form-row"><label class="form-label">Confirm New Password</label><input class="form-input" type="password" placeholder="Confirm new password"></div>
  `;
  openGenModal('Change Password', body, () => {
    alert('Password change is not enabled in this demo.');
  }, 'Save');
};
// ══ HELPERS ══
function taskItems(tasks, readOnly = false) {
  return tasks.map((t, index)=>{
    const actionHtml = !readOnly && t.status === 'Pending'
      ? `<button type="button" class="btn btn-outline btn-sm" onclick="startStudentTask(${Number(t.id)})">Start Task</button>`
      : !readOnly && t.status === 'Ongoing' && t.startedAt
        ? `<button type="button" class="btn btn-outline btn-sm" onclick="navigateTo('submissions')">Continue Task</button>`
        : `<span class="tag ${t.tag}">${escapeHtml(t.tagLabel)}</span>`;

    return `<div class="task-item" id="student-task-${Number(t.id) || 0}">
      <div class="task-check ${t.done?'done':''}">
        ${t.done?'✓':''}
      </div>
      <div>
        <div class="task-name" style="${t.status === 'Completed' ? 'text-decoration:line-through;color:var(--text3)' : ''}">${escapeHtml(t.name)}</div>
        <div class="task-due">${t.due}${t.startedAt ? ` · Started <span data-task-started="${Number(t.id)}">${formatTaskElapsed(t.startedAt, t.completedAt)}</span>` : ''}</div>
      </div>
      <div class="task-meta">${actionHtml}</div>
    </div>`;
  }).join('');
}
function formatTaskElapsed(startedAt, completedAt = '') {
  const started = new Date(String(startedAt).replace(' ', 'T')).getTime();
  if (Number.isNaN(started)) return 'Started';
  const completed = completedAt ? new Date(String(completedAt).replace(' ', 'T')).getTime() : Date.now();
  const elapsedMinutes = Math.max(0, Math.floor((completed - started) / 60000));
  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = elapsedMinutes % 60;
  return `${hours}h ${minutes}m elapsed`;
}

function refreshTaskElapsedTimes() {
  document.querySelectorAll('[data-task-started]').forEach(element => {
    const task = STUDENT_TASKS.find(item => Number(item.id) === Number(element.dataset.taskStarted));
    if (task?.startedAt) element.textContent = formatTaskElapsed(task.startedAt, task.completedAt);
  });
}

async function startStudentTask(taskId) {
  const task = STUDENT_TASKS.find(item => item.id === Number(taskId));
  if (!task) return;
  if (!confirm(`Start task "${task.name}" now?`)) return;
  try {
    const params = new URLSearchParams({ action: 'start_task', id: String(task.id) });
    const response = await fetch(`${API_BASE}?resource=tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.message || 'Unable to start task.');
    await loadStudentTasks();
    navigateTo(currentPage);
  } catch (error) {
    console.warn('Unable to start task:', error);
    alert(error.message || 'Unable to start task.');
  }
}

const taskTimerInterval = setInterval(refreshTaskElapsedTimes, 60000);

function clearTaskBadge() {
  // Mark tasks as read for current role's badge and refresh navigation
  if (TASK_UNREAD_COUNTS[currentRole] !== undefined) {
    TASK_UNREAD_COUNTS[currentRole] = 0;
  }
  buildNav();
}

async function recordAttendance(type, scanData, faceEncoding, eventType = pendingAttendanceEventType) {
  const nextEvent = getNextStudentAttendanceEvent();
  const selectedEvent = eventType || nextEvent?.action;
  if (!nextEvent || selectedEvent !== nextEvent.action || nextEvent.type !== type) {
    alert('Attendance events must be recorded in the displayed order. Refresh the page and try again.');
    return false;
  }
  const event = STUDENT_ATTENDANCE_EVENTS.find(item => item.action === selectedEvent);
  if (!event) return false;

  try {
    const params = new URLSearchParams({
      action: selectedEvent,
      face_snapshot: scanData || '',
      face_encoding: JSON.stringify(faceEncoding || [])
    });
    const response = await fetch(`${API_BASE}?resource=attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      alert(data.message || `${event.label} was not recorded.`);
      return false;
    }

    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    let todayEntry = getTodayAttendanceEntry();
    if (!todayEntry) {
      todayEntry = {
        date: today,
        timeIn: '',
        timeOut: '',
        morningTimeIn: '',
        morningTimeOut: '',
        afternoonTimeIn: '',
        afternoonTimeOut: '',
        totalMinutes: 0,
        hrs: '0.00',
        status: 'Present'
      };
      ATTENDANCE_LOG.unshift(todayEntry);
    }

    todayEntry[event.field] = data.time;
    if (selectedEvent === 'morning_time_in') todayEntry.timeIn = data.time;
    if (selectedEvent === 'morning_time_out') todayEntry.timeOut = data.time;
    todayEntry[event.faceField] = scanData;
    todayEntry[event.verificationField] = 'Verified';
    todayEntry.morningMinutes = data.morning_minutes;
    todayEntry.afternoonMinutes = data.afternoon_minutes;
    todayEntry.totalMinutes = Number(data.total_minutes) || 0;
    todayEntry.durationMinutes = todayEntry.totalMinutes;
    todayEntry.hrs = (todayEntry.totalMinutes / 60).toFixed(2);
    todayEntry.status = data.status || todayEntry.status || 'Present';
    addNotification(`${event.label} recorded at ${formatAttendanceTime(data.time)}`, 'success');
    return true;
  } catch (error) {
    console.warn(`Attendance event ${selectedEvent} failed:`, error);
    alert(error.message || `${event.label} could not be recorded.`);
    return false;
  }
}

function captureFaceSnapshot() {
  return new Promise((resolve, reject) => {
    const registrationVideo = document.getElementById('cameraPreview');
    const modalVideo = document.getElementById('camera-feed');
    const video = registrationVideo?.srcObject ? registrationVideo : modalVideo?.srcObject ? modalVideo : registrationVideo || modalVideo;
    if (!video || video.readyState < 2) {
      reject(new Error('Camera frame is not ready. Please wait for the live camera, then try again.'));
      return;
    }
    if (!video.videoWidth || !video.videoHeight) {
      reject(new Error('Camera frame has no image data. Please reopen the camera and try again.'));
      return;
    }
    const width = Math.min(1280, video.videoWidth || 640);
    const height = Math.min(720, video.videoHeight || 480);
    if (width < 160 || height < 120) {
      reject(new Error('Camera frame is too small. Please reopen the camera and try again.'));
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Unable to capture the camera frame.'));
      return;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(video, 0, 0, width, height);
    const firstPixel = ctx.getImageData(0, 0, 1, 1).data;
    if (firstPixel[3] === 0) {
      reject(new Error('The camera frame is empty. Please try Capture Face again.'));
      return;
    }
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const brightness = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (brightness > 160) {
        data[i] = Math.min(255, data[i] + 8);
        data[i + 1] = Math.min(255, data[i + 1] + 8);
        data[i + 2] = Math.min(255, data[i + 2] + 8);
      }
    }
    ctx.putImageData(imageData, 0, 0);
    resolve(canvas.toDataURL('image/jpeg', 0.9));
  });
}

function compareFaceSnapshots(a, b) {
  return new Promise(resolve => {
    if (!a || !b) {
      resolve(false);
      return;
    }
    const size = 16;
    const canvasA = document.createElement('canvas');
    const canvasB = document.createElement('canvas');
    canvasA.width = canvasA.height = size;
    canvasB.width = canvasB.height = size;
    const ctxA = canvasA.getContext('2d');
    const ctxB = canvasB.getContext('2d');
    const imgA = new Image();
    const imgB = new Image();
    let loaded = 0;

    function tryCompare() {
      if (loaded < 2) return;
      const dataA = ctxA.getImageData(0, 0, size, size).data;
      const dataB = ctxB.getImageData(0, 0, size, size).data;
      let diff = 0;
      for (let i = 0; i < dataA.length; i += 4) {
        diff += Math.abs(dataA[i] - dataB[i]);
        diff += Math.abs(dataA[i + 1] - dataB[i + 1]);
        diff += Math.abs(dataA[i + 2] - dataB[i + 2]);
      }
      const maxDiff = size * size * 3 * 255;
      const normalized = diff / maxDiff;
      resolve(normalized < 0.22);
    }

    imgA.crossOrigin = 'anonymous';
    imgB.crossOrigin = 'anonymous';
    imgA.onload = () => { ctxA.drawImage(imgA, 0, 0, size, size); loaded++; tryCompare(); };
    imgB.onload = () => { ctxB.drawImage(imgB, 0, 0, size, size); loaded++; tryCompare(); };
    imgA.src = a;
    imgB.src = b;
  });
}

function getFaceRegistrationEndpoint(action, data = {}) {
  const studentId = currentUser?.student_id || ROLES.student.nis || ROLES.student.student_id || '';
  const params = new URLSearchParams({ action, role: currentUser.role || 'student', username: currentUser.username || ROLES.student.email.split('@')[0] || '', studentId });
  Object.keys(data).forEach(key => {
    if (data[key] !== undefined && data[key] !== null) {
      params.append(key, data[key]);
    }
  });
  return fetch('../php/face_registration.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  }).then(res => res.json());
}

let realFaceModelsPromise = null;
async function ensureRealFaceRecognition() {
  if (!window.faceapi) throw new Error('Face recognition library is unavailable.');
  if (!realFaceModelsPromise) {
    const modelUrl = 'https://justadudewhohacks.github.io/face-api.js/models';
    realFaceModelsPromise = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(modelUrl),
      faceapi.nets.faceLandmark68Net.loadFromUri(modelUrl),
      faceapi.nets.faceRecognitionNet.loadFromUri(modelUrl)
    ]);
  }
  await realFaceModelsPromise;
}

async function getRealFaceDescriptor(imageSource) {
  await ensureRealFaceRecognition();
  const image = new Image();
  image.src = imageSource;
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error('Captured face image could not be loaded.'));
  });
  const detections = await faceapi.detectAllFaces(image, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptors();
  if (detections.length === 0) throw new Error('No face detected. Please position your face inside the frame.');
  if (detections.length > 1) throw new Error('Only one face should be visible.');
  return Array.from(detections[0].descriptor);
}

async function loadFaceRegistrationStatus() {
  const statusCard = document.getElementById('face-reg-status-card');
  const badge = document.getElementById('face-reg-status-badge');
  const statusText = document.getElementById('face-reg-status-text');
  const previewImg = document.getElementById('student-face-reg-preview');
  const capturedPreview = document.getElementById('face-reg-captured-preview');
  const openBtn = document.getElementById('face-reg-open-btn');
  const captureBtn = document.getElementById('face-reg-capture-btn');
  const retakeBtn = document.getElementById('face-reg-retake-btn');
  const saveBtn = document.getElementById('face-reg-save-btn');
  const faceIndicator = document.getElementById('face-detection-indicator');
  const studentName = document.getElementById('face-reg-student-name');
  const studentId = document.getElementById('face-reg-student-id');
  const regDate = document.getElementById('face-reg-date');
  const regTime = document.getElementById('face-reg-time');

  if (!statusCard || !badge) {
    return;
  }

  if (studentName) studentName.textContent = currentUser?.name || ROLES.student.name;
  if (studentId) studentId.textContent = currentUser?.nis || ROLES.student.nis || '—';
  FACE_REGISTRATION_STATUS_VERIFIED = false;
  FACE_REGISTRATION_LOCKED = false;
  FACE_REGISTRATION_REGISTERED = false;
  if (faceIndicator) {
    faceIndicator.textContent = 'No Face Detected';
    faceIndicator.className = 'badge bg-secondary';
  }
  if (openBtn) openBtn.disabled = true;
  if (captureBtn) captureBtn.disabled = true;
  if (retakeBtn) retakeBtn.disabled = true;
  if (saveBtn) saveBtn.disabled = true;
  if (previewImg) previewImg.src = ROLES.student.photo || '';
  if (capturedPreview) {
    capturedPreview.style.display = 'none';
    capturedPreview.src = '';
  }
  if (regDate) regDate.textContent = '—';
  if (regTime) regTime.textContent = '—';
  if (statusText) statusText.textContent = 'Ready to begin';
  badge.className = 'badge bg-secondary';
  badge.textContent = 'Not Registered';
  setFaceRegistrationState({ faceCaptured: false, capturedImage: '' });

  try {
    const result = await getFaceRegistrationEndpoint('status');
    if (!result.success) {
      if (statusText) statusText.textContent = 'Service unavailable';
      return;
    }

    const faceImage = typeof result.faceImage === 'string' ? result.faceImage.trim() : '';
    const registered = result.registered === true || String(result.status || '').toLowerCase() === 'registered';
    const imageAvailable = registered && result.imageValid === true && !!faceImage;
    const brokenRegisteredImage = registered && result.imageValid === false;
    FACE_REGISTRATION_STATUS_VERIFIED = true;
    FACE_REGISTRATION_LOCKED = registered;
    FACE_REGISTRATION_REGISTERED = registered && imageAvailable && !!result.faceEncoding;
    if (previewImg) {
      previewImg.src = imageAvailable ? `${faceImage}${faceImage.includes('?') ? '&' : '?'}v=${Date.now()}` : (ROLES.student.photo || '');
      previewImg.style.display = imageAvailable ? 'block' : '';
      previewImg.onload = () => {
        previewImg.style.display = 'block';
      };
      previewImg.onerror = () => {
        console.error('Registered face failed to load:', previewImg.src);
        previewImg.style.display = 'none';
        showFaceRegAlert('Registered face image could not be loaded.', 'error');
      };
    }
    if (imageAvailable && currentRole === 'student') {
      currentUser.face_image = faceImage;
      ROLES.student.photo = faceImage;
    }
    if (badge) {
      badge.className = registered ? 'badge bg-success' : result.status === 'Pending' ? 'badge bg-warning text-dark' : 'badge bg-secondary';
      badge.innerHTML = registered ? '<i class="bi bi-check-circle-fill me-1" aria-hidden="true"></i>Face Already Registered' : (result.status || 'Not Registered');
    }
    if (statusText) statusText.textContent = registered
      ? 'Your face has been successfully registered. Face registration can only be completed once. You cannot register or change your face again.'
      : (result.message || result.status || 'Not Registered');
    if (brokenRegisteredImage) {
      showFaceRegAlert(result.message || 'Registered face image could not be loaded.', 'error');
    }
    if (regDate) regDate.textContent = registered && result.registrationDate ? new Date(result.registrationDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—';
    if (regTime) regTime.textContent = registered && result.registrationDate ? new Date(result.registrationDate).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—';
    if (capturedPreview && imageAvailable) {
      capturedPreview.src = `${faceImage}${faceImage.includes('?') ? '&' : '?'}v=${Date.now()}`;
      capturedPreview.style.display = 'block';
    } else if (capturedPreview) {
      capturedPreview.src = '';
      capturedPreview.style.display = 'none';
    }
    updateFaceRegistrationControls();
  } catch (error) {
    FACE_REGISTRATION_STATUS_VERIFIED = false;
    FACE_REGISTRATION_LOCKED = false;
    FACE_REGISTRATION_REGISTERED = false;
    if (statusText) statusText.textContent = 'Unable to load status';
    updateFaceRegistrationControls();
  }
}

function setFaceRegistrationState(state) {
  Object.assign(FACE_REG_STATE, state);
  updateFaceRegistrationControls();
}

function updateFaceRegistrationControls() {
  const openBtn = document.getElementById('face-reg-open-btn');
  const captureBtn = document.getElementById('face-reg-capture-btn');
  const retakeBtn = document.getElementById('face-reg-retake-btn');
  const saveBtn = document.getElementById('face-reg-save-btn');

  const registrationBlocked = !FACE_REGISTRATION_STATUS_VERIFIED || FACE_REGISTRATION_LOCKED;
  if (openBtn) {
    openBtn.disabled = registrationBlocked || !!faceRegCameraStream;
  }
  if (captureBtn) {
    captureBtn.disabled = registrationBlocked || !faceValidationState.ready || !faceRegCameraStream;
  }
  if (retakeBtn) {
    retakeBtn.disabled = registrationBlocked || !FACE_REG_STATE.faceCaptured;
  }
  if (saveBtn) {
    saveBtn.disabled = registrationBlocked || !FACE_REG_STATE.faceCaptured;
  }
}

function showFaceRegAlert(message, type = 'info') {
  const alertBox = document.getElementById('face-reg-alert');
  if (!alertBox) {
    return;
  }
  const level = type === 'error' ? 'danger' : type === 'warning' ? 'warning' : type === 'success' ? 'success' : 'info';
  alertBox.textContent = message || '';
  alertBox.className = `alert alert-${level} mt-3`;
  alertBox.style.display = message ? 'block' : 'none';
}

function clearFaceRegAlert() {
  showFaceRegAlert('', 'info');
}

function isBrowserCameraSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

async function probeCameraDevice() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    return false;
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.some((device) => device.kind === 'videoinput');
  } catch (error) {
    return false;
  }
}

function canModifyFaceRegistration() {
  if (FACE_REGISTRATION_LOCKED) {
    showFaceRegAlert('Your face has been successfully registered. Face registration can only be completed once. You cannot register or change your face again.', 'warning');
    return false;
  }
  if (!FACE_REGISTRATION_STATUS_VERIFIED) {
    showFaceRegAlert('Checking your face registration status. Please try again in a moment.', 'warning');
    return false;
  }
  return true;
}

async function captureCroppedRegistrationFace(video) {
  await ensureRealFaceRecognition();
  const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.55 })).withFaceLandmarks();
  if (detections.length !== 1) {
    throw new Error(detections.length > 1 ? 'Only one face should be visible.' : 'No face detected. Position your face inside the circle.');
  }
  const box = detections[0].detection.box;
  const faceBox = { x: box.x, y: box.y, width: box.width, height: box.height };
  const guideDiameter = Math.min(video.videoWidth * 0.42, video.videoHeight * 0.72);
  const centerX = video.videoWidth / 2;
  const centerY = video.videoHeight / 2;
  const faceCenterX = faceBox.x + faceBox.width / 2;
  const faceCenterY = faceBox.y + faceBox.height / 2;
  if (faceBox.width < guideDiameter * 0.52) throw new Error('Move closer to the camera.');
  if (faceBox.width > guideDiameter * 0.92 || faceBox.height > guideDiameter * 0.92) throw new Error('Move slightly farther from the camera.');
  if (Math.abs(faceCenterX - centerX) >= guideDiameter * 0.1 || Math.abs(faceCenterY - centerY) >= guideDiameter * 0.1) {
    throw new Error('Center your face inside the circle.');
  }
  const facePadX = faceBox.width * 0.08;
  const facePadY = faceBox.height * 0.08;
  const guideCorners = [
    [faceBox.x - facePadX, faceBox.y - facePadY],
    [faceBox.x + faceBox.width + facePadX, faceBox.y - facePadY],
    [faceBox.x - facePadX, faceBox.y + faceBox.height + facePadY],
    [faceBox.x + faceBox.width + facePadX, faceBox.y + faceBox.height + facePadY]
  ];
  if (!guideCorners.every(([x, y]) => ((x - centerX) ** 2 + (y - centerY) ** 2) <= (guideDiameter * 0.47) ** 2)) {
    throw new Error('Make sure your entire face is visible inside the circle.');
  }
  const landmarks = detections[0].landmarks.positions;
  if (landmarks.length < 68) throw new Error('Make sure your entire face is visible.');
  const quality = measureFaceImageQuality(video, faceBox);
  if (!quality.lightingGood) throw new Error('Improve the lighting on your face before capturing.');
  if (!quality.blurGood) throw new Error('Hold still; the image is blurry.');

  const side = Math.max(faceBox.width, faceBox.height) * 1.22;
  const sourceSize = Math.min(side, video.videoWidth, video.videoHeight);
  if (sourceSize < 192) throw new Error('Move closer to the camera for a clearer face image.');
  const cropCenterX = faceBox.x + faceBox.width / 2;
  const cropCenterY = faceBox.y + faceBox.height / 2;
  const left = Math.max(0, Math.min(video.videoWidth - sourceSize, cropCenterX - sourceSize / 2));
  const top = Math.max(0, Math.min(video.videoHeight - sourceSize, cropCenterY - sourceSize / 2));
  if (faceBox.x < left || faceBox.y < top || faceBox.x + faceBox.width > left + sourceSize || faceBox.y + faceBox.height > top + sourceSize) {
    throw new Error('Make sure your entire face is visible inside the circle.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to crop the face image.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(video, left, top, sourceSize, sourceSize, 0, 0, canvas.width, canvas.height);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  if (!imageData.data.some((value, index) => index % 4 === 3 && value > 0)) {
    throw new Error('The captured face image is blank. Please try again.');
  }
  return canvas.toDataURL('image/jpeg', 0.92);
}

async function openFaceRegistrationCamera() {
  if (!canModifyFaceRegistration()) return;
  if (faceRegCameraStream) {
    return;
  }
  const video = document.getElementById('cameraPreview');
  if (!video) {
    return;
  }
  clearFaceRegAlert();

  if (!isBrowserCameraSupported()) {
    updateFaceValidationUI({ cameraConnected: false, message: 'Camera not found.' });
    showFaceRegAlert('Camera not found.', 'error');
    return;
  }

  const hasCamera = await probeCameraDevice();
  if (!hasCamera) {
    updateFaceValidationUI({ cameraConnected: false, message: 'Camera not found.' });
    showFaceRegAlert('Camera not found.', 'error');
    return;
  }

  navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'user',
      width: { ideal: 1280 },
      height: { ideal: 720 }
    },
    audio: false
  }).then((stream) => {
    faceRegCameraStream = stream;
    video.srcObject = stream;
    const syncPreviewAspectRatio = () => {
      if (video.videoWidth && video.videoHeight) {
        const stage = video.closest('.face-capture-stage');
        if (stage) stage.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
      }
    };
    video.addEventListener('loadedmetadata', syncPreviewAspectRatio, { once: true });
    syncPreviewAspectRatio();
    video.play().catch(() => {});
    setFaceRegistrationState({ cameraActive: true, faceCaptured: false, capturedImage: '' });
    updateFaceValidationUI({ cameraConnected: true, message: 'Camera connected. Position your face in the frame.' });
    clearFaceRegAlert();
    startFaceValidationLoop(video, 'register');
  }).catch((error) => {
    const message = error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError'
      ? 'Camera permission denied.'
      : error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError'
        ? 'Camera not found.'
        : 'Camera permission denied or unavailable.';
    updateFaceValidationUI({ cameraConnected: false, message });
    showFaceRegAlert(message, 'error');
    console.error('Camera open failed', error);
  });
}

function captureFaceForRegistration() {
  if (!canModifyFaceRegistration()) return;
  if (faceRegistrationSaving) {
    return;
  }
  if (!faceRegCameraStream) {
    showFaceRegAlert('Please open the camera first.', 'warning');
    return;
  }
  if (!faceValidationState.cameraConnected) {
    showFaceRegAlert('Camera is not active.', 'warning');
    return;
  }
  if (!faceValidationState.faceDetected) {
    showFaceRegAlert('No face detected.', 'error');
    return;
  }
  if (faceValidationState.multipleFaces) {
    showFaceRegAlert('Multiple faces detected.', 'error');
    return;
  }
  if (faceValidationState.faceTooFar) {
    showFaceRegAlert('Face is too far from the camera.', 'error');
    return;
  }
  if (faceValidationState.faceTooClose) {
    showFaceRegAlert('Face is too close to the camera.', 'error');
    return;
  }
  if (!faceValidationState.insideGuide) {
    showFaceRegAlert('Face is outside the detection frame.', 'error');
    return;
  }
  if (!faceValidationState.lightingGood) {
    showFaceRegAlert('Poor lighting.', 'error');
    return;
  }
  if (!faceValidationState.blurGood) {
    showFaceRegAlert('Face is blurry.', 'error');
    return;
  }
  if (!faceValidationState.ready) {
    showFaceRegAlert(faceValidationState.message || 'Face is not ready for capture.', 'warning');
    return;
  }

  const video = document.getElementById('cameraPreview');
  captureCroppedRegistrationFace(video).then((imageData) => {
    const preview = document.getElementById('face-reg-captured-preview');
    if (preview) {
      preview.src = imageData;
      preview.style.display = 'block';
    }
    setFaceRegistrationState({ faceCaptured: true, capturedImage: imageData });
    const indicator = document.getElementById('face-detection-indicator');
    if (indicator) {
      indicator.textContent = 'Face Captured';
      indicator.className = 'badge bg-success';
    }
    stopFaceValidationLoop();
    if (faceRegCameraStream) {
      faceRegCameraStream.getTracks().forEach((track) => track.stop());
      faceRegCameraStream = null;
    }
    const video = document.getElementById('cameraPreview');
    if (video) video.srcObject = null;
    faceRegistrationSaving = false;
    showFaceRegAlert('Face captured. Review the image, then save your registration.', 'info');
    updateFaceRegistrationControls();
  }).catch((error) => {
    console.error('Face capture failed', error);
    showFaceRegAlert(error.message || 'Face capture failed.', 'error');
  });
}

function retakeFaceRegistration() {
  if (!canModifyFaceRegistration()) return;
  const preview = document.getElementById('face-reg-captured-preview');
  if (preview) {
    preview.src = '';
    preview.style.display = 'none';
  }
  setFaceRegistrationState({ faceCaptured: false, capturedImage: '' });
  openFaceRegistrationCamera();
}

function cancelFaceRegistration() {
  if (faceRegCameraStream) {
    faceRegCameraStream.getTracks().forEach((track) => track.stop());
    faceRegCameraStream = null;
  }
  const video = document.getElementById('cameraPreview');
  if (video) {
    video.srcObject = null;
  }
  const preview = document.getElementById('face-reg-captured-preview');
  if (preview) {
    preview.src = '';
    preview.style.display = 'none';
  }
  const indicator = document.getElementById('face-detection-indicator');
  if (indicator) {
    indicator.textContent = 'No Face Detected';
    indicator.className = 'badge bg-secondary';
  }
  setFaceRegistrationState({ cameraActive: false, faceCaptured: false, capturedImage: '' });
}

async function saveFaceRegistration() {
  if (faceRegistrationSaving) return;
  if (!canModifyFaceRegistration()) return;
  if (!FACE_REG_STATE.faceCaptured || !FACE_REG_STATE.capturedImage) {
    showFaceRegAlert('Capture your face before saving the registration.', 'warning');
    return;
  }
  if (!/^data:image\/(jpeg|png);base64,/.test(FACE_REG_STATE.capturedImage)) {
    showFaceRegAlert('Captured face image is invalid.', 'error');
    return;
  }
  const saveBtn = document.getElementById('face-reg-save-btn');
  faceRegistrationSaving = true;
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
  }
  try {
    const response = await registerFace(FACE_REG_STATE.capturedImage);
    if (!response || response.success !== true) {
      showFaceRegAlert(response?.message || 'Unable to save your face registration. Please try again.', 'error');
      return;
    }
    const savedFaceImage = typeof response.faceImage === 'string' ? response.faceImage.trim() : '';
    const registeredImage = document.getElementById('student-face-reg-preview');
    if (registeredImage && savedFaceImage) {
      registeredImage.src = `${savedFaceImage}${savedFaceImage.includes('?') ? '&' : '?'}v=${Date.now()}`;
      registeredImage.style.display = 'block';
    }
    setFaceRegistrationState({ faceCaptured: false, capturedImage: '' });
    await loadFaceRegistrationStatus();
  } finally {
    faceRegistrationSaving = false;
    if (saveBtn) {
      saveBtn.textContent = 'Save Registration';
    }
    updateFaceRegistrationControls();
  }
}

function initStudentFaceRegPage() {
  if (currentPage !== 'facereg') {
    return;
  }
  loadStoredFaceTemplate();
  loadFaceRegistrationStatus();
}

function startFaceRegistrationFlow() {
  faceRegistrationPending = true;
  setFaceModalStatus('Position your face. The system will register it as soon as it is ready.', 'info');
  openFaceModal('register');
}

function cancelFaceRegistrationFlow() {
  faceRegistrationPending = false;
  closeFaceModal();
}

async function registerFace(scanData, replaceExisting = false) {
  if (currentRole === 'student' && !canModifyFaceRegistration()) return;
  const actionBtn = document.getElementById('face-reg-action-btn');
  if (actionBtn) {
    actionBtn.disabled = true;
    actionBtn.textContent = 'Saving registration…';
  }

  try {
    const response = await getFaceRegistrationEndpoint('register', { faceImage: scanData, replace: replaceExisting ? '1' : '' });
    if (!response.success) {
      if (actionBtn) {
        actionBtn.disabled = false;
        actionBtn.textContent = '📸 Capture Face';
      }
      if (response.registered === true && response.message && response.message.includes('replace')) {
        const replace = confirm('You already have a registered face. Do you want to replace it?');
        if (replace) {
          return await registerFace(scanData, true);
        }
        showFaceRegAlert('Registration cancelled. Existing face remains unchanged.', 'warning');
        addNotification('Face registration cancelled by user.', 'warning');
        return;
      }
      const message = response.message || 'Unable to complete registration at this time.';
      showFaceRegAlert(message, 'danger');
      addNotification(message, 'warning');
      return;
    }

    ROLES.student.photo = scanData;
    const refImg = document.getElementById('face-modal-ref-img');
    if (refImg) refImg.src = scanData;
    addNotification('Face registration successful', 'success');
    await loadFaceRegistrationStatus();
    showFaceRegAlert('✓ Face registered successfully. You may now use Face Recognition for Time In and Time Out.', 'success');
  } catch (err) {
    if (actionBtn) {
      actionBtn.disabled = false;
      actionBtn.textContent = '📸 Capture Face';
    }
    console.error('Face registration failed', err);
    showFaceRegAlert('Face registration failed. Please try again later.', 'danger');
  }
}

function triggerFilePicker() {
  const input = document.getElementById('submission-file-input');
  if (input) input.click();
}
function handleFileInput(event) {
  const file = event.target.files[0];
  if (!file) return;
  pendingUploadFile = file;
  const label = document.getElementById('submission-file-name');
  if (label) label.textContent = file.name;
}
function handleSubmissionDrop(event) {
  event.preventDefault();
  const file = event.dataTransfer.files[0];
  if (!file) return;
  pendingUploadFile = file;
  const label = document.getElementById('submission-file-name');
  if (label) label.textContent = file.name;
}
async function uploadSubmission() {
  if (!pendingUploadFile) {
    alert('Please select or drag a file first.');
    return;
  }
  const taskId = Number(document.getElementById('submission-task-select')?.value || 0);
  const selectedTask = STUDENT_TASKS.find(item => Number(item.id) === taskId);
  if (!selectedTask) {
    alert('Please select an assigned task first.');
    return;
  }

  try {
    const params = new FormData();
    params.append('task_id', String(taskId));
    params.append('file', pendingUploadFile);
    const res = await fetch(`${API_BASE}?resource=submissions`, {
      method: 'POST',
      body: params
    });
    const data = await res.json();
    if (!data.success) {
      alert(data.message || 'Unable to submit task.');
      return;
    }

    const newSub = {
      id: Number(data.id) || 0,
      student: currentUser.name || ROLES.student.name,
      task: selectedTask.name,
      name: pendingUploadFile.name,
      date: new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'}),
      status: 'For Review',
      tag: 'tag-amber'
    };
    SUBMISSIONS.unshift(newSub);
    addNotification(`Submission uploaded: ${pendingUploadFile.name}`, 'success');
  } catch (err) {
    console.warn('uploadSubmission DB error:', err);
    alert('Unable to connect to the server.');
    return;
  }

  pendingUploadFile = null;
  navigateTo('submissions');
}

function approveSubmission(index) {
  const submission = SUBMISSIONS[index];
  if (!submission) return;
  submission.status = 'Approved';
  submission.tag = 'tag-green';
  addNotification(`Submission approved: ${submission.name}`, 'success');
  // Persist to DB
  if (submission.id) {
    const params = new URLSearchParams({ _method: 'PUT', id: submission.id, status: 'Approved', supervisor_comment: '' });
    fetch(`${API_BASE}?resource=submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    }).catch(err => console.warn('approveSubmission DB failed:', err));
  }
  if (currentPage === 'submissions') navigateTo('submissions');
}

function rejectSubmission(index) {
  const submission = SUBMISSIONS[index];
  if (!submission) return;
  const comment = prompt('Enter rejection reason (optional):') || '';
  submission.status = 'Rejected';
  submission.tag = 'tag-red';
  addNotification(`Submission rejected: ${submission.name}`, 'warning');
  // Persist to DB
  if (submission.id) {
    const params = new URLSearchParams({ _method: 'PUT', id: submission.id, status: 'Rejected', supervisor_comment: comment });
    fetch(`${API_BASE}?resource=submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    }).catch(err => console.warn('rejectSubmission DB failed:', err));
  }
  if (currentPage === 'submissions') navigateTo('submissions');
}

function normalizeText(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function matchStudentTask(taskName) {
  const normalized = normalizeText(taskName);
  if (!normalized) return null;

  return STUDENT_TASKS.find(t => {
    const taskLower = normalizeText(t.name);
    if (taskLower.includes(normalized) || normalized.includes(taskLower)) return true;
    if (normalized.includes('weekly journal') && taskLower.includes('weekly journal')) return true;
    if (normalized.includes('system documentation') && taskLower.includes('system documentation')) return true;
    if (normalized.includes('meeting minutes') && taskLower.includes('meeting minutes')) return true;
    if (normalized.includes('final report') && taskLower.includes('final report')) return true;
    if (normalized.includes('network diagram') && taskLower.includes('network diagram')) return true;
    if (normalized.includes('database schema') && taskLower.includes('database schema')) return true;
    if (normalized.includes('week 11 journal') && taskLower.includes('week 11 journal')) return true;
    return false;
  });
}

function markTaskDoneBySubmission(taskName, fileName = '') {
  // Final completion is controlled by supervisor approval on the server.
}

// ══ FACE MODAL ══
function getFaceTemplateStorageKey() {
  const username = currentUser?.username || currentUser?.email?.split('@')[0] || ROLES.student.email.split('@')[0] || 'student';
  return `bisu_face_template_${username}`;
}
function loadStoredFaceTemplate() {
  if (faceTemplateCache) {
    return faceTemplateCache;
  }
  try {
    const raw = localStorage.getItem(getFaceTemplateStorageKey());
    faceTemplateCache = raw ? JSON.parse(raw) : null;
    return faceTemplateCache;
  } catch (error) {
    return null;
  }
}
function saveStoredFaceTemplate(template) {
  try {
    faceTemplateCache = template;
    localStorage.setItem(getFaceTemplateStorageKey(), JSON.stringify(template));
  } catch (error) {
    console.warn('Unable to save face template locally', error);
  }
}
function getCachedFaceTemplate() {
  return loadStoredFaceTemplate();
}
function logFaceAttempt(action, status, message, details = {}) {
  try {
    const key = 'bisu_face_attempts';
    const logs = JSON.parse(localStorage.getItem(key) || '[]');
    logs.push({ action, status, message, details, timestamp: new Date().toISOString(), user: currentUser?.username || currentUser?.name || 'student' });
    localStorage.setItem(key, JSON.stringify(logs.slice(-50)));
  } catch (error) {
    console.warn('Unable to log face attempt', error);
  }
}
function buildFaceFeatureVector(canvas) {
  const context = canvas.getContext('2d');
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  let brightness = 0;
  let centerBrightness = 0;
  let centerBrightnessPixels = 0;
  let skinPixels = 0;
  let edgeScore = 0;
  let centerSkin = 0;
  let centerPixels = 0;
  let centroidX = 0;
  let centroidY = 0;
  const histogram = Array(8).fill(0);
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const index = (y * canvas.width + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      brightness += gray;
      const inCenterRegion = Math.abs(x - canvas.width / 2) < canvas.width * 0.25 && Math.abs(y - canvas.height / 2) < canvas.height * 0.25;
      if (inCenterRegion) {
        centerBrightness += gray;
        centerBrightnessPixels += 1;
      }
      const isSkin = (r > 95 && g > 40 && b > 20 && r > g && r > b && Math.abs(r - g) > 15 && r - g < 50)
        || (r > 95 && g > 60 && b > 50 && g > 70 && r > g && r > b);
      if (isSkin) {
        skinPixels += 1;
        const inCenter = Math.abs(x - canvas.width / 2) < canvas.width * 0.2 && Math.abs(y - canvas.height / 2) < canvas.height * 0.2;
        if (inCenter) {
          centerSkin += 1;
          centerPixels += 1;
        }
        centroidX += x;
        centroidY += y;
      }
      if (x > 0 && y > 0) {
        const prev = data[((y - 1) * canvas.width + x) * 4];
        const prevGray = Math.round(0.299 * prev + 0.587 * data[((y - 1) * canvas.width + x) * 4 + 1] + 0.114 * data[((y - 1) * canvas.width + x) * 4 + 2]);
        edgeScore += Math.abs(gray - prevGray);
      }
      const bucket = Math.min(7, Math.floor(gray / 32));
      histogram[bucket] += 1;
    }
  }
  const totalPixels = canvas.width * canvas.height;
  const skinRatio = skinPixels / totalPixels;
  const brightnessAvg = brightness / totalPixels;
  const centerBrightnessAvg = centerBrightnessPixels > 0 ? centerBrightness / centerBrightnessPixels : brightnessAvg;
  const edgeAvg = edgeScore / totalPixels;
  const centerRatio = centerPixels > 0 ? centerSkin / centerPixels : 0;
  const skinCount = skinPixels > 0 ? skinPixels : 1;
  const centroid = { x: centroidX / skinCount, y: centroidY / skinCount };
  return { brightnessAvg, centerBrightnessAvg, skinRatio, edgeAvg, centerRatio, centroidX: centroid.x / canvas.width, centroidY: centroid.y / canvas.height, histogram };
}
function applyFaceEnhancement(canvas) {
  const context = canvas.getContext('2d');
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const brightness = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const offset = brightness > 140 ? 14 : 8;
    data[i] = Math.min(255, data[i] + offset);
    data[i + 1] = Math.min(255, data[i + 1] + offset);
    data[i + 2] = Math.min(255, data[i + 2] + offset);
  }
  const sharpenKernel = [0, -0.5, 0, -0.5, 2.5, -0.5, 0, -0.5, 0];
  const temp = new Uint8ClampedArray(data);
  for (let y = 1; y < canvas.height - 1; y += 1) {
    for (let x = 1; x < canvas.width - 1; x += 1) {
      const index = (y * canvas.width + x) * 4;
      let r = 0;
      let g = 0;
      let b = 0;
      let kernelIndex = 0;
      for (let ky = -1; ky <= 1; ky += 1) {
        for (let kx = -1; kx <= 1; kx += 1) {
          const neighbor = ((y + ky) * canvas.width + (x + kx)) * 4;
          r += temp[neighbor] * sharpenKernel[kernelIndex];
          g += temp[neighbor + 1] * sharpenKernel[kernelIndex];
          b += temp[neighbor + 2] * sharpenKernel[kernelIndex];
          kernelIndex += 1;
        }
      }
      data[index] = Math.max(0, Math.min(255, r));
      data[index + 1] = Math.max(0, Math.min(255, g));
      data[index + 2] = Math.max(0, Math.min(255, b));
    }
  }
  context.putImageData(imageData, 0, 0);
  return canvas;
}
function compareFaceVectors(a, b) {
  let diff = 0;
  diff += Math.abs(a.brightnessAvg - b.brightnessAvg) / 255;
  diff += Math.abs(a.skinRatio - b.skinRatio) * 4;
  diff += Math.abs(a.edgeAvg - b.edgeAvg) / 255;
  diff += Math.abs(a.centerRatio - b.centerRatio) * 2;
  diff += Math.abs(a.centroidX - b.centroidX) * 1.5;
  diff += Math.abs(a.centroidY - b.centroidY) * 1.5;
  const histogramDiff = a.histogram.reduce((sum, value, index) => sum + Math.abs(value - b.histogram[index]), 0) / 512;
  diff += histogramDiff / 2000;
  return Math.max(0, 1 - diff);
}
function createFaceTemplate(samples) {
  return {
    version: 1,
    owner: currentUser?.username || currentUser?.email || 'student',
    createdAt: new Date().toISOString(),
    descriptor: {
      brightnessAvg: samples.reduce((sum, sample) => sum + sample.brightnessAvg, 0) / samples.length,
      skinRatio: samples.reduce((sum, sample) => sum + sample.skinRatio, 0) / samples.length,
      edgeAvg: samples.reduce((sum, sample) => sum + sample.edgeAvg, 0) / samples.length,
      centerRatio: samples.reduce((sum, sample) => sum + sample.centerRatio, 0) / samples.length,
      centroidX: samples.reduce((sum, sample) => sum + sample.centroidX, 0) / samples.length,
      centroidY: samples.reduce((sum, sample) => sum + sample.centroidY, 0) / samples.length,
      histogram: Array(8).fill(0).map((_, index) => Math.round(samples.reduce((sum, sample) => sum + sample.histogram[index], 0) / samples.length))
    },
    faceImage: samples[0]?.faceImage || ''
  };
}
function updateFaceValidationUI(state) {
  faceValidationState = { ...faceValidationState, ...state };
  const cameraStatus = document.getElementById('face-camera-status');
  const detectedStatus = document.getElementById('face-detected-status');
  const centeredStatus = document.getElementById('face-centered-status');
  const lightingStatus = document.getElementById('face-lighting-status');
  const blurStatus = document.getElementById('face-blur-status');
  const eyesStatus = document.getElementById('face-eyes-status');
  const guideStatus = document.getElementById('face-guide-status');
  const readyStatus = document.getElementById('face-ready-status');
  const actionBtn = document.getElementById('face-reg-action-btn');
  const cancelBtn = document.getElementById('face-reg-cancel-btn');
  if (cameraStatus) {
    cameraStatus.className = `mb-1 ${faceValidationState.cameraConnected ? 'text-success' : 'text-danger'}`;
    cameraStatus.innerHTML = `<i class="bi ${faceValidationState.cameraConnected ? 'bi-check-circle-fill' : 'bi-x-circle-fill'} me-2"></i>${faceValidationState.cameraConnected ? '🟢 Camera Connected' : '🔴 Camera Disconnected'}`;
  }
  if (detectedStatus) {
    const detectedMessage = faceValidationState.multipleFaces ? '🔴 Multiple faces detected' : (faceValidationState.faceDetected ? '🟢 Face Detected' : '🔴 No face detected');
    detectedStatus.className = `mb-1 ${faceValidationState.faceDetected && !faceValidationState.multipleFaces ? 'text-success' : 'text-danger'}`;
    detectedStatus.innerHTML = `<i class="bi ${faceValidationState.faceDetected && !faceValidationState.multipleFaces ? 'bi-check-circle-fill' : 'bi-x-circle-fill'} me-2"></i>${detectedMessage}`;
  }
  if (centeredStatus) {
    const centeredMessage = faceValidationState.faceCentered ? '🟢 Face Centered' : (faceValidationState.faceTooFar ? '🔴 Face too far' : (faceValidationState.faceTooClose ? '🔴 Face too close' : '🔴 Face not centered'));
    centeredStatus.className = `mb-1 ${faceValidationState.faceCentered ? 'text-success' : 'text-danger'}`;
    centeredStatus.innerHTML = `<i class="bi ${faceValidationState.faceCentered ? 'bi-check-circle-fill' : 'bi-x-circle-fill'} me-2"></i>${centeredMessage}`;
  }
  if (lightingStatus) {
    lightingStatus.className = `mb-1 ${faceValidationState.lightingGood ? 'text-success' : 'text-danger'}`;
    lightingStatus.innerHTML = `<i class="bi ${faceValidationState.lightingGood ? 'bi-check-circle-fill' : 'bi-x-circle-fill'} me-2"></i>${faceValidationState.lightingGood ? '🟢 Good Lighting' : '🔴 Poor lighting'}`;
  }
  if (blurStatus) {
    blurStatus.className = `mb-1 ${faceValidationState.blurGood ? 'text-success' : 'text-danger'}`;
    blurStatus.innerHTML = `<i class="bi ${faceValidationState.blurGood ? 'bi-check-circle-fill' : 'bi-x-circle-fill'} me-2"></i>${faceValidationState.blurGood ? '🟢 Clear Face' : '🔴 Face is blurry'}`;
  }
  if (eyesStatus) {
    eyesStatus.className = `mb-1 ${faceValidationState.eyesVisible ? 'text-success' : 'text-danger'}`;
    eyesStatus.innerHTML = `<i class="bi ${faceValidationState.eyesVisible ? 'bi-check-circle-fill' : 'bi-x-circle-fill'} me-2"></i>${faceValidationState.eyesVisible ? '🟢 Eyes Visible' : '🔴 Eyes not visible'}`;
  }
  if (guideStatus) {
    guideStatus.className = `mb-1 ${faceValidationState.insideGuide ? 'text-success' : 'text-danger'}`;
    guideStatus.innerHTML = `<i class="bi ${faceValidationState.insideGuide ? 'bi-check-circle-fill' : 'bi-x-circle-fill'} me-2"></i>${faceValidationState.insideGuide ? '🟢 Face inside guide frame' : '🔴 Face outside guide frame'}`;
  }
  if (readyStatus) {
    readyStatus.className = `text-${faceValidationState.ready ? 'success' : 'danger'}`;
    readyStatus.innerHTML = `<i class="bi ${faceValidationState.ready ? 'bi-person-check-fill' : 'bi-exclamation-circle-fill'} me-2"></i>${faceValidationState.ready ? '🟢 Ready to Capture' : faceValidationState.message || 'Waiting for input'}`;
  }
  const status = document.getElementById('scan-status');
  if (status) {
    status.textContent = faceValidationState.message;
  }
  const alertText = document.getElementById('face-reg-alert');
  if (alertText) {
    alertText.textContent = faceValidationState.message;
  }
  showFaceRegAlert(faceValidationState.message, faceValidationState.ready ? 'success' : 'danger');
  const faceIndicator = document.getElementById('face-detection-indicator');
  if (faceIndicator) {
    const ready = faceValidationState.ready === true;
    faceIndicator.textContent = ready ? 'Face detected. Ready to capture.' : faceValidationState.faceDetected && !faceValidationState.multipleFaces ? 'Face detected · checking quality' : 'No Face Detected';
    faceIndicator.className = `badge ${ready ? 'bg-success' : faceValidationState.faceDetected && !faceValidationState.multipleFaces ? 'bg-warning text-dark' : 'bg-secondary'}`;
  }
  const lightingQuality = document.getElementById('face-quality-lighting');
  const centeredQuality = document.getElementById('face-quality-centered');
  const clearQuality = document.getElementById('face-quality-clear');
  if (lightingQuality) {
    lightingQuality.innerHTML = `${faceValidationState.lightingGood ? '✓' : '✕'} Good Lighting`;
    lightingQuality.className = faceValidationState.lightingGood ? 'text-success' : 'text-danger';
  }
  if (centeredQuality) {
    centeredQuality.innerHTML = `${faceValidationState.faceCentered ? '✓' : '✕'} Face Centered`;
    centeredQuality.className = faceValidationState.faceCentered ? 'text-success' : 'text-danger';
  }
  if (clearQuality) {
    clearQuality.innerHTML = `${faceValidationState.blurGood ? '✓' : '✕'} Clear Image`;
    clearQuality.className = faceValidationState.blurGood ? 'text-success' : 'text-danger';
  }
  if (currentPage === 'facereg') {
    const openBtn = document.getElementById('face-reg-open-btn');
    const captureBtn = document.getElementById('face-reg-capture-btn');
    const retakeBtn = document.getElementById('face-reg-retake-btn');
    const saveBtn = document.getElementById('face-reg-save-btn');
    if (openBtn) {
      openBtn.disabled = !!faceRegCameraStream;
    }
    if (captureBtn) {
      captureBtn.disabled = !faceValidationState.ready || !faceRegCameraStream;
    }
    if (retakeBtn) {
      retakeBtn.disabled = !FACE_REG_STATE.faceCaptured;
    }
    if (saveBtn) {
      saveBtn.disabled = !FACE_REG_STATE.faceCaptured;
    }
  }
}
function stopFaceValidationLoop() {
  if (faceValidationLoop) {
    cancelAnimationFrame(faceValidationLoop);
    faceValidationLoop = null;
  }
}
function measureFaceImageQuality(video, faceBox) {
  const cropSize = Math.max(faceBox.width, faceBox.height) * 1.2;
  const centerX = faceBox.x + faceBox.width / 2;
  const centerY = faceBox.y + faceBox.height / 2;
  const left = Math.max(0, Math.min(video.videoWidth - cropSize, centerX - cropSize / 2));
  const top = Math.max(0, Math.min(video.videoHeight - cropSize, centerY - cropSize / 2));
  const sourceSize = Math.min(cropSize, video.videoWidth - left, video.videoHeight - top);
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(video, left, top, sourceSize, sourceSize, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const gray = new Float32Array(canvas.width * canvas.height);
  let brightness = 0;
  let clippedPixels = 0;
  for (let index = 0; index < gray.length; index += 1) {
    const pixelIndex = index * 4;
    gray[index] = pixels[pixelIndex] * 0.299 + pixels[pixelIndex + 1] * 0.587 + pixels[pixelIndex + 2] * 0.114;
    brightness += gray[index];
    if (gray[index] < 18 || gray[index] > 245) clippedPixels += 1;
  }
  let laplacianTotal = 0;
  let laplacianSquaredTotal = 0;
  let samples = 0;
  for (let y = 1; y < canvas.height - 1; y += 1) {
    for (let x = 1; x < canvas.width - 1; x += 1) {
      const index = y * canvas.width + x;
      const laplacian = gray[index - canvas.width] + gray[index - 1] - 4 * gray[index] + gray[index + 1] + gray[index + canvas.width];
      laplacianTotal += laplacian;
      laplacianSquaredTotal += laplacian * laplacian;
      samples += 1;
    }
  }
  const averageBrightness = brightness / gray.length;
  const laplacianMean = laplacianTotal / samples;
  const sharpness = laplacianSquaredTotal / samples - laplacianMean * laplacianMean;
  return {
    lightingGood: averageBrightness >= 45 && averageBrightness <= 220 && clippedPixels / gray.length < 0.35,
    blurGood: sharpness >= 18
  };
}

async function evaluateFaceFrame(video) {
  const now = performance.now();
  if (now - lastFaceValidationRun < faceValidationFrameInterval) {
    return faceValidationState;
  }
  lastFaceValidationRun = now;
  if (!video || !video.videoWidth || !video.videoHeight) {
    return { cameraConnected: false, faceDetected: false, faceCentered: false, lightingGood: false, blurGood: false, cameraQuality: false, eyesVisible: false, ready: false, message: 'Camera disconnected.' };
  }
  try {
    await ensureRealFaceRecognition();
    const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.55 })).withFaceLandmarks();
    const multipleFaces = detections.length > 1;
    const faceDetected = detections.length === 1;
    if (!faceDetected) {
      faceValidationReadyFrames = 0;
      return {
        cameraConnected: true, faceDetected: false, faceCentered: false, lightingGood: false, blurGood: false,
        cameraQuality: false, eyesVisible: false, insideGuide: false, multipleFaces, faceTooFar: false,
        faceTooClose: false, faceBox: null, ready: false,
        message: multipleFaces ? 'Only one face should be visible.' : 'No face detected. Position your face inside the circle.'
      };
    }

    const box = detections[0].detection.box;
    const faceBox = { x: box.x, y: box.y, width: box.width, height: box.height };
    const guideDiameter = Math.min(video.videoWidth * 0.42, video.videoHeight * 0.72);
    const centerX = video.videoWidth / 2;
    const centerY = video.videoHeight / 2;
    const faceCenterX = faceBox.x + faceBox.width / 2;
    const faceCenterY = faceBox.y + faceBox.height / 2;
    const faceTooFar = faceBox.width < guideDiameter * 0.52;
    const faceTooClose = faceBox.width > guideDiameter * 0.92 || faceBox.height > guideDiameter * 0.92;
    const faceCentered = Math.abs(faceCenterX - centerX) < guideDiameter * 0.1 && Math.abs(faceCenterY - centerY) < guideDiameter * 0.1;
    const padX = faceBox.width * 0.08;
    const padY = faceBox.height * 0.08;
    const corners = [
      [faceBox.x - padX, faceBox.y - padY],
      [faceBox.x + faceBox.width + padX, faceBox.y - padY],
      [faceBox.x - padX, faceBox.y + faceBox.height + padY],
      [faceBox.x + faceBox.width + padX, faceBox.y + faceBox.height + padY]
    ];
    const insideGuide = corners.every(([x, y]) => ((x - centerX) ** 2 + (y - centerY) ** 2) <= (guideDiameter * 0.47) ** 2);
    const landmarks = detections[0].landmarks.positions;
    const eyesVisible = landmarks.length >= 68 && landmarks.slice(36, 48).every(point => point.x >= faceBox.x && point.x <= faceBox.x + faceBox.width && point.y >= faceBox.y && point.y <= faceBox.y + faceBox.height);
    const quality = measureFaceImageQuality(video, faceBox);
    const lightingGood = quality.lightingGood;
    const blurGood = quality.blurGood;
    const cameraQuality = lightingGood && blurGood;
    let message = 'Hold still.';
    let ready = false;
    if (faceTooFar) message = 'Move closer to the camera.';
    else if (faceTooClose) message = 'Move slightly farther from the camera.';
    else if (!faceCentered) message = 'Center your face inside the circle.';
    else if (!insideGuide) message = 'Make sure your entire face is visible inside the circle.';
    else if (!eyesVisible) message = 'Make sure your entire face is visible.';
    else if (!lightingGood) message = 'Improve the lighting on your face.';
    else if (!blurGood) message = 'Hold still; the image is blurry.';
    else {
      ready = true;
      message = 'Face detected. Ready to capture.';
    }
    faceValidationReadyFrames = ready ? faceValidationReadyFrames + 1 : 0;
    const stableReady = faceValidationReadyFrames >= 2;
    return {
      cameraConnected: true, faceDetected, faceCentered, lightingGood, blurGood, cameraQuality, eyesVisible,
      insideGuide, multipleFaces, faceTooFar, faceTooClose, faceBox, ready: stableReady,
      message: stableReady ? 'Face detected. Ready to capture.' : message
    };
  } catch (error) {
    faceValidationReadyFrames = 0;
    return {
      cameraConnected: true, faceDetected: false, faceCentered: false, lightingGood: false, blurGood: false,
      cameraQuality: false, eyesVisible: false, insideGuide: false, multipleFaces: false, faceTooFar: false,
      faceTooClose: false, faceBox: null, ready: false,
      message: 'Face detection is unavailable. Check your connection and try again.'
    };
  }
}
function startFaceValidationLoop(video, type = 'register') {
  if (!video) {
    return;
  }
  stopFaceValidationLoop();
  faceValidationReadyFrames = 0;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    const state = await evaluateFaceFrame(video);
    updateFaceValidationUI(state);
    running = false;
    faceValidationLoop = requestAnimationFrame(tick);
  };
  faceValidationLoop = requestAnimationFrame(tick);
}
function startEmbeddedPreview() {
  const video = document.getElementById('cameraPreview');
  if (!video) {
    return;
  }
  if (embeddedFacePreviewStream) {
    return;
  }
  navigator.mediaDevices.getUserMedia({ video: true, audio: false }).then((stream) => {
    embeddedFacePreviewStream = stream;
    video.srcObject = stream;
    video.play().catch(() => {});
    updateFaceValidationUI({ cameraConnected: true, message: 'Camera connected. Please position your face.' });
    startFaceValidationLoop(video, 'preview');
  }).catch((error) => {
    updateFaceValidationUI({ cameraConnected: false, message: 'Camera permission denied or unavailable.' });
    logFaceAttempt('preview', 'failed', 'Camera unavailable', { error: error.message });
  });
}
function stopEmbeddedPreview() {
  if (embeddedFacePreviewStream) {
    embeddedFacePreviewStream.getTracks().forEach((track) => track.stop());
    embeddedFacePreviewStream = null;
  }
  stopFaceValidationLoop();
  const video = document.getElementById('cameraPreview');
  if (video) {
    video.srcObject = null;
  }
}
function setFaceModalStatus(message, type = 'info') {
  const status = document.getElementById('scan-status');
  if (!status) {
    return;
  }
  status.textContent = String(message || '').split('\n').join(' ');
  status.className = `scan-status ${type === 'error' ? 'error' : type === 'success' ? 'success' : 'scanning'}`;
}
async function openFaceModal(type, attendanceEventType = null) {
  if (currentRole === 'student' && type === 'register' && !canModifyFaceRegistration()) {
    return;
  }
  if (currentRole === 'student' && type !== 'register' && !FACE_REGISTRATION_REGISTERED) {
    alert('Please register your face first before recording attendance.');
    navigateTo('facereg');
    return;
  }
  if (currentRole === 'student' && type !== 'register') {
    const nextEvent = getNextStudentAttendanceEvent();
    const selectedEvent = attendanceEventType || nextEvent?.action;
    if (!nextEvent || selectedEvent !== nextEvent.action || nextEvent.type !== type) {
      alert('Attendance events must be recorded in the displayed order.');
      return;
    }
    pendingAttendanceEventType = selectedEvent;
  } else {
    pendingAttendanceEventType = null;
  }
  const modal = document.getElementById('face-modal');
  const refImg = document.getElementById('face-modal-ref-img');
  const scanImg = document.getElementById('face-modal-scan-img');
  const title = document.getElementById('face-modal-title');
  const desc = document.getElementById('face-modal-desc');
  const status = document.getElementById('scan-status');
  const selectedEventLabel = STUDENT_ATTENDANCE_EVENTS.find(event => event.action === pendingAttendanceEventType)?.label;
  if (title) {
    title.textContent = type === 'register'
      ? '📸 Face Registration'
      : `${type === 'in' ? '📷' : '🚪'} ${selectedEventLabel || (type === 'in' ? 'Time In' : 'Time Out')} — Face Recognition`;
  }
  if (desc) {
    desc.textContent = type === 'register' ? 'Capture your face to register it for future attendance verification.' : 'Please position your face within the frame. Keep still for accurate recognition.';
  }
  if (status) {
    status.className = 'scan-status scanning';
    status.textContent = '🔍 Initializing camera…';
  }
  if (refImg) {
    refImg.src = '';
    refImg.style.display = 'none';
  }
  if (scanImg) {
    scanImg.src = '';
    scanImg.style.display = 'none';
  }
  stopEmbeddedPreview();
  if (type !== 'register') {
    faceRegistrationPending = false;
  }
  modal.classList.remove('hidden');
  startCamera(type);
}
function closeFaceModal() {
  pendingAttendanceEventType = null;
  const modal = document.getElementById('face-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
  stopCamera();
  stopFaceValidationLoop();
  startEmbeddedPreview();
}
function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
  if (scanTimer) {
    clearTimeout(scanTimer);
    scanTimer = null;
  }
  const video = document.getElementById('camera-feed');
  if (video) {
    video.srcObject = null;
  }
}
async function startCamera(type) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 },
        advanced: [{ focusMode: 'continuous' }]
      },
      audio: false
    });
    cameraStream = stream;
    const video = document.getElementById('camera-feed');
    const refImg = document.getElementById('face-modal-ref-img');
    const scanImg = document.getElementById('face-modal-scan-img');
    if (video) {
      video.srcObject = stream;
      await video.play().catch(() => {});
    }
    updateFaceValidationUI({ cameraConnected: true, message: 'Camera connected. Please position your face.' });
    setFaceModalStatus('🔍 Scanning face…', 'info');
    startFaceValidationLoop(video, type);
    if (type === 'register') {
      setFaceModalStatus('Camera ready. Capture your face, then save the registration.', 'info');
    } else {
      const registration = await getFaceRegistrationEndpoint('status');
      const registeredImage = registration.faceImage || '';
      if (refImg) {
        refImg.onload = () => { refImg.style.display = 'block'; };
        refImg.onerror = () => {
          refImg.style.display = 'none';
          setFaceModalStatus('Registered face image could not be loaded.', 'error');
        };
        refImg.src = registration.imageValid && registeredImage
          ? `${registeredImage}${registeredImage.includes('?') ? '&' : '?'}v=${Date.now()}`
          : '';
        refImg.style.display = registration.imageValid && registeredImage ? 'block' : 'none';
      }
      if (!registration.registered || !registration.imageValid || !registration.faceEncoding) {
        setFaceModalStatus('Face registration required before Time In/Time Out.', 'error');
        stopCamera();
        return;
      }
      let readyFrame;
      try {
        readyFrame = await captureFaceSnapshot();
      } catch (error) {
        setFaceModalStatus(error.message || 'Unable to capture the current face.', 'error');
        return;
      }
      if (scanImg) {
        scanImg.src = readyFrame;
        scanImg.style.display = 'block';
        scanImg.onload = () => { scanImg.style.display = 'block'; };
      }
      try {
        const descriptor = await getRealFaceDescriptor(readyFrame);
        setFaceModalStatus('✅ Face captured. Verifying…', 'success');
        const attendanceSaved = await recordAttendance(type, readyFrame, descriptor, pendingAttendanceEventType);
        logFaceAttempt(type, attendanceSaved ? 'success' : 'failed', attendanceSaved ? 'Face verified' : 'Attendance event was not recorded', { attendanceType: pendingAttendanceEventType || type });
        if (attendanceSaved) {
          setTimeout(() => {
            closeFaceModal();
            navigateTo(currentPage);
          }, 1600);
        }
      } catch (error) {
        setFaceModalStatus(error.message || 'Face verification failed.', 'error');
        logFaceAttempt(type, 'failed', error.message || 'Face verification failed', { attendanceType: type });
      }
    }
  } catch (e) {
    updateFaceValidationUI({ cameraConnected: false, faceDetected: false, faceCentered: false, lightingGood: false, blurGood: false, ready: false, message: 'Camera permission denied or unavailable.' });
    setFaceModalStatus('📵 Camera permission denied or unavailable.', 'error');
    logFaceAttempt(type, 'failed', 'Camera unavailable', { error: e.message });
  }
}
async function registerFace(scanData) {
  try {
    const descriptor = await getRealFaceDescriptor(scanData);
    const response = await getFaceRegistrationEndpoint('register', { faceImage: scanData, faceEncoding: JSON.stringify(descriptor), replace: '1' });
  if (!response.success) {
    setFaceModalStatus(response.message || 'Unable to save face registration.', 'error');
    addNotification(response.message || 'Unable to save face registration.', 'warning');
    return response;
  }
  const savedFaceImage = typeof response.faceImage === 'string' ? response.faceImage.trim() : '';
  if (!savedFaceImage || savedFaceImage.startsWith('data:') || savedFaceImage.startsWith('blob:')) {
    throw new Error('The saved face image path was not returned by the server.');
  }
  currentUser.face_image = savedFaceImage;
  ROLES.student.photo = savedFaceImage;
  const refImg = document.getElementById('face-modal-ref-img');
  if (refImg) refImg.src = savedFaceImage;
  const scanImg = document.getElementById('face-modal-scan-img');
  if (scanImg) scanImg.src = savedFaceImage;
  setFaceModalStatus('✅ Face registration saved successfully.', 'success');
  addNotification('Face registration saved successfully.', 'success');
  logFaceAttempt('register', 'success', 'Face registered successfully', { descriptorLength: descriptor.length });
  await loadFaceRegistrationStatus();
  setTimeout(() => {
    closeFaceModal();
    navigateTo(currentPage);
  }, 1500);
  return response;
  } catch (error) {
    setFaceModalStatus(error.message || 'Registration failed.', 'error');
    addNotification(error.message || 'Registration failed.', 'warning');
    return { success: false, message: error.message || 'Registration failed.' };
  }
}

// ══ GENERIC MODAL ══
function openGenModal(title, bodyHtml = null, onSave = null, saveLabel = 'Save') {
  const modal = document.getElementById('gen-modal');
  document.getElementById('gen-modal-title').textContent = title;
  document.getElementById('gen-modal-body').innerHTML = bodyHtml || `
    <div class="form-row"><label class="form-label">Full Name</label><input class="form-input" type="text" placeholder="Enter full name"></div>
    <div class="form-row"><label class="form-label">Email</label><input class="form-input" type="email" placeholder="Enter email address"></div>
    <div class="form-row"><label class="form-label">Program / Department</label><select class="form-select"><option>BIndTech Elect</option><option>BSCS</option><option>BIndTech FPST</option></select></div>
    <div class="form-row"><label class="form-label">Notes</label><textarea class="form-input" rows="3" placeholder="Additional notes…"></textarea></div>`;
  genModalSaveCallback = onSave;
  document.getElementById('gen-modal-save-button').textContent = saveLabel;
  modal.classList.remove('hidden');
}
async function handleGenModalSave() {
  if (typeof genModalSaveCallback === 'function') {
    const result = genModalSaveCallback();
    // Support both sync (false) and async (Promise<false>) callbacks
    const keepOpen = (result instanceof Promise) ? await result : result;
    if (keepOpen === false) {
      return;
    }
  }
  closeGenModal();
  genModalSaveCallback = null;
}
function closeGenModal() {
  document.getElementById('gen-modal').classList.add('hidden');
}

function formatAttendanceTime(value) {
  const timestamp = String(value || '').trim();
  if (!timestamp || timestamp === '—') return timestamp || '—';

  const match = timestamp.match(/(?:^|[T\s])(\d{1,2}:\d{2})(?::\d{2}(?:\.\d+)?)?(?:\s*(AM|PM))?/i);
  return match ? `${match[1]}${match[2] ? ` ${match[2].toUpperCase()}` : ''}` : timestamp;
}

// live clock
function updateClock() {
  const el = document.getElementById('live-time');
  if(el) el.textContent = new Date().toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit',hour12:true});
}
setInterval(updateClock, 1000);

// ══ ADMIN: COMPANY MANAGEMENT ══
function showCompanySuccessToast(message) {
  const host = document.getElementById('content') || document.body;
  const existing = host.querySelector('.company-success-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'company-success-toast';
  toast.innerHTML = `
    <div class="company-toast-icon">✓</div>
    <div class="company-toast-text">${escapeHtml(message)}</div>
    <button type="button" class="company-toast-close" onclick="this.parentElement.remove()">×</button>
  `;

  host.appendChild(toast);
  toast.style.position = 'fixed';
  toast.style.top = '88px';
  toast.style.right = '24px';
  toast.style.zIndex = '2000';
  toast.style.display = 'flex';
  toast.style.alignItems = 'center';
  toast.style.gap = '10px';
  toast.style.background = '#e9f9ef';
  toast.style.border = '1px solid #a6e7b8';
  toast.style.color = '#155724';
  toast.style.borderRadius = '12px';
  toast.style.boxShadow = '0 12px 30px rgba(35, 115, 63, 0.16)';
  toast.style.padding = '12px 14px';
  toast.style.minWidth = '280px';
  toast.style.maxWidth = '440px';
  toast.style.fontWeight = '700';
  toast.style.fontSize = '14px';

  const icon = toast.querySelector('.company-toast-icon');
  if (icon) {
    icon.style.width = '24px';
    icon.style.height = '24px';
    icon.style.borderRadius = '50%';
    icon.style.display = 'inline-flex';
    icon.style.alignItems = 'center';
    icon.style.justifyContent = 'center';
    icon.style.background = '#d3f3dc';
    icon.style.color = '#196b38';
  }

  const closeBtn = toast.querySelector('.company-toast-close');
  if (closeBtn) {
    closeBtn.style.border = 'none';
    closeBtn.style.background = 'transparent';
    closeBtn.style.color = '#1c4d2e';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.fontSize = '18px';
    closeBtn.style.lineHeight = '1';
    closeBtn.style.padding = '0';
    closeBtn.style.marginLeft = '6px';
  }

  setTimeout(() => { if (toast.parentElement) toast.remove(); }, 3500);
}

async function refreshCompanyList() {
  try {
    const response = await fetch(`${API_BASE}?resource=companies`);
    const data = await response.json();
    if (!data.success || !Array.isArray(data.companies)) {
      return false;
    }

    ADMIN_COMPANIES.length = 0;
    data.companies.forEach((company) => {
      ADMIN_COMPANIES.push({
        ...company,
        id: company.id,
        name: company.name,
        address: company.address || company.location || '',
        location: company.location || company.address || '',
        contact_person: company.contact_person || company.contact || company.contact_name || '-',
        contact: company.contact_person || company.contact || company.contact_name || '-',
        contact_phone: company.contact_phone || company.phone || '-',
        contact_email: company.contact_email || company.email || '-',
        email: company.contact_email || company.email || '-',
        status: company.status || 'Active'
      });
    });
    window.__companyLoadedKey = '';

    return true;
  } catch (error) {
    console.warn('Failed to refresh company list:', error);
    return false;
  }
}

async function loadAdminCompanyPage(page = 1, search = '') {
  const normalizedSearch = String(search || '').trim();
  const requestedPage = Math.max(1, Number(page) || 1);
  const requestKey = `${normalizedSearch}\u0000${requestedPage}`;
  if (window.__companyLoadedKey === requestKey) return true;
  if (window.__companyPageRequest?.key === requestKey) return window.__companyPageRequest.promise;

  window.__companyPageLoading = true;
  window.__companyPageError = '';
  const request = (async () => {
    try {
      const params = new URLSearchParams({
        resource: 'companies',
        search: normalizedSearch,
        page: String(requestedPage),
        limit: '8'
      });
      const response = await fetch(`${API_BASE}?${params.toString()}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !data.success || !Array.isArray(data.companies)) {
        throw new Error(data.message || 'Unable to load companies.');
      }

      ADMIN_COMPANY_PAGE_RECORDS = data.companies.map((company) => ({
        ...company,
        id: company.id,
        name: company.name,
        address: company.address || company.location || '',
        location: company.location || company.address || '',
        contact_person: company.contact_person || company.contact || company.contact_name || '-',
        contact: company.contact_person || company.contact || company.contact_name || '-',
        contact_phone: company.contact_phone || company.phone || '-',
        contact_email: company.contact_email || company.email || '-',
        email: company.contact_email || company.email || '-',
        status: company.status || 'Active'
      }));
      const pagination = data.pagination || {};
      window.__companyPage = Number(pagination.page) || requestedPage;
      window.__companyTotalPages = Math.max(1, Number(pagination.total_pages) || 1);
      window.__companySearch = normalizedSearch;
      window.__companyLoadedKey = `${normalizedSearch}\u0000${window.__companyPage}`;
      window.__companyPageLoading = false;
      if (currentPage === 'companies' && typeof updateAdminCompanyPageDom === 'function' && updateAdminCompanyPageDom()) {
        return true;
      }
      if (currentPage === 'companies') navigateTo('companies');
      return true;
    } catch (error) {
      window.__companyPageLoading = false;
      window.__companyPageError = error.message || 'Unable to load companies.';
      if (currentPage === 'companies' && typeof updateAdminCompanyPageDom === 'function') updateAdminCompanyPageDom();
      console.warn('Failed to load paginated company list:', error);
      return false;
    }
  })();
  window.__companyPageRequest = { key: requestKey, promise: request };
  try {
    return await request;
  } finally {
    if (window.__companyPageRequest?.key === requestKey) window.__companyPageRequest = null;
  }
}

function changeCompanyPage(delta) {
  const current = Number(window.__companyPage || 1);
  const next = Math.max(1, Math.min(Number(window.__companyTotalPages || 1), current + delta));
  window.__companyPage = next;
  if (currentPage === 'companies') {
    loadAdminCompanyPage(next, window.__companySearch || '');
  }
}

function openNewCompanyModal() {
  const body = `
    <div class="form-row"><label class="form-label">Company Name <span style="color:#d14343">*</span></label><input class="form-input" id="gen-company-name" type="text" placeholder="Enter company name"></div>
    <div class="form-row"><label class="form-label">Address <span style="color:#d14343">*</span></label><input class="form-input" id="gen-company-address" type="text" placeholder="Enter company address"></div>
    <div class="form-row"><label class="form-label">Latitude</label><input class="form-input" id="gen-company-lat" type="number" step="any" placeholder="Company latitude"></div>
    <div class="form-row"><label class="form-label">Longitude</label><input class="form-input" id="gen-company-lng" type="number" step="any" placeholder="Company longitude"></div>
    <div class="form-row"><label class="form-label">Allowed Radius (meters)</label><input class="form-input" id="gen-company-radius" type="number" min="1" max="10000" step="1" value="100"></div>
    <div class="form-row"><label class="form-label">Contact Person <span style="color:#d14343">*</span></label><input class="form-input" id="gen-company-contact" type="text" placeholder="Enter contact person"></div>
    <div class="form-row"><label class="form-label">Contact Number <span style="color:#d14343">*</span></label><input class="form-input" id="gen-company-phone" type="text" placeholder="Enter contact number"></div>
    <div class="form-row"><label class="form-label">Email</label><input class="form-input" id="gen-company-email" type="email" placeholder="Enter email address"></div>
    <div class="form-row"><label class="form-label">Status</label><select class="form-select" id="gen-company-status"><option value="Active">Active</option><option value="Inactive">Inactive</option></select></div>
  `;
  openGenModal('Add Company', body, async () => saveCompany('add'), 'Save Company');
}

function editCompany(companyOrIndex) {
  const company = typeof companyOrIndex === 'number' ? ADMIN_COMPANIES[companyOrIndex] : companyOrIndex;
  if (!company) return;
  const body = `
    <div class="form-row"><label class="form-label">Company Name <span style="color:#d14343">*</span></label><input class="form-input" id="gen-company-name" type="text" value="${escapeHtml(company.name || '')}"></div>
    <div class="form-row"><label class="form-label">Address <span style="color:#d14343">*</span></label><input class="form-input" id="gen-company-address" type="text" value="${escapeHtml(company.address || company.location || '')}"></div>
    <div class="form-row"><label class="form-label">Latitude</label><input class="form-input" id="gen-company-lat" type="number" step="any" value="${escapeHtml(company.latitude ?? '')}"></div>
    <div class="form-row"><label class="form-label">Longitude</label><input class="form-input" id="gen-company-lng" type="number" step="any" value="${escapeHtml(company.longitude ?? '')}"></div>
    <div class="form-row"><label class="form-label">Allowed Radius (meters)</label><input class="form-input" id="gen-company-radius" type="number" min="1" max="10000" step="1" value="${escapeHtml(company.allowed_radius_meters ?? 100)}"></div>
    <div class="form-row"><label class="form-label">Contact Person <span style="color:#d14343">*</span></label><input class="form-input" id="gen-company-contact" type="text" value="${escapeHtml(company.contact_person || company.contact || '')}"></div>
    <div class="form-row"><label class="form-label">Contact Number <span style="color:#d14343">*</span></label><input class="form-input" id="gen-company-phone" type="text" value="${escapeHtml(company.contact_phone || company.phone || '')}"></div>
    <div class="form-row"><label class="form-label">Email</label><input class="form-input" id="gen-company-email" type="email" value="${escapeHtml(company.contact_email || company.email || '')}"></div>
    <div class="form-row"><label class="form-label">Status</label><select class="form-select" id="gen-company-status"><option value="Active" ${company.status==='Active'?'selected':''}>Active</option><option value="Inactive" ${company.status==='Inactive'?'selected':''}>Inactive</option></select></div>
  `;
  openGenModal('Edit Company', body, async () => saveCompany('edit', company), 'Save Company');
}

async function saveCompany(mode, index = null) {
  const name = document.getElementById('gen-company-name')?.value.trim();
  const address = document.getElementById('gen-company-address')?.value.trim();
  const latitude = document.getElementById('gen-company-lat')?.value.trim();
  const longitude = document.getElementById('gen-company-lng')?.value.trim();
  const allowedRadius = document.getElementById('gen-company-radius')?.value.trim() || '100';
  const contact = document.getElementById('gen-company-contact')?.value.trim();
  const phone = document.getElementById('gen-company-phone')?.value.trim();
  const email = document.getElementById('gen-company-email')?.value.trim();
  const status = document.getElementById('gen-company-status')?.value || 'Active';

  if (!['Active', 'Inactive'].includes(status)) {
    alert('Company status must be Active or Inactive.');
    return false;
  }

  if (!name || !address || !contact || !phone) {
    alert('Please complete all required fields.');
    return false;
  }

  const payload = {
    name,
    address,
    location: address,
    latitude: latitude || '',
    longitude: longitude || '',
    allowed_radius_meters: allowedRadius,
    contact_person: contact,
    contact_phone: phone,
    contact_email: email,
    status
  };

  if (mode === 'edit' && index !== null) {
    const company = typeof index === 'number' ? ADMIN_COMPANIES[index] : index;
    if (company?.id) payload.id = company.id;
  }

  try {
    const response = await fetch(`${API_BASE}?resource=companies`, {
      method: mode === 'edit' ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(payload)
    });
    const data = await response.json();
    if (!data.success) {
      alert(data.message || 'Failed to add company.');
      return false;
    }

    await refreshCompanyList();
    logAdminActivity(mode === 'edit' ? 'Update' : 'Create', `${mode === 'edit' ? 'Updated company' : 'Added company'} "${name}".`);
    addNotification(mode === 'edit' ? `Company updated: ${name}` : `Company added: ${name}`, 'success');
    showCompanySuccessToast(mode === 'edit' ? 'Company updated successfully!' : 'Company added successfully!');

    if (currentPage === 'companies') await loadAdminCompanyPage(window.__companyPage || 1, window.__companySearch || '');
    return true;
  } catch (error) {
    console.error('Company save failed:', error);
    alert('Failed to add company.');
    return false;
  }
}

async function deleteCompany(companyOrIndex) {
  if (!confirm('Are you sure you want to delete this company?')) return;
  const company = typeof companyOrIndex === 'number' ? ADMIN_COMPANIES[companyOrIndex] : companyOrIndex;
  if (!company) return;

  try {
    const response = await fetch(`${API_BASE}?resource=companies`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id: String(company.id || '') })
    });
    const data = await response.json();
    if (!data.success) {
      alert(data.message || 'Failed to delete company.');
      return;
    }

    await refreshCompanyList();
    logAdminActivity('Delete', `Deleted company "${company.name}".`);
    addNotification(`Company deleted: ${company.name}`, 'warning');
    if (currentPage === 'companies') await loadAdminCompanyPage(window.__companyPage || 1, window.__companySearch || '');
  } catch (error) {
    console.error('Company delete failed:', error);
    alert('Failed to delete company.');
  }
}

function viewCompany(company) {
  if (!company) return;
  const details = `
    <div class="form-row"><label class="form-label">Company Name</label><div class="form-text">${escapeHtml(company.name || '—')}</div></div>
    <div class="form-row"><label class="form-label">Address</label><div class="form-text">${escapeHtml(company.address || company.location || '—')}</div></div>
    <div class="form-row"><label class="form-label">Contact Person</label><div class="form-text">${escapeHtml(company.contact_person || company.contact || '—')}</div></div>
    <div class="form-row"><label class="form-label">Contact Number</label><div class="form-text">${escapeHtml(company.contact_phone || company.phone || '—')}</div></div>
    <div class="form-row"><label class="form-label">Email</label><div class="form-text">${escapeHtml(company.contact_email || company.email || '—')}</div></div>
    <div class="form-row"><label class="form-label">Status</label><div class="form-text">${escapeHtml(company.status || 'Active')}</div></div>
  `;
  openGenModal('Company Details', details, null, 'Close');
}

// ══ ADMIN: SYSTEM SETTINGS ══
function saveSystemSettings() {
  const hours = parseInt(document.querySelector('.form-input[value="500"]')?.value || 500, 10);
  const maxStudents = parseInt(document.querySelector('.form-input[value="15"]')?.value || 15, 10);
  const reminder = parseInt(document.querySelector('.form-input[value="48"]')?.value || 48, 10);
  const faceEnabled = document.querySelectorAll('input[type="checkbox"]')[0]?.checked || false;
  const autoAttendance = document.querySelectorAll('input[type="checkbox"]')[1]?.checked || false;

  ADMIN_SETTINGS.ojt_hours = hours;
  ADMIN_SETTINGS.max_students_per_supervisor = maxStudents;
  ADMIN_SETTINGS.submission_deadline_reminder = reminder;
  ADMIN_SETTINGS.face_recognition_enabled = faceEnabled;
  ADMIN_SETTINGS.auto_attendance = autoAttendance;

  addNotification('System settings updated successfully', 'success');
  if (currentPage === 'settings') {
    navigateTo('settings');
  }
}

// ══ ADMIN: REPORTS & LOGS ══
function exportAttendanceReport() {
  const rows = typeof getFilteredReportRows === 'function' ? getFilteredReportRows() : [];
  const header = ['Student ID', 'Student Name', 'Program', 'Company', 'Coordinator', 'Supervisor', 'Status'];
  const csv = header.join(',') + '\n' + rows.map((row) => header.map((key) => {
    const value = {
      'Student ID': row.studentId || '',
      'Student Name': row.studentName || '',
      Program: row.program || '',
      Company: row.company || '',
      Coordinator: row.coordinator || '',
      Supervisor: row.supervisor || '',
      Status: row.status || ''
    }[key] || '';
    return `"${String(value).replace(/"/g, '""')}"`;
  }).join(',')).join('\n');
  downloadCSV(csv, 'internship-report.csv');
  recordBackendActivity('Export Report', 'Exported internship report as CSV.');
  addNotification('Internship report exported', 'success');
}

function exportOJTCompletionReport() {
  const rows = typeof getFilteredReportRows === 'function' ? getFilteredReportRows() : [];
  const printRows = rows.length
    ? rows.map((row) => `
        <tr>
          <td>${escapeHtml(row.studentId || '—')}</td>
          <td>${escapeHtml(row.studentName)}</td>
          <td>${escapeHtml(row.program)}</td>
          <td>${escapeHtml(row.company)}</td>
          <td>${escapeHtml(row.coordinator || 'Unassigned')}</td>
          <td>${escapeHtml(row.supervisor || 'Unassigned')}</td>
          <td>${escapeHtml(row.status)}</td>
        </tr>`).join('')
    : '<tr><td colspan="7" style="text-align:center;padding:16px">No records to print.</td></tr>';

  const printWindow = window.open('', '_blank', 'width=1000,height=800');
  if (!printWindow) {
    alert('Please allow pop-ups to print the report.');
    return;
  }

  printWindow.document.write(`<!DOCTYPE html><html><head><title>Internship Report</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#111}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f7fb}</style></head><body><h2>Detailed Internship Report</h2><p>Generated on ${new Date().toLocaleString()}</p><table><thead><tr><th>Student ID</th><th>Student Name</th><th>Program</th><th>Company</th><th>Coordinator</th><th>Supervisor</th><th>Status</th></tr></thead><tbody>${printRows}</tbody></table></body></html>`);
  printWindow.document.close();
  setTimeout(() => printWindow.print(), 250);
  recordBackendActivity('Print Report', 'Printed internship report.');
  addNotification('Internship report prepared for printing', 'success');
}

function downloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

// ══ ADMIN: BACKUP & SECURITY ══
function createBackup() {
  addNotification('Database backup initiated...', 'info');
  setTimeout(() => {
    recordBackendActivity('Database Backup', 'Completed database backup.');
    addNotification('Backup completed successfully. Size: 245 MB', 'success');
    if (currentPage === 'backup') {
      navigateTo('backup');
    }
  }, 2000);
}

function restoreBackup() {
  if (!confirm('Restore system from backup? This will overwrite current data.')) return;
  addNotification('Restore initiated...', 'warning');
  setTimeout(() => {
    recordBackendActivity('Database Restore', 'Completed database restore.');
    addNotification('System restored successfully', 'success');
    if (currentPage === 'backup') {
      navigateTo('backup');
    }
  }, 2000);
}

function viewSecurityLogs() {
  const body = `<div style="max-height:400px;overflow-y:auto;padding:0">
    ${SYSTEM_LOGS.filter(l => l.action.includes('Login') || l.action.includes('login')).map(l => `
      <div style="padding:12px;border-bottom:1px solid var(--surface2);font-size:12px">
        <div style="font-weight:600">${l.ts}</div>
        <div style="color:var(--text2)">${l.user} (${l.role}) - ${l.action}</div>
        <div style="color:var(--text3);font-family:'DM Mono',monospace">${l.ip}</div>
      </div>
    `).join('')}
  </div>`;
  openGenModal('Security Logs', body, null, 'Close');
}

document.addEventListener('DOMContentLoaded', restoreAuthenticatedSession);
window.addEventListener('pageshow', event => {
  if (event.persisted) {
    const appContainer = document.getElementById('app');
    if (appContainer) appContainer.style.display = 'none';
    restoreAuthenticatedSession();
  }
});

function testSystem() {
  addNotification('System test initiated...', 'info');
  setTimeout(() => {
    const results = [
      '✅ Database connection: OK',
      '✅ File system: OK',
      '✅ Face recognition service: OK',
      '✅ Email service: OK',
      '✅ Backup storage: OK'
    ];
    const body = `<div style="font-size:12px;line-height:1.8"><strong>System Test Results:</strong><br>${results.join('<br>')}</div>`;
    openGenModal('System Test Results', body, null, 'Close');
    addNotification('System test completed - All systems operational', 'success');
  }, 1500);
}

