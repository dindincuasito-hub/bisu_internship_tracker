<?php
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth.php';
header('Content-Type: application/json; charset=utf-8');

$requestMethod = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($requestMethod !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

try {
    $coordinator = requireAuth('coordinator');
} catch (RuntimeException $e) {
    http_response_code($e->getMessage() === 'Forbidden' ? 403 : 401);
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    exit;
}

try {
    $pdo = getDbConnection();
    $programStmt = $pdo->prepare('SELECT program_id FROM users WHERE id=? AND role="coordinator" AND status="Active" LIMIT 1');
    $programStmt->execute([(int)$coordinator['id']]);
    $programId = (int)($programStmt->fetchColumn() ?: 0);
    if ($programId <= 0) {
        echo json_encode(['success' => true, 'records' => []]);
        exit;
    }

    $stmt = $pdo->prepare(
        'SELECT u.id, u.student_id, u.name AS student_name,
                COALESCE(p.code, p.name, u.program) AS program, u.section,
                c.name AS assigned_company, company_sup.name AS assigned_supervisor,
                co.name AS assigned_coordinator,
                COALESCE(a.internship_status, "Pending") AS internship_status,
                COALESCE(a.hours_completed, 0) AS hours_rendered,
                COALESCE(a.hours_required, 500) AS required_hours,
                COALESCE(fr.registration_status, "Not Registered") AS face_registration_status,
                CASE
                    WHEN fr.registration_status = "Registered"
                         AND attendance_today.time_in IS NOT NULL
                         AND attendance_today.verification_status = "Verified"
                    THEN attendance_today.status
                    ELSE "Absent"
                END AS attendance_summary,
                COALESCE(a.updated_at, u.created) AS last_updated
         FROM users u
         LEFT JOIN programs p ON p.id = u.program_id
         LEFT JOIN assignments a ON a.student_id = u.id
         LEFT JOIN companies c ON c.id = a.company_id
         LEFT JOIN users company_sup ON company_sup.id = (
             SELECT assigned_sup.id FROM users assigned_sup
             WHERE assigned_sup.role = "supervisor" AND assigned_sup.status = "Active"
               AND assigned_sup.company_id = a.company_id
             ORDER BY assigned_sup.id ASC LIMIT 1
         )
         LEFT JOIN face_registrations fr ON fr.user_id = u.id
         LEFT JOIN attendance_logs attendance_today ON attendance_today.student_id = u.id
             AND attendance_today.log_date = CURRENT_DATE()
         LEFT JOIN (
             SELECT program_id, MIN(id) AS coordinator_id
             FROM users
             WHERE role = "coordinator" AND status = "Active" AND program_id IS NOT NULL
             GROUP BY program_id
         ) program_coordinator ON program_coordinator.program_id = u.program_id
         LEFT JOIN users co ON co.id = program_coordinator.coordinator_id
         WHERE u.role = "student" AND u.status = "Active" AND u.program_id = ?
         ORDER BY u.name ASC'
    );
    $stmt->execute([$programId]);
    echo json_encode(['success' => true, 'records' => $stmt->fetchAll()]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Unable to load student records']);
}
