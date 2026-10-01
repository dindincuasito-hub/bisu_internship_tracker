<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

echo "Testing 127.0.0.1:\n";
$start = microtime(true);
try {
    $pdo1 = new PDO('mysql:host=127.0.0.1;dbname=bisu_internship_tracker;charset=utf8mb4', 'root', '', [PDO::ATTR_TIMEOUT => 2]);
    echo "127.0.0.1 OK in " . round((microtime(true)-$start)*1000, 2) . "ms\n";
} catch (Exception $e) {
    echo "127.0.0.1 FAIL: " . $e->getMessage() . "\n";
}

echo "Testing localhost:\n";
$start = microtime(true);
try {
    $pdo2 = new PDO('mysql:host=localhost;dbname=bisu_internship_tracker;charset=utf8mb4', 'root', '', [PDO::ATTR_TIMEOUT => 2]);
    echo "localhost OK in " . round((microtime(true)-$start)*1000, 2) . "ms\n";
} catch (Exception $e) {
    echo "localhost FAIL: " . $e->getMessage() . "\n";
}
