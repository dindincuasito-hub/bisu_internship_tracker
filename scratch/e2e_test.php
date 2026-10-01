<?php
/**
 * End-to-end API test — simulates what the browser JS does
 * Tests: login → init data → school_years → programs → companies → student_records
 */

$BASE = 'http://localhost/bisu_internship_tracker/php';

// Helper: HTTP POST
function apiPost(string $url, array $data = []): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query($data),
        CURLOPT_COOKIEJAR      => sys_get_temp_dir() . '/bisu_test_cookie.txt',
        CURLOPT_COOKIEFILE     => sys_get_temp_dir() . '/bisu_test_cookie.txt',
        CURLOPT_HTTPHEADER     => ['Content-Type: application/x-www-form-urlencoded'],
        CURLOPT_TIMEOUT        => 10,
    ]);
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);
    curl_close($ch);
    if ($err) return ['_curl_error' => $err];
    $json = json_decode($body, true);
    return $json ?? ['_raw' => $body, '_code' => $code];
}

function apiGet(string $url): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_COOKIEJAR      => sys_get_temp_dir() . '/bisu_test_cookie.txt',
        CURLOPT_COOKIEFILE     => sys_get_temp_dir() . '/bisu_test_cookie.txt',
        CURLOPT_TIMEOUT        => 10,
    ]);
    $body = curl_exec($ch);
    $err  = curl_error($ch);
    curl_close($ch);
    if ($err) return ['_curl_error' => $err];
    $json = json_decode($body, true);
    return $json ?? ['_raw' => substr($body, 0, 200)];
}

function pass(string $label): void { echo "  ✓ {$label}\n"; }
function fail(string $label, mixed $detail = null): void {
    echo "  ✗ {$label}\n";
    if ($detail) echo "    → " . (is_string($detail) ? $detail : json_encode($detail)) . "\n";
}

echo "═══════════════════════════════════════\n";
echo " BISU Internship Tracker — API Test\n";
echo "═══════════════════════════════════════\n\n";

// ── 1. LOGIN as admin ──────────────────────
echo "[1] Login as Admin\n";
$login = apiPost("{$BASE}/login.php", [
    'username' => 'admin',
    'password' => 'admin123',
    'role'     => 'admin',
]);
if (($login['success'] ?? false) === true) {
    pass("Login successful — name: {$login['name']}, id: {$login['id']}");
} else {
    fail("Admin login failed", $login);
}
echo "\n";

// ── 2. INIT DATA ───────────────────────────
echo "[2] Init Data (api.php?resource=init)\n";
$init = apiGet("{$BASE}/api.php?resource=init");
if ($init['success'] ?? false) {
    pass("school_years: " . count($init['school_years'] ?? []) . " records");
    pass("programs: " . count($init['programs'] ?? []) . " records");
    pass("companies: " . count($init['companies'] ?? []) . " records");
    pass("supervisors: " . count($init['supervisors'] ?? []) . " records");
    pass("coordinators: " . count($init['coordinators'] ?? []) . " records");
} else {
    fail("Init data failed", $init);
}
echo "\n";

// ── 3. SCHOOL YEARS POST ───────────────────
echo "[3] Add School Year\n";
$sy = apiPost("{$BASE}/api.php?resource=school_years", [
    'year_label'     => '2025–2026',
    'semester'       => '1st Semester',
    'start_date'     => 'Aug 1, 2025',
    'end_date'       => 'Dec 31, 2025',
    'students_count' => '200',
    'status'         => 'Active',
]);
if ($sy['success'] ?? false) {
    pass("School year added — id: " . ($sy['id'] ?? '?'));
} else {
    fail("Add school year failed", $sy);
}
echo "\n";

// ── 4. STUDENT RECORDS (coordinator) ───────
echo "[4] Student Records (as coordinator)\n";
// First login as coordinator
$clogin = apiPost("{$BASE}/login.php", [
    'username' => 'me.santos',
    'password' => 'coordinator123',
    'role'     => 'coordinator',
]);
if ($clogin['success'] ?? false) {
    pass("Coordinator login — name: {$clogin['name']}, id: {$clogin['id']}");
    $records = apiGet("{$BASE}/api.php?resource=student_records");
    if ($records['success'] ?? false) {
        pass("Student records loaded: " . count($records['students'] ?? []) . " students");
    } else {
        fail("Student records failed", $records);
    }
} else {
    fail("Coordinator login failed", $clogin);
}
echo "\n";

// ── 5. STUDENT ASSIGNMENT ──────────────────
echo "[5] Attendance (as student)\n";
$slogin = apiPost("{$BASE}/login.php", [
    'username' => 'jdc',
    'password' => 'student123',
    'role'     => 'student',
]);
if ($slogin['success'] ?? false) {
    pass("Student login — name: {$slogin['name']}, id: {$slogin['id']}");
    $att = apiGet("{$BASE}/api.php?resource=attendance");
    if ($att['success'] ?? false) {
        pass("Attendance loaded: " . count($att['attendance'] ?? []) . " records");
    } else {
        fail("Attendance fetch failed", $att);
    }
} else {
    fail("Student login failed", $slogin);
}

echo "\n═══════════════════════════════════════\n";
echo " Test Complete\n";
echo "═══════════════════════════════════════\n";
