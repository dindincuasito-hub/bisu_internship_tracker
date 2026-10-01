<?php
// Syntax check all modified PHP files
$files = [
    __DIR__ . '/../php/login.php',
    __DIR__ . '/../php/auth.php',
    __DIR__ . '/../php/db.php',
    __DIR__ . '/../php/api.php',
    __DIR__ . '/../php/supervisor_tasks.php',
    __DIR__ . '/../php/users.php',
];

$allOk = true;
foreach ($files as $file) {
    $out = shell_exec("C:\\xampp\\php\\php.exe -l \"$file\" 2>&1");
    $basename = basename($file);
    if (strpos($out, 'No syntax errors') !== false) {
        echo "✓ {$basename}: OK\n";
    } else {
        echo "✗ {$basename}: FAIL — " . trim($out) . "\n";
        $allOk = false;
    }
}

echo $allOk ? "\nAll files: PASS\n" : "\nSome files have errors!\n";
