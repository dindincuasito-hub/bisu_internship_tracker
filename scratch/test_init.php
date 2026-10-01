<?php
/**
 * Quick test: verify init endpoint works WITHOUT a session (public access)
 */
$BASE = 'http://localhost/bisu_internship_tracker/php';

function get(string $url): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10]);
    $body = curl_exec($ch);
    curl_close($ch);
    return json_decode($body, true) ?? ['_raw' => substr($body, 0, 300)];
}

echo "=== Test: api.php?resource=init (no session) ===\n";
$data = get("{$BASE}/api.php?resource=init");
if ($data['success'] ?? false) {
    echo "  ✓ school_years: " . count($data['school_years'] ?? []) . "\n";
    echo "  ✓ programs: " . count($data['programs'] ?? []) . "\n";
    echo "  ✓ companies: " . count($data['companies'] ?? []) . "\n";
    echo "  ✓ supervisors: " . count($data['supervisors'] ?? []) . "\n";
    echo "  ✓ coordinators: " . count($data['coordinators'] ?? []) . "\n";
    echo "  Sample school year: " . ($data['school_years'][0]['year_label'] ?? 'N/A') . " - " . ($data['school_years'][0]['semester'] ?? '') . "\n";
    echo "  Sample company: " . ($data['companies'][0]['name'] ?? 'N/A') . "\n";
} else {
    echo "  ✗ FAILED: " . json_encode($data) . "\n";
}

echo "\n=== Test: api.php?resource=unknown ===\n";
$data2 = get("{$BASE}/api.php?resource=unknown");
echo "  Expected 404: " . ($data2['success'] === false ? '✓' : '✗') . " — " . ($data2['message'] ?? '') . "\n";

echo "\n=== Test: PHP syntax api.php ===\n";
$syntax = shell_exec('C:\\xampp\\php\\php.exe -l C:\\xampp\\htdocs\\bisu_internship_tracker\\php\\api.php 2>&1');
echo "  " . trim($syntax) . "\n";
