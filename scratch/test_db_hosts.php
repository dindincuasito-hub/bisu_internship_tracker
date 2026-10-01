<?php
$hosts = ['127.0.0.1', 'localhost'];
foreach ($hosts as $host) {
    $start = microtime(true);
    try {
        $pdo = new PDO("mysql:host={$host};port=3306;charset=utf8mb4", 'root', '', [
            PDO::ATTR_TIMEOUT => 2,
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
        ]);
        $time = round((microtime(true) - $start) * 1000, 2);
        echo "Host {$host}: CONNECTED IN {$time}ms\n";
    } catch (Exception $e) {
        $time = round((microtime(true) - $start) * 1000, 2);
        echo "Host {$host}: FAILED IN {$time}ms - " . $e->getMessage() . "\n";
    }
}
