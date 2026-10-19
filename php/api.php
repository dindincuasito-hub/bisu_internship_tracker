<?php
/**
 * api.php — Central CRUD API for the Digital Internship Tracker
 * All requests are JSON. All queries use prepared statements.
 */
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth.php';

header('Content-Type: application/json; charset=utf-8');

// --- DB Connection ---
try {
    $pdo = getDbConnection();
} catch (Exception $e) {
    http_response_code(503);
    echo json_encode(['success' => false, 'message' => 'Database unavailable.']);
    exit;
}

// --- Helpers ---
function send(array $payload, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

function sendError(string $message, int $code = 400): void
{
    send(['success' => false, 'message' => $message], $code);
}

function verifyStudentFace(PDO $pdo, int $userId, string $submittedEncoding): void
{
    $stmt = $pdo->prepare('SELECT face_image, face_encoding FROM face_registrations WHERE user_id=? AND registration_status="Registered" ORDER BY id DESC LIMIT 1');
    $stmt->execute([$userId]);
    $registration = $stmt->fetch(PDO::FETCH_ASSOC);
    $storedPath = (string)($registration['face_image'] ?? '');
    $physicalPath = dirname(__DIR__) . '/' . ltrim($storedPath, '/');
    $imageInfo = is_file($physicalPath) ? @getimagesize($physicalPath) : false;
    if (!$registration || !is_file($physicalPath) || !$imageInfo || ($imageInfo[0] ?? 0) < 160 || ($imageInfo[1] ?? 0) < 120) {
        sendError('Registered face image is missing or invalid. Please register your face again.', 403);
    }
    $stored = json_decode((string)$registration['face_encoding'], true);
    $submitted = json_decode($submittedEncoding, true);
    if (!is_array($stored) || count($stored) !== 128) {
        sendError('Face registration required before Time In/Time Out.', 403);
    }
    if (!is_array($submitted) || count($submitted) !== 128 || count(array_filter($submitted, 'is_numeric')) !== 128) {
        sendError('Face does not match the registered student.', 403);
    }
    $sum = 0.0;
    for ($index = 0; $index < 128; $index++) {
        $difference = (float)$stored[$index] - (float)$submitted[$index];
        $sum += $difference * $difference;
    }
    if (sqrt($sum) > 0.60) {
        sendError('Face does not match the registered student.', 403);
    }
}

function parseCoordinatePair(array $payload, string $label, bool $required = false): ?array
{
    $latitudeRaw = trim((string)($payload['latitude'] ?? ''));
    $longitudeRaw = trim((string)($payload['longitude'] ?? ''));
    if ($latitudeRaw === '' && $longitudeRaw === '' && !$required) {
        return null;
    }
    if ($latitudeRaw === '' || $longitudeRaw === '' || !is_numeric($latitudeRaw) || !is_numeric($longitudeRaw)) {
        sendError($label . ' latitude and longitude are both required and must be numeric.', 400);
    }

    $latitude = (float)$latitudeRaw;
    $longitude = (float)$longitudeRaw;
    if ($latitude < -90 || $latitude > 90 || $longitude < -180 || $longitude > 180) {
        sendError($label . ' coordinates are outside valid ranges.', 400);
    }

    return ['latitude' => $latitude, 'longitude' => $longitude];
}

function parseAllowedRadiusMeters(array $payload): int
{
    $rawRadius = trim((string)($payload['allowed_radius_meters'] ?? ''));
    if ($rawRadius === '') {
        return 100;
    }
    if (!ctype_digit($rawRadius) || (int)$rawRadius < 1 || (int)$rawRadius > 10000) {
        sendError('Allowed radius must be a whole number between 1 and 10000 meters.', 400);
    }
    return (int)$rawRadius;
}

function getAssignedCompanyCoordinates(PDO $pdo, int $userId): ?array
{
    $stmt = $pdo->prepare('SELECT c.latitude, c.longitude, c.allowed_radius_meters FROM assignments a LEFT JOIN companies c ON c.id = a.company_id WHERE a.student_id = ? ORDER BY a.updated_at DESC, a.id DESC LIMIT 1');
    $stmt->execute([$userId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row || !is_numeric($row['latitude'] ?? null) || !is_numeric($row['longitude'] ?? null)) {
        return null;
    }

    $latitude = (float)$row['latitude'];
    $longitude = (float)$row['longitude'];
    $radius = (int)($row['allowed_radius_meters'] ?? 0);
    if ($latitude < -90 || $latitude > 90 || $longitude < -180 || $longitude > 180 || $radius < 1 || $radius > 10000) {
        return null;
    }

    return ['latitude' => $latitude, 'longitude' => $longitude, 'allowed_radius_meters' => $radius];
}

function calculateDistanceMeters(float $latitude1, float $longitude1, float $latitude2, float $longitude2): float
{
    $earthRadius = 6371000.0;
    $latitude1 = deg2rad($latitude1);
    $latitude2 = deg2rad($latitude2);
    $deltaLatitude = $latitude2 - $latitude1;
    $deltaLongitude = deg2rad($longitude2 - $longitude1);
    $a = sin($deltaLatitude / 2) ** 2
        + cos($latitude1) * cos($latitude2) * sin($deltaLongitude / 2) ** 2;
    $a = min(1.0, max(0.0, $a));
    return $earthRadius * 2 * atan2(sqrt($a), sqrt(1 - $a));
}

function validateAttendanceLocation(PDO $pdo, int $userId, array $payload): array
{
    $studentCoordinates = parseCoordinatePair($payload, 'GPS', true);
    $companyCoordinates = getAssignedCompanyCoordinates($pdo, $userId);
    if ($companyCoordinates === null) {
        sendError('The assigned company location is not configured. Contact your coordinator before recording attendance.', 409);
    }

    $distanceMeters = calculateDistanceMeters(
        $studentCoordinates['latitude'],
        $studentCoordinates['longitude'],
        $companyCoordinates['latitude'],
        $companyCoordinates['longitude']
    );
    $allowedRadius = $companyCoordinates['allowed_radius_meters'];
    if ($distanceMeters > $allowedRadius) {
        sendError(
            'You are outside your OJT location. You are ' . (int)round($distanceMeters) . ' meters away. Allowed distance: ' . $allowedRadius . ' meters.',
            403
        );
    }

    return [
        'latitude' => $studentCoordinates['latitude'],
        'longitude' => $studentCoordinates['longitude'],
        'accuracy' => isset($payload['accuracy']) && is_numeric($payload['accuracy']) ? (float)$payload['accuracy'] : null,
        'distance_meters' => $distanceMeters,
        'allowed_radius_meters' => $allowedRadius,
    ];
}

function calculateAttendancePairSeconds(?string $start, ?string $end): ?int
{
    if (!$start || !$end) {
        return null;
    }
    $startTimestamp = strtotime($start);
    $endTimestamp = strtotime($end);
    if ($startTimestamp === false || $endTimestamp === false || $endTimestamp < $startTimestamp) {
        return null;
    }
    return $endTimestamp - $startTimestamp;
}

function calculateAttendancePairMinutes(?string $start, ?string $end): ?int
{
    $seconds = calculateAttendancePairSeconds($start, $end);
    return $seconds === null ? null : (int)round($seconds / 60);
}

function enrichAttendanceRows(array $rows): array
{
    foreach ($rows as &$row) {
        $morningSeconds = calculateAttendancePairSeconds($row['time_in'] ?? null, $row['time_out'] ?? null);
        $afternoonSeconds = calculateAttendancePairSeconds($row['afternoon_time_in'] ?? null, $row['afternoon_time_out'] ?? null);
        $totalSeconds = ($morningSeconds ?? 0) + ($afternoonSeconds ?? 0);
        $row['morning_seconds'] = $morningSeconds;
        $row['afternoon_seconds'] = $afternoonSeconds;
        $row['total_seconds'] = $totalSeconds;
        $row['morning_minutes'] = $morningSeconds === null ? null : (int)round($morningSeconds / 60);
        $row['afternoon_minutes'] = $afternoonSeconds === null ? null : (int)round($afternoonSeconds / 60);
        $row['total_minutes'] = (int)round($totalSeconds / 60);
        $row['duration_minutes'] = $row['total_minutes'];
    }
    unset($row);
    return $rows;
}

function requireSession(): array
{
    $user = getSessionUser();
    if (empty($user)) {
        sendError('Unauthorized. Please log in.', 401);
    }
    return $user;
}

function requireRole(array $user, array $allowedRoles): void
{
    if (!in_array($user['role'], $allowedRoles, true)) {
        sendError('Forbidden. Insufficient permissions.', 403);
    }
}

function getCoordinatorProgramId(PDO $pdo, array $user): ?int
{
    if (($user['role'] ?? '') !== 'coordinator') {
        return null;
    }
    $stmt = $pdo->prepare('SELECT program_id FROM users WHERE id = ? AND role = "coordinator" AND status = "Active" LIMIT 1');
    $stmt->execute([intval($user['id'] ?? 0)]);
    $programId = (int)($stmt->fetchColumn() ?: 0);
    return $programId > 0 ? $programId : null;
}

function getCoordinatorCompanyId(PDO $pdo, array $user): ?int
{
    if (($user['role'] ?? '') !== 'coordinator') {
        return null;
    }
    $ids = getCoordinatorCompanyIds($pdo, (int)($user['id'] ?? 0));
    return $ids ? (int)$ids[0] : null;
}

function getCompanySupervisorId(PDO $pdo, ?int $companyId): ?int
{
    if (!$companyId) {
        return null;
    }
    $stmt = $pdo->prepare('SELECT id FROM users WHERE role = "supervisor" AND status = "Active" AND company_id = ? ORDER BY id ASC LIMIT 1');
    $stmt->execute([$companyId]);
    $supervisorId = $stmt->fetchColumn();
    return $supervisorId ? (int)$supervisorId : null;
}

function createAttendanceSupervisorNotification(PDO $pdo, int $studentId, int $attendanceId, string $eventType): void
{
    $assignmentStmt = $pdo->prepare('SELECT a.company_id, a.supervisor_id, c.name AS company_name FROM assignments a LEFT JOIN companies c ON c.id = a.company_id WHERE a.student_id = ? ORDER BY a.updated_at DESC, a.id DESC LIMIT 1');
    $assignmentStmt->execute([$studentId]);
    $assignment = $assignmentStmt->fetch(PDO::FETCH_ASSOC);
    $resolvedCompanyId = $assignment && !empty($assignment['company_id']) ? (int)$assignment['company_id'] : null;
    $resolvedSupervisorId = $assignment && !empty($assignment['supervisor_id']) ? (int)$assignment['supervisor_id'] : null;

    if ($resolvedSupervisorId === null && $resolvedCompanyId !== null) {
        $resolvedSupervisorId = getCompanySupervisorId($pdo, $resolvedCompanyId);
    }

    if (!$resolvedSupervisorId || $resolvedSupervisorId <= 0) {
        return;
    }

    $eventTimeColumns = [
        'morning_time_in' => 'time_in',
        'morning_time_out' => 'time_out',
        'afternoon_time_in' => 'afternoon_time_in',
        'afternoon_time_out' => 'afternoon_time_out',
    ];
    $eventLabels = [
        'morning_time_in' => 'Morning Time In',
        'morning_time_out' => 'Morning Time Out',
        'afternoon_time_in' => 'Afternoon Time In',
        'afternoon_time_out' => 'Afternoon Time Out',
    ];
    if (!isset($eventTimeColumns[$eventType], $eventLabels[$eventType])) {
        return;
    }
    $timeColumn = $eventTimeColumns[$eventType];
    $attendanceStmt = $pdo->prepare("SELECT student_id, log_date, `$timeColumn` AS event_time FROM attendance_logs WHERE id = ? LIMIT 1");
    $attendanceStmt->execute([$attendanceId]);
    $attendance = $attendanceStmt->fetch(PDO::FETCH_ASSOC);
    if (!$attendance) {
        return;
    }

    $studentNameStmt = $pdo->prepare('SELECT name FROM users WHERE id = ? AND role = "student" LIMIT 1');
    $studentNameStmt->execute([$studentId]);
    $studentName = (string)($studentNameStmt->fetchColumn() ?: 'Student');

    $attendanceDate = !empty($attendance['log_date']) ? date('F j, Y', strtotime($attendance['log_date'])) : '';
    $attendanceTime = !empty($attendance['event_time']) ? date('g:i A', strtotime($attendance['event_time'])) : '';
    $message = $attendanceDate !== '' && $attendanceTime !== ''
        ? $studentName . ' recorded ' . $eventLabels[$eventType] . ' on ' . $attendanceDate . ' at ' . $attendanceTime . '.'
        : ($attendanceTime !== '' ? $studentName . ' recorded ' . $eventLabels[$eventType] . ' at ' . $attendanceTime . '.' : $studentName . ' recorded ' . $eventLabels[$eventType] . '.');

    $duplicateStmt = $pdo->prepare('SELECT id FROM notifications WHERE user_id = ? AND notification_type = "attendance" AND attendance_id = ? AND message = ? LIMIT 1');
    $duplicateStmt->execute([$resolvedSupervisorId, $attendanceId, $message]);
    if ($duplicateStmt->fetchColumn()) {
        return;
    }

    $insertStmt = $pdo->prepare('INSERT INTO notifications (user_id, role, title, message, type, notification_type, student_id, attendance_id, company_id, supervisor_id, attendance_date, page, url, is_read) VALUES (?, "supervisor", ?, ?, "info", "attendance", ?, ?, ?, ?, ?, "attendance", "", 0)');
    $insertStmt->execute([$resolvedSupervisorId, 'Attendance Recorded', $message, $studentId, $attendanceId, $resolvedCompanyId, $resolvedSupervisorId, !empty($attendance['log_date']) ? $attendance['log_date'] : null]);
}

function attachProgramStudents(PDO $pdo, array $programs): array
{
    $studentsByProgram = [];
    $stmt = $pdo->query("SELECT id, name, email, username, student_id, section, program_id
        FROM users
        WHERE role = 'student' AND status = 'Active' AND program_id IS NOT NULL
        ORDER BY name ASC");
    foreach ($stmt->fetchAll() as $student) {
        $programId = (int) $student['program_id'];
        $studentsByProgram[$programId][] = $student;
    }
    foreach ($programs as &$program) {
        $students = $studentsByProgram[(int) $program['id']] ?? [];
        $program['students_count'] = count($students);
        $program['students_list'] = $students;
    }
    unset($program);
    return $programs;
}

// --- Routing ---
$method = $_SERVER['REQUEST_METHOD'];
$resource = trim($_GET['resource'] ?? '', '/');
$action = trim($_GET['action'] ?? $_POST['action'] ?? '', '/');

// Parse JSON body for PUT/DELETE or content-type: application/json
$body = [];
$contentType = $_SERVER['CONTENT_TYPE'] ?? '';
if (strpos($contentType, 'application/json') !== false) {
    $raw = file_get_contents('php://input');
    $body = json_decode($raw, true) ?: [];
} else {
    $body = $_POST;
}

    // =====================================================
    // ACTIVITY LOGS (read-only audit trail)
    // =====================================================
    if ($resource === 'activity_logs') {
        $user = requireSession();
        requireRole($user, ['admin']);
        if ($method !== 'GET') sendError('Method not allowed.', 405);
        $query = trim($_GET['search'] ?? '');
        $page = max(1, intval($_GET['page'] ?? 1));
        $limit = min(100, max(1, intval($_GET['limit'] ?? 8)));
        $where = '';
        $params = [];
        if ($query !== '') {
            $where = 'WHERE user_name LIKE ? OR action LIKE ? OR description LIKE ?';
            $term = '%' . $query . '%';
            $params = [$term, $term, $term];
        }
        $countStmt = $pdo->prepare("SELECT COUNT(*) FROM activity_logs {$where}");
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();
        $offset = ($page - 1) * $limit;
        $stmt = $pdo->prepare("SELECT id, user_name AS user, role, action, description, created_at AS timestamp
                               FROM activity_logs {$where} ORDER BY created_at DESC, id DESC LIMIT {$limit} OFFSET {$offset}");
        $stmt->execute($params);
        send(['success' => true, 'logs' => $stmt->fetchAll(), 'total' => $total, 'page' => $page, 'limit' => $limit]);
    }

    if ($resource === 'activity_events') {
        $user = requireSession();
        if ($method !== 'POST') sendError('Method not allowed.', 405);
        $allowedActions = ['Generate Report', 'Export Report', 'Print Report', 'Database Backup', 'Database Restore'];
        $eventAction = trim($body['action'] ?? '');
        $description = trim($body['description'] ?? '');
        if (!in_array($eventAction, $allowedActions, true) || $description === '') sendError('Invalid activity event.');
        logActivity($pdo, (int)$user['id'], $eventAction, $description);
        send(['success' => true, 'message' => 'Activity recorded.']);
    }

// =====================================================
// SCHOOL YEARS
// =====================================================
if ($resource === 'school_years') {
    if ($method === 'GET') {
        $stmt = $pdo->query('SELECT * FROM school_years ORDER BY id DESC');
        send(['success' => true, 'school_years' => $stmt->fetchAll()]);
    }

    $user = requireSession();

    if ($method === 'POST' && ($body['_method'] ?? '') !== 'PUT' && ($body['_method'] ?? '') !== 'DELETE') {
        requireRole($user, ['admin']);
        $yearLabel = trim($body['year_label'] ?? '');
        $semester = trim($body['semester'] ?? '');
        $startDate = trim($body['start_date'] ?? '');
        $endDate = trim($body['end_date'] ?? '');
        $studentsCount = intval($body['students_count'] ?? 0);
        $status = trim($body['status'] ?? 'Active');
        if (!$yearLabel || !$semester || !$startDate || !$endDate) {
            sendError('All fields are required.');
        }
        $stmt = $pdo->prepare('INSERT INTO school_years (year_label, semester, start_date, end_date, students_count, status) VALUES (?,?,?,?,?,?)');
        $stmt->execute([$yearLabel, $semester, $startDate, $endDate, $studentsCount, $status]);
        logActivity($pdo, (int)$user['id'], 'Create Academic Year', 'Created academic year ' . $yearLabel . ' (' . $semester . ').');
        send(['success' => true, 'message' => 'School year added.', 'id' => (int)$pdo->lastInsertId()]);
    }

    if ($method === 'PUT' || ($method === 'POST' && ($body['_method'] ?? '') === 'PUT')) {
        requireRole($user, ['admin']);
        $id = intval($body['id'] ?? 0);
        if ($id <= 0) sendError('Invalid ID.');
        $stmt = $pdo->prepare('UPDATE school_years SET year_label=?, semester=?, start_date=?, end_date=?, students_count=?, status=? WHERE id=?');
        $stmt->execute([
            trim($body['year_label'] ?? ''),
            trim($body['semester'] ?? ''),
            trim($body['start_date'] ?? ''),
            trim($body['end_date'] ?? ''),
            intval($body['students_count'] ?? 0),
            trim($body['status'] ?? 'Active'),
            $id,
        ]);
        logActivity($pdo, (int)$user['id'], 'Update Academic Year', 'Updated academic year ' . trim($body['year_label'] ?? '') . '.');
        send(['success' => true, 'message' => 'School year updated.']);
    }

    if ($method === 'DELETE' || ($method === 'POST' && ($body['_method'] ?? '') === 'DELETE')) {
        requireRole($user, ['admin']);
        $id = intval($body['id'] ?? $_GET['id'] ?? 0);
        if ($id <= 0) sendError('Invalid ID.');
        $stmt = $pdo->prepare('DELETE FROM school_years WHERE id=?');
        $stmt->execute([$id]);
        send(['success' => true, 'message' => 'School year deleted.']);
    }
}

// =====================================================
// PROGRAMS
// =====================================================
if ($resource === 'programs') {
    if ($method === 'GET') {
        $stmt = $pdo->query("SELECT p.*, COALESCE(GROUP_CONCAT(DISTINCT u.name ORDER BY u.name SEPARATOR ', '), 'Unassigned') AS coordinator_name
            FROM programs p
            LEFT JOIN users u ON u.program_id = p.id AND u.role = 'coordinator' AND u.status = 'Active'
            GROUP BY p.id
            ORDER BY p.code ASC");
        $rows = attachProgramStudents($pdo, $stmt->fetchAll());
        send(['success' => true, 'programs' => $rows]);
    }

    $user = requireSession();

    if ($method === 'POST' && ($body['_method'] ?? '') !== 'PUT' && ($body['_method'] ?? '') !== 'DELETE') {
        requireRole($user, ['admin']);
        $code = strtoupper(trim($body['code'] ?? ''));
        $name = trim($body['name'] ?? '');
        $reqHours = intval($body['req_hours'] ?? 500);
        $studentsCount = intval($body['students_count'] ?? 0);
        $coordinator = 'Unassigned';
        if (!$code || !$name) sendError('Code and name are required.');
        $nameCheck = $pdo->prepare('SELECT 1 FROM programs WHERE LOWER(name)=LOWER(?) LIMIT 1');
        $nameCheck->execute([$name]);
        if ($nameCheck->fetchColumn()) sendError('Program already exists.', 409);
        // Check unique
        $check = $pdo->prepare('SELECT 1 FROM programs WHERE code=? LIMIT 1');
        $check->execute([$code]);
        if ($check->fetchColumn()) sendError('Program code already exists.', 409);
        $stmt = $pdo->prepare('INSERT INTO programs (code, name, req_hours, students_count, coordinator, students_list) VALUES (?,?,?,?,?,?)');
        $stmt->execute([$code, $name, $reqHours, $studentsCount, $coordinator, '[]']);
        logActivity($pdo, (int)$user['id'], 'Create Program', 'Created program ' . $code . ' - ' . $name . '.');
        send(['success' => true, 'message' => 'Program added.', 'id' => (int)$pdo->lastInsertId()]);
    }

    if ($method === 'PUT' || ($method === 'POST' && ($body['_method'] ?? '') === 'PUT')) {
        requireRole($user, ['admin']);
        $id = intval($body['id'] ?? 0);
        if ($id <= 0) sendError('Invalid ID.');
        $code = strtoupper(trim($body['code'] ?? ''));
        $name = trim($body['name'] ?? '');
        $nameCheck = $pdo->prepare('SELECT 1 FROM programs WHERE LOWER(name)=LOWER(?) AND id<>? LIMIT 1');
        $nameCheck->execute([$name, $id]);
        if ($nameCheck->fetchColumn()) sendError('Program already exists.', 409);
        $codeCheck = $pdo->prepare('SELECT 1 FROM programs WHERE code=? AND id<>? LIMIT 1');
        $codeCheck->execute([$code, $id]);
        if ($codeCheck->fetchColumn()) sendError('Program code already exists.', 409);
        $stmt = $pdo->prepare('UPDATE programs SET code=?, name=?, req_hours=?, students_count=? WHERE id=?');
        $stmt->execute([
            $code,
            $name,
            intval($body['req_hours'] ?? 500),
            intval($body['students_count'] ?? 0),
            $id,
        ]);
        logActivity($pdo, (int)$user['id'], 'Update Program', 'Updated program ' . $code . ' - ' . $name . '.');
        send(['success' => true, 'message' => 'Program updated.']);
    }

    if ($method === 'DELETE' || ($method === 'POST' && ($body['_method'] ?? '') === 'DELETE')) {
        requireRole($user, ['admin']);
        $id = intval($body['id'] ?? $_GET['id'] ?? 0);
        if ($id <= 0) sendError('Invalid ID.');
        $pdo->prepare('DELETE FROM programs WHERE id=?')->execute([$id]);
        logActivity($pdo, (int)$user['id'], 'Delete Program', 'Deleted program #' . $id . '.');
        send(['success' => true, 'message' => 'Program deleted.']);
    }
}

// =====================================================
// COMPANIES
// =====================================================
if ($resource === 'companies') {
    if ($method === 'GET') {
        $search = trim((string)($_GET['search'] ?? ''));
        $search = mb_substr($search, 0, 200);
        $hasPagination = $search !== '' || array_key_exists('page', $_GET) || array_key_exists('limit', $_GET);

        if (!$hasPagination) {
            $stmt = $pdo->query('SELECT * FROM companies ORDER BY name ASC');
            send(['success' => true, 'companies' => $stmt->fetchAll()]);
        }

        $pageSize = max(1, min(100, (int)($_GET['limit'] ?? 10)));
        $page = max(1, (int)($_GET['page'] ?? 1));
        $where = '';
        $searchParams = [];
        if ($search !== '') {
            $where = ' WHERE name LIKE ? OR address LIKE ? OR location LIKE ? OR contact_person LIKE ? OR contact_phone LIKE ? OR contact_email LIKE ? OR status LIKE ?';
            $likeSearch = '%' . $search . '%';
            $searchParams = array_fill(0, 7, $likeSearch);
        }

        $countStmt = $pdo->prepare('SELECT COUNT(*) FROM companies' . $where);
        $countStmt->execute($searchParams);
        $total = (int)$countStmt->fetchColumn();
        $totalPages = max(1, (int)ceil($total / $pageSize));
        $page = min($page, $totalPages);
        $offset = ($page - 1) * $pageSize;

        $stmt = $pdo->prepare('SELECT * FROM companies' . $where . ' ORDER BY name ASC LIMIT ? OFFSET ?');
        foreach ($searchParams as $index => $value) {
            $stmt->bindValue($index + 1, $value, PDO::PARAM_STR);
        }
        $stmt->bindValue(count($searchParams) + 1, $pageSize, PDO::PARAM_INT);
        $stmt->bindValue(count($searchParams) + 2, $offset, PDO::PARAM_INT);
        $stmt->execute();
        send([
            'success' => true,
            'companies' => $stmt->fetchAll(),
            'pagination' => [
                'page' => $page,
                'page_size' => $pageSize,
                'total' => $total,
                'total_pages' => $totalPages,
                'search' => $search,
            ],
        ]);
    }

    $user = requireSession();
    requireRole($user, ['admin', 'coordinator']);

    if ($method === 'POST' && ($body['_method'] ?? '') !== 'PUT' && ($body['_method'] ?? '') !== 'DELETE') {
        $name = trim($body['name'] ?? '');
        $address = trim($body['address'] ?? $body['location'] ?? '');
        $location = trim($body['location'] ?? $address);
        $contactPerson = trim($body['contact_person'] ?? $body['name'] ?? '');
        $contactEmail = trim($body['contact_email'] ?? '');
        $contactPhone = trim($body['contact_phone'] ?? '');
        $coordinates = parseCoordinatePair($body, 'Company');
        $allowedRadius = parseAllowedRadiusMeters($body);
        $status = trim($body['status'] ?? 'Active');
        if (!in_array($status, ['Active', 'Inactive'], true)) {
            sendError('Company status must be Active or Inactive.');
        }
        if (!$name || (!$address && !$location)) sendError('Company name and address/location are required.');
        if ($contactPerson === '') {
            $contactPerson = $name;
        }
        $check = $pdo->prepare('SELECT 1 FROM companies WHERE name=? LIMIT 1');
        $check->execute([$name]);
        if ($check->fetchColumn()) sendError('Company name already exists.', 409);
        $stmt = $pdo->prepare('INSERT INTO companies (name, location, contact_person, address, contact_email, contact_phone, latitude, longitude, allowed_radius_meters, status) VALUES (?,?,?,?,?,?,?,?,?,?)');
        $stmt->execute([$name, $location ?: $address, $contactPerson, $address, $contactEmail, $contactPhone, $coordinates['latitude'] ?? null, $coordinates['longitude'] ?? null, $allowedRadius, $status]);
        $companyId = (int)$pdo->lastInsertId();
        if ($status === 'Active' && $user['role'] === 'admin') {
            try {
                notifyCoordinatorsAboutNewCompany($pdo, $companyId, $name);
            } catch (Throwable $notificationError) {
                error_log('[notifications] New company notification failed: ' . $notificationError->getMessage());
            }
        }
        logActivity($pdo, (int)$user['id'], 'Create Company', 'Added company ' . $name . '.');
        send(['success' => true, 'message' => 'Company added.', 'id' => $companyId, 'contact_person' => $contactPerson]);
    }

    if ($method === 'PUT' || ($method === 'POST' && ($body['_method'] ?? '') === 'PUT')) {
        $id = intval($body['id'] ?? 0);
        if ($id <= 0) sendError('Invalid ID.');
        $address = trim($body['address'] ?? $body['location'] ?? '');
        $location = trim($body['location'] ?? $address);
        $contactPerson = trim($body['contact_person'] ?? '');
        $coordinates = parseCoordinatePair($body, 'Company');
        $allowedRadius = parseAllowedRadiusMeters($body);
        $status = trim($body['status'] ?? 'Active');
        if (!in_array($status, ['Active', 'Inactive'], true)) {
            sendError('Company status must be Active or Inactive.');
        }
        $stmt = $pdo->prepare('UPDATE companies SET name=?, location=?, contact_person=?, address=?, contact_email=?, contact_phone=?, latitude=?, longitude=?, allowed_radius_meters=?, status=? WHERE id=?');
        $stmt->execute([
            trim($body['name'] ?? ''),
            $location ?: $address,
            $contactPerson,
            $address,
            trim($body['contact_email'] ?? ''),
            trim($body['contact_phone'] ?? ''),
            $coordinates['latitude'] ?? null,
            $coordinates['longitude'] ?? null,
            $allowedRadius,
            $status,
            $id,
        ]);
        logActivity($pdo, (int)$user['id'], 'Update Company', 'Updated company ' . trim($body['name'] ?? '') . '.');
        send(['success' => true, 'message' => 'Company updated.']);
    }

    if ($method === 'DELETE' || ($method === 'POST' && ($body['_method'] ?? '') === 'DELETE')) {
        requireRole($user, ['admin']);
        $id = intval($body['id'] ?? $_GET['id'] ?? 0);
        if ($id <= 0) sendError('Invalid ID.');
        $pdo->prepare('DELETE FROM companies WHERE id=?')->execute([$id]);
        logActivity($pdo, (int)$user['id'], 'Delete Company', 'Deleted company #' . $id . '.');
        send(['success' => true, 'message' => 'Company deleted.']);
    }
}

// =====================================================
// ADMIN DETAILED REPORT
// =====================================================
if ($resource === 'admin_report') {
    $user = requireSession();
    requireRole($user, ['admin']);

    if ($method === 'GET') {
        $stmt = $pdo->query(
            'SELECT u.id, u.student_id AS student_no, u.name AS student_name,
                    COALESCE(p.code, p.name, u.program) AS program,
                    c.name AS company_name,
                    co.name AS coordinator_name,
                    company_sup.name AS supervisor_name,
                    COALESCE(a.internship_status, "Pending") AS internship_status,
                    sy.year_label
             FROM users u
             LEFT JOIN programs p ON p.id = u.program_id
             LEFT JOIN assignments a ON a.student_id = u.id
             LEFT JOIN companies c ON c.id = a.company_id
             LEFT JOIN (
                 SELECT program_id, MIN(id) AS coordinator_id
                 FROM users
                 WHERE role = "coordinator" AND status = "Active" AND program_id IS NOT NULL
                 GROUP BY program_id
             ) program_coordinator ON program_coordinator.program_id = u.program_id
             LEFT JOIN users co ON co.id = program_coordinator.coordinator_id
             LEFT JOIN users company_sup ON company_sup.id = (
                 SELECT assigned_sup.id FROM users assigned_sup
                 WHERE assigned_sup.role = "supervisor"
                     AND assigned_sup.status = "Active"
                     AND assigned_sup.company_id = a.company_id
                 ORDER BY assigned_sup.id ASC LIMIT 1
             )
             LEFT JOIN school_years sy ON sy.id = a.school_year_id
             WHERE u.role = "student" AND u.status = "Active"
             ORDER BY u.name ASC'
        );
        $reports = $stmt->fetchAll();
        logActivity($pdo, (int)$user['id'], 'Generate Report', 'Generated the admin internship report.');
        send(['success' => true, 'reports' => $reports]);
    }
}

// =====================================================
// ASSIGNMENTS
// =====================================================
if ($resource === 'company_assignment') {
    $user = requireSession();
    requireRole($user, ['coordinator', 'admin']);

    if ($method === 'GET') {
        $assignedCompanyIds = getCoordinatorCompanyIds($pdo, (int)($user['id'] ?? 0));
        $coordinatorId = (int)($user['id'] ?? 0);

        if ($user['role'] === 'coordinator') {
            $programId = getCoordinatorProgramId($pdo, $user);
            if (empty($assignedCompanyIds)) {
                send(['success' => true, 'companies' => [], 'students' => [], 'company_id' => null, 'company_ids' => [], 'program_id' => $programId, 'message' => 'No Company Assigned']);
            }
            if ($programId === null) {
                send(['success' => true, 'companies' => [], 'students' => [], 'company_id' => null, 'company_ids' => $assignedCompanyIds, 'program_id' => null]);
            }

            $companySql =
                'SELECT c.id, c.name, c.location,
                        sup.id AS supervisor_id, sup.name AS supervisor_name,
                        COUNT(DISTINCT stu.id) AS assigned_students
                 FROM coordinator_company cc
                 JOIN companies c ON c.id = cc.company_id AND c.status = "Active"
                 LEFT JOIN users sup ON sup.id = (
                     SELECT company_sup.id FROM users company_sup
                     WHERE company_sup.role = "supervisor"
                         AND company_sup.status = "Active"
                         AND company_sup.company_id = c.id
                     ORDER BY company_sup.id ASC LIMIT 1
                 )
                 LEFT JOIN assignments a ON a.company_id = c.id
                 LEFT JOIN users stu ON stu.id = a.student_id AND stu.role = "student" AND stu.status = "Active" AND stu.program_id = ?
                 WHERE cc.coordinator_id = ?
                 GROUP BY c.id, c.name, c.location, sup.id, sup.name
                 ORDER BY c.name ASC';
            $companyStmt = $pdo->prepare($companySql);
            $companyStmt->execute([$programId, $coordinatorId]);
            $companies = $companyStmt->fetchAll();

            $studentSql =
                'SELECT u.id, u.name, u.student_id, u.program_id,
                        COALESCE(p.code, p.name, u.program) AS program,
                        a.id AS assignment_id, a.company_id, a.internship_status AS assignment_status,
                        c.name AS company_name
                                    FROM users u
                                    LEFT JOIN assignments a ON a.student_id = u.id
                 LEFT JOIN programs p ON p.id = u.program_id
                 LEFT JOIN companies c ON c.id = a.company_id
                                    WHERE u.role = "student" AND u.status = "Active" AND u.program_id = ?
                 ORDER BY u.name ASC';
            $studentStmt = $pdo->prepare($studentSql);
                            $studentStmt->execute([$programId]);
            $students = $studentStmt->fetchAll();

              send(['success' => true, 'companies' => $companies, 'students' => $students, 'company_id' => getCoordinatorCompanyId($pdo, $user), 'company_ids' => $assignedCompanyIds, 'program_id' => $programId]);
        }

        $companySql =
            'SELECT c.id, c.name, c.location,
                    sup.id AS supervisor_id, sup.name AS supervisor_name,
                    COUNT(a.id) AS assigned_students
             FROM companies c
             LEFT JOIN users sup ON sup.id = (
                 SELECT company_sup.id FROM users company_sup
                 WHERE company_sup.role = "supervisor"
                     AND company_sup.status = "Active"
                     AND company_sup.company_id = c.id
                 ORDER BY company_sup.id ASC LIMIT 1
             )
             LEFT JOIN assignments a ON a.company_id = c.id
             WHERE c.status = "Active"
             GROUP BY c.id, c.name, c.location, sup.id, sup.name
             ORDER BY c.name ASC';
        $companyStmt = $pdo->prepare($companySql);
        $companyStmt->execute();
        $companies = $companyStmt->fetchAll();

        $studentSql =
            'SELECT u.id, u.name, u.student_id, u.program_id,
                    COALESCE(p.code, p.name, u.program) AS program,
                    a.id AS assignment_id, a.company_id, a.internship_status AS assignment_status,
                    c.name AS company_name
             FROM users u
             LEFT JOIN programs p ON p.id = u.program_id
             LEFT JOIN assignments a ON a.student_id = u.id
             LEFT JOIN companies c ON c.id = a.company_id
             WHERE u.role = "student" AND u.status = "Active"
             ORDER BY u.name ASC';
        $studentStmt = $pdo->prepare($studentSql);
        $studentStmt->execute();
        $students = $studentStmt->fetchAll();
        send(['success' => true, 'companies' => $companies, 'students' => $students, 'company_id' => getCoordinatorCompanyId($pdo, $user), 'company_ids' => $assignedCompanyIds]);
    }

    if ($method === 'POST') {
        requireRole($user, ['coordinator']);
        $studentId = intval($body['student_id'] ?? 0);
        $companyId = intval($body['company_id'] ?? 0);
        $remarks = trim($body['remarks'] ?? '');
        if ($studentId <= 0 || $companyId <= 0) sendError('Student and company are required.');

        $assignedCompanyIds = getCoordinatorCompanyIds($pdo, (int)($user['id'] ?? 0));
        if (empty($assignedCompanyIds)) sendError('No Company Assigned.', 403);
        if (!in_array($companyId, $assignedCompanyIds, true)) {
            sendError('You can only assign students to companies assigned to your account.', 403);
        }

        $companyStmt = $pdo->prepare('SELECT id, name FROM companies WHERE id=? AND status="Active" LIMIT 1');
        $companyStmt->execute([$companyId]);
        $company = $companyStmt->fetch();
        if (!$company) sendError('Company not found.');
        $supervisorId = getCompanySupervisorId($pdo, (int)$company['id']);

        $programId = getCoordinatorProgramId($pdo, $user);
        if ($programId === null) sendError('Coordinator has no assigned program.', 403);
        $studentStmt = $pdo->prepare('SELECT id, program_id, program FROM users WHERE id=? AND role="student" AND status="Active" LIMIT 1');
        $studentStmt->execute([$studentId]);
        $student = $studentStmt->fetch();
        if (!$student) sendError('Student not found.');
        if ((int)$student['program_id'] !== $programId) {
            sendError('Student is outside your assigned program.', 403);
        }

        $existingStmt = $pdo->prepare('SELECT id, company_id FROM assignments WHERE student_id=? LIMIT 1');
        $existingStmt->execute([$studentId]);
        $existing = $existingStmt->fetch(PDO::FETCH_ASSOC);
        if ($existing && !empty($existing['company_id'])) {
            sendError('This student is already assigned to a company and cannot be assigned again.', 409);
        }
        if ($existing) {
            $stmt = $pdo->prepare(
                'UPDATE assignments
                 SET company_id=?, supervisor_id=?, coordinator_id=?, program_code=?,
                     remarks=CASE WHEN ? <> "" THEN ? ELSE remarks END, updated_at=NOW()
                 WHERE id=? AND company_id IS NULL'
            );
            $stmt->execute([$companyId, $supervisorId, $user['id'], $student['program'] ?? '', $remarks, $remarks, (int)$existing['id']]);
            if ($stmt->rowCount() !== 1) {
                sendError('This student was assigned to a company by another request. Refresh and try again.', 409);
            }
            $assignmentId = (int)$existing['id'];
        } else {
            $stmt = $pdo->prepare('INSERT INTO assignments (student_id, company_id, supervisor_id, coordinator_id, program_code, internship_status, hours_required, remarks) VALUES (?,?,?,?,?,?,?,?)');
            $stmt->execute([$studentId, $companyId, $supervisorId, $user['id'], $student['program'] ?? '', 'Pending', 500, $remarks]);
            $assignmentId = (int)$pdo->lastInsertId();
        }
        logActivity($pdo, (int)$user['id'], 'Assign Student', 'Assigned ' . $student['name'] . ' to ' . $company['name'] . '.');
        send(['success' => true, 'message' => 'Student assigned.', 'id' => $assignmentId]);
    }
}

if ($resource === 'assignments') {
    $user = requireSession();

    if ($method === 'GET') {
        $role = $user['role'];
        $userId = intval($user['id'] ?? 0);

        if ($role === 'student') {
            $stmt = $pdo->prepare(
                'SELECT a.*, c.name AS company_name, c.location AS company_location,
                        company_sup.name AS supervisor_name, co.name AS coordinator_name,
                        sy.year_label, sy.semester
                 FROM assignments a
                  JOIN users u ON u.id = a.student_id
                 LEFT JOIN companies c ON a.company_id = c.id
                 LEFT JOIN users company_sup ON company_sup.id = (
                     SELECT assigned_sup.id FROM users assigned_sup
                     WHERE assigned_sup.role = "supervisor"
                         AND assigned_sup.status = "Active"
                         AND assigned_sup.company_id = a.company_id
                     ORDER BY assigned_sup.id ASC LIMIT 1
                 )
                  LEFT JOIN (
                      SELECT program_id, MIN(id) AS coordinator_id
                      FROM users
                      WHERE role = "coordinator" AND status = "Active" AND program_id IS NOT NULL
                      GROUP BY program_id
                  ) program_coordinator ON program_coordinator.program_id = u.program_id
                  LEFT JOIN users co ON co.id = program_coordinator.coordinator_id
                 LEFT JOIN school_years sy ON a.school_year_id = sy.id
                 WHERE a.student_id = ? LIMIT 1'
            );
            $stmt->execute([$userId]);
            $assignment = $stmt->fetch();
            send(['success' => true, 'assignment' => $assignment ?: null]);
        } elseif ($role === 'supervisor') {
            $stmt = $pdo->prepare(
                'SELECT a.*, u.name AS student_name, u.student_id AS student_no,
                        COALESCE(p.name, p.code, u.program) AS program, u.section, u.contact,
                        c.name AS company_name,
                        c.location AS company_location,
                        company_sup.name AS supervisor_name,
                        co.name AS coordinator_name,
                        sy.year_label, sy.semester
                 FROM assignments a
                 JOIN users u ON a.student_id = u.id
                 LEFT JOIN programs p ON p.id = u.program_id
                 LEFT JOIN companies c ON a.company_id = c.id
                 LEFT JOIN users company_sup ON company_sup.id = (
                     SELECT assigned_sup.id FROM users assigned_sup
                     WHERE assigned_sup.role = "supervisor"
                         AND assigned_sup.status = "Active"
                         AND assigned_sup.company_id = a.company_id
                     ORDER BY assigned_sup.id ASC LIMIT 1
                 )
                 LEFT JOIN (
                     SELECT program_id, MIN(id) AS coordinator_id
                     FROM users
                     WHERE role = "coordinator" AND status = "Active" AND program_id IS NOT NULL
                     GROUP BY program_id
                 ) program_coordinator ON program_coordinator.program_id = u.program_id
                 LEFT JOIN users co ON co.id = program_coordinator.coordinator_id
                 LEFT JOIN school_years sy ON a.school_year_id = sy.id
                 JOIN users supervisor ON supervisor.id = ?
                    AND supervisor.role = "supervisor"
                    AND supervisor.status = "Active"
                    AND supervisor.company_id = a.company_id
                 WHERE u.role = "student" AND u.status = "Active"
                 ORDER BY u.name ASC'
            );
            $stmt->execute([$userId]);
            send(['success' => true, 'assignments' => $stmt->fetchAll()]);
        } elseif ($role === 'coordinator') {
            $coordProgramId = getCoordinatorProgramId($pdo, $user);
            $sql = 'SELECT a.*, u.name AS student_name, u.student_id AS student_no,
                           u.program, u.section, u.contact,
                           c.name AS company_name,
                           company_sup.name AS supervisor_name,
                           sy.year_label, sy.semester
                    FROM assignments a
                    JOIN users u ON a.student_id = u.id
                    LEFT JOIN companies c ON a.company_id = c.id
                    LEFT JOIN users company_sup ON company_sup.id = (
                        SELECT assigned_sup.id FROM users assigned_sup
                        WHERE assigned_sup.role = "supervisor"
                            AND assigned_sup.status = "Active"
                            AND assigned_sup.company_id = a.company_id
                        ORDER BY assigned_sup.id ASC LIMIT 1
                    )
                    LEFT JOIN school_years sy ON a.school_year_id = sy.id
                        WHERE a.coordinator_id = ? AND u.program_id = ?';
                    $params = [$userId, $coordProgramId ?? 0];
            if (!empty($_GET['program'])) {
                $sql .= ' AND a.program_code = ?';
                $params[] = $_GET['program'];
            }
            $sql .= ' ORDER BY u.name ASC';
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            send(['success' => true, 'assignments' => $stmt->fetchAll()]);
        } else {
            // admin — fetch all
            $stmt = $pdo->query(
                'SELECT a.*, u.name AS student_name, u.student_id AS student_no,
                        COALESCE(p.name, p.code, u.program) AS program, u.section,
                        c.name AS company_name,
                        company_sup.name AS supervisor_name,
                        co.name AS coordinator_name,
                        sy.year_label
                 FROM assignments a
                 JOIN users u ON a.student_id = u.id
                 LEFT JOIN programs p ON p.id = u.program_id
                 LEFT JOIN companies c ON a.company_id = c.id
                 LEFT JOIN users company_sup ON company_sup.id = (
                     SELECT assigned_sup.id FROM users assigned_sup
                     WHERE assigned_sup.role = "supervisor"
                         AND assigned_sup.status = "Active"
                         AND assigned_sup.company_id = a.company_id
                     ORDER BY assigned_sup.id ASC LIMIT 1
                 )
                 LEFT JOIN (
                     SELECT program_id, MIN(id) AS coordinator_id
                     FROM users
                     WHERE role = "coordinator" AND status = "Active" AND program_id IS NOT NULL
                     GROUP BY program_id
                 ) program_coordinator ON program_coordinator.program_id = u.program_id
                 LEFT JOIN users co ON co.id = program_coordinator.coordinator_id
                 LEFT JOIN school_years sy ON a.school_year_id = sy.id
                 ORDER BY a.assigned_at DESC'
            );
            send(['success' => true, 'assignments' => $stmt->fetchAll()]);
        }
    }

    if ($method === 'POST' && ($body['_method'] ?? '') !== 'PUT' && ($body['_method'] ?? '') !== 'DELETE') {
        requireRole($user, ['admin', 'coordinator']);
        $studentId = intval($body['student_id'] ?? 0);
        if ($studentId <= 0) sendError('Student ID is required.');
        $companyId = !empty($body['company_id']) ? intval($body['company_id']) : null;
        $supervisorId = !empty($body['supervisor_id']) ? intval($body['supervisor_id']) : null;
        $coordinatorId = !empty($body['coordinator_id']) ? intval($body['coordinator_id']) : null;
        $schoolYearId = !empty($body['school_year_id']) ? intval($body['school_year_id']) : null;
        $programCode = trim($body['program_code'] ?? '');
        $status = trim($body['internship_status'] ?? 'Pending');
        $hoursRequired = intval($body['hours_required'] ?? 500);
        $remarks = trim($body['remarks'] ?? '');

        if ($user['role'] === 'coordinator') {
            $coordProgramId = getCoordinatorProgramId($pdo, $user);
            $studentProgram = $pdo->prepare('SELECT program_id FROM users WHERE id=? AND role="student" AND status="Active" LIMIT 1');
            $studentProgram->execute([$studentId]);
            if ($coordProgramId === null || (int)$studentProgram->fetchColumn() !== $coordProgramId) {
                sendError('Student is outside your assigned program.', 403);
            }
            $lockedCompany = $pdo->prepare('SELECT company_id FROM assignments WHERE student_id=? LIMIT 1');
            $lockedCompany->execute([$studentId]);
            $lockedCompanyId = $lockedCompany->fetchColumn();
            if (!$lockedCompanyId) sendError('No company assigned by Admin for this student.');
            if (array_key_exists('company_id', $body) && intval($body['company_id']) !== intval($lockedCompanyId)) {
                sendError('Coordinators cannot change the Admin-assigned company.');
            }
            $companyId = intval($lockedCompanyId);
        }

        // Always attach the active head of the final assigned company.
        $supervisorId = getCompanySupervisorId($pdo, $companyId);

        // Upsert assignment
        $existing = $pdo->prepare('SELECT id FROM assignments WHERE student_id=? LIMIT 1');
        $existing->execute([$studentId]);
        $existingRow = $existing->fetch();

        if ($existingRow && $user['role'] === 'coordinator') {
            $stmt = $pdo->prepare('UPDATE assignments SET remarks=?, updated_at=NOW() WHERE student_id=?');
            $stmt->execute([$remarks, $studentId]);
            logActivity($pdo, (int)$user['id'], 'Update Assignment', 'Updated assignment notes for student #' . $studentId . '.');
            send(['success' => true, 'message' => 'Assignment note updated.', 'id' => $existingRow['id']]);
        } elseif ($existingRow) {
            $stmt = $pdo->prepare('UPDATE assignments SET company_id=?, supervisor_id=?, coordinator_id=?, school_year_id=?, program_code=?, internship_status=?, hours_required=?, remarks=?, updated_at=NOW() WHERE student_id=?');
            $stmt->execute([$companyId, $supervisorId, $coordinatorId, $schoolYearId, $programCode, $status, $hoursRequired, $remarks, $studentId]);
            logActivity($pdo, (int)$user['id'], 'Update Assignment', 'Updated assignment for student #' . $studentId . '.');
            send(['success' => true, 'message' => 'Assignment updated.', 'id' => $existingRow['id']]);
        } else {
            $stmt = $pdo->prepare('INSERT INTO assignments (student_id, company_id, supervisor_id, coordinator_id, school_year_id, program_code, internship_status, hours_required, remarks) VALUES (?,?,?,?,?,?,?,?,?)');
            $stmt->execute([$studentId, $companyId, $supervisorId, $coordinatorId, $schoolYearId, $programCode, $status, $hoursRequired, $remarks]);
            logActivity($pdo, (int)$user['id'], 'Assign Student', 'Assigned student #' . $studentId . ' to company #' . ($companyId ?: 'unassigned') . '.');
            send(['success' => true, 'message' => 'Assignment created.', 'id' => (int)$pdo->lastInsertId()]);
        }
    }

    if ($method === 'PUT' || ($method === 'POST' && ($body['_method'] ?? '') === 'PUT')) {
        requireRole($user, ['admin', 'coordinator', 'supervisor']);
        $id = intval($body['id'] ?? 0);
        if ($id <= 0) sendError('Invalid ID.');

        if (array_key_exists('company_id', $body)) {
            $companyId = $body['company_id'] === '' ? null : intval($body['company_id']);
        } else {
            $companyStmt = $pdo->prepare('SELECT company_id FROM assignments WHERE id=? LIMIT 1');
            $companyStmt->execute([$id]);
            $companyId = $companyStmt->fetchColumn();
            $companyId = $companyId ? (int)$companyId : null;
        }
        $body['supervisor_id'] = getCompanySupervisorId($pdo, $companyId);

        // Build partial update
        $fields = [];
        $params = [];
        $allowedFields = ['company_id', 'supervisor_id', 'coordinator_id', 'school_year_id',
                          'program_code', 'internship_status', 'hours_completed', 'hours_required',
                          'evaluation_score', 'completion_cleared', 'remarks'];
        foreach ($allowedFields as $f) {
            if (array_key_exists($f, $body)) {
                $fields[] = "$f=?";
                $params[] = $body[$f] === '' ? null : $body[$f];
            }
        }
        if (empty($fields)) sendError('Nothing to update.');
        $fields[] = 'updated_at=NOW()';
        $params[] = $id;
        $pdo->prepare('UPDATE assignments SET ' . implode(',', $fields) . ' WHERE id=?')->execute($params);
        logActivity($pdo, (int)$user['id'], 'Update Assignment', 'Updated assignment #' . $id . '.');
        send(['success' => true, 'message' => 'Assignment updated.']);
    }
}

// =====================================================
// ATTENDANCE
// =====================================================
if ($resource === 'attendance') {
    $user = requireSession();
    $userId = intval($user['id'] ?? 0);

    if ($method === 'GET') {
        if ($user['role'] === 'student') {
            $stmt = $pdo->prepare('SELECT * FROM attendance_logs WHERE student_id=? ORDER BY log_date DESC LIMIT 60');
            $stmt->execute([$userId]);
            send(['success' => true, 'attendance' => enrichAttendanceRows($stmt->fetchAll())]);
        } elseif ($user['role'] === 'supervisor') {
            $stmt = $pdo->prepare(
                'SELECT al.*, u.name AS student_name, c.name AS company_name FROM attendance_logs al
                 JOIN users u ON al.student_id = u.id
                 JOIN assignments a ON al.student_id = a.student_id
                 JOIN users supervisor ON supervisor.id = ?
                    AND supervisor.role = "supervisor"
                    AND supervisor.status = "Active"
                    AND supervisor.company_id = a.company_id
                 LEFT JOIN companies c ON c.id = a.company_id
                 WHERE u.role = "student" AND u.status = "Active"
                 ORDER BY al.log_date DESC, al.student_id ASC LIMIT 300'
            );
            $stmt->execute([$userId]);
            send(['success' => true, 'attendance' => enrichAttendanceRows($stmt->fetchAll())]);
        } elseif ($user['role'] === 'coordinator') {
            try {
                $programId = getCoordinatorProgramId($pdo, $user);
                if ($programId === null) {
                    error_log('[attendance][coordinator] No active program is configured for coordinator user #' . $userId . '.');
                    sendError('Coordinator program is not configured. Check the coordinator user record.', 422);
                }
                $stmt = $pdo->prepare(
                    'SELECT al.*, u.student_id AS student_identifier, u.name AS student_name,
                            COALESCE(p.code, p.name, u.program) AS program,
                            a.id AS assignment_id, c.name AS company_name
                     FROM attendance_logs al
                     JOIN users u ON al.student_id = u.id
                     LEFT JOIN programs p ON p.id = u.program_id
                     LEFT JOIN assignments a ON a.student_id = u.id
                     LEFT JOIN companies c ON a.company_id = c.id
                     WHERE u.role = "student" AND u.status = "Active" AND u.program_id = ?
                     ORDER BY al.log_date DESC, u.name ASC LIMIT 500'
                );
                $stmt->execute([$programId]);
                send(['success' => true, 'attendance' => enrichAttendanceRows($stmt->fetchAll())]);
            } catch (Throwable $e) {
                error_log('[attendance][coordinator] Query failed for coordinator #' . $userId . ': ' . $e->getMessage());
                sendError('Unable to load coordinator attendance records. Check the server log for the database error.', 500);
            }
        } else {
            $stmt = $pdo->query(
                'SELECT al.*, u.name AS student_name, c.name AS company_name
                 FROM attendance_logs al
                 JOIN users u ON al.student_id = u.id
                 LEFT JOIN assignments a ON al.student_id = a.student_id
                 LEFT JOIN companies c ON a.company_id = c.id
                 ORDER BY al.log_date DESC LIMIT 500'
            );
            send(['success' => true, 'attendance' => enrichAttendanceRows($stmt->fetchAll())]);
        }
    }

    if ($method === 'POST') {
        requireRole($user, ['student']);
        $action = trim($body['action'] ?? '');
        if ($action === 'validate_location') {
            $location = validateAttendanceLocation($pdo, $userId, $body);
            send([
                'success' => true,
                'message' => 'Location verified.',
                'distance_meters' => round($location['distance_meters'], 2),
                'allowed_radius_meters' => $location['allowed_radius_meters'],
            ]);
        }
        $legacyActions = ['time_in' => 'morning_time_in', 'time_out' => 'morning_time_out'];
        $eventType = $legacyActions[$action] ?? $action;
        $eventColumns = [
            'morning_time_in' => ['time_in', 'face_snapshot_in', 'time_in_latitude', 'time_in_longitude', 'time_in_accuracy', 'time_in_address', 'time_in_distance', 'time_in_distance_meters', 'time_in_location_status', 'verification_status'],
            'morning_time_out' => ['time_out', 'face_snapshot_out', 'time_out_latitude', 'time_out_longitude', 'time_out_accuracy', 'time_out_address', 'time_out_distance', 'time_out_distance_meters', 'time_out_location_status', 'time_out_verification_status'],
            'afternoon_time_in' => ['afternoon_time_in', 'afternoon_face_snapshot_in', 'afternoon_time_in_latitude', 'afternoon_time_in_longitude', 'afternoon_time_in_accuracy', 'afternoon_time_in_address', 'afternoon_time_in_distance', 'afternoon_time_in_distance_meters', 'afternoon_time_in_location_status', 'afternoon_time_in_verification_status'],
            'afternoon_time_out' => ['afternoon_time_out', 'afternoon_face_snapshot_out', 'afternoon_time_out_latitude', 'afternoon_time_out_longitude', 'afternoon_time_out_accuracy', 'afternoon_time_out_address', 'afternoon_time_out_distance', 'afternoon_time_out_distance_meters', 'afternoon_time_out_location_status', 'afternoon_time_out_verification_status'],
        ];
        $eventLabels = [
            'morning_time_in' => 'Morning Time In',
            'morning_time_out' => 'Morning Time Out',
            'afternoon_time_in' => 'Afternoon Time In',
            'afternoon_time_out' => 'Afternoon Time Out',
        ];
        if (!isset($eventColumns[$eventType])) {
            sendError('Invalid attendance event.', 400);
        }

        $location = validateAttendanceLocation($pdo, $userId, $body);
        $faceEncoding = trim($body['face_encoding'] ?? '');
        verifyStudentFace($pdo, $userId, $faceEncoding);
        $faceSnapshot = trim($body['face_snapshot'] ?? '');
        if ($faceSnapshot === '') {
            sendError('A verified face capture is required.', 400);
        }

        $today = date('Y-m-d');
        $now = date('Y-m-d H:i:s');
        $nowTimestamp = strtotime($now);
        $assignStmt = $pdo->prepare('SELECT id FROM assignments WHERE student_id=? ORDER BY updated_at DESC, id DESC LIMIT 1');
        $assignStmt->execute([$userId]);
        $assignmentId = (int)($assignStmt->fetchColumn() ?: 0);
        $sequenceColumns = ['time_in', 'time_out', 'afternoon_time_in', 'afternoon_time_out'];
        $sequenceEvents = ['morning_time_in', 'morning_time_out', 'afternoon_time_in', 'afternoon_time_out'];
        $morningSeconds = null;
        $afternoonSeconds = null;
        $totalSeconds = 0;
        $morningMinutes = null;
        $afternoonMinutes = null;
        $totalMinutes = 0;
        $status = 'Present';

        $pdo->beginTransaction();
        try {
            $ensureDailyRow = $pdo->prepare(
                'INSERT INTO attendance_logs (student_id, assignment_id, log_date) VALUES (?,?,?)
                 ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)'
            );
            $ensureDailyRow->execute([$userId, $assignmentId > 0 ? $assignmentId : null, $today]);

            $attendanceStmt = $pdo->prepare('SELECT * FROM attendance_logs WHERE student_id=? AND log_date=? LIMIT 1 FOR UPDATE');
            $attendanceStmt->execute([$userId, $today]);
            $row = $attendanceStmt->fetch(PDO::FETCH_ASSOC);
            if (!$row) {
                throw new RuntimeException('Unable to lock today attendance row.');
            }

            $expectedEvent = null;
            foreach ($sequenceEvents as $index => $candidateEvent) {
                if (empty($row[$sequenceColumns[$index]])) {
                    $expectedEvent = $candidateEvent;
                    break;
                }
            }
            if ($expectedEvent !== $eventType) {
                $pdo->rollBack();
                $message = $expectedEvent === null
                    ? 'All four attendance events are already recorded for today.'
                    : 'Record ' . $eventLabels[$expectedEvent] . ' before ' . $eventLabels[$eventType] . '.';
                sendError($message, 409);
            }

            $eventIndex = array_search($eventType, $sequenceEvents, true);
            if ($eventIndex > 0) {
                $previousTimestamp = strtotime((string)$row[$sequenceColumns[$eventIndex - 1]]);
                if ($previousTimestamp === false || $nowTimestamp === false || $nowTimestamp <= $previousTimestamp) {
                    $pdo->rollBack();
                    sendError('Attendance events must be recorded in chronological order.', 409);
                }
            }

            [$timestampColumn, $snapshotColumn, $latitudeColumn, $longitudeColumn, $accuracyColumn, $addressColumn, $distanceColumn, $distanceMetersColumn, $locationStatusColumn, $verificationColumn] = $eventColumns[$eventType];
            $row[$timestampColumn] = $now;
            $morningSeconds = calculateAttendancePairSeconds($row['time_in'] ?? null, $row['time_out'] ?? null);
            $afternoonSeconds = calculateAttendancePairSeconds($row['afternoon_time_in'] ?? null, $row['afternoon_time_out'] ?? null);
            $totalSeconds = ($morningSeconds ?? 0) + ($afternoonSeconds ?? 0);
            $morningMinutes = $morningSeconds === null ? null : (int)round($morningSeconds / 60);
            $afternoonMinutes = $afternoonSeconds === null ? null : (int)round($afternoonSeconds / 60);
            $totalMinutes = (int)round($totalSeconds / 60);
            $status = $row['status'] ?: 'Present';
            if ($eventType === 'morning_time_in') {
                $lateThreshold = strtotime($today . ' 08:15:00');
                $status = $nowTimestamp > $lateThreshold ? 'Late' : 'Present';
            }

            $updateSql = "UPDATE attendance_logs SET `$timestampColumn`=?, `$snapshotColumn`=?, `$latitudeColumn`=?, `$longitudeColumn`=?, `$accuracyColumn`=?, `$addressColumn`=NULL, `$distanceColumn`=?, `$distanceMetersColumn`=?, `$locationStatusColumn`='Verified', `$verificationColumn`='Verified', duration_minutes=?, status=? WHERE id=?";
            $updateStmt = $pdo->prepare($updateSql);
            $updateStmt->execute([
                $now,
                $faceSnapshot,
                $location['latitude'],
                $location['longitude'],
                $location['accuracy'],
                $location['distance_meters'],
                $location['distance_meters'],
                $totalMinutes,
                $status,
                (int)$row['id'],
            ]);
            $pdo->prepare(
                'UPDATE assignments
                 SET hours_completed = (
                     SELECT COALESCE(SUM(
                        CASE WHEN time_in IS NOT NULL AND time_out IS NOT NULL AND time_out >= time_in
                            THEN TIMESTAMPDIFF(SECOND, time_in, time_out) ELSE 0 END
                        + CASE WHEN afternoon_time_in IS NOT NULL AND afternoon_time_out IS NOT NULL AND afternoon_time_out >= afternoon_time_in
                              THEN TIMESTAMPDIFF(SECOND, afternoon_time_in, afternoon_time_out) ELSE 0 END
                     ), 0) / 3600.0
                     FROM attendance_logs WHERE student_id=?
                 )
                 WHERE student_id=?'
            )->execute([$userId, $userId]);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log('[attendance] Event write failed for student #' . $userId . ': ' . $error->getMessage());
            sendError('Unable to record this attendance event. Please try again.', 500);
        }

        createAttendanceSupervisorNotification($pdo, $userId, (int)$row['id'], $eventType);
        logActivity($pdo, $userId, 'Attendance', 'Recorded ' . $eventLabels[$eventType] . ' for ' . $today . '.');
        send([
            'success' => true,
            'message' => $eventLabels[$eventType] . ' recorded.',
            'event_type' => $eventType,
            'status' => $status,
            'time' => $now,
            'morning_minutes' => $morningMinutes,
            'afternoon_minutes' => $afternoonMinutes,
            'total_minutes' => $totalMinutes,
            'morning_seconds' => $morningSeconds,
            'afternoon_seconds' => $afternoonSeconds,
            'total_seconds' => $totalSeconds,
            'location_status' => 'Verified',
            'distance_meters' => round($location['distance_meters'], 2),
        ]);
    }
}

// =====================================================
// TASKS
// =====================================================
if ($resource === 'tasks') {
    $user = requireSession();
    $userId = intval($user['id'] ?? 0);

    $allowedTaskStatuses = ['Pending', 'Ongoing', 'Completed', 'Rejected / Needs Revision'];

    if ($method === 'GET') {
        if ($user['role'] === 'student') {
            $stmt = $pdo->prepare(
                'SELECT t.*, u.name AS supervisor_name,
                        ts.id AS submission_id, ts.status AS submission_status,
                        ts.is_late, ts.file_name, ts.submitted_at, ts.supervisor_comment,
                        ts.rejection_reason, ts.reviewed_at, ts.reviewed_by
                 FROM tasks t
                 JOIN users u ON t.supervisor_id = u.id
                 LEFT JOIN task_submissions ts ON ts.task_id = t.id AND ts.student_id = ?
                 WHERE t.student_id = ?
                 ORDER BY t.due_date ASC'
            );
            $stmt->execute([$userId, $userId]);
            send(['success' => true, 'tasks' => $stmt->fetchAll()]);
        } elseif ($user['role'] === 'supervisor') {
            $stmt = $pdo->prepare(
                'SELECT t.*, student.name AS student_name, student.student_id AS student_no,
                       MAX(a.company_id) AS company_id,
                       COUNT(DISTINCT ts.id) AS submission_count,
                       COUNT(DISTINCT CASE WHEN ts.status IN ("Approved","Rejected") THEN ts.id END) AS reviewed_count
                 FROM tasks t
                 JOIN users supervisor ON supervisor.id = ?
                    AND supervisor.role = "supervisor"
                    AND supervisor.status = "Active"
                   LEFT JOIN users student ON student.id = t.student_id AND student.role = "student" AND student.status = "Active"
                   LEFT JOIN assignments a ON a.student_id = student.id AND a.company_id = supervisor.company_id
                 LEFT JOIN task_submissions ts ON ts.task_id = t.id
                   WHERE t.supervisor_id = supervisor.id
                     AND (t.assignee_type = "all" OR (student.id IS NOT NULL AND a.student_id IS NOT NULL))
                 GROUP BY t.id
                 ORDER BY t.created_at DESC'
            );
            $stmt->execute([$userId]);
            send(['success' => true, 'tasks' => $stmt->fetchAll()]);
        } else {
            // admin/coordinator — all tasks
            $stmt = $pdo->query(
                'SELECT t.*, u.name AS supervisor_name,
                        COUNT(ts.id) AS submission_count
                 FROM tasks t
                 JOIN users u ON t.supervisor_id = u.id
                 LEFT JOIN task_submissions ts ON ts.task_id = t.id
                 GROUP BY t.id
                 ORDER BY t.created_at DESC'
            );
            send(['success' => true, 'tasks' => $stmt->fetchAll()]);
        }
    }

    if ($method === 'POST' && ($body['action'] ?? '') === 'start_task') {
        requireRole($user, ['student']);
        $id = intval($body['id'] ?? 0);
        if ($id <= 0) sendError('Invalid task ID.');
        $stmt = $pdo->prepare('UPDATE tasks SET status="Ongoing", started_at=COALESCE(started_at, NOW()) WHERE id=? AND student_id=? AND status IN ("Pending","Ongoing")');
        $stmt->execute([$id, $userId]);
        if ($stmt->rowCount() !== 1) sendError('Task cannot be started.', 409);
        $startedStmt = $pdo->prepare('SELECT started_at FROM tasks WHERE id=? AND student_id=? LIMIT 1');
        $startedStmt->execute([$id, $userId]);
        send(['success' => true, 'message' => 'Task started.', 'started_at' => $startedStmt->fetchColumn()]);
    }

    if (($method === 'PUT' || ($method === 'POST' && ($body['_method'] ?? '') === 'PUT')) && $user['role'] === 'student') {
        $id = intval($body['id'] ?? 0);
        $status = trim($body['status'] ?? '');
        sendError('Task status is controlled by the task workflow.', 409);
    }

    if ($method === 'POST' && ($body['_method'] ?? '') !== 'PUT' && ($body['_method'] ?? '') !== 'DELETE') {
        requireRole($user, ['supervisor', 'admin']);
        $title = trim($body['title'] ?? '');
        $description = trim($body['description'] ?? '');
        $studentId = intval($body['student_id'] ?? 0);
        $dueDate = trim($body['due_date'] ?? '') ?: null;
        $status = 'Pending';
        if (!$title) sendError('Task title is required.');
        if ($studentId <= 0) sendError('A student must be selected.');
        $supervisorId = ($user['role'] === 'supervisor') ? $userId : intval($body['supervisor_id'] ?? $userId);
        $studentCheck = $pdo->prepare(
            'SELECT u.id
             FROM users u
             JOIN assignments a ON a.student_id = u.id AND a.company_id IS NOT NULL
             JOIN users supervisor ON supervisor.id = ?
                AND supervisor.role = "supervisor"
                AND supervisor.status = "Active"
                AND supervisor.company_id = a.company_id
             WHERE u.id = ? AND u.role = "student" AND u.status = "Active"
             LIMIT 1'
        );
        $studentCheck->execute([$supervisorId, $studentId]);
        if (!$studentCheck->fetchColumn()) sendError('Student is not assigned to your company.', 403);

        $pdo->beginTransaction();
        $supervisorLock = $pdo->prepare('SELECT id FROM users WHERE id=? FOR UPDATE');
        $supervisorLock->execute([$supervisorId]);
        $duplicateCheck = $pdo->prepare(
            'SELECT id FROM tasks
             WHERE supervisor_id=? AND student_id=? AND title=?
                 AND ((due_date = ?) OR (due_date IS NULL AND ? IS NULL))
             LIMIT 1'
        );
        $duplicateCheck->execute([$supervisorId, $studentId, $title, $dueDate, $dueDate]);
        if ($duplicateCheck->fetchColumn()) {
            $pdo->rollBack();
            sendError('This task has already been assigned to this student.', 409);
        }
        $stmt = $pdo->prepare('INSERT INTO tasks (title, description, supervisor_id, student_id, assignee_type, assignee_ids, due_date, status) VALUES (?,?,?,?,?,?,?,?)');
        $stmt->execute([$title, $description, $supervisorId, $studentId, 'specific', json_encode([$studentId]), $dueDate, $status]);
        $taskId = (int)$pdo->lastInsertId();
        $notificationCheck = $pdo->prepare("SELECT id FROM notifications WHERE user_id=? AND notification_type='task_assigned' AND task_id=? LIMIT 1");
        $notificationCheck->execute([$studentId, $taskId]);
        if (!$notificationCheck->fetchColumn()) {
            $notificationStmt = $pdo->prepare("INSERT INTO notifications (user_id, role, title, message, type, notification_type, task_id, is_read, page) VALUES (?, 'student', ?, ?, 'info', 'task_assigned', ?, 0, 'tasks')");
            $notificationStmt->execute([$studentId, 'New Task Assigned', 'You have been assigned a new task: ' . $title, $taskId]);
        }
        $pdo->commit();
        $studentNameStmt = $pdo->prepare('SELECT name FROM users WHERE id=? LIMIT 1');
        $studentNameStmt->execute([$studentId]);
        logActivity($pdo, (int)$user['id'], 'Create Task', 'Assigned task "' . $title . '" to ' . ($studentNameStmt->fetchColumn() ?: 'student') . '.');
        send(['success' => true, 'message' => 'Task created.', 'id' => $taskId]);
    }

    if ($method === 'PUT' || ($method === 'POST' && ($body['_method'] ?? '') === 'PUT')) {
        requireRole($user, ['supervisor', 'admin']);
        $id = intval($body['id'] ?? 0);
        if ($id <= 0) sendError('Invalid ID.');
        $currentTask = $pdo->prepare('SELECT t.status, t.title, t.description, t.due_date, u.name AS student_name
                          FROM tasks t LEFT JOIN users u ON u.id = t.student_id
                          WHERE t.id=? AND t.supervisor_id=? FOR UPDATE');
        $currentTask->execute([$id, $userId]);
        $currentTask = $currentTask->fetch(PDO::FETCH_ASSOC);
        if (!$currentTask) sendError('Task not found.', 404);
        $stmt = $pdo->prepare('UPDATE tasks SET title=?, description=?, due_date=? WHERE id=? AND supervisor_id=?');
        $stmt->execute([
            trim($body['title'] ?? ''),
            trim($body['description'] ?? ''),
            trim($body['due_date'] ?? '') ?: null,
            $id,
            $userId,
        ]);
        $actionName = 'Update Task';
        $taskLabel = $currentTask['title'] ?? ('#' . $id);
        $studentLabel = $currentTask['student_name'] ?? 'student';
        $description = 'Updated task "' . $taskLabel . '" for ' . $studentLabel . '.';
        logActivity($pdo, (int)$user['id'], $actionName, $description);
        send(['success' => true, 'message' => 'Task updated.']);
    }

    if ($method === 'DELETE' || ($method === 'POST' && ($body['_method'] ?? '') === 'DELETE')) {
        requireRole($user, ['supervisor', 'admin']);
        $id = intval($body['id'] ?? $_GET['id'] ?? 0);
        if ($id <= 0) sendError('Invalid ID.');
        $taskTitle = $pdo->prepare('SELECT title FROM tasks WHERE id=? LIMIT 1');
        $taskTitle->execute([$id]);
        $taskTitle = $taskTitle->fetchColumn();
        $pdo->prepare('DELETE FROM tasks WHERE id=?')->execute([$id]);
        logActivity($pdo, (int)$user['id'], 'Delete Task', 'Deleted task "' . ($taskTitle ?: ('#' . $id)) . '".');
        send(['success' => true, 'message' => 'Task deleted.']);
    }
}

// =====================================================
// TASK SUBMISSIONS
// =====================================================
if ($resource === 'submissions') {
    $user = requireSession();
    $userId = intval($user['id'] ?? 0);

    if ($method === 'GET') {
        if (!empty($_GET['download'])) {
            requireRole($user, ['supervisor', 'admin']);
            $submissionId = intval($_GET['download']);
            if ($user['role'] === 'admin') {
                $downloadStmt = $pdo->prepare('SELECT file_name, file_path FROM task_submissions WHERE id = ? LIMIT 1');
                $downloadStmt->execute([$submissionId]);
            } else {
                $downloadStmt = $pdo->prepare(
                    'SELECT ts.file_name, ts.file_path
                     FROM task_submissions ts
                     JOIN tasks t ON t.id = ts.task_id
                     JOIN assignments a ON a.student_id = ts.student_id
                     JOIN users supervisor ON supervisor.id = ?
                        AND supervisor.role = "supervisor"
                        AND supervisor.status = "Active"
                        AND supervisor.company_id = a.company_id
                     WHERE ts.id = ? AND t.supervisor_id = supervisor.id
                     LIMIT 1'
                );
                $downloadStmt->execute([(int)$user['id'], $submissionId]);
            }
            $uploadRoot = realpath(dirname(__DIR__) . '/uploads/submissions');
            $download = $downloadStmt->fetch();
            if (!$download || !$uploadRoot) sendError('Submitted file not found.', 404);

            $file = !empty($download['file_path'])
                ? realpath(dirname(__DIR__) . '/' . ltrim($download['file_path'], '/\\'))
                : false;

            if (!$file || strpos($file, $uploadRoot . DIRECTORY_SEPARATOR) !== 0 || !is_file($file)) {
                sendError('Submitted file is unavailable.', 404);
            }
            header('Content-Type: ' . (mime_content_type($file) ?: 'application/octet-stream'));
            $downloadName = preg_replace('/[\r\n"]/', '_', basename($download['file_name'] ?: $file));
            header('Content-Disposition: inline; filename="' . $downloadName . '"');
            header('Content-Length: ' . filesize($file));
            readfile($file);
            exit;
        }
        if ($user['role'] === 'student') {
            $stmt = $pdo->prepare(
                'SELECT ts.*, t.title AS task_title, t.due_date
                 FROM task_submissions ts
                 JOIN tasks t ON ts.task_id = t.id
                 WHERE ts.student_id = ?
                 ORDER BY ts.submitted_at DESC'
            );
            $stmt->execute([$userId]);
            send(['success' => true, 'submissions' => $stmt->fetchAll()]);
        } elseif ($user['role'] === 'supervisor') {
            $stmt = $pdo->prepare(
                'SELECT ts.*, t.title AS task_title, t.due_date, t.supervisor_id, u.name AS student_name
                 FROM task_submissions ts
                 JOIN tasks t ON ts.task_id = t.id
                 JOIN users u ON ts.student_id = u.id
                      JOIN assignments a ON a.student_id = ts.student_id
                      JOIN users supervisor ON supervisor.id = ?
                          AND supervisor.role = "supervisor"
                          AND supervisor.status = "Active"
                          AND supervisor.company_id = a.company_id
                      WHERE t.supervisor_id = supervisor.id
                 ORDER BY ts.submitted_at DESC'
            );
            $stmt->execute([$userId]);
            send(['success' => true, 'submissions' => $stmt->fetchAll()]);
        } else {
            $stmt = $pdo->query(
                'SELECT ts.*, t.title AS task_title, u.name AS student_name
                 FROM task_submissions ts
                 JOIN tasks t ON ts.task_id = t.id
                 JOIN users u ON ts.student_id = u.id
                 ORDER BY ts.submitted_at DESC LIMIT 200'
            );
            send(['success' => true, 'submissions' => $stmt->fetchAll()]);
        }
    }

    // Submit a file (student)
    if ($method === 'POST' && empty($body['_method'])) {
        requireRole($user, ['student']);
        $taskId = intval($body['task_id'] ?? 0);
        $notes = trim($body['notes'] ?? '');
        if ($taskId <= 0) sendError('Task ID is required.');

        $fileName = null;
        $filePath = null;

        if (empty($_FILES['file']['name'])) {
            sendError('Please select a file to upload before submitting the task.', 400);
        }

        $uploadDir = dirname(__DIR__) . '/uploads/submissions/';
        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0755, true);
        }
        $originalName = basename($_FILES['file']['name']);
        $safeName = preg_replace('/[^a-zA-Z0-9._-]/', '_', $originalName);
        $uniqueName = time() . '_' . $userId . '_' . $safeName;
        $destPath = $uploadDir . $uniqueName;
        if (!move_uploaded_file($_FILES['file']['tmp_name'], $destPath)) {
            sendError('Failed to upload file.');
        }
        $fileName = $originalName;
        $filePath = 'uploads/submissions/' . $uniqueName;

        $taskStmt = $pdo->prepare('SELECT id, title, due_date, status, supervisor_id FROM tasks WHERE id=? AND student_id=? LIMIT 1');
        $taskStmt->execute([$taskId, $userId]);
        $task = $taskStmt->fetch(PDO::FETCH_ASSOC);
        if (!$task || empty($task['supervisor_id'])) sendError('This task is not assigned to you.', 403);
        if (!in_array($task['status'] ?? '', ['Ongoing', 'Rejected / Needs Revision'], true)) sendError('Start the task before submitting it.', 409);

        $submittedAt = date('Y-m-d H:i:s');
        $isLate = !empty($task['due_date']) && strtotime($submittedAt) > strtotime($task['due_date'] . ' 23:59:59');
        $stmt = $pdo->prepare(
            'INSERT INTO task_submissions (task_id, student_id, file_name, file_path, notes, status, is_late, submitted_at)
             VALUES (?,?,?,?,?,"For Review",?,?)
             ON DUPLICATE KEY UPDATE file_name=VALUES(file_name), file_path=VALUES(file_path), notes=VALUES(notes), status="For Review", is_late=VALUES(is_late), supervisor_comment=NULL, reviewed_at=NULL, submitted_at=VALUES(submitted_at)'
        );
        $stmt->execute([$taskId, $userId, $fileName, $filePath, $notes, $isLate ? 1 : 0, $submittedAt]);
        $pdo->prepare('UPDATE tasks SET status="Ongoing", started_at=COALESCE(started_at, NOW()), completed_at=NULL WHERE id=? AND student_id=? AND status IN ("Pending","Ongoing","Rejected / Needs Revision")')->execute([$taskId, $userId]);
        $submissionId = (int)$pdo->lastInsertId();
        if ($submissionId <= 0) {
            $submissionIdStmt = $pdo->prepare('SELECT id FROM task_submissions WHERE task_id=? AND student_id=? LIMIT 1');
            $submissionIdStmt->execute([$taskId, $userId]);
            $submissionId = (int)$submissionIdStmt->fetchColumn();
        }

        $studentNameStmt = $pdo->prepare('SELECT name FROM users WHERE id=? LIMIT 1');
        $studentNameStmt->execute([$userId]);
        $studentName = (string)($studentNameStmt->fetchColumn() ?: 'Student');
        $notificationCheck = $pdo->prepare("SELECT id FROM notifications WHERE user_id=? AND notification_type='task_submission' AND submission_id=? LIMIT 1");
        $notificationCheck->execute([(int)$task['supervisor_id'], $submissionId]);
        if (!$notificationCheck->fetchColumn()) {
            $notificationStmt = $pdo->prepare("INSERT INTO notifications (user_id, role, title, message, type, notification_type, task_id, student_id, supervisor_id, submission_id, is_read, page) VALUES (?, 'supervisor', ?, ?, 'info', 'task_submission', ?, ?, ?, ?, 0, 'submissions')");
            $notificationStmt->execute([
                (int)$task['supervisor_id'],
                $isLate ? 'Late Task Submission' : 'Task Submission Received',
                $studentName . ' submitted the task: ' . $task['title'] . ($isLate ? ' — LATE.' : '.'),
                $taskId,
                $userId,
                (int)$task['supervisor_id'],
                $submissionId,
            ]);
        }

        logActivity($pdo, $userId, 'Submit Task', 'Submitted output for task "' . ($task['title'] ?: ('#' . $taskId)) . '".');
        send(['success' => true, 'message' => 'Task submitted successfully.', 'id' => $submissionId]);
    }

    // Review submission (supervisor)
    if ($method === 'PUT' || ($method === 'POST' && ($body['_method'] ?? '') === 'PUT')) {
        requireRole($user, ['supervisor', 'admin']);
        $id = intval($body['id'] ?? 0);
        $status = trim($body['status'] ?? '');
        $comment = trim($body['supervisor_comment'] ?? '');
        if ($id <= 0 || !in_array($status, ['Approved', 'Rejected'], true)) sendError('Invalid request.');
        $submissionStmt = $pdo->prepare('SELECT ts.task_id, ts.student_id, t.title, t.supervisor_id FROM task_submissions ts JOIN tasks t ON t.id=ts.task_id WHERE ts.id=? LIMIT 1');
        $submissionStmt->execute([$id]);
        $submission = $submissionStmt->fetch(PDO::FETCH_ASSOC);
        if (!$submission) sendError('Submission not found.', 404);
        if ($user['role'] === 'supervisor' && (int)$submission['supervisor_id'] !== $userId) sendError('You cannot review this submission.', 403);
        if ($user['role'] === 'supervisor') {
            $assignmentAccess = $pdo->prepare(
                'SELECT 1
                 FROM assignments a
                 JOIN users supervisor ON supervisor.id = ?
                    AND supervisor.role = "supervisor"
                    AND supervisor.status = "Active"
                    AND supervisor.company_id = a.company_id
                 WHERE a.student_id = ?
                 LIMIT 1'
            );
            $assignmentAccess->execute([$userId, (int)$submission['student_id']]);
            if (!$assignmentAccess->fetchColumn()) sendError('You cannot review submissions for students outside your company.', 403);
        }
        $stmt = $pdo->prepare('UPDATE task_submissions SET status=?, supervisor_comment=?, rejection_reason=?, reviewed_at=NOW(), reviewed_by=? WHERE id=?');
        $stmt->execute([$status, $comment, $status === 'Rejected' ? $comment : null, $userId, $id]);
        $taskStatus = $status === 'Approved' ? 'Completed' : 'Rejected / Needs Revision';
        $taskUpdate = $pdo->prepare('UPDATE tasks SET status=?, completed_at = CASE WHEN ? = "Approved" THEN NOW() ELSE NULL END WHERE id=? AND supervisor_id=?');
        $taskUpdate->execute([$taskStatus, $status, (int)$submission['task_id'], (int)$submission['supervisor_id']]);
        if ($status === 'Approved') {
            $pdo->prepare('UPDATE tasks SET completed_at=COALESCE(completed_at, NOW()) WHERE id=? AND supervisor_id=?')->execute([(int)$submission['task_id'], (int)$submission['supervisor_id']]);
        } else {
            $pdo->prepare('UPDATE tasks SET completed_at=NULL WHERE id=? AND supervisor_id=?')->execute([(int)$submission['task_id'], (int)$submission['supervisor_id']]);
        }
        if ($status === 'Rejected') {
            $studentMessage = 'Your submission for "' . $submission['title'] . '" was rejected by your Supervisor.';
            if ($comment !== '') $studentMessage .= ' Reason: ' . $comment;
            $notificationCheck = $pdo->prepare("SELECT id FROM notifications WHERE user_id=? AND notification_type='task_rejected' AND submission_id=? LIMIT 1");
            $notificationCheck->execute([(int)$submission['student_id'], $id]);
            if (!$notificationCheck->fetchColumn()) {
                $notificationStmt = $pdo->prepare("INSERT INTO notifications (user_id, role, title, message, type, notification_type, task_id, student_id, supervisor_id, submission_id, is_read, page) VALUES (?, 'student', ?, ?, 'warning', 'task_rejected', ?, ?, ?, ?, 0, 'tasks')");
                $notificationStmt->execute([(int)$submission['student_id'], 'Task Submission Rejected', $studentMessage, (int)$submission['task_id'], (int)$submission['student_id'], (int)$submission['supervisor_id'], $id]);
            }
        } elseif ($status === 'Approved') {
            $notificationCheck = $pdo->prepare("SELECT id FROM notifications WHERE user_id=? AND notification_type='task_approved' AND task_id=? LIMIT 1");
            $notificationCheck->execute([(int)$submission['student_id'], (int)$submission['task_id']]);
            if (!$notificationCheck->fetchColumn()) {
                $notificationStmt = $pdo->prepare("INSERT INTO notifications (user_id, role, title, message, type, notification_type, task_id, student_id, supervisor_id, submission_id, is_read, page) VALUES (?, 'student', ?, ?, 'success', 'task_approved', ?, ?, ?, ?, 0, 'tasks')");
                $notificationStmt->execute([
                    (int)$submission['student_id'],
                    'Task Approved',
                    'Your task "' . $submission['title'] . '" has been approved by your supervisor.',
                    (int)$submission['task_id'],
                    (int)$submission['student_id'],
                    (int)$submission['supervisor_id'],
                    $id,
                ]);
            }
        }
        logActivity($pdo, (int)$user['id'], 'Review Submission', ucfirst(strtolower($status)) . ' student submission #' . $id . '.');
        send(['success' => true, 'message' => 'Submission reviewed.']);
    }
}

// =====================================================
// EVALUATIONS
// =====================================================
if ($resource === 'evaluations') {
    $user = requireSession();
    $userId = intval($user['id'] ?? 0);

    if ($method === 'GET') {
        if ($user['role'] === 'student') {
            $stmt = $pdo->prepare(
                'SELECT e.*, su.name AS supervisor_name
                 FROM evaluations e
                 JOIN assignments a ON e.assignment_id = a.id
                 JOIN users su ON e.supervisor_id = su.id
                 WHERE a.student_id = ? LIMIT 1'
            );
            $stmt->execute([$userId]);
            send(['success' => true, 'evaluation' => $stmt->fetch() ?: null]);
        } elseif ($user['role'] === 'supervisor') {
            $stmt = $pdo->prepare(
                'SELECT e.*, u.name AS student_name
                 FROM evaluations e
                 JOIN assignments a ON e.assignment_id = a.id
                 JOIN users u ON a.student_id = u.id
                 WHERE e.supervisor_id = ?
                 ORDER BY e.evaluated_at DESC'
            );
            $stmt->execute([$userId]);
            send(['success' => true, 'evaluations' => $stmt->fetchAll()]);
        } else {
            $stmt = $pdo->query(
                'SELECT e.*, u.name AS student_name, su.name AS supervisor_name
                 FROM evaluations e
                 JOIN assignments a ON e.assignment_id = a.id
                 JOIN users u ON a.student_id = u.id
                 JOIN users su ON e.supervisor_id = su.id
                 ORDER BY e.evaluated_at DESC'
            );
            send(['success' => true, 'evaluations' => $stmt->fetchAll()]);
        }
    }

    if ($method === 'POST') {
        requireRole($user, ['supervisor']);
        $assignmentId = intval($body['assignment_id'] ?? 0);
        $score = floatval($body['score'] ?? 0);
        $punctuality = intval($body['punctuality'] ?? 0);
        $qualityOfWork = intval($body['quality_of_work'] ?? 0);
        $teamwork = intval($body['teamwork'] ?? 0);
        $communication = intval($body['communication'] ?? 0);
        $remarks = trim($body['remarks'] ?? '');
        if ($assignmentId <= 0) sendError('Assignment ID is required.');

        $stmt = $pdo->prepare(
            'INSERT INTO evaluations (assignment_id, supervisor_id, score, punctuality, quality_of_work, teamwork, communication, remarks)
             VALUES (?,?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE score=VALUES(score), punctuality=VALUES(punctuality),
               quality_of_work=VALUES(quality_of_work), teamwork=VALUES(teamwork),
               communication=VALUES(communication), remarks=VALUES(remarks), evaluated_at=NOW()'
        );
        $stmt->execute([$assignmentId, $userId, $score, $punctuality, $qualityOfWork, $teamwork, $communication, $remarks]);

        // Sync score to assignments table
        $pdo->prepare('UPDATE assignments SET evaluation_score=? WHERE id=?')->execute([$score, $assignmentId]);
        send(['success' => true, 'message' => 'Evaluation saved.', 'id' => (int)$pdo->lastInsertId()]);
    }
}

// =====================================================
// INIT DATA (bulk-load for app startup)
// =====================================================
if ($resource === 'init') {
    $syStmt = $pdo->query('SELECT * FROM school_years ORDER BY id DESC');
    $progStmt = $pdo->query("SELECT p.*, COALESCE(GROUP_CONCAT(DISTINCT u.name ORDER BY u.name SEPARATOR ', '), 'Unassigned') AS coordinator_name
        FROM programs p
        LEFT JOIN users u ON u.program_id = p.id AND u.role = 'coordinator' AND u.status = 'Active'
        GROUP BY p.id
        ORDER BY p.code ASC");
    $studentStmt = $pdo->query("SELECT u.id, u.name, u.email, u.username, u.student_id, u.section,
                                      COALESCE(p.code, p.name, u.program) AS program,
                                      u.academic_year, u.contact, u.status
                               FROM users u
                               LEFT JOIN programs p ON p.id = u.program_id
                               WHERE u.role = 'student' AND u.status = 'Active'
                               ORDER BY u.name ASC");
    $compStmt = $pdo->query('SELECT * FROM companies WHERE status = "Active" ORDER BY name ASC');
    $supStmt = $pdo->query("SELECT u.id, u.name, u.email, u.contact, u.company_id, COALESCE(c.name, u.company) AS company, u.status FROM users u LEFT JOIN companies c ON c.id = u.company_id WHERE u.role='supervisor' AND u.status='Active' ORDER BY u.name ASC");
    $coordStmt = $pdo->query("SELECT u.id, u.name, u.email, u.contact, u.employee_id, u.program_id, COALESCE(p.name, p.code, u.program) AS program, status FROM users u LEFT JOIN programs p ON p.id = u.program_id WHERE u.role='coordinator' AND u.status='Active' ORDER BY u.name ASC");

        $statsStmt = $pdo->query("SELECT
                (SELECT COUNT(DISTINCT id) FROM users WHERE role = 'student' AND status = 'Active') AS total_students,
                (SELECT COUNT(DISTINCT id) FROM users WHERE role = 'coordinator' AND status = 'Active') AS total_coordinators,
                (SELECT COUNT(DISTINCT id) FROM users WHERE role = 'supervisor' AND status = 'Active') AS total_supervisors,
                (SELECT COUNT(DISTINCT id) FROM companies WHERE status = 'Active') AS total_companies,
                (SELECT COUNT(DISTINCT a.id)
                     FROM assignments a
                     JOIN users u ON u.id = a.student_id
                    WHERE u.role = 'student' AND u.status = 'Active' AND a.internship_status = 'Pending') AS pending_internships,
                (SELECT COUNT(DISTINCT a.id)
                     FROM assignments a
                     JOIN users u ON u.id = a.student_id
                    WHERE u.role = 'student' AND u.status = 'Active' AND a.internship_status = 'Ongoing') AS ongoing_internships,
                (SELECT COUNT(DISTINCT a.id)
                     FROM assignments a
                     JOIN users u ON u.id = a.student_id
                    WHERE u.role = 'student' AND u.status = 'Active' AND a.internship_status = 'Completed') AS completed_internships,
                (SELECT COUNT(DISTINCT a.id)
                     FROM assignments a
                     JOIN users u ON u.id = a.student_id
                    WHERE u.role = 'student' AND u.status = 'Active' AND a.internship_status IN ('Approved', 'Ongoing')) AS active_internships,
                (SELECT COUNT(DISTINCT id) FROM programs) AS total_programs");
        $stats = $statsStmt->fetch() ?: [];

    $programs = attachProgramStudents($pdo, $progStmt->fetchAll());
    send([
        'success' => true,
        'school_years' => $syStmt->fetchAll(),
        'programs' => $programs,
        'students' => $studentStmt->fetchAll(),
        'companies' => $compStmt->fetchAll(),
        'supervisors' => $supStmt->fetchAll(),
        'coordinators' => $coordStmt->fetchAll(),
        'dashboard_stats' => array_map('intval', $stats),
    ]);
}

// =====================================================
// USER PROFILE UPDATE
// =====================================================
if ($resource === 'profile') {
    $user = requireSession();
    $userId = intval($user['id'] ?? 0);

    if ($method === 'GET') {
         $stmt = $pdo->prepare('SELECT u.id, u.name, u.email, u.username, u.contact, u.address, u.student_id,
                                      u.section, u.program_id, u.academic_year,
                           COALESCE(p.code, p.name, u.program) AS program,
                           u.employee_id, u.company_id, COALESCE(c.name, u.company) AS company_name,
                           c.contact_person AS company_contact_person, c.contact_email AS company_email,
                                                     c.contact_phone AS company_phone, c.location AS company_location,
                                                     (SELECT fr.face_image FROM face_registrations fr
                                                        WHERE fr.student_id = u.student_id
                                                            AND fr.registration_status = "Registered"
                                                            AND fr.face_encoding IS NOT NULL
                                                            AND fr.face_encoding <> ""
                                                        ORDER BY fr.id DESC LIMIT 1) AS face_image
                               FROM users u
                               LEFT JOIN programs p ON p.id = u.program_id
                       LEFT JOIN companies c ON c.id = u.company_id
                               WHERE u.id = ? AND u.role = ? AND u.status = "Active"
                               LIMIT 1');
        $stmt->execute([$userId, $user['role']]);
        $profile = $stmt->fetch();
        if (!$profile) sendError('Authenticated user record not found.', 404);
        if (!empty($profile['face_image']) && str_starts_with($profile['face_image'], 'uploads/')) {
            $profile['face_image'] = '../' . $profile['face_image'];
        }
        send(['success' => true, 'profile' => $profile]);
    }

    if ($method === 'POST') {
        $nameInput = $body['name'] ?? '';
        $emailInput = $body['email'] ?? '';
        $contactInput = $body['contact'] ?? '';
        $currentPassInput = $body['current_password'] ?? '';
        $newPassInput = $body['new_password'] ?? '';
        $confirmPassInput = $body['confirm_password'] ?? '';
        if (!is_string($nameInput) || !is_string($emailInput) || !is_string($contactInput)
            || !is_string($currentPassInput) || !is_string($newPassInput) || !is_string($confirmPassInput)) {
            sendError('Profile fields must be text values.');
        }
        $name = trim($nameInput);
        $email = trim($emailInput);
        $contact = trim($contactInput);
        $currentPass = trim($currentPassInput);
        $newPass = trim($newPassInput);
        $confirmPass = trim($confirmPassInput);

        if ($newPass !== '' && ($name !== '' || $email !== '' || $contact !== '')) {
            sendError('Update profile information and password in separate requests.');
        }

        if ($name !== '' || $email !== '' || $contact !== '') {
            $nameLength = function_exists('mb_strlen') ? mb_strlen($name, 'UTF-8') : strlen($name);
            if ($nameLength < 1 || $nameLength > 120 || strlen($email) > 160 || strlen($contact) > 100
                || $email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                sendError('A name and valid email address are required.');
            }
            $account = $pdo->prepare('SELECT id FROM users WHERE id = ? AND role = ? AND status = "Active" LIMIT 1');
            $account->execute([$userId, $user['role']]);
            if (!$account->fetch()) sendError('Authenticated user record not found.', 404);

            $duplicate = $pdo->prepare('SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1');
            $duplicate->execute([$email, $userId]);
            if ($duplicate->fetch()) sendError('That email address is already in use.', 409);

            $stmt = $pdo->prepare('UPDATE users SET name = ?, email = ?, contact = ? WHERE id = ? AND role = ? AND status = "Active"');
            try {
                $stmt->execute([$name, $email, $contact, $userId, $user['role']]);
            } catch (PDOException $e) {
                if ($e->getCode() === '23000') sendError('That email address is already in use.', 409);
                throw $e;
            }

            startSessionIfNeeded();
            if ((int)($_SESSION['user']['id'] ?? 0) === $userId) {
                $_SESSION['user']['name'] = $name;
                $_SESSION['user']['email'] = $email;
                $_SESSION['user']['contact'] = $contact;
            }
            session_write_close();
            logActivity($pdo, $userId, 'Update Profile', 'Updated profile information.');
        }

        if ($newPass !== '') {
            if ($newPass !== $confirmPass) sendError('New password and confirmation do not match.');
            if ($currentPass === '') sendError('Current password is required.');
            if (strlen($newPass) < 8) sendError('New password must be at least 8 characters long.');
            $check = $pdo->prepare('SELECT password_hash FROM users WHERE id = ? AND role = ? AND status = "Active" LIMIT 1');
            $check->execute([$userId, $user['role']]);
            $row = $check->fetch();
            if (!$row) sendError('Authenticated user record not found.', 404);
            if (!password_verify($currentPass, $row['password_hash'])) {
                sendError('Current password is incorrect.');
            }
            $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ? AND role = ? AND status = "Active"')->execute([password_hash($newPass, PASSWORD_DEFAULT), $userId, $user['role']]);
            logActivity($pdo, $userId, 'Update Profile', 'Changed account password.');
        }

        send(['success' => true, 'message' => $newPass !== '' ? 'Password updated successfully.' : 'Profile updated successfully.']);
    }
}

// =====================================================
// STUDENT RECORDS (for coordinator)
// =====================================================
if ($resource === 'student_records') {
    $user = requireSession();
    requireRole($user, ['coordinator', 'admin']);
    $userId = intval($user['id'] ?? 0);

    if ($method === 'GET') {
        $programId = getCoordinatorProgramId($pdo, $user);

        $sql = 'SELECT u.id, u.name, u.email, u.student_id AS student_no, u.program_id,
                       COALESCE(p.code, p.name, u.program) AS program, u.section,
                       u.contact, u.status AS user_status,
                       a.id AS assignment_id, a.school_year_id, a.internship_status, a.hours_completed, a.hours_required,
                       a.evaluation_score, a.completion_cleared, a.remarks,
                       a.assigned_at, a.updated_at, sy.year_label,
                       c.name AS company_name,
                       company_sup.name AS supervisor_name,
                       CASE
                           WHEN fr.registration_status = "Registered"
                                AND attendance_today.time_in IS NOT NULL
                                AND attendance_today.verification_status = "Verified"
                                AND attendance_today.time_in_location_status = "Verified"
                           THEN attendance_today.status
                           ELSE "Absent"
                       END AS attendance_status,
                       co.name AS coordinator_name,
                       COALESCE(fr.registration_status, "Not Registered") AS face_registration_status
                FROM users u
                LEFT JOIN programs p ON p.id = u.program_id
                LEFT JOIN assignments a ON a.student_id = u.id
                LEFT JOIN school_years sy ON sy.id = a.school_year_id
                LEFT JOIN companies c ON a.company_id = c.id
                                LEFT JOIN users company_sup ON company_sup.id = (
                                        SELECT assigned_sup.id FROM users assigned_sup
                                        WHERE assigned_sup.role = "supervisor"
                                            AND assigned_sup.status = "Active"
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
                WHERE u.role = "student" AND u.status = "Active"';
        $params = [];
        if ($user['role'] === 'coordinator') {
            if ($programId === null) {
                send(['success' => true, 'students' => [], 'program_id' => null, 'dashboard' => [
                    'total_assigned_students' => 0,
                    'students_with_company' => 0,
                    'ongoing_internships' => 0,
                    'completed_internships' => 0,
                    'pending_requirements' => 0,
                    'attendance_today' => 0,
                    'activities' => [],
                    'status_summary' => [],
                ]]);
            }
            $sql .= ' AND u.program_id = ?';
            $params[] = $programId;
        }
        if (!empty($_GET['program'])) {
            $sql .= ' AND (u.program = ? OR p.code = ? OR p.name = ?)';
            $params[] = $_GET['program'];
            $params[] = $_GET['program'];
            $params[] = $_GET['program'];
        }
        $sql .= ' ORDER BY u.name ASC';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $students = $stmt->fetchAll();

        $dashboardStmt = $pdo->prepare(
            'SELECT COUNT(DISTINCT u.id) AS total_assigned_students,
                    COUNT(DISTINCT CASE WHEN c.id IS NOT NULL THEN u.id END) AS students_with_company,
                    COUNT(DISTINCT CASE WHEN a.internship_status = "Ongoing" THEN u.id END) AS ongoing_internships,
                    COUNT(DISTINCT CASE WHEN a.internship_status = "Completed" THEN u.id END) AS completed_internships
             FROM users u
             LEFT JOIN assignments a ON a.student_id = u.id
             LEFT JOIN companies c ON c.id = a.company_id
             WHERE u.role = "student" AND u.status = "Active" AND u.program_id = ?'
        );
        $dashboardStmt->execute([$programId]);
        $dashboard = array_map('intval', $dashboardStmt->fetch() ?: []);

        $pendingStmt = $pdo->prepare(
            'SELECT COUNT(DISTINCT ts.student_id)
             FROM task_submissions ts
             JOIN users u ON u.id = ts.student_id
             WHERE u.role = "student" AND u.status = "Active" AND u.program_id = ?
               AND ts.status IN ("Pending", "For Review", "Rejected")'
        );
        $pendingStmt->execute([$programId]);
        $dashboard['pending_requirements'] = (int)$pendingStmt->fetchColumn();

        $attendanceStmt = $pdo->prepare(
            'SELECT COUNT(DISTINCT al.student_id)
             FROM attendance_logs al
             JOIN users u ON u.id = al.student_id
             WHERE u.role = "student" AND u.status = "Active" AND u.program_id = ?
               AND al.log_date = CURRENT_DATE()'
        );
        $attendanceStmt->execute([$programId]);
        $dashboard['attendance_today'] = (int)$attendanceStmt->fetchColumn();

        $statusStmt = $pdo->prepare(
                        'SELECT CASE
                                                WHEN a.internship_status = "Ongoing" THEN "Ongoing"
                                                WHEN a.internship_status = "Completed" THEN "Completed"
                                                ELSE "Pending"
                                        END AS status,
                                        COUNT(DISTINCT u.id) AS count
             FROM users u
             LEFT JOIN assignments a ON a.student_id = u.id
             WHERE u.role = "student" AND u.status = "Active" AND u.program_id = ?
                         GROUP BY CASE
                                                WHEN a.internship_status = "Ongoing" THEN "Ongoing"
                                                WHEN a.internship_status = "Completed" THEN "Completed"
                                                ELSE "Pending"
                                            END'
        );
        $statusStmt->execute([$programId]);
        $dashboard['status_summary'] = $statusStmt->fetchAll();

        $activityStmt = $pdo->prepare(
            'SELECT al.user_id AS student_id, u.name, al.action AS activity, al.created_at AS date, "info" AS status
             FROM activity_logs al
             JOIN users u ON u.id = al.user_id
                         WHERE u.role = "student" AND u.status = "Active" AND u.program_id = ?
                             AND al.action IN ("Attendance", "Submit Task", "Face Registration", "Face Registration Update")
             ORDER BY al.created_at DESC
             LIMIT 5'
        );
        $activityStmt->execute([$programId]);
        $dashboard['activities'] = $activityStmt->fetchAll();

        send(['success' => true, 'students' => $students, 'program_id' => $programId, 'dashboard' => $dashboard]);
    }

    if ($method === 'POST' && ($body['_method'] ?? '') === 'PUT') {
        $assignmentId = intval($body['assignment_id'] ?? 0);
        $status = trim($body['internship_status'] ?? '');
        $remarks = trim($body['remarks'] ?? '');
        if ($assignmentId <= 0) sendError('Invalid assignment ID.');
        $stmt = $pdo->prepare('UPDATE assignments SET internship_status=?, remarks=?, updated_at=NOW() WHERE id=?');
        $stmt->execute([$status, $remarks, $assignmentId]);
        send(['success' => true, 'message' => 'Student record updated.']);
    }
}

// =====================================================
// INIT — aggregated bootstrap data for JS loadInitialData()
// Returns: school_years, programs, companies, supervisors, coordinators
// No auth required — data is non-sensitive reference data
// =====================================================
if ($resource === 'init') {
    $syStmt = $pdo->query('SELECT id, year_label, semester, start_date, end_date, students_count, status FROM school_years ORDER BY id DESC LIMIT 20');
    $progStmt = $pdo->query("SELECT p.id, p.code, p.name, p.req_hours, p.students_count, p.coordinator,
        COALESCE(GROUP_CONCAT(DISTINCT u.name ORDER BY u.name SEPARATOR ', '), 'Unassigned') AS coordinator_name
        FROM programs p
        LEFT JOIN users u ON u.program_id = p.id AND u.role = 'coordinator' AND u.status = 'Active'
        GROUP BY p.id
        ORDER BY p.code ASC");
    $compStmt = $pdo->query('SELECT id, name, location, contact_email, contact_phone, status FROM companies WHERE status="Active" ORDER BY name ASC');
    $supStmt = $pdo->query('SELECT u.id, u.name, u.email, u.contact, u.company_id, COALESCE(c.name, u.company) AS company, u.status FROM users u LEFT JOIN companies c ON c.id = u.company_id WHERE u.role="supervisor" AND u.status="Active" ORDER BY u.name ASC');
    $coordStmt = $pdo->query('SELECT u.id, u.name, u.email, u.employee_id, u.program_id, COALESCE(p.name, p.code, u.program) AS program, u.status FROM users u LEFT JOIN programs p ON p.id = u.program_id WHERE u.role="coordinator" AND u.status="Active" ORDER BY u.name ASC');

    $programRows = attachProgramStudents($pdo, $progStmt->fetchAll());
    send([
        'success'      => true,
        'school_years' => $syStmt->fetchAll(),
        'programs'     => $programRows,
        'companies'    => $compStmt->fetchAll(),
        'supervisors'  => $supStmt->fetchAll(),
        'coordinators' => $coordStmt->fetchAll(),
    ]);
}

// Fallback
sendError('Unknown resource: ' . htmlspecialchars($resource), 404);
