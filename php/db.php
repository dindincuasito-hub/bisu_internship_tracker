<?php

function getDbConfig(): array
{
    $config = [
        'host' => '127.0.0.1',
        'dbname' => 'bisu_internship_tracker',
        'user' => 'root',
        'pass' => '',
        'charset' => 'utf8mb4',
    ];

    // Keep machine- and host-specific credentials out of version control.
    // db.local.php is intentionally ignored by Git and may return any or all
    // of the keys above.
    $localConfigPath = __DIR__ . '/db.local.php';
    if (is_file($localConfigPath)) {
        $localConfig = require $localConfigPath;
        if (!is_array($localConfig)) {
            throw new RuntimeException('Database configuration must return an array.');
        }
        foreach (array_keys($config) as $key) {
            if (array_key_exists($key, $localConfig)) {
                $config[$key] = (string) $localConfig[$key];
            }
        }
    }

    // Environment variables are useful on managed hosting and take priority
    // over the local configuration file when provided.
    $environmentKeys = [
        'host' => 'DB_HOST',
        'dbname' => 'DB_NAME',
        'user' => 'DB_USER',
        'pass' => 'DB_PASS',
        'charset' => 'DB_CHARSET',
    ];
    foreach ($environmentKeys as $key => $environmentKey) {
        $value = getenv($environmentKey);
        if ($value !== false && $value !== '') {
            $config[$key] = $value;
        }
    }

    return $config;
}

function getDbConnection(bool $initializeSchema = true, bool $createMissingDatabase = true): PDO
{
    $config = getDbConfig();
    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
        PDO::ATTR_TIMEOUT            => 3,
    ];

    try {
        $pdo = new PDO(
            "mysql:host={$config['host']};dbname={$config['dbname']};charset={$config['charset']}",
            $config['user'],
            $config['pass'],
            $options
        );
    } catch (PDOException $e) {
        if (($e->getCode() === 1049 || (int)$e->getCode() === 1049) && $createMissingDatabase) {
            createDatabase($config, $options);
            $pdo = new PDO(
                "mysql:host={$config['host']};dbname={$config['dbname']};charset={$config['charset']}",
                $config['user'],
                $config['pass'],
                $options
            );
        } else {
            throw $e;
        }
    }

    if ($initializeSchema) {
        initializeDatabase($pdo);
    } else {
        $pdo->exec('SET SESSION lock_wait_timeout = 5');
        $pdo->exec('SET SESSION innodb_lock_wait_timeout = 5');
    }
    return $pdo;
}

function logActivity(PDO $pdo, ?int $userId, string $action, string $description, ?string $userName = null, ?string $role = null): void
{
    if ($userId !== null && ($userName === null || $role === null)) {
        $actor = $pdo->prepare('SELECT name, role FROM users WHERE id=? LIMIT 1');
        $actor->execute([$userId]);
        $actor = $actor->fetch();
        $userName = $userName ?? ($actor['name'] ?? 'System');
        $role = $role ?? ($actor['role'] ?? null);
    }
    $stmt = $pdo->prepare('INSERT INTO activity_logs (user_id, user_name, role, action, description) VALUES (?,?,?,?,?)');
    $stmt->execute([$userId, $userName ?: 'System', $role, $action, $description]);
}

/**
 * Records an authenticated access event and alerts every active administrator.
 * Activity logs are the audit record; notifications are only an admin alert and
 * deliberately have no delete/read relationship with the activity log.
 */
function recordUserAccessEvent(PDO $pdo, array $user, string $action): void
{
    if (!in_array($action, ['Login', 'Logout'], true)) {
        throw new InvalidArgumentException('Unsupported user access action.');
    }

    $userId = (int)($user['id'] ?? 0);
    $name = trim((string)($user['name'] ?? 'User')) ?: 'User';
    $role = strtolower(trim((string)($user['role'] ?? '')));
    $roleLabel = $role !== '' ? ucfirst($role) : 'User';
    $verb = $action === 'Login' ? 'logged in' : 'logged out';

    logActivity($pdo, $userId ?: null, $action, $name . ' ' . $verb . '.', $name, $role ?: null);

    // Each admin has an independent notification inbox, so each active admin
    // receives one alert for this one access event.
    $admins = $pdo->query('SELECT id FROM users WHERE role = "admin" AND status = "Active"')->fetchAll(PDO::FETCH_COLUMN);
    if (!$admins) {
        return;
    }

    $insert = $pdo->prepare(
        'INSERT INTO notifications (user_id, role, title, message, type, notification_type, page, url, is_read)
         VALUES (?, "admin", ?, ?, "info", ?, "logs", "", 0)'
    );
    $notificationType = $action === 'Login' ? 'user_login' : 'user_logout';
    $title = 'User ' . $action;
    $message = $name . ' ' . $verb . '. Role: ' . $roleLabel . '.';
    foreach ($admins as $adminId) {
        $insert->execute([(int)$adminId, $title, $message, $notificationType]);
    }
}

// Guard flag: initializeDatabase runs at most once per PHP process.
// This prevents 12 CREATE TABLE statements from executing on every API request.
$_BISU_DB_INITIALIZED = false;

function createDatabase(array $config, array $options): void
{
    $pdo = new PDO(
        "mysql:host={$config['host']};charset={$config['charset']}",
        $config['user'],
        $config['pass'],
        $options
    );
    $pdo->exec("CREATE DATABASE IF NOT EXISTS `{$config['dbname']}` CHARACTER SET {$config['charset']} COLLATE {$config['charset']}_unicode_ci");
}

