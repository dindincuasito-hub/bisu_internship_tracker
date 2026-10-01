<?php
require_once __DIR__ . '/../../db.php';
require_once __DIR__ . '/../../auth.php';
header('Content-Type: application/json; charset=utf-8');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
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
    $pdo = getDbConnection();
    $user = authenticateUser($pdo, $email, $password, $role);
    if (!$user) {
        echo json_encode(['success' => false, 'message' => 'Invalid credentials']);
        exit;
    }
    startUserSession($user);
    recordUserAccessEvent($pdo, $user, 'Login');
    echo json_encode(['success' => true, 'role' => $role, 'email' => $user['email'], 'name' => $user['name'], 'message' => 'Login successful']);
} catch (Exception $e) {
    if (isDatabaseUnavailable($e)) {
        $user = authenticateDemoUser($email, $password, $role);
        if ($user) {
            startUserSession($user);
            echo json_encode(['success' => true, 'role' => $role, 'email' => $user['email'], 'name' => $user['name'], 'message' => 'Login successful (demo mode)']);
            exit;
        }
        echo json_encode(['success' => false, 'message' => 'Invalid credentials']);
        exit;
    }
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Server error: ' . $e->getMessage()]);
}
