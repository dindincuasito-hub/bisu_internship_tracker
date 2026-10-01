<?php
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth.php';
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

try {
    $currentUser = requireAuth();
} catch (RuntimeException $e) {
    http_response_code($e->getMessage() === 'Forbidden' ? 403 : 401);
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    exit;
}

$name = trim($_POST['name'] ?? '');
$email = trim($_POST['email'] ?? '');
$password = trim($_POST['password'] ?? '');
$role = strtolower(trim($_POST['role'] ?? ''));

$allowedRoles = ['student', 'supervisor', 'coordinator', 'admin'];
if ($name === '' || $email === '' || $password === '' || $role === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'All fields are required']);
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Please enter a valid email address']);
    exit;
}

if (!in_array($role, $allowedRoles, true)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid role selected']);
    exit;
}

if ($currentUser['role'] === 'coordinator' && !in_array($role, ['student', 'supervisor'], true)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Coordinators may only create student or supervisor accounts']);
    exit;
}

try {
    $pdo = getDbConnection();
    if (userExists($pdo, $email)) {
        http_response_code(409);
        echo json_encode(['success' => false, 'message' => 'A user with that email already exists']);
        exit;
    }

    $userId = createUser($pdo, $name, $email, $password, $role);
    echo json_encode(['success' => true, 'message' => 'User created successfully', 'user_id' => $userId]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Server error: ' . $e->getMessage()]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Server error: ' . $e->getMessage()]);
}