function initializeDatabase(PDO $pdo): void
{
    global $_BISU_DB_INITIALIZED;
    if ($_BISU_DB_INITIALIZED) {
        return; // Already ran in this PHP process — skip all CREATE TABLE overhead
    }
    $_BISU_DB_INITIALIZED = true;

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(120) NOT NULL,
            email VARCHAR(160) NOT NULL,
            username VARCHAR(100) DEFAULT NULL,
            contact VARCHAR(100) DEFAULT NULL,
            address VARCHAR(255) DEFAULT NULL,
            student_id VARCHAR(50) DEFAULT NULL,
            section VARCHAR(50) DEFAULT NULL,
            program VARCHAR(100) DEFAULT NULL,
            program_id INT DEFAULT NULL,
            academic_year VARCHAR(50) DEFAULT NULL,
            employee_id VARCHAR(50) DEFAULT NULL,
            company VARCHAR(120) DEFAULT NULL,
            company_id INT DEFAULT NULL,
            UNIQUE KEY (email),
            UNIQUE KEY (username),
            password_hash VARCHAR(255) NOT NULL,
            role ENUM('student','supervisor','coordinator','admin') NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'Active',
            created DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_login DATETIME NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;"
    );

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS activity_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT DEFAULT NULL,
            user_name VARCHAR(120) NOT NULL,
            role VARCHAR(30) DEFAULT NULL,
            action VARCHAR(120) NOT NULL,
            description TEXT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY activity_logs_created_idx (created_at),
            KEY activity_logs_user_idx (user_id),
            CONSTRAINT activity_logs_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;"
    );

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS programs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            code VARCHAR(20) NOT NULL UNIQUE,
            name VARCHAR(255) NOT NULL,
            req_hours INT NOT NULL DEFAULT 0,
            students_count INT NOT NULL DEFAULT 0,
            coordinator VARCHAR(120) NOT NULL,
            students_list TEXT NOT NULL DEFAULT ''
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;"
    );

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS school_years (
            id INT AUTO_INCREMENT PRIMARY KEY,
            year_label VARCHAR(50) NOT NULL,
            semester VARCHAR(50) NOT NULL,
            start_date VARCHAR(50) NOT NULL,
            end_date VARCHAR(50) NOT NULL,
            students_count INT NOT NULL DEFAULT 0,
            status VARCHAR(50) NOT NULL DEFAULT 'Active'
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;"
    );

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS supervisor_tasks (
            id INT AUTO_INCREMENT PRIMARY KEY,
            task VARCHAR(255) NOT NULL,
            assignee VARCHAR(255) NOT NULL,
            due_date VARCHAR(50) NOT NULL,
            submissions VARCHAR(50) NOT NULL DEFAULT '0/0',
            status ENUM('Not Started','Ongoing','Completed') NOT NULL DEFAULT 'Not Started'
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;"
    );

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS face_registrations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            student_id VARCHAR(50) DEFAULT NULL,
            face_image LONGTEXT NOT NULL,
            face_encoding LONGTEXT DEFAULT NULL,
            registration_status VARCHAR(30) NOT NULL DEFAULT 'Registered',
            status VARCHAR(50) NOT NULL DEFAULT 'Registered',
            registered_by VARCHAR(120) NOT NULL,
            remarks TEXT DEFAULT NULL,
            registered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE KEY user_face_unique (user_id),
            KEY face_student_status_idx (student_id, registration_status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;"
    );

    try {
        $faceColumns = $pdo->query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='face_registrations'")->fetchAll(PDO::FETCH_COLUMN);
        if (!in_array('student_id', $faceColumns, true)) $pdo->exec("ALTER TABLE face_registrations ADD COLUMN student_id VARCHAR(50) DEFAULT NULL AFTER user_id");
        if (!in_array('face_encoding', $faceColumns, true)) $pdo->exec("ALTER TABLE face_registrations ADD COLUMN face_encoding LONGTEXT DEFAULT NULL AFTER face_image");
        if (!in_array('registration_status', $faceColumns, true)) $pdo->exec("ALTER TABLE face_registrations ADD COLUMN registration_status VARCHAR(30) NOT NULL DEFAULT 'Registered' AFTER face_encoding");
        if (!in_array('updated_at', $faceColumns, true)) $pdo->exec("ALTER TABLE face_registrations ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at");
        $pdo->exec("UPDATE face_registrations fr JOIN users u ON u.id=fr.user_id SET fr.student_id=u.student_id WHERE (fr.student_id IS NULL OR fr.student_id='')");
        $pdo->exec("UPDATE face_registrations SET registration_status=CASE WHEN status='Registered' THEN 'Registered' ELSE status END WHERE registration_status IS NULL OR registration_status=''");
    } catch (Exception $e) {
        // Keep older installations usable if a nonessential migration is unavailable.
    }

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS notifications (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT DEFAULT NULL,
            role ENUM('student','supervisor','coordinator','admin') NOT NULL,
            title VARCHAR(120) NOT NULL,
            message TEXT NOT NULL,
            type ENUM('info','success','warning','error') NOT NULL DEFAULT 'info',
            notification_type VARCHAR(50) NOT NULL DEFAULT 'general',
            task_id INT DEFAULT NULL,
            student_id INT DEFAULT NULL,
            attendance_id INT DEFAULT NULL,
            company_id INT DEFAULT NULL,
            supervisor_id INT DEFAULT NULL,
            attendance_date DATE DEFAULT NULL,
            submission_id INT DEFAULT NULL,
            is_read TINYINT(1) NOT NULL DEFAULT 0,
            page VARCHAR(120) DEFAULT NULL,
            url VARCHAR(255) DEFAULT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            KEY notification_task_idx (user_id, notification_type, task_id, is_read)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;"
    );

    try {
        $notificationColumns = $pdo->query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='notifications'")->fetchAll(PDO::FETCH_COLUMN);
        if (!in_array('notification_type', $notificationColumns, true)) $pdo->exec("ALTER TABLE notifications ADD COLUMN notification_type VARCHAR(50) NOT NULL DEFAULT 'general' AFTER type");
        if (!in_array('task_id', $notificationColumns, true)) $pdo->exec("ALTER TABLE notifications ADD COLUMN task_id INT DEFAULT NULL AFTER notification_type");
        if (!in_array('student_id', $notificationColumns, true)) $pdo->exec("ALTER TABLE notifications ADD COLUMN student_id INT DEFAULT NULL AFTER task_id");
        if (!in_array('attendance_id', $notificationColumns, true)) $pdo->exec("ALTER TABLE notifications ADD COLUMN attendance_id INT DEFAULT NULL AFTER student_id");
        if (!in_array('company_id', $notificationColumns, true)) $pdo->exec("ALTER TABLE notifications ADD COLUMN company_id INT DEFAULT NULL AFTER attendance_id");
        if (!in_array('supervisor_id', $notificationColumns, true)) $pdo->exec("ALTER TABLE notifications ADD COLUMN supervisor_id INT DEFAULT NULL AFTER company_id");
        if (!in_array('attendance_date', $notificationColumns, true)) $pdo->exec("ALTER TABLE notifications ADD COLUMN attendance_date DATE DEFAULT NULL AFTER supervisor_id");
        if (!in_array('submission_id', $notificationColumns, true)) $pdo->exec("ALTER TABLE notifications ADD COLUMN submission_id INT DEFAULT NULL AFTER attendance_date");
        $notificationIndex = $pdo->query("SHOW INDEX FROM notifications WHERE Key_name='notification_task_idx'")->fetch();
        if (!$notificationIndex) $pdo->exec('ALTER TABLE notifications ADD INDEX notification_task_idx (user_id, notification_type, task_id, is_read)');
    } catch (Exception $e) {
        // Keep older installations usable if a nonessential migration is unavailable.
    }

    // ── NORMALIZED TABLES ──

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS companies (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(200) NOT NULL,
            location VARCHAR(255) DEFAULT '',
            contact_person VARCHAR(160) DEFAULT '',
            contact_email VARCHAR(160) DEFAULT '',
            contact_phone VARCHAR(60) DEFAULT '',
            address TEXT DEFAULT NULL,
            latitude DECIMAL(10,8) DEFAULT NULL,
            longitude DECIMAL(11,8) DEFAULT NULL,
            allowed_radius_meters INT NOT NULL DEFAULT 100,
            status ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY company_name_unique (name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;"
    );

    $contactPersonCheck = $pdo->query("SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companies' AND COLUMN_NAME = 'contact_person'")->fetch();
    if ($contactPersonCheck && intval($contactPersonCheck['count']) === 0) {
        $pdo->exec("ALTER TABLE companies ADD COLUMN contact_person VARCHAR(160) NOT NULL DEFAULT '' AFTER location");
    }

    $companyColumns = $pdo->query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='companies'")->fetchAll(PDO::FETCH_COLUMN);
    if (!in_array('latitude', $companyColumns, true)) {
        $pdo->exec("ALTER TABLE companies ADD COLUMN latitude DECIMAL(10,8) DEFAULT NULL AFTER address");
    }
    if (!in_array('longitude', $companyColumns, true)) {
        $pdo->exec("ALTER TABLE companies ADD COLUMN longitude DECIMAL(11,8) DEFAULT NULL AFTER latitude");
    }
    if (!in_array('allowed_radius_meters', $companyColumns, true)) {
        $pdo->exec("ALTER TABLE companies ADD COLUMN allowed_radius_meters INT NOT NULL DEFAULT 100 AFTER longitude");
    }

    $companyStatusType = $pdo->query("SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='companies' AND COLUMN_NAME='status'")->fetchColumn();
    if (is_string($companyStatusType) && strpos($companyStatusType, "'Pending'") !== false) {
        $pdo->exec("UPDATE companies SET status='Inactive' WHERE status='Pending'");
        $pdo->exec("ALTER TABLE companies MODIFY status ENUM('Active','Inactive') NOT NULL DEFAULT 'Active'");
    }

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS assignments (
            id INT AUTO_INCREMENT PRIMARY KEY,
            student_id INT NOT NULL,
            company_id INT DEFAULT NULL,
            supervisor_id INT DEFAULT NULL,
            coordinator_id INT DEFAULT NULL,
            school_year_id INT DEFAULT NULL,
            program_code VARCHAR(20) DEFAULT NULL,
            internship_status ENUM('Pending','Approved','Ongoing','Completed') NOT NULL DEFAULT 'Pending',
            hours_completed DECIMAL(8,2) NOT NULL DEFAULT 0,
            hours_required INT NOT NULL DEFAULT 500,
            evaluation_score DECIMAL(5,2) DEFAULT NULL,
            completion_cleared TINYINT(1) NOT NULL DEFAULT 0,
            remarks TEXT DEFAULT NULL,
            assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
            FOREIGN KEY (supervisor_id) REFERENCES users(id) ON DELETE SET NULL,
            FOREIGN KEY (coordinator_id) REFERENCES users(id) ON DELETE SET NULL,
            FOREIGN KEY (school_year_id) REFERENCES school_years(id) ON DELETE SET NULL,
            UNIQUE KEY assignment_student_unique (student_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;"
    );
    $hoursCompletedColumn = $pdo->query("SHOW COLUMNS FROM assignments LIKE 'hours_completed'")->fetch(PDO::FETCH_ASSOC);
    if ($hoursCompletedColumn && str_starts_with(strtolower((string)$hoursCompletedColumn['Type']), 'int')) {
        $pdo->exec('ALTER TABLE assignments MODIFY hours_completed DECIMAL(8,2) NOT NULL DEFAULT 0');
    }

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS coordinator_company (
            id INT AUTO_INCREMENT PRIMARY KEY,
            coordinator_id INT NOT NULL,
            company_id INT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY coordinator_company_unique (coordinator_id, company_id),
            FOREIGN KEY (coordinator_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;"
    );

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS coordinator_company_assignments (
            id INT AUTO_INCREMENT PRIMARY KEY,
            coordinator_id INT NOT NULL,
            company_id INT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY coordinator_company_assignments_unique (coordinator_id, company_id),
            FOREIGN KEY (coordinator_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;"
    );

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS attendance_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            student_id INT NOT NULL,
            assignment_id INT DEFAULT NULL,
            log_date DATE NOT NULL,
            time_in DATETIME DEFAULT NULL,
            time_out DATETIME DEFAULT NULL,
            duration_minutes INT DEFAULT NULL,
            face_snapshot_in LONGTEXT DEFAULT NULL,
            face_snapshot_out LONGTEXT DEFAULT NULL,
            time_in_latitude DECIMAL(10,8) DEFAULT NULL,
            time_in_longitude DECIMAL(11,8) DEFAULT NULL,
            time_in_accuracy DECIMAL(10,2) DEFAULT NULL,
            time_in_address VARCHAR(500) DEFAULT NULL,
            time_in_distance DECIMAL(10,2) DEFAULT NULL,
            time_in_distance_meters DECIMAL(10,2) DEFAULT NULL,
            time_in_location_status ENUM('Verified','Not Verified','Pending') NOT NULL DEFAULT 'Pending',
            time_out_latitude DECIMAL(10,8) DEFAULT NULL,
            time_out_longitude DECIMAL(11,8) DEFAULT NULL,
            time_out_accuracy DECIMAL(10,2) DEFAULT NULL,
            time_out_address VARCHAR(500) DEFAULT NULL,
            time_out_distance DECIMAL(10,2) DEFAULT NULL,
            time_out_distance_meters DECIMAL(10,2) DEFAULT NULL,
            time_out_location_status ENUM('Verified','Not Verified','Pending') NOT NULL DEFAULT 'Pending',
            time_out_verification_status ENUM('Verified','Failed','Pending') NOT NULL DEFAULT 'Pending',
            afternoon_time_in DATETIME DEFAULT NULL,
            afternoon_time_out DATETIME DEFAULT NULL,
            afternoon_face_snapshot_in LONGTEXT DEFAULT NULL,
            afternoon_face_snapshot_out LONGTEXT DEFAULT NULL,
            afternoon_time_in_latitude DECIMAL(10,8) DEFAULT NULL,
            afternoon_time_in_longitude DECIMAL(11,8) DEFAULT NULL,
            afternoon_time_in_accuracy DECIMAL(10,2) DEFAULT NULL,
            afternoon_time_in_address VARCHAR(500) DEFAULT NULL,
            afternoon_time_in_distance DECIMAL(10,2) DEFAULT NULL,
            afternoon_time_in_distance_meters DECIMAL(10,2) DEFAULT NULL,
            afternoon_time_in_location_status ENUM('Verified','Not Verified','Pending') NOT NULL DEFAULT 'Pending',
            afternoon_time_in_verification_status ENUM('Verified','Failed','Pending') NOT NULL DEFAULT 'Pending',
            afternoon_time_out_latitude DECIMAL(10,8) DEFAULT NULL,
            afternoon_time_out_longitude DECIMAL(11,8) DEFAULT NULL,
            afternoon_time_out_accuracy DECIMAL(10,2) DEFAULT NULL,
            afternoon_time_out_address VARCHAR(500) DEFAULT NULL,
            afternoon_time_out_distance DECIMAL(10,2) DEFAULT NULL,
            afternoon_time_out_distance_meters DECIMAL(10,2) DEFAULT NULL,
            afternoon_time_out_location_status ENUM('Verified','Not Verified','Pending') NOT NULL DEFAULT 'Pending',
            afternoon_time_out_verification_status ENUM('Verified','Failed','Pending') NOT NULL DEFAULT 'Pending',
            verification_status ENUM('Verified','Failed','Pending') NOT NULL DEFAULT 'Pending',
            status ENUM('Present','Late','Absent','Excused') NOT NULL DEFAULT 'Present',
            remarks VARCHAR(255) DEFAULT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE SET NULL,
            UNIQUE KEY attendance_daily_unique (student_id, log_date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;"
    );
    try {
        $attendanceColumns = $pdo->query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='attendance_logs'")->fetchAll(PDO::FETCH_COLUMN);
        $attendanceMigrations = [
            ['time_in_latitude', "ALTER TABLE attendance_logs ADD COLUMN time_in_latitude DECIMAL(10,8) DEFAULT NULL AFTER face_snapshot_out"],
            ['time_in_longitude', "ALTER TABLE attendance_logs ADD COLUMN time_in_longitude DECIMAL(11,8) DEFAULT NULL AFTER time_in_latitude"],
            ['time_in_accuracy', "ALTER TABLE attendance_logs ADD COLUMN time_in_accuracy DECIMAL(10,2) DEFAULT NULL AFTER time_in_longitude"],
            ['time_in_address', "ALTER TABLE attendance_logs ADD COLUMN time_in_address VARCHAR(500) DEFAULT NULL AFTER time_in_accuracy"],
            ['time_in_distance', "ALTER TABLE attendance_logs ADD COLUMN time_in_distance DECIMAL(10,2) DEFAULT NULL AFTER time_in_accuracy"],
            ['time_in_distance_meters', "ALTER TABLE attendance_logs ADD COLUMN time_in_distance_meters DECIMAL(10,2) DEFAULT NULL AFTER time_in_distance"],
            ['time_in_location_status', "ALTER TABLE attendance_logs ADD COLUMN time_in_location_status ENUM('Verified','Not Verified','Pending') NOT NULL DEFAULT 'Pending' AFTER time_in_distance_meters"],
            ['time_out_latitude', "ALTER TABLE attendance_logs ADD COLUMN time_out_latitude DECIMAL(10,8) DEFAULT NULL AFTER time_in_location_status"],
            ['time_out_longitude', "ALTER TABLE attendance_logs ADD COLUMN time_out_longitude DECIMAL(11,8) DEFAULT NULL AFTER time_out_latitude"],
            ['time_out_accuracy', "ALTER TABLE attendance_logs ADD COLUMN time_out_accuracy DECIMAL(10,2) DEFAULT NULL AFTER time_out_longitude"],
            ['time_out_address', "ALTER TABLE attendance_logs ADD COLUMN time_out_address VARCHAR(500) DEFAULT NULL AFTER time_out_accuracy"],
            ['time_out_distance', "ALTER TABLE attendance_logs ADD COLUMN time_out_distance DECIMAL(10,2) DEFAULT NULL AFTER time_out_accuracy"],
            ['time_out_distance_meters', "ALTER TABLE attendance_logs ADD COLUMN time_out_distance_meters DECIMAL(10,2) DEFAULT NULL AFTER time_out_distance"],
            ['time_out_location_status', "ALTER TABLE attendance_logs ADD COLUMN time_out_location_status ENUM('Verified','Not Verified','Pending') NOT NULL DEFAULT 'Pending' AFTER time_out_distance_meters"],
        ];
        foreach ($attendanceMigrations as [$columnName, $sql]) {
            if (!in_array($columnName, $attendanceColumns, true)) {
                $pdo->exec($sql);
            }
        }
        $verificationColumn = $pdo->query("SHOW COLUMNS FROM attendance_logs LIKE 'verification_status'")->fetch();
        if (!$verificationColumn) {
            $pdo->exec("ALTER TABLE attendance_logs ADD COLUMN verification_status ENUM('Verified','Failed','Pending') NOT NULL DEFAULT 'Pending' AFTER face_snapshot_out");
        }
        $pdo->exec("UPDATE attendance_logs SET verification_status='Verified' WHERE time_in IS NOT NULL AND verification_status='Pending'");
    } catch (Exception $e) {
        // Keep older installations usable if the attendance migration is unavailable.
    }

    $attendanceEventColumns = [
        'time_out_verification_status' => "ALTER TABLE attendance_logs ADD COLUMN time_out_verification_status ENUM('Verified','Failed','Pending') NOT NULL DEFAULT 'Pending'",
        'afternoon_time_in' => 'ALTER TABLE attendance_logs ADD COLUMN afternoon_time_in DATETIME DEFAULT NULL',
        'afternoon_time_out' => 'ALTER TABLE attendance_logs ADD COLUMN afternoon_time_out DATETIME DEFAULT NULL',
        'afternoon_face_snapshot_in' => 'ALTER TABLE attendance_logs ADD COLUMN afternoon_face_snapshot_in LONGTEXT DEFAULT NULL',
        'afternoon_face_snapshot_out' => 'ALTER TABLE attendance_logs ADD COLUMN afternoon_face_snapshot_out LONGTEXT DEFAULT NULL',
        'afternoon_time_in_latitude' => 'ALTER TABLE attendance_logs ADD COLUMN afternoon_time_in_latitude DECIMAL(10,8) DEFAULT NULL',
        'afternoon_time_in_longitude' => 'ALTER TABLE attendance_logs ADD COLUMN afternoon_time_in_longitude DECIMAL(11,8) DEFAULT NULL',
        'afternoon_time_in_accuracy' => 'ALTER TABLE attendance_logs ADD COLUMN afternoon_time_in_accuracy DECIMAL(10,2) DEFAULT NULL',
        'afternoon_time_in_address' => 'ALTER TABLE attendance_logs ADD COLUMN afternoon_time_in_address VARCHAR(500) DEFAULT NULL',
        'afternoon_time_in_distance' => 'ALTER TABLE attendance_logs ADD COLUMN afternoon_time_in_distance DECIMAL(10,2) DEFAULT NULL',
        'afternoon_time_in_distance_meters' => 'ALTER TABLE attendance_logs ADD COLUMN afternoon_time_in_distance_meters DECIMAL(10,2) DEFAULT NULL',
        'afternoon_time_in_location_status' => "ALTER TABLE attendance_logs ADD COLUMN afternoon_time_in_location_status ENUM('Verified','Not Verified','Pending') NOT NULL DEFAULT 'Pending'",
        'afternoon_time_in_verification_status' => "ALTER TABLE attendance_logs ADD COLUMN afternoon_time_in_verification_status ENUM('Verified','Failed','Pending') NOT NULL DEFAULT 'Pending'",
        'afternoon_time_out_latitude' => 'ALTER TABLE attendance_logs ADD COLUMN afternoon_time_out_latitude DECIMAL(10,8) DEFAULT NULL',
        'afternoon_time_out_longitude' => 'ALTER TABLE attendance_logs ADD COLUMN afternoon_time_out_longitude DECIMAL(11,8) DEFAULT NULL',
        'afternoon_time_out_accuracy' => 'ALTER TABLE attendance_logs ADD COLUMN afternoon_time_out_accuracy DECIMAL(10,2) DEFAULT NULL',
        'afternoon_time_out_address' => 'ALTER TABLE attendance_logs ADD COLUMN afternoon_time_out_address VARCHAR(500) DEFAULT NULL',
        'afternoon_time_out_distance' => 'ALTER TABLE attendance_logs ADD COLUMN afternoon_time_out_distance DECIMAL(10,2) DEFAULT NULL',
        'afternoon_time_out_distance_meters' => 'ALTER TABLE attendance_logs ADD COLUMN afternoon_time_out_distance_meters DECIMAL(10,2) DEFAULT NULL',
        'afternoon_time_out_location_status' => "ALTER TABLE attendance_logs ADD COLUMN afternoon_time_out_location_status ENUM('Verified','Not Verified','Pending') NOT NULL DEFAULT 'Pending'",
        'afternoon_time_out_verification_status' => "ALTER TABLE attendance_logs ADD COLUMN afternoon_time_out_verification_status ENUM('Verified','Failed','Pending') NOT NULL DEFAULT 'Pending'",
    ];
    $attendanceEventExistingColumns = $pdo->query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='attendance_logs'")->fetchAll(PDO::FETCH_COLUMN);
    foreach ($attendanceEventColumns as $columnName => $migrationSql) {
        if (!in_array($columnName, $attendanceEventExistingColumns, true)) {
            $pdo->exec($migrationSql);
        }
    }
    $pdo->exec("UPDATE attendance_logs SET time_out_verification_status=verification_status WHERE time_out IS NOT NULL AND time_out_verification_status='Pending' AND verification_status IN ('Verified','Failed')");

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS tasks (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            description TEXT DEFAULT NULL,
            supervisor_id INT NOT NULL,
            student_id INT DEFAULT NULL,
            assignee_type ENUM('all','specific') NOT NULL DEFAULT 'all',
            assignee_ids TEXT DEFAULT NULL,
            due_date DATE DEFAULT NULL,
            status ENUM('Pending','Ongoing','Completed','Rejected / Needs Revision') NOT NULL DEFAULT 'Pending',
            started_at DATETIME DEFAULT NULL,
            completed_at DATETIME DEFAULT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (supervisor_id) REFERENCES users(id) ON DELETE CASCADE,
            KEY task_supervisor_status_idx (supervisor_id, status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;"
    );


    try {
        $taskStudentColumn = $pdo->query("SHOW COLUMNS FROM tasks LIKE 'student_id'")->fetch();
        if (!$taskStudentColumn) {
            $pdo->exec('ALTER TABLE tasks ADD COLUMN student_id INT DEFAULT NULL AFTER supervisor_id');
        }
        $statusColumn = $pdo->query("SHOW COLUMNS FROM tasks LIKE 'status'")->fetch();
        if ($statusColumn) {
            $pdo->exec("ALTER TABLE tasks MODIFY status VARCHAR(50) NOT NULL DEFAULT 'Pending'");
            $pdo->exec("UPDATE tasks SET status = CASE
                WHEN status IN ('Not Started', 'Pending') THEN 'Pending'
                WHEN status IN ('In Progress', 'Ongoing') THEN 'Ongoing'
                WHEN status IN ('Done', 'Completed') THEN 'Completed'
                WHEN status = 'Submitted' THEN 'Ongoing'
                ELSE 'Pending'
            END");
            $pdo->exec("ALTER TABLE tasks MODIFY status ENUM('Pending','Ongoing','Completed','Rejected / Needs Revision') NOT NULL DEFAULT 'Pending'");
        }
        $studentIndex = $pdo->query("SHOW INDEX FROM tasks WHERE Key_name = 'task_student_idx'")->fetch();
        if (!$studentIndex) {
            $pdo->exec('ALTER TABLE tasks ADD INDEX task_student_idx (student_id, status)');
        }
        $studentForeignKey = $pdo->query("SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'student_id' AND REFERENCED_TABLE_NAME = 'users' LIMIT 1")->fetch();
        if (!$studentForeignKey) {
            $pdo->exec('ALTER TABLE tasks ADD CONSTRAINT task_student_fk FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE');
        }
    } catch (Exception $e) {
        // Keep older installations usable if a nonessential migration is unavailable.
    }
    try {
        $legacyTaskStatusColumn = $pdo->query("SHOW COLUMNS FROM supervisor_tasks LIKE 'status'")->fetch();
        if ($legacyTaskStatusColumn) {
            $pdo->exec("ALTER TABLE supervisor_tasks MODIFY status VARCHAR(50) NOT NULL DEFAULT 'Not Started'");
            $pdo->exec("UPDATE supervisor_tasks SET status = CASE
                WHEN status IN ('In Progress', 'Ongoing') THEN 'Ongoing'
                WHEN status IN ('Done', 'Completed') THEN 'Completed'
                WHEN status = 'Submitted' THEN 'Ongoing'
                ELSE 'Not Started'
            END");
            $pdo->exec("ALTER TABLE supervisor_tasks MODIFY status ENUM('Not Started','Ongoing','Completed') NOT NULL DEFAULT 'Not Started'");
        }
    } catch (Exception $e) {
        // Keep older installations usable if a nonessential migration is unavailable.
    }
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS task_submissions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            task_id INT NOT NULL,
            student_id INT NOT NULL,
            file_name VARCHAR(255) DEFAULT NULL,
            file_path VARCHAR(500) DEFAULT NULL,
            notes TEXT DEFAULT NULL,
            status ENUM('Pending','For Review','Approved','Rejected') NOT NULL DEFAULT 'Pending',
            is_late TINYINT(1) NOT NULL DEFAULT 0,
            supervisor_comment TEXT DEFAULT NULL,
            rejection_reason TEXT DEFAULT NULL,
            reviewed_by INT DEFAULT NULL,
            submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            reviewed_at DATETIME DEFAULT NULL,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
            FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE KEY submission_unique (task_id, student_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;"
    );
    try {
        $submissionColumns = $pdo->query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='task_submissions'")->fetchAll(PDO::FETCH_COLUMN);
        if (!in_array('is_late', $submissionColumns, true)) $pdo->exec("ALTER TABLE task_submissions ADD COLUMN is_late TINYINT(1) NOT NULL DEFAULT 0 AFTER status");
        if (!in_array('rejection_reason', $submissionColumns, true)) $pdo->exec("ALTER TABLE task_submissions ADD COLUMN rejection_reason TEXT DEFAULT NULL AFTER supervisor_comment");
        if (!in_array('reviewed_by', $submissionColumns, true)) $pdo->exec("ALTER TABLE task_submissions ADD COLUMN reviewed_by INT DEFAULT NULL AFTER reviewed_at");
        $taskColumns = $pdo->query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='tasks'")->fetchAll(PDO::FETCH_COLUMN);
        if (!in_array('started_at', $taskColumns, true)) $pdo->exec("ALTER TABLE tasks ADD COLUMN started_at DATETIME DEFAULT NULL AFTER status");
        if (!in_array('completed_at', $taskColumns, true)) $pdo->exec("ALTER TABLE tasks ADD COLUMN completed_at DATETIME DEFAULT NULL AFTER started_at");
        $pdo->exec("ALTER TABLE tasks MODIFY status ENUM('Pending','Ongoing','Completed','Rejected / Needs Revision') NOT NULL DEFAULT 'Pending'");
    } catch (Exception $e) {
        // Keep older installations usable if a nonessential migration is unavailable.
    }

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS evaluations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            assignment_id INT NOT NULL,
            supervisor_id INT NOT NULL,
            score DECIMAL(5,2) NOT NULL DEFAULT 0,
            performance_rating INT DEFAULT NULL COMMENT '1-5 stars',
            punctuality INT DEFAULT NULL,
            quality_of_work INT DEFAULT NULL,
            teamwork INT DEFAULT NULL,
            communication INT DEFAULT NULL,
            remarks TEXT DEFAULT NULL,
            evaluated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
            FOREIGN KEY (supervisor_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE KEY evaluation_unique (assignment_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;"
    );

    // ── SEED DATA ──

    $users = $pdo->query('SELECT COUNT(*) AS count FROM users')->fetch();
    if ($users && intval($users['count']) === 0) {
        $defaultUsers = [
            ['name' => 'Juan dela Cruz', 'email' => 'jdc@student.bisu.edu.ph', 'password' => 'student123', 'role' => 'student', 'student_id' => '2024-00123', 'section' => 'A', 'program' => 'BSIT', 'academic_year' => '2024-2025'],
            ['name' => 'Tech Solutions Inc.', 'email' => 'ojt@techsolutions.ph', 'password' => 'supervisor123', 'role' => 'supervisor', 'employee_id' => 'SUP-001', 'company' => 'Tech Solutions Inc.'],
            ['name' => 'Ma. Santos', 'email' => 'me.santos@bisu.edu.ph', 'password' => 'coordinator123', 'role' => 'coordinator', 'employee_id' => 'COORD-001'],
            ['name' => 'Admin User', 'email' => 'admin@bisu.edu.ph', 'password' => 'admin123', 'role' => 'admin'],
            ['name' => 'Ana Buenaventura', 'email' => 'a.buena@student.bisu.edu.ph', 'password' => 'student123', 'role' => 'student', 'student_id' => '2024-00124', 'section' => 'A', 'program' => 'BSIT', 'academic_year' => '2024-2025'],
            ['name' => 'Carlo Reyes', 'email' => 'c.reyes@student.bisu.edu.ph', 'password' => 'student123', 'role' => 'student', 'student_id' => '2024-00125', 'section' => 'A', 'program' => 'BSIT', 'academic_year' => '2024-2025'],
        ];
        $stmt = $pdo->prepare('INSERT INTO users (name, email, username, password_hash, role, status, student_id, section, program, academic_year, employee_id, company) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        foreach ($defaultUsers as $user) {
            $username = explode('@', $user['email'])[0];
            $stmt->execute([
                $user['name'],
                $user['email'],
                $username,
                password_hash($user['password'], PASSWORD_DEFAULT),
                $user['role'],
                'Active',
                $user['student_id'] ?? '',
                $user['section'] ?? '',
                $user['program'] ?? '',
                $user['academic_year'] ?? '',
                $user['employee_id'] ?? '',
                $user['company'] ?? '',
            ]);
        }
    }

    $programs = $pdo->query('SELECT COUNT(*) AS count FROM programs')->fetch();
    if ($programs && intval($programs['count']) === 0) {
        $stmt = $pdo->prepare('INSERT INTO programs (code, name, req_hours, students_count, coordinator, students_list) VALUES (?, ?, ?, ?, ?, ?)');
        $stmt->execute(['BSIT', 'Bachelor of Science in Information Technology', 500, 78, 'Ma. Santos', json_encode(['Juan dela Cruz', 'Ana Buenaventura', 'Carlo Reyes'])]);
        $stmt->execute(['BSCS', 'Bachelor of Science in Computer Science', 500, 52, 'Dr. Reyes', json_encode(['Maria Santos', 'Jose Ramos'])]);
        $stmt->execute(['BFST', 'Bachelor of Science in Food Science and Technology', 500, 35, 'TBD', json_encode([])]);
    }

    $schoolYears = $pdo->query('SELECT COUNT(*) AS count FROM school_years')->fetch();
    if ($schoolYears && intval($schoolYears['count']) === 0) {
        $stmt = $pdo->prepare('INSERT INTO school_years (year_label, semester, start_date, end_date, students_count, status) VALUES (?, ?, ?, ?, ?, ?)');
        $stmt->execute(['2024–2025', '2nd Semester', 'Jan 15, 2025', 'May 30, 2025', 186, 'Active']);
        $stmt->execute(['2024–2025', '1st Semester', 'Aug 12, 2024', 'Dec 20, 2024', 172, 'Completed']);
        $stmt->execute(['2023–2024', '2nd Semester', 'Jan 10, 2024', 'May 24, 2024', 160, 'Completed']);
        $stmt->execute(['2023–2024', '1st Semester', 'Aug 7, 2023', 'Dec 15, 2023', 155, 'Completed']);
    }

    $tasks = $pdo->query('SELECT COUNT(*) AS count FROM supervisor_tasks')->fetch();
    if ($tasks && intval($tasks['count']) === 0) {
        $stmt = $pdo->prepare('INSERT INTO supervisor_tasks (task, assignee, due_date, submissions, status) VALUES (?, ?, ?, ?, ?)');
        $stmt->execute(['System Documentation', 'All Interns', 'May 3', '8/12', 'Not Started']);
        $stmt->execute(['Client Presentation Deck', 'Juan, Paolo', 'May 7', '0/2', 'Not Started']);
        $stmt->execute(['Bug Report Log', 'Lisa', 'Apr 30', '1/1', 'Ongoing']);
        $stmt->execute(['Code Review Task', 'Ryan', 'May 5', '0/1', 'Not Started']);
    }

    // Ensure username and role-specific columns exist for older installations
    try {
        $schemaColumns = [
            'username' => "VARCHAR(100) DEFAULT NULL AFTER email",
            'contact' => "VARCHAR(100) DEFAULT NULL AFTER username",
            'address' => "VARCHAR(255) DEFAULT NULL AFTER contact",
            'student_id' => "VARCHAR(50) DEFAULT NULL AFTER contact",
            'section' => "VARCHAR(50) DEFAULT NULL AFTER student_id",
            'program' => "VARCHAR(100) DEFAULT NULL AFTER section",
            'program_id' => "INT DEFAULT NULL AFTER program",
            'academic_year' => "VARCHAR(50) DEFAULT NULL AFTER program",
            'employee_id' => "VARCHAR(50) DEFAULT NULL AFTER academic_year",
            'company' => "VARCHAR(120) DEFAULT NULL AFTER employee_id",
            'company_id' => "INT DEFAULT NULL AFTER company"
        ];
        foreach ($schemaColumns as $column => $definition) {
            $hasColumn = $pdo->query("SHOW COLUMNS FROM users LIKE '{$column}'")->fetch();
            if (!$hasColumn) {
                $pdo->exec("ALTER TABLE users ADD COLUMN {$column} {$definition}");
            }
        }
        $pdo->exec("UPDATE users u INNER JOIN programs p ON (u.program = p.code OR u.program = p.name OR p.coordinator = u.name) SET u.program_id = p.id, u.program = p.code WHERE u.role = 'coordinator' AND (u.program_id IS NULL OR u.program_id = 0)");
        $pdo->exec("UPDATE users u INNER JOIN programs p ON (u.program = p.code OR u.program = p.name) SET u.program_id = p.id, u.program = p.code WHERE u.role = 'student' AND (u.program_id IS NULL OR u.program_id = 0)");
        $pdo->exec("UPDATE users u INNER JOIN companies c ON u.company = c.name SET u.company_id = c.id WHERE u.role = 'supervisor' AND (u.company_id IS NULL OR u.company_id = 0)");
        $pdo->exec("INSERT INTO coordinator_company (coordinator_id, company_id) SELECT id, company_id FROM users WHERE role = 'coordinator' AND company_id IS NOT NULL AND company_id > 0 ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP");
        $pdo->exec("INSERT INTO coordinator_company_assignments (coordinator_id, company_id) SELECT coordinator_id, company_id FROM coordinator_company ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP");
        $pdo->exec("UPDATE users SET username = SUBSTRING_INDEX(email, '@', 1) WHERE (username IS NULL OR username = '') AND email LIKE '%@%'");
    } catch (Exception $e) {
        // ignore — best-effort for schema migration
    }
}

function isDatabaseUnavailable(Throwable $e): bool
{
    return $e instanceof PDOException;
}

function authenticateUser(PDO $pdo, string $username, string $password, string $role): ?array
{
    $fields = 'u.id, u.name, u.email, u.username, u.password_hash, u.role, u.status, u.created, u.last_login, u.program, u.program_id, COALESCE(p.name, p.code, u.program) AS program_name, u.student_id, u.section, u.academic_year, u.employee_id, u.company, u.company_id, COALESCE(c.name, u.company) AS company_name, u.contact, u.address';
    $stmt = $pdo->prepare("SELECT {$fields} FROM users u LEFT JOIN programs p ON p.id = u.program_id LEFT JOIN companies c ON c.id = u.company_id WHERE u.username = ? AND u.role = ? LIMIT 1");
    $stmt->execute([$username, $role]);
    $user = $stmt->fetch();
    if (!$user) {
        // fallback: if input looks like email, try email lookup for compatibility
        if (strpos($username, '@') !== false) {
            $stmt = $pdo->prepare("SELECT {$fields} FROM users u LEFT JOIN programs p ON p.id = u.program_id LEFT JOIN companies c ON c.id = u.company_id WHERE u.email = ? AND u.role = ? LIMIT 1");
            $stmt->execute([$username, $role]);
            $user = $stmt->fetch();
        } else {
            $stmt = $pdo->prepare("SELECT {$fields} FROM users u LEFT JOIN programs p ON p.id = u.program_id LEFT JOIN companies c ON c.id = u.company_id WHERE SUBSTRING_INDEX(u.email, '@', 1) = ? AND u.role = ? LIMIT 1");
            $stmt->execute([$username, $role]);
            $user = $stmt->fetch();
        }
        if (!$user) {
            return null;
        }
    }
    if (!password_verify($password, $user['password_hash'])) {
        return null;
    }
    $stmt = $pdo->prepare('UPDATE users SET last_login = ? WHERE id = ?');
    $stmt->execute([date('Y-m-d H:i:s'), $user['id']]);
    unset($user['password_hash']);
    $user['last_login'] = date('Y-m-d H:i:s');
    if (($user['role'] ?? '') === 'coordinator') {
        $companyIds = getCoordinatorCompanyIds($pdo, (int)($user['id'] ?? 0));
        $user['company_ids'] = $companyIds;
        if (!empty($companyIds)) {
            $user['company_id'] = (int)$companyIds[0];
            $user['company_name'] = $pdo->prepare('SELECT name FROM companies WHERE id = ? LIMIT 1')->execute([$user['company_id']]) ? null : null;
        }
    }
    return $user;
}

function getUserByUsernameAndRole(PDO $pdo, string $username, string $role): ?array
{
    $stmt = $pdo->prepare('SELECT id, name, email, username, role, status FROM users WHERE username = ? AND role = ? LIMIT 1');
    $stmt->execute([$username, $role]);
    $user = $stmt->fetch();
    if (!$user && strpos($username, '@') !== false) {
        $stmt = $pdo->prepare('SELECT id, name, email, username, role, status FROM users WHERE email = ? AND role = ? LIMIT 1');
        $stmt->execute([$username, $role]);
        $user = $stmt->fetch();
    } elseif (!$user) {
        $stmt = $pdo->prepare("SELECT id, name, email, username, role, status FROM users WHERE SUBSTRING_INDEX(email, '@', 1) = ? AND role = ? LIMIT 1");
        $stmt->execute([$username, $role]);
        $user = $stmt->fetch();
    }
    return $user ?: null;
}

function getFaceRegistrationHistory(PDO $pdo, int $userId): array
{
    $stmt = $pdo->prepare('SELECT registration_status AS status, registered_by, remarks, registered_at, created_at FROM face_registrations WHERE user_id = ? ORDER BY registered_at DESC');
    $stmt->execute([$userId]);
    return $stmt->fetchAll();
}

function saveFaceRegistration(PDO $pdo, int $userId, string $studentId, string $faceImage, string $faceEncoding, string $registeredBy, string $remarks = ''): int
{
    $stmt = $pdo->prepare('INSERT INTO face_registrations (user_id, student_id, face_image, face_encoding, registration_status, status, registered_by, remarks, registered_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $stmt->execute([
        $userId,
        $studentId,
        $faceImage,
        $faceEncoding,
        'Registered',
        'Registered',
        $registeredBy,
        $remarks,
        date('Y-m-d H:i:s')
    ]);
    return (int)$pdo->lastInsertId();
}

function getFaceRegistration(PDO $pdo, int $userId): ?array
{
    $stmt = $pdo->prepare("SELECT id, registration_status AS status, registered_by, remarks, registered_at, face_image, face_encoding FROM face_registrations WHERE user_id = ? AND registration_status = 'Registered' AND face_image IS NOT NULL AND face_image <> '' ORDER BY id DESC LIMIT 1");
    $stmt->execute([$userId]);
    return $stmt->fetch() ?: null;
}

function userExists(PDO $pdo, string $email): bool
{
    $stmt = $pdo->prepare('SELECT 1 FROM users WHERE email = ? LIMIT 1');
    $stmt->execute([$email]);
    return (bool) $stmt->fetchColumn();
}

function emailExists(PDO $pdo, string $email, int $excludeId = 0): bool
{
    $sql = 'SELECT 1 FROM users WHERE email = ?' . ($excludeId > 0 ? ' AND id != ?' : '') . ' LIMIT 1';
    $stmt = $pdo->prepare($sql);
    $params = $excludeId > 0 ? [$email, $excludeId] : [$email];
    $stmt->execute($params);
    return (bool) $stmt->fetchColumn();
}

function usernameExists(PDO $pdo, string $username, int $excludeId = 0): bool
{
    $sql = 'SELECT 1 FROM users WHERE username = ?' . ($excludeId > 0 ? ' AND id != ?' : '') . ' LIMIT 1';
    $stmt = $pdo->prepare($sql);
    $params = $excludeId > 0 ? [$username, $excludeId] : [$username];
    $stmt->execute($params);
    return (bool) $stmt->fetchColumn();
}

function getUsers(PDO $pdo): array
{
    $stmt = $pdo->query('SELECT u.id, u.name, u.email, u.username, u.role, u.status, u.created, u.contact, u.address, u.student_id, u.section, u.program, u.program_id, COALESCE(p.name, p.code, u.program) AS program_name, u.academic_year, u.employee_id, u.company_id, COALESCE(c.name, u.company) AS company_name, u.company FROM users u LEFT JOIN programs p ON p.id = u.program_id LEFT JOIN companies c ON c.id = u.company_id ORDER BY u.created DESC');
    $users = $stmt->fetchAll();
    foreach ($users as &$user) {
        if (($user['role'] ?? '') === 'coordinator') {
            $user['company_ids'] = getCoordinatorCompanyIds($pdo, (int)($user['id'] ?? 0));
            $user['company_id'] = $user['company_ids'] ? (int)$user['company_ids'][0] : null;
        }
    }
    unset($user);
    return $users;
}

function getCoordinatorCompanyIds(PDO $pdo, int $coordinatorId): array
{
    $stmt = $pdo->prepare('SELECT company_id FROM coordinator_company WHERE coordinator_id = ? ORDER BY company_id ASC');
    $stmt->execute([$coordinatorId]);
    $ids = [];
    foreach ($stmt->fetchAll() as $row) {
        $companyId = (int)($row['company_id'] ?? 0);
        if ($companyId > 0) {
            $ids[] = $companyId;
        }
    }
    if (!empty($ids)) {
        return array_values(array_unique($ids));
    }

    $legacyStmt = $pdo->prepare('SELECT company_id FROM coordinator_company_assignments WHERE coordinator_id = ? ORDER BY company_id ASC');
    $legacyStmt->execute([$coordinatorId]);
    foreach ($legacyStmt->fetchAll() as $row) {
        $companyId = (int)($row['company_id'] ?? 0);
        if ($companyId > 0) {
            $ids[] = $companyId;
        }
    }
    if (!empty($ids)) {
        return array_values(array_unique($ids));
    }

    $legacyUserStmt = $pdo->prepare('SELECT company_id FROM users WHERE id = ? AND role = "coordinator" AND company_id IS NOT NULL AND company_id > 0 LIMIT 1');
    $legacyUserStmt->execute([$coordinatorId]);
    $legacyCompanyId = (int)($legacyUserStmt->fetchColumn() ?: 0);
    if ($legacyCompanyId > 0) {
        $pdo->prepare('INSERT INTO coordinator_company (coordinator_id, company_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP')->execute([$coordinatorId, $legacyCompanyId]);
        $pdo->prepare('INSERT INTO coordinator_company_assignments (coordinator_id, company_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP')->execute([$coordinatorId, $legacyCompanyId]);
        return [$legacyCompanyId];
    }

    return [];
}

function createCoordinatorNotification(PDO $pdo, int $coordinatorId, string $notificationType, string $title, string $message, string $page, ?int $studentId = null, ?int $companyId = null): void
{
    $duplicate = $pdo->prepare(
        'SELECT id FROM notifications
         WHERE user_id = ? AND notification_type = ? AND student_id <=> ? AND company_id <=> ?
         LIMIT 1'
    );
    $duplicate->execute([$coordinatorId, $notificationType, $studentId, $companyId]);
    if ($duplicate->fetchColumn()) {
        return;
    }

    $stmt = $pdo->prepare(
        'INSERT INTO notifications
            (user_id, role, title, message, type, notification_type, student_id, company_id, page)
         VALUES (?, "coordinator", ?, ?, "info", ?, ?, ?, ?)'
    );
    $stmt->execute([$coordinatorId, $title, $message, $notificationType, $studentId, $companyId, $page]);
}

function notifyCoordinatorsAboutNewStudent(PDO $pdo, int $studentId, string $studentName, int $programId): void
{
    $stmt = $pdo->prepare(
        'SELECT id FROM users
         WHERE role = "coordinator" AND status = "Active" AND program_id = ?'
    );
    $stmt->execute([$programId]);
    foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $coordinatorId) {
        createCoordinatorNotification(
            $pdo,
            (int)$coordinatorId,
            'NEW_STUDENT',
            'New Student',
            $studentName . ' was added to your program.',
            'student-records',
            $studentId,
            null
        );
    }
}

function notifyCoordinatorsAboutNewCompany(PDO $pdo, int $companyId, string $companyName): void
{
    $assigned = $pdo->prepare(
        'SELECT DISTINCT u.id
         FROM users u
         WHERE u.role = "coordinator" AND u.status = "Active"
           AND (
               EXISTS (SELECT 1 FROM coordinator_company cc WHERE cc.coordinator_id = u.id AND cc.company_id = ?)
               OR EXISTS (SELECT 1 FROM coordinator_company_assignments cca WHERE cca.coordinator_id = u.id AND cca.company_id = ?)
               OR u.company_id = ?
           )'
    );
    $assigned->execute([$companyId, $companyId, $companyId]);
    $coordinatorIds = array_map('intval', $assigned->fetchAll(PDO::FETCH_COLUMN));

    if (!$coordinatorIds) {
        $allActive = $pdo->query(
            'SELECT id FROM users WHERE role = "coordinator" AND status = "Active"'
        )->fetchAll(PDO::FETCH_COLUMN);
        $coordinatorIds = array_map('intval', $allActive);
        if ($coordinatorIds) {
            $link = $pdo->prepare('INSERT IGNORE INTO coordinator_company (coordinator_id, company_id) VALUES (?, ?)');
            foreach ($coordinatorIds as $coordinatorId) {
                $link->execute([$coordinatorId, $companyId]);
            }
        }
    }

    foreach ($coordinatorIds as $coordinatorId) {
        createCoordinatorNotification(
            $pdo,
            $coordinatorId,
            'NEW_COMPANY',
            'New Company',
            $companyName . ' is now available for company assignment.',
            'company-assignment',
            null,
            $companyId
        );
    }
}

function syncCompanyHeadAssignments(PDO $pdo, int $companyId): void
{
    if ($companyId <= 0) {
        return;
    }
    $supervisorId = null;
    $stmt = $pdo->prepare('SELECT id FROM users WHERE role = "supervisor" AND status = "Active" AND company_id = ? ORDER BY id ASC LIMIT 1');
    $stmt->execute([$companyId]);
    $headId = $stmt->fetchColumn();
    if ($headId) {
        $supervisorId = (int)$headId;
    }
    $pdo->prepare('UPDATE assignments SET supervisor_id = ?, updated_at = CURRENT_TIMESTAMP WHERE company_id = ?')->execute([$supervisorId, $companyId]);
}

function setCoordinatorCompanyAssignments(PDO $pdo, int $coordinatorId, array $companyIds): void
{
    $ids = [];
    foreach ($companyIds as $companyId) {
        $value = (int)$companyId;
        if ($value > 0) {
            $ids[] = $value;
        }
    }
    $ids = array_values(array_unique($ids));

    if ($ids === []) {
        return;
    }

    // Keep existing coordinator-company assignments intact and only add new
    // company relationships. This preserves the first assigned company while
    // allowing additional companies to be added without replacing old ones.
    $insert = $pdo->prepare('INSERT IGNORE INTO coordinator_company (coordinator_id, company_id) VALUES (?, ?)');
    $compatInsert = $pdo->prepare('INSERT IGNORE INTO coordinator_company_assignments (coordinator_id, company_id) VALUES (?, ?)');
    foreach ($ids as $companyId) {
        $insert->execute([$coordinatorId, $companyId]);
        $compatInsert->execute([$coordinatorId, $companyId]);
    }
}

function updateUser(PDO $pdo, int $id, array $data): void
{
    $stmt = $pdo->prepare('UPDATE users SET name = ?, email = ?, username = ?, role = ?, status = ?, contact = ?, address = ?, student_id = ?, section = ?, program = ?, program_id = ?, academic_year = ?, employee_id = ?, company = ?, company_id = ? WHERE id = ?');
    $stmt->execute([
        $data['name'],
        $data['email'],
        $data['username'],
        $data['role'],
        $data['status'],
        $data['contact'],
        $data['address'] ?? null,
        $data['student_id'],
        $data['section'] ?? '',
        $data['program'],
        $data['program_id'] ?? null,
        $data['academic_year'],
        $data['employee_id'],
        $data['company'],
        $data['company_id'] ?? null,
        $id,
    ]);
}

function updateUserPassword(PDO $pdo, int $id, string $password): void
{
    $stmt = $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
    $stmt->execute([password_hash($password, PASSWORD_DEFAULT), $id]);
}

function changeUserStatus(PDO $pdo, int $id, string $status): void
{
    $stmt = $pdo->prepare('UPDATE users SET status = ? WHERE id = ?');
    $stmt->execute([$status, $id]);
}

function createUser(PDO $pdo, string $name, string $email, string $password, string $role, string $status = 'Active', ?string $username = null, string $contact = '', string $studentId = '', string $section = '', string $program = '', string $academicYear = '', string $employeeId = '', string $company = '', ?int $programId = null, ?int $companyId = null, ?string $address = null): int
{
    if ($username === null) {
        $username = explode('@', $email)[0];
    }
    $stmt = $pdo->prepare('INSERT INTO users (name, email, username, contact, address, student_id, section, program, program_id, academic_year, employee_id, company, company_id, password_hash, role, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $stmt->execute([
        $name,
        $email,
        $username,
        $contact,
        $address,
        $studentId,
        $section,
        $program,
        $programId,
        $academicYear,
        $employeeId,
        $company,
        $companyId,
        password_hash($password, PASSWORD_DEFAULT),
        $role,
        $status,
    ]);
    return (int) $pdo->lastInsertId();
}
