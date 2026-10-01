<?php
require 'C:/xampp/htdocs/bisu_internship_tracker/php/db.php';
try {
    $t = microtime(true);
    $pdo = getDbConnection();
    printf("DB connect + initializeDatabase: %.3fs\n", microtime(true) - $t);
    $t2 = microtime(true);
    $pdo->query('SHOW TABLES');
    printf("SHOW TABLES query: %.3fs\n", microtime(true) - $t2);
    // Second call — should skip initializeDatabase via flag
    $t3 = microtime(true);
    $pdo2 = getDbConnection();
    printf("Second getDbConnection (should be instant): %.3fs\n", microtime(true) - $t3);
} catch (Exception $e) {
    echo 'ERR: ' . $e->getMessage() . "\n";
}
