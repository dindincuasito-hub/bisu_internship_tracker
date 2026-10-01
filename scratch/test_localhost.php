<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

echo "Testing localhost connection...\n";
$start = microtime(true);
try {
    $pdo = new PDO('mysql:host=localhost;dbname=bisu_internship_tracker;charset=utf8mb4', 'root', '', [PDO::ATTR_TIMEOUT => 2]);
    $time = round((microtime(true)-$start)*1000, 2);
    echo "SUCCESS: Connected via localhost in {$time}ms!\n";
    $users = $pdo->query("SELECT count(*) FROM users")->fetchColumn();
    echo "Users in DB: {$users}\n";
} catch (Exception $e) {
    echo "FAIL: " . $e->getMessage() . "\n";
}
