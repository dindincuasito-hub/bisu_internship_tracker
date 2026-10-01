<?php
// Quick API test — verifies api.php parses and init resource works
require __DIR__ . '/../php/db.php';

$pdo = getDbConnection();

// Simulate the init resource
$syStmt = $pdo->query('SELECT * FROM school_years ORDER BY id DESC');
$progStmt = $pdo->query('SELECT * FROM programs ORDER BY code ASC');
$compStmt = $pdo->query('SELECT * FROM companies ORDER BY name ASC');
$supStmt = $pdo->query("SELECT id, name, email, contact, company, status FROM users WHERE role='supervisor' AND status='Active' ORDER BY name ASC");
$coordStmt = $pdo->query("SELECT id, name, email, contact, employee_id, program, status FROM users WHERE role='coordinator' AND status='Active' ORDER BY name ASC");

$school_years = $syStmt->fetchAll();
$programs = $progStmt->fetchAll();
$companies = $compStmt->fetchAll();
$supervisors = $supStmt->fetchAll();
$coordinators = $coordStmt->fetchAll();

echo "school_years: " . count($school_years) . PHP_EOL;
echo "programs: " . count($programs) . PHP_EOL;
echo "companies: " . count($companies) . PHP_EOL;
echo "supervisors: " . count($supervisors) . PHP_EOL;
echo "coordinators: " . count($coordinators) . PHP_EOL;

// Test syntax of api.php
$syntaxCheck = shell_exec('C:\\xampp\\php\\php.exe -l ' . __DIR__ . '/../php/api.php 2>&1');
echo "api.php syntax: " . trim($syntaxCheck) . PHP_EOL;

// Test syntax of supervisor_tasks.php
$taskSyntax = shell_exec('C:\\xampp\\php\\php.exe -l ' . __DIR__ . '/../php/supervisor_tasks.php 2>&1');
echo "supervisor_tasks.php syntax: " . trim($taskSyntax) . PHP_EOL;

// Test syntax of db.php
$dbSyntax = shell_exec('C:\\xampp\\php\\php.exe -l ' . __DIR__ . '/../php/db.php 2>&1');
echo "db.php syntax: " . trim($dbSyntax) . PHP_EOL;
