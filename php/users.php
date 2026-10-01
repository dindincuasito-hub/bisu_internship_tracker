<?php
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth.php';
header('Content-Type: application/json; charset=utf-8');

try {
    $pdo = getDbConnection();
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database unavailable']);
    exit;
}

try {
    requireAuth('admin');
} catch (RuntimeException $e) {
    http_response_code($e->getMessage() === 'Forbidden' ? 403 : 401);
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    try {
        $users = getUsers($pdo);
        echo json_encode(['success' => true, 'users' => $users]);
        exit;
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Unable to load users']);
        exit;
    }
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

$action = trim($_POST['action'] ?? 'create');
$allowedRoles = ['student', 'coordinator', 'supervisor', 'admin'];

function sendError(int $status, string $message): void
{
    http_response_code($status);
    echo json_encode(['success' => false, 'message' => $message]);
    exit;
}

function deriveAccountEmail(string $username, string $name): string
{
    $base = trim($username !== '' ? $username : $name);
    $base = strtolower(preg_replace('/[^a-z0-9._-]+/i', '', $base) ?: 'account');
    return $base . '@bisu.edu.ph';
}

switch ($action) {
    case 'create':
        $name = trim($_POST['name'] ?? '');
        $username = trim($_POST['username'] ?? '');
        $email = trim($_POST['email'] ?? '');
        $password = trim($_POST['password'] ?? '');
        $confirm = trim($_POST['confirm_password'] ?? '');
        $role = strtolower(trim($_POST['role'] ?? ''));
        $status = trim($_POST['status'] ?? 'Active');
        $contact = trim($_POST['contact'] ?? '');
        $address = $role === 'student' ? trim($_POST['address'] ?? '') : '';
        $studentId = trim($_POST['student_id'] ?? '');
        $section = trim($_POST['section'] ?? '');
        $program = trim($_POST['program'] ?? '');
        $programId = intval($_POST['program_id'] ?? 0);
        $academicYear = trim($_POST['academic_year'] ?? '');
        $employeeId = trim($_POST['employee_id'] ?? '');
        $company = trim($_POST['company'] ?? '');
        $companyId = intval($_POST['company_id'] ?? 0);
        $companyIds = [];
        if (isset($_POST['company_ids'])) {
            $companyIds = array_filter(array_map('intval', explode(',', (string)$_POST['company_ids'])));
        } elseif ($companyId > 0) {
            $companyIds = [$companyId];
        }

        if ($name === '' || $username === '' || $password === '' || $confirm === '' || $role === '' || $status === '') {
            sendError(400, 'Please fill in all required fields.');
        }
        if ($email === '') {
            $email = deriveAccountEmail($username, $name);
        }
        if ($password !== $confirm) {
            sendError(400, 'Password and Confirm Password must match.');
        }
        if (!in_array($role, $allowedRoles, true)) {
            sendError(400, 'Invalid role selected.');
        }
        if ($role === 'coordinator' || $role === 'student') {
            if ($programId <= 0) {
            sendError(400, 'Program is required for this account.');
            }
            $programCheck = $pdo->prepare('SELECT code FROM programs WHERE id=? LIMIT 1');
            $programCheck->execute([$programId]);
            $programCode = $programCheck->fetchColumn();
            if (!$programCode) {
                sendError(400, 'Selected program does not exist.');
            }
            $program = $programCode;
            if ($role === 'coordinator') {
                if (empty($companyIds)) {
                    sendError(400, 'Company is required for Coordinator accounts.');
                }
                $companyId = (int)($companyIds[0] ?? 0);
                $companyCheck = $pdo->prepare('SELECT name FROM companies WHERE id=? LIMIT 1');
                $companyCheck->execute([$companyId]);
                $companyName = $companyCheck->fetchColumn();
                if (!$companyName) {
                    sendError(400, 'Selected company does not exist.');
                }
                $company = $companyName;
            }
        } elseif ($role === 'supervisor') {
            if ($companyId <= 0) {
                sendError(400, 'Company is required for Supervisor accounts.');
            }
            $companyCheck = $pdo->prepare('SELECT name FROM companies WHERE id=? LIMIT 1');
            $companyCheck->execute([$companyId]);
            $companyName = $companyCheck->fetchColumn();
            if (!$companyName) {
                sendError(400, 'Selected company does not exist.');
            }
            $company = $companyName;
        } else {
            $programId = 0;
            $companyId = 0;
        }
        if (usernameExists($pdo, $username)) {
            sendError(409, 'That username is already in use.');
        }
        if (emailExists($pdo, $email)) {
            sendError(409, 'That email is already in use.');
        }

        $previousCompanyId = 0;
        try {
            $userId = createUser(
                $pdo,
                $name,
                $email,
                $password,
                $role,
                $status,
                $username,
                $contact,
                $studentId,
                $section,
                $program,
                $academicYear,
                $employeeId,
                $company,
                $programId > 0 ? $programId : null,
                $companyId > 0 ? $companyId : null,
                $address
            );
            if ($role === 'coordinator') {
                setCoordinatorCompanyAssignments($pdo, $userId, $companyIds);
            }
            if ($role === 'supervisor' && $companyId > 0) {
                syncCompanyHeadAssignments($pdo, $companyId);
            }
            if ($role === 'supervisor' && $previousCompanyId > 0 && $previousCompanyId !== $companyId) {
                syncCompanyHeadAssignments($pdo, $previousCompanyId);
            }
            if ($role === 'student' && $programId > 0) {
                try {
                    notifyCoordinatorsAboutNewStudent($pdo, $userId, $name, $programId);
                } catch (Throwable $notificationError) {
                    error_log('[notifications] New student notification failed: ' . $notificationError->getMessage());
                }
            }
            $roleLabel = ucfirst($role);
            logActivity($pdo, (int)getSessionUser()['id'], 'Create ' . $roleLabel, 'Created ' . strtolower($roleLabel) . ' account for ' . $name . '.');
            echo json_encode(['success' => true, 'message' => 'Account created successfully.', 'user_id' => $userId]);
            exit;
        } catch (Exception $e) {
            sendError(500, 'Unable to create account: ' . $e->getMessage());
        }
        break;

    case 'update':
        $id = intval($_POST['id'] ?? 0);
        if ($id <= 0) {
            sendError(400, 'Invalid account ID.');
        }
        $name = trim($_POST['name'] ?? '');
        $username = trim($_POST['username'] ?? '');
        $email = trim($_POST['email'] ?? '');
        $role = strtolower(trim($_POST['role'] ?? ''));
        $status = trim($_POST['status'] ?? 'Active');
        $contact = trim($_POST['contact'] ?? '');
        $address = $role === 'student' ? trim($_POST['address'] ?? '') : '';
        $studentId = trim($_POST['student_id'] ?? '');
        $section = trim($_POST['section'] ?? '');
        $program = trim($_POST['program'] ?? '');
        $programId = intval($_POST['program_id'] ?? 0);
        $academicYear = trim($_POST['academic_year'] ?? '');
        $employeeId = trim($_POST['employee_id'] ?? '');
        $company = trim($_POST['company'] ?? '');
        $companyId = intval($_POST['company_id'] ?? 0);
        $companyIds = [];
        if (isset($_POST['company_ids'])) {
            $companyIds = array_filter(array_map('intval', explode(',', (string)$_POST['company_ids'])));
        } elseif ($companyId > 0) {
            $companyIds = [$companyId];
        }

        if ($name === '' || $username === '' || $role === '' || $status === '') {
            sendError(400, 'Please fill in all required fields.');
        }
        if ($email === '') {
            $email = deriveAccountEmail($username, $name);
        }
        if (!in_array($role, $allowedRoles, true)) {
            sendError(400, 'Invalid role selected.');
        }
        if ($role === 'coordinator' || $role === 'student') {
            if ($programId <= 0) {
            sendError(400, 'Program is required for this account.');
            }
            $programCheck = $pdo->prepare('SELECT code FROM programs WHERE id=? LIMIT 1');
            $programCheck->execute([$programId]);
            $programCode = $programCheck->fetchColumn();
            if (!$programCode) {
                sendError(400, 'Selected program does not exist.');
            }
            $program = $programCode;
            if ($role === 'coordinator') {
                if (empty($companyIds)) {
                    sendError(400, 'Company is required for Coordinator accounts.');
                }
                $companyId = (int)($companyIds[0] ?? 0);
                $companyCheck = $pdo->prepare('SELECT name FROM companies WHERE id=? LIMIT 1');
                $companyCheck->execute([$companyId]);
                $companyName = $companyCheck->fetchColumn();
                if (!$companyName) {
                    sendError(400, 'Selected company does not exist.');
                }
                $company = $companyName;
            }
        } elseif ($role === 'supervisor') {
            if ($companyId <= 0) {
                sendError(400, 'Company is required for Supervisor accounts.');
            }
            $companyCheck = $pdo->prepare('SELECT name FROM companies WHERE id=? LIMIT 1');
            $companyCheck->execute([$companyId]);
            $companyName = $companyCheck->fetchColumn();
            if (!$companyName) {
                sendError(400, 'Selected company does not exist.');
            }
            $company = $companyName;
        } else {
            $programId = 0;
            $companyId = 0;
        }
        if (usernameExists($pdo, $username, $id)) {
            sendError(409, 'That username is already in use.');
        }
        if (emailExists($pdo, $email, $id)) {
            sendError(409, 'That email is already in use.');
        }

        $password = trim($_POST['password'] ?? '');
        $confirm = trim($_POST['confirm_password'] ?? '');
        if ($password !== '' || $confirm !== '') {
            if ($password === '' || $confirm === '') {
                sendError(400, 'Please provide both password and confirmation to update the password.');
            }
            if ($password !== $confirm) {
                sendError(400, 'Password and Confirm Password must match.');
            }
        }

        $previousCompanyId = 0;
        if ($role === 'supervisor') {
            $previousCompanyStmt = $pdo->prepare('SELECT company_id FROM users WHERE id = ? AND role = "supervisor" LIMIT 1');
            $previousCompanyStmt->execute([$id]);
            $previousCompanyId = (int)($previousCompanyStmt->fetchColumn() ?: 0);
        }

        $oldUserStmt = $pdo->prepare('SELECT name, role, status FROM users WHERE id=? LIMIT 1');
        $oldUserStmt->execute([$id]);
        $oldUser = $oldUserStmt->fetch() ?: [];
        try {
            updateUser(
                $pdo,
                $id,
                [
                    'name' => $name,
                    'username' => $username,
                    'email' => $email,
                    'role' => $role,
                    'status' => $status,
                    'contact' => $contact,
                    'address' => $address,
                    'student_id' => $studentId,
                    'section' => $section,
                    'program' => $program,
                    'program_id' => $programId > 0 ? $programId : null,
                    'academic_year' => $academicYear,
                    'employee_id' => $employeeId,
                    'company' => $company,
                    'company_id' => $companyId > 0 ? $companyId : null,
                ]
            );
            if ($role === 'coordinator') {
                setCoordinatorCompanyAssignments($pdo, $id, $companyIds);
            }
            if ($role === 'supervisor' && $companyId > 0) {
                syncCompanyHeadAssignments($pdo, $companyId);
            }
            if ($role === 'supervisor' && $previousCompanyId > 0 && $previousCompanyId !== $companyId) {
                syncCompanyHeadAssignments($pdo, $previousCompanyId);
            }
            if ($password !== '') {
                updateUserPassword($pdo, $id, $password);
            }
            $roleLabel = ucfirst($role);
            $actionName = ($oldUser['status'] ?? '') !== $status
                ? ($status === 'Active' ? 'Activate ' : 'Deactivate ') . $roleLabel
                : 'Update ' . $roleLabel;
            logActivity($pdo, (int)getSessionUser()['id'], $actionName, 'Updated ' . strtolower($roleLabel) . ' account for ' . $name . '.');
            echo json_encode(['success' => true, 'message' => 'Account updated successfully.']);
            exit;
        } catch (Exception $e) {
            sendError(500, 'Unable to update account: ' . $e->getMessage());
        }
        break;

    case 'reset_password':
        $id = intval($_POST['id'] ?? 0);
        $password = trim($_POST['password'] ?? '');
        $confirm = trim($_POST['confirm_password'] ?? '');

        if ($id <= 0 || $password === '' || $confirm === '') {
            sendError(400, 'Please provide a new password and confirmation.');
        }
        if ($password !== $confirm) {
            sendError(400, 'Password and Confirm Password must match.');
        }

        try {
            updateUserPassword($pdo, $id, $password);
            $target = $pdo->prepare('SELECT name, role FROM users WHERE id=? LIMIT 1');
            $target->execute([$id]);
            $target = $target->fetch() ?: ['name' => 'User', 'role' => 'user'];
            logActivity($pdo, (int)getSessionUser()['id'], 'Update User Password', 'Reset password for ' . $target['name'] . '.');
            echo json_encode(['success' => true, 'message' => 'Password reset successfully.']);
            exit;
        } catch (Exception $e) {
            sendError(500, 'Unable to reset password: ' . $e->getMessage());
        }
        break;

    case 'change_status':
        $id = intval($_POST['id'] ?? 0);
        $status = trim($_POST['status'] ?? 'Active');

        if ($id <= 0 || !in_array($status, ['Active', 'Inactive'], true)) {
            sendError(400, 'Invalid request.');
        }
        try {
            changeUserStatus($pdo, $id, $status);
            $target = $pdo->prepare('SELECT name, role FROM users WHERE id=? LIMIT 1');
            $target->execute([$id]);
            $target = $target->fetch() ?: ['name' => 'User', 'role' => 'user'];
            $roleLabel = ucfirst($target['role']);
            logActivity($pdo, (int)getSessionUser()['id'], $status === 'Active' ? 'Activate ' . $roleLabel : 'Deactivate ' . $roleLabel, ($status === 'Active' ? 'Activated ' : 'Deactivated ') . $target['name'] . '.');
            echo json_encode(['success' => true, 'message' => 'Account status updated.']);
            exit;
        } catch (Exception $e) {
            sendError(500, 'Unable to update status: ' . $e->getMessage());
        }
        break;

    default:
        sendError(400, 'Unknown action.');
        break;
}
