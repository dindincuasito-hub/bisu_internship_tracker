<?php
require_once __DIR__ . '/db.php';
header('Content-Type: application/json; charset=utf-8');

function getStudentRecordRow(PDO $pdo, array $user): array
{
    $registration = getFaceRegistration($pdo, $user['id']);
    $faceStatus = $registration ? 'Registered' : 'Not Registered';

    $hoursRendered = 0;
    $requiredHours = 500;
    $status = 'Pending';

    if (!empty($user['student_id'])) {
        $requiredHours = max(1, (int)($user['academic_year'] ? 500 : 500));
    }

    if (!empty($user['company'])) {
        $status = 'Active';
    }
    if (!empty($user['company']) && $hoursRendered >= $requiredHours) {
        $status = 'Completed';
    }

    $attendanceSummary = 'No attendance yet';
    try {
        $stmt = $pdo->prepare('SELECT COUNT(*) AS count FROM attendance_logs WHERE user_id = ?');
        $stmt->execute([$user['id']]);
        $attendanceCount = $stmt->fetchColumn();
        if ($attendanceCount) {
            $attendanceSummary = 'Attendance recorded';
        }
    } catch (Throwable $e) {
        $attendanceSummary = 'Attendance unavailable';
    }

    return [
        'id' => $user['id'],
        'student_id' => $user['student_id'] ?? '',
        'student_name' => $user['name'],
        'program' => $user['program'] ?? '',
        'section' => $user['academic_year'] ?? '',
        'assigned_company' => $user['company'] ?? '',
        'assigned_supervisor' => $user['employee_id'] ?? '',
        'assigned_coordinator' => $user['username'] ?? '',
        'internship_status' => $status,
        'hours_rendered' => $hoursRendered,
        'required_hours' => $requiredHours,
        'attendance_summary' => $attendanceSummary,
        'face_registration_status' => $faceStatus,
        'last_updated' => $user['created'] ?? date('Y-m-d H:i:s'),
    ];
}

$requestMethod = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($requestMethod !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

try {
    $pdo = getDbConnection();
    $stmt = $pdo->prepare('SELECT id, name, email, username, role, status, created, contact, student_id, program, academic_year, employee_id, company FROM users WHERE role = ? ORDER BY created DESC');
    $stmt->execute(['student']);
    $users = $stmt->fetchAll();
    $rows = array_map(function ($user) use ($pdo) {
        return getStudentRecordRow($pdo, $user);
    }, $users);

    echo json_encode(['success' => true, 'records' => $rows]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Unable to load student records']);
}
