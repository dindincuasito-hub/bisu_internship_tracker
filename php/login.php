<?php
require_once __DIR__ . '/db.php';
define('BISU_SKIP_AUTO_SESSION', true);
require_once __DIR__ . '/auth.php';
header('Content-Type: application/json; charset=utf-8');
setPrivatePageHeaders();
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $user = getSessionUser();
    if (!$user || empty($user['id']) || !in_array($user['role'] ?? '', ['admin', 'coordinator', 'supervisor', 'student'], true)) {
        echo json_encode(['success' => false, 'authenticated' => false]);
        exit;
    }
    echo json_encode(['success' => true, 'authenticated' => true, 'user' => $user]);
    exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}
if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}
if (session_status() === PHP_SESSION_NONE) {
    session_id('');
}
$username = trim($_POST['username'] ?? '');
$password = trim($_POST['password'] ?? '');
$role = trim($_POST['role'] ?? 'student');
if ($username === '' || $password === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Username and password are required']);
    exit;
}

try {
    $pdo = getDbConnection(false, false);
    $user = authenticateUser($pdo, $username, $password, $role);
    if (!$user) {
        $failedUser = getUserByUsernameAndRole($pdo, $username, $role);
        logActivity(
            $pdo,
            $failedUser ? (int)$failedUser['id'] : null,
            'Failed Login',
            'Failed login attempt for ' . ($failedUser['name'] ?? $username) . '.',
            $failedUser['name'] ?? $username,
            $failedUser['role'] ?? $role
        );
        echo json_encode(['success' => false, 'message' => 'Invalid credentials']);
        exit;
    }
    startUserSession($user);
    recordUserAccessEvent($pdo, $user, 'Login');
    $companyIds = [];
    if (($user['role'] ?? '') === 'coordinator') {
        $companyIds = getCoordinatorCompanyIds($pdo, intval($user['id'] ?? 0));
    }
    echo json_encode([
        'success' => true,
        'role' => $role,
        'id' => intval($user['id'] ?? 0),
        'username' => $user['username'] ?? '',
        'email' => $user['email'] ?? '',
        'name' => $user['name'],
        'program' => $user['program'] ?? '',
        'program_name' => $user['program_name'] ?? ($user['program'] ?? ''),
        'program_id' => !empty($user['program_id']) ? intval($user['program_id']) : null,
        'student_id' => $user['student_id'] ?? '',
        'section' => $user['section'] ?? '',
        'academic_year' => $user['academic_year'] ?? '',
        'address' => $user['address'] ?? '',
        'company' => $user['company'] ?? '',
        'company_id' => !empty($user['company_id']) ? intval($user['company_id']) : (count($companyIds) ? (int)$companyIds[0] : null),
        'company_ids' => $companyIds,
        'company_name' => $user['company_name'] ?? ($user['company'] ?? ''),
        'employee_id' => $user['employee_id'] ?? '',
        'message' => 'Login successful'
    ]);
} catch (Throwable $e) {
    error_log('[login] Authentication request failed: ' . $e->getMessage());
    http_response_code(isDatabaseUnavailable($e) ? 503 : 500);
    echo json_encode([
        'success' => false,
        'message' => isDatabaseUnavailable($e)
            ? 'The sign-in database is unavailable. Check that MySQL is running and the configured database is healthy.'
            : 'The sign-in service could not complete your request. Please try again.'
    ]);
}
