<?php
require __DIR__ . '/../php/db.php';
try {
    $pdo = getDbConnection();
    $tables = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    echo "Tables: " . implode(', ', $tables) . PHP_EOL;
    echo "Count: " . count($tables) . PHP_EOL;
} catch (Exception $e) {
    echo "ERROR: " . $e->getMessage() . PHP_EOL;
}
