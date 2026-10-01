<?php
/**
 * Full Integration Test — simulates the browser's complete flow for all 4 roles
 * Tests: login → init → role-specific data → CRUD operations
 */
$BASE = 'http://localhost/bisu_internship_tracker/php';
$COOKIE = sys_get_temp_dir() . '/bisu_fulltest_' . getmypid() . '.txt';

function httpPost(string $url, array $data, string $cookie): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query($data),
        CURLOPT_COOKIEJAR      => $cookie,
        CURLOPT_COOKIEFILE     => $cookie,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/x-www-form-urlencoded'],
        CURLOPT_TIMEOUT        => 10,
    ]);
    $body = curl_exec($ch);
    $err  = curl_error($ch);
    curl_close($ch);
    if ($err) return ['_curl_error' => $err];
    return json_decode($body, true) ?? ['_raw' => substr($body, 0, 300)];
}

function httpGet(string $url, string $cookie): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_COOKIEJAR      => $cookie,
        CURLOPT_COOKIEFILE     => $cookie,
        CURLOPT_TIMEOUT        => 10,
    ]);
    $body = curl_exec($ch);
    $err  = curl_error($ch);
    curl_close($ch);
    if ($err) return ['_curl_error' => $err];
    return json_decode($body, true) ?? ['_raw' => substr($body, 0, 300)];
}

function ok(string $label, $value = null): void {
    echo "  ✓ {$label}" . ($value !== null ? " → {$value}" : '') . "\n";
}
function fail(string $label, $detail = null): void {
    echo "  ✗ {$label}" . ($detail !== null ? " → " . (is_string($detail) ? $detail : json_encode($detail)) : '') . "\n";
}
function heading(string $title): void {
    echo "\n" . str_repeat('═', 50) . "\n  {$title}\n" . str_repeat('═', 50) . "\n";
}

$results = ['pass' => 0, 'fail' => 0];
function check(bool $cond, string $label, $detail = null): void {
    global $results;
    if ($cond) { ok($label); $results['pass']++; }
    else { fail($label, $detail); $results['fail']++; }
}

// ─────────────────────────────────────────────────
// 1. PUBLIC INIT ENDPOINT (no session required)
// ─────────────────────────────────────────────────
heading('1. Init Endpoint (no auth)');
$init = httpGet("{$BASE}/api.php?resource=init", $COOKIE);
check($init['success'] ?? false, 'init returns success');
check(count($init['school_years'] ?? []) >= 1, 'school_years: ' . count($init['school_years'] ?? []) . ' rows');
check(count($init['programs'] ?? []) >= 1, 'programs: ' . count($init['programs'] ?? []) . ' rows');
check(count($init['companies'] ?? []) >= 1, 'companies: ' . count($init['companies'] ?? []) . ' rows');
check(count($init['supervisors'] ?? []) >= 1, 'supervisors: ' . count($init['supervisors'] ?? []) . ' rows');
check(count($init['coordinators'] ?? []) >= 1, 'coordinators: ' . count($init['coordinators'] ?? []) . ' rows');

// ─────────────────────────────────────────────────
// 2. ADMIN ROLE
// ─────────────────────────────────────────────────
heading('2. Admin Login & Operations');
$admin = httpPost("{$BASE}/login.php", ['username'=>'admin','password'=>'admin123','role'=>'admin'], $COOKIE);
check($admin['success'] ?? false, 'Admin login', $admin['message'] ?? 'no message');
check(isset($admin['id']) && $admin['id'] > 0, 'Admin id returned: ' . ($admin['id'] ?? 0));
check($admin['role'] ?? '' === 'admin', 'Admin role confirmed');

// Admin: get user list
$users = httpGet("{$BASE}/users.php", $COOKIE);
check($users['success'] ?? false, 'Fetch user list');
check(count($users['users'] ?? []) >= 3, 'Has multiple users: ' . count($users['users'] ?? []));

// Admin: create a test coordinator
$createUser = httpPost("{$BASE}/users.php", [
    'action' => 'create',
    'name' => 'Test Coordinator ' . date('His'),
    'username' => 'testcoord_' . date('His'),
    'password' => 'Test@1234',
    'confirm_password' => 'Test@1234',
    'role' => 'coordinator',
    'status' => 'Active',
    'contact' => '09123456789',
    'program' => 'BSIT',
], $COOKIE);
check($createUser['success'] ?? false, 'Create coordinator account', $createUser['message'] ?? json_encode($createUser));
$newUserId = $createUser['user_id'] ?? 0;

// Admin: activate/deactivate
if ($newUserId > 0) {
    $toggle = httpPost("{$BASE}/users.php", ['action'=>'change_status','id'=>$newUserId,'status'=>'Inactive'], $COOKIE);
    check($toggle['success'] ?? false, 'Toggle user to Inactive');
    $toggle2 = httpPost("{$BASE}/users.php", ['action'=>'change_status','id'=>$newUserId,'status'=>'Active'], $COOKIE);
    check($toggle2['success'] ?? false, 'Toggle user back to Active');
}

