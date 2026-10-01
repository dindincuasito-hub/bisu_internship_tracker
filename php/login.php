<?php
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth.php';
header('Content-Type: application/json; charset=utf-8');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
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
    $pdo = getDbConnection();
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
} catch (Exception $e) {
    if (isDatabaseUnavailable($e)) {
        $user = authenticateDemoUser($username, $password, $role);
        if ($user) {
            startUserSession($user);
            $companyIds = [];
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
                'message' => 'Login successful (demo mode)'
            ]);
            exit;
        }
        echo json_encode(['success' => false, 'message' => 'Invalid credentials']);
        exit;
    }
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Server error: ' . $e->getMessage()]);
}
