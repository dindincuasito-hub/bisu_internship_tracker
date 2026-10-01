<?php
require_once __DIR__ . '/../php/db.php';
try {
    $pdo = getDbConnection();
    echo "DB CONNECTED SUCCESSFULLY AND INITIALIZED!\n";
    $stmt = $pdo->query("SELECT count(*) as cnt FROM users");
    $row = $stmt->fetch();
    echo "User count: " . $row['cnt'] . "\n";
} catch (Exception $e) {
    echo "DB Exception: " . $e->getMessage() . "\n";
}
