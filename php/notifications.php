<?php
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth.php';
header('Content-Type: application/json; charset=utf-8');

function respond(array $payload): void
{
    echo json_encode($payload);
    exit;
}

 $pdo = null;
try {
    $pdo = getDbConnection();
} catch (Exception $e) {
    respond(['success' => false, 'message' => 'Database unavailable']);
}

$method = $_SERVER['REQUEST_METHOD'];
if ($method === 'GET') {
    $user = getSessionUser();
    if (!$user) respond(['success' => false, 'message' => 'Unauthorized']);

    $stmt = $pdo->prepare('SELECT id, title, message, type, notification_type, task_id, student_id, attendance_id, company_id, supervisor_id, attendance_date, submission_id, is_read, page, url, created_at
                           FROM notifications
                           WHERE user_id = ?
                           ORDER BY created_at DESC LIMIT 50');
    $stmt->execute([(int)$user['id']]);
    $rows = $stmt->fetchAll();
    respond(['success' => true, 'notifications' => $rows]);
}

if ($method === 'POST') {
    $sessionUser = getSessionUser();
    if (!$sessionUser) {
        respond(['success' => false, 'message' => 'Unauthorized']);
    }
    $action = trim($_POST['action'] ?? '');
    if ($action === 'create') {
        if ($sessionUser['role'] === 'student') {
            respond(['success' => false, 'message' => 'Students cannot create notifications']);
        }
        $role = trim($_POST['role'] ?? '');
        $username = trim($_POST['username'] ?? '');
        $title = trim($_POST['title'] ?? 'Notification');
        $message = trim($_POST['message'] ?? '');
        $type = trim($_POST['type'] ?? 'info');
        $page = trim($_POST['page'] ?? '');
        $url = trim($_POST['url'] ?? '');
        $notificationType = trim($_POST['notification_type'] ?? 'general');
        $taskId = intval($_POST['task_id'] ?? 0) ?: null;
        $studentId = intval($_POST['student_id'] ?? 0) ?: null;
        $attendanceId = intval($_POST['attendance_id'] ?? 0) ?: null;
        $companyId = intval($_POST['company_id'] ?? 0) ?: null;
        $supervisorId = intval($_POST['supervisor_id'] ?? 0) ?: null;
        $attendanceDate = trim($_POST['attendance_date'] ?? '');
        $submissionId = intval($_POST['submission_id'] ?? 0) ?: null;
        if ($role === '' || $message === '') {
            respond(['success' => false, 'message' => 'Role and message are required']);
        }
        $userId = null;
        if ($username !== '') {
            $user = getUserByUsernameAndRole($pdo, $username, $role);
            if ($user) {
                $userId = intval($user['id']);
            }
        }
        if ($userId === null && $supervisorId) {
            $userId = $supervisorId;
        }
        $stmt = $pdo->prepare('INSERT INTO notifications (user_id, role, title, message, type, notification_type, task_id, student_id, attendance_id, company_id, supervisor_id, attendance_date, submission_id, page, url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([$userId, $role, $title, $message, $type, $notificationType, $taskId, $studentId, $attendanceId, $companyId, $supervisorId, $attendanceDate ?: null, $submissionId, $page, $url]);
        respond(['success' => true, 'notification_id' => intval($pdo->lastInsertId())]);
    }
    if ($action === 'mark_read') {
        $user = getSessionUser();
        $id = intval($_POST['id'] ?? 0);
        if ($id <= 0) {
            respond(['success' => false, 'message' => 'Invalid notification id']);
        }
        if (!$user) respond(['success' => false, 'message' => 'Unauthorized']);
        $stmt = $pdo->prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?');
        $stmt->execute([$id, (int)$user['id']]);
        respond(['success' => true]);
    }
    if ($action === 'mark_all_read') {
        $user = getSessionUser();
        if (!$user) respond(['success' => false, 'message' => 'Unauthorized']);
        $stmt = $pdo->prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?');
        $stmt->execute([(int)$user['id']]);
        respond(['success' => true]);
    }
    if ($action === 'delete_all') {
        // Task notification history is persistent and must not be deleted from this UI.
        respond(['success' => true]);
    }
    respond(['success' => false, 'message' => 'Invalid action']);
}

http_response_code(405);
respond(['success' => false, 'message' => 'Method not allowed']);
