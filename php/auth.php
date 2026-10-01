<?php
require_once __DIR__ . '/db.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

function logAuthError(string $message): void
{
    error_log('[auth] ' . $message);
}

function requireAuth(?string $requiredRole = null): array
{
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }

    if (empty($_SESSION['user']['id']) || empty($_SESSION['user']['role'])) {
        logAuthError('Missing session data for access request.');
        throw new RuntimeException('Authentication required');
    }

    $user = $_SESSION['user'];
    session_write_close();

    $allowedRoles = ['student', 'supervisor', 'coordinator', 'admin'];
    if (!in_array($user['role'], $allowedRoles, true)) {
        logAuthError('Invalid role in session: ' . ($user['role'] ?? 'unknown'));
        throw new RuntimeException('Invalid session role');
    }

    if ($requiredRole !== null && $user['role'] !== $requiredRole) {
        throw new RuntimeException('Forbidden');
    }

    return $user;
}

function startUserSession(array $user): void
{
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    session_regenerate_id(true);
    $companyIds = [];
    if (!empty($user['company_ids']) && is_array($user['company_ids'])) {
        $companyIds = array_values(array_filter(array_map('intval', $user['company_ids'])));
    }
    if (($user['role'] ?? '') === 'coordinator' && empty($companyIds) && !empty($user['company_id'])) {
        $companyIds = [(int)$user['company_id']];
    }
    $_SESSION['user'] = [
        'id'           => intval($user['id'] ?? 0),
        'username'     => $user['username'] ?? '',
        'name'         => $user['name'] ?? '',
        'email'        => $user['email'] ?? '',
        'role'         => $user['role'] ?? 'student',
        'program'      => $user['program'] ?? null,
        'program_id'   => !empty($user['program_id']) ? intval($user['program_id']) : null,
        'student_id'   => $user['student_id'] ?? null,
        'section'      => $user['section'] ?? null,
        'academic_year'=> $user['academic_year'] ?? null,
        'company'      => $user['company'] ?? null,
        'company_id'   => !empty($user['company_id']) ? intval($user['company_id']) : (count($companyIds) ? (int)$companyIds[0] : null),
        'company_ids'  => $companyIds,
        'employee_id'  => $user['employee_id'] ?? null,
        'contact'      => $user['contact'] ?? null,
        'address'      => $user['address'] ?? null,
    ];
    session_write_close();
}

function clearUserSession(): void
{
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
    }
    session_destroy();
}

function getSessionUser(): ?array
{
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    $user = $_SESSION['user'] ?? null;
    session_write_close();
    return $user;
}

function getAllowedModulesForRole(string $role): array
{
    $modules = [
        'admin' => ['dashboard','users','programs','academicyear','companies','students','company-assignment','supervisor-assignment','attendance','tasks','submissions','journal','requirements','evaluations','reports','notifications','facereg'],
        'coordinator' => ['dashboard','programs','students','company-assignment','attendance','tasks','submissions','journal','requirements','evaluations','notifications','facereg'],
        'supervisor' => ['dashboard','students','attendance','tasks','submissions','journal','requirements','evaluations','notifications','facereg'],
        'student' => ['dashboard','attendance','tasks','submissions','journal','requirements','evaluations','notifications','facereg','profile'],
    ];

    return $modules[$role] ?? $modules['student'];
}

function enforceRoleAccess(string $requestedModule, string $role): bool
{
    $allowedModules = getAllowedModulesForRole($role);
    return in_array($requestedModule, $allowedModules, true);
}
