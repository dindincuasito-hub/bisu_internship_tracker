<?php
require "C:\xampp\htdocs\bisu_internship_tracker\php\db.php";
$pdo = getDbConnection();
echo "before=" . json_encode(getCoordinatorCompanyIds($pdo, 9)) . PHP_EOL;
setCoordinatorCompanyAssignments($pdo, 9, [4, 3]);
echo "after=" . json_encode(getCoordinatorCompanyIds($pdo, 9)) . PHP_EOL;
