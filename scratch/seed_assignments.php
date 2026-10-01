<?php
/**
 * Seed demo assignment — connects Juan dela Cruz (student id=1) to:
 *   company: Tech Solutions Inc. (id=1)
 *   supervisor: ojt@techsolutions.ph (id=2)
 *   coordinator: me.santos (id=3)
 *   school_year: 2024-2025 2nd Semester (id=1)
 */
require __DIR__ . '/../php/db.php';

$pdo = getDbConnection();

// Check if assignment already exists
$check = $pdo->prepare('SELECT id FROM assignments WHERE student_id=? LIMIT 1');
$check->execute([1]);
if ($check->fetch()) {
    echo "Assignment for student id=1 already exists.\n";
} else {
    $stmt = $pdo->prepare(
        'INSERT INTO assignments (student_id, company_id, supervisor_id, coordinator_id, school_year_id, program_code, internship_status, hours_required, hours_completed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    // school_year_id=5 (2025-2026 1st Semester Active), company=1, sup=2, coord=3
    $stmt->execute([1, 1, 2, 3, 5, 'BSIT', 'Ongoing', 500, 120]);
    echo "Assignment created: id=" . $pdo->lastInsertId() . "\n";
}

// Also seed assignments for Ana (id=5) and Carlo (id=6)
$students = [5 => [2, 2, 3, 5, 'BSIT', 60], 6 => [1, 2, 3, 5, 'BSIT', 45]];
foreach ($students as $sid => $vals) {
    $check = $pdo->prepare('SELECT id FROM assignments WHERE student_id=? LIMIT 1');
    $check->execute([$sid]);
    if (!$check->fetch()) {
        $stmt = $pdo->prepare(
            'INSERT INTO assignments (student_id, company_id, supervisor_id, coordinator_id, school_year_id, program_code, internship_status, hours_required, hours_completed)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([$sid, $vals[0], $vals[1], $vals[2], $vals[3], $vals[4], 'Ongoing', 500, $vals[5]]);
        echo "Assignment created for student_id={$sid}: id=" . $pdo->lastInsertId() . "\n";
    } else {
        echo "Assignment for student_id={$sid} already exists.\n";
    }
}

// Verify
$all = $pdo->query(
    'SELECT a.id, u.name AS student, c.name AS company, su.name AS supervisor, co.name AS coordinator, a.internship_status, a.hours_completed
     FROM assignments a
     JOIN users u ON a.student_id = u.id
     LEFT JOIN companies c ON a.company_id = c.id
     LEFT JOIN users su ON a.supervisor_id = su.id
     LEFT JOIN users co ON a.coordinator_id = co.id'
)->fetchAll();

echo "\nAssignments in DB:\n";
foreach ($all as $r) {
    echo "  [{$r['id']}] {$r['student']} → {$r['company']} | sup: {$r['supervisor']} | coord: {$r['coordinator']} | {$r['internship_status']} | {$r['hours_completed']}h\n";
}
