<?php
require __DIR__ . '/../php/db.php';
$pdo = getDbConnection();

$sy = $pdo->query('SELECT id, year_label, semester, status FROM school_years ORDER BY id ASC')->fetchAll();
echo "School Years:\n";
foreach ($sy as $r) echo "  [{$r['id']}] {$r['year_label']} {$r['semester']} ({$r['status']})\n";

$users = $pdo->query("SELECT id, name, role FROM users ORDER BY id ASC")->fetchAll();
echo "\nUsers:\n";
foreach ($users as $r) echo "  [{$r['id']}] {$r['name']} ({$r['role']})\n";

$companies = $pdo->query('SELECT id, name FROM companies ORDER BY id ASC')->fetchAll();
echo "\nCompanies:\n";
foreach ($companies as $r) echo "  [{$r['id']}] {$r['name']}\n";