// Admin: add school year
$sy = httpPost("{$BASE}/api.php?resource=school_years", [
    'year_label' => '2099-Test',
    'semester' => '1st Semester',
    'start_date' => 'Jan 1, 2099',
    'end_date' => 'Jun 30, 2099',
    'students_count' => 0,
    'status' => 'Active',
], $COOKIE);
check($sy['success'] ?? false, 'Admin: add school year', $sy['message'] ?? json_encode($sy));

// Admin: add company
$comp = httpPost("{$BASE}/api.php?resource=companies", [
    'name' => 'TestCorp ' . rand(1000, 9999),
    'location' => 'Bohol',
    'contact_email' => 'test@corp.ph',
    'contact_phone' => '09001234567',
    'status' => 'Active',
], $COOKIE);
check($comp['success'] ?? false, 'Admin: add company', $comp['message'] ?? json_encode($comp));

// ─────────────────────────────────────────────────
// 3. COORDINATOR ROLE
// ─────────────────────────────────────────────────
heading('3. Coordinator Login & Operations');
// Re-use same cookie — PHP sessions are per-browser
// Switch session to coordinator by logging in again
$coord = httpPost("{$BASE}/login.php", ['username'=>'me.santos','password'=>'coordinator123','role'=>'coordinator'], $COOKIE);
check($coord['success'] ?? false, 'Coordinator login', $coord['message'] ?? 'no message');
check(($coord['name'] ?? '') === 'Ma. Santos', 'Coordinator name: ' . ($coord['name'] ?? ''));

// Coordinator: fetch student records
$records = httpGet("{$BASE}/api.php?resource=student_records", $COOKIE);
check($records['success'] ?? false, 'Fetch student records');
$studentCount = count($records['students'] ?? []);
check($studentCount >= 1, "Has {$studentCount} student(s)");

// Coordinator: check first student has company
if ($studentCount > 0) {
    $first = $records['students'][0];
    check(!empty($first['name']), 'First student name: ' . ($first['name'] ?? ''));
    check(!empty($first['company_name']), 'First student has company: ' . ($first['company_name'] ?? 'NONE'));
}

// ─────────────────────────────────────────────────
// 4. STUDENT ROLE
// ─────────────────────────────────────────────────
heading('4. Student Login & Operations');
$student = httpPost("{$BASE}/login.php", ['username'=>'jdc','password'=>'student123','role'=>'student'], $COOKIE);
check($student['success'] ?? false, 'Student login', $student['message'] ?? 'no message');
check(($student['name'] ?? '') === 'Juan dela Cruz', 'Student name: ' . ($student['name'] ?? ''));
check(isset($student['id']) && $student['id'] > 0, 'Student id returned: ' . ($student['id'] ?? 0));

// Student: fetch attendance
$att = httpGet("{$BASE}/api.php?resource=attendance", $COOKIE);
check($att['success'] ?? false, 'Fetch attendance');

// Student: fetch assignments
$assign = httpGet("{$BASE}/api.php?resource=assignments", $COOKIE);
check($assign['success'] ?? false, 'Fetch student assignment');
check(!empty($assign['assignment']), 'Student has assignment: ' . ($assign['assignment']['company_name'] ?? 'none'));

// Student: fetch submissions
$subs = httpGet("{$BASE}/api.php?resource=submissions", $COOKIE);
check($subs['success'] ?? false, 'Fetch submissions');

// ─────────────────────────────────────────────────
// 5. SUPERVISOR ROLE
// ─────────────────────────────────────────────────
heading('5. Supervisor Login & Operations');
$sup = httpPost("{$BASE}/login.php", ['username'=>'ojt@techsolutions.ph','password'=>'supervisor123','role'=>'supervisor'], $COOKIE);
check($sup['success'] ?? false, 'Supervisor login', $sup['message'] ?? 'no message');

if ($sup['success'] ?? false) {
    $supAssignments = httpGet("{$BASE}/api.php?resource=assignments", $COOKIE);
    check($supAssignments['success'] ?? false, 'Supervisor fetch student assignments');
    check(count($supAssignments['assignments'] ?? []) >= 1, 'Supervisor has ' . count($supAssignments['assignments'] ?? []) . ' student(s)');

    $supTasks = httpGet("{$BASE}/supervisor_tasks.php", $COOKIE);
    check($supTasks['success'] ?? false, 'Supervisor fetch tasks');
}

// ─────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────
heading('Test Summary');
$total = $results['pass'] + $results['fail'];
echo "  PASS: {$results['pass']}/{$total}\n";
echo "  FAIL: {$results['fail']}/{$total}\n";
if ($results['fail'] === 0) {
    echo "\n  ✅ ALL TESTS PASSED\n";
} else {
    echo "\n  ⚠ {$results['fail']} TEST(S) FAILED — review above\n";
}

// Cleanup
@unlink($COOKIE);
