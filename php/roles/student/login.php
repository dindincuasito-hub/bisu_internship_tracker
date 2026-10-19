<?php
require_once __DIR__ . '/../../db.php';
define('BISU_SKIP_AUTO_SESSION', true);
require_once __DIR__ . '/../../auth.php';
header('Content-Type: application/json; charset=utf-8');
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
$email = trim($_POST['email'] ?? '');
$password = trim($_POST['password'] ?? '');
$role = 'student';
if ($email === '' || $password === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Email and password are required']);
    exit;
}
try {
    $pdo = getDbConnection(false, false);
    $user = authenticateUser($pdo, $email, $password, $role);
    if (!$user) {
        echo json_encode(['success' => false, 'message' => 'Invalid credentials']);
        exit;
    }
    startUserSession($user);
    recordUserAccessEvent($pdo, $user, 'Login');
    echo json_encode(['success' => true, 'role' => $role, 'email' => $user['email'], 'name' => $user['name'], 'message' => 'Login successful']);
} catch (Throwable $e) {
    error_log('[login][student] Authentication request failed: ' . $e->getMessage());
    http_response_code(isDatabaseUnavailable($e) ? 503 : 500);
    echo json_encode(['success' => false, 'message' => isDatabaseUnavailable($e) ? 'The sign-in database is unavailable.' : 'The sign-in service could not complete your request. Please try again.']);
}
