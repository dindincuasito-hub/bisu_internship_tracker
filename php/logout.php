<?php
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth.php';
header('Content-Type: application/json; charset=utf-8');
$user = getSessionUser();
if ($user) {
	try {
		$pdo = getDbConnection();
		recordUserAccessEvent($pdo, $user, 'Logout');
	} catch (Throwable $e) {
		error_log('Unable to record logout activity: ' . $e->getMessage());
	}
}
clearUserSession();
echo json_encode(['success' => true, 'message' => 'Logged out']);
