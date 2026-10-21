-- Database schema for BISU Internship Tracker
CREATE DATABASE IF NOT EXISTS `bisu_internship_tracker` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `bisu_internship_tracker`;

CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(120) NOT NULL,
  `email` VARCHAR(160) NOT NULL UNIQUE,
  `username` VARCHAR(100) DEFAULT NULL,
  `contact` VARCHAR(100) DEFAULT NULL,
  `address` VARCHAR(255) DEFAULT NULL,
  `student_id` VARCHAR(50) DEFAULT NULL,
  `section` VARCHAR(50) DEFAULT NULL,
  `program` VARCHAR(100) DEFAULT NULL,
  `program_id` INT DEFAULT NULL,
  `academic_year` VARCHAR(50) DEFAULT NULL,
  `employee_id` VARCHAR(50) DEFAULT NULL,
  `company` VARCHAR(120) DEFAULT NULL,
  `company_id` INT DEFAULT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('student','supervisor','coordinator','admin') NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'Active',
  `created` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_login` DATETIME NULL,
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `activity_logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT DEFAULT NULL,
  `user_name` VARCHAR(120) NOT NULL,
  `role` VARCHAR(30) DEFAULT NULL,
  `action` VARCHAR(120) NOT NULL,
  `description` TEXT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `activity_logs_created_idx` (`created_at`),
  KEY `activity_logs_user_idx` (`user_id`),
  CONSTRAINT `activity_logs_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `programs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `code` VARCHAR(20) NOT NULL UNIQUE,
  `name` VARCHAR(255) NOT NULL,
  `req_hours` INT NOT NULL DEFAULT 0,
  `students_count` INT NOT NULL DEFAULT 0,
  `coordinator` VARCHAR(120) NOT NULL,
  `students_list` TEXT NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `school_years` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `year_label` VARCHAR(50) NOT NULL,
  `semester` VARCHAR(50) NOT NULL,
  `start_date` VARCHAR(50) NOT NULL,
  `end_date` VARCHAR(50) NOT NULL,
  `students_count` INT NOT NULL DEFAULT 0,
  `status` ENUM('Not Started','Ongoing','Completed') NOT NULL DEFAULT 'Not Started'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `supervisor_tasks` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `task` VARCHAR(255) NOT NULL,
  `assignee` VARCHAR(255) NOT NULL,
  `due_date` VARCHAR(50) NOT NULL,
  `submissions` VARCHAR(50) NOT NULL DEFAULT '0/0',
  `status` ENUM('Not Started','Ongoing','Completed') NOT NULL DEFAULT 'Not Started'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `face_registrations` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `student_id` VARCHAR(50) DEFAULT NULL,
  `face_image` LONGTEXT NOT NULL,
  `face_encoding` LONGTEXT DEFAULT NULL,
  `registration_status` VARCHAR(30) NOT NULL DEFAULT 'Registered',
  `status` VARCHAR(50) NOT NULL DEFAULT 'Registered',
  `registered_by` VARCHAR(120) NOT NULL,
  `remarks` TEXT DEFAULT NULL,
  `registered_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `face_registration_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  UNIQUE KEY `user_face_unique` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `notifications` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT DEFAULT NULL,
  `role` ENUM('student','supervisor','coordinator','admin') NOT NULL,
  `title` VARCHAR(120) NOT NULL,
  `message` TEXT NOT NULL,
  `type` ENUM('info','success','warning','error') NOT NULL DEFAULT 'info',
  `notification_type` VARCHAR(50) NOT NULL DEFAULT 'general',
  `task_id` INT DEFAULT NULL,
  `student_id` INT DEFAULT NULL,
  `attendance_id` INT DEFAULT NULL,
  `company_id` INT DEFAULT NULL,
  `supervisor_id` INT DEFAULT NULL,
  `attendance_date` DATE DEFAULT NULL,
  `submission_id` INT DEFAULT NULL,
  `is_read` TINYINT(1) NOT NULL DEFAULT 0,
  `page` VARCHAR(120) DEFAULT NULL,
  `url` VARCHAR(255) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `notification_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  KEY `notification_user_read_idx` (`user_id`, `is_read`, `created_at`),
  KEY `notification_task_idx` (`user_id`, `notification_type`, `task_id`, `is_read`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `companies` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(200) NOT NULL,
  `location` VARCHAR(255) DEFAULT '',
  `contact_person` VARCHAR(160) DEFAULT '',
  `contact_email` VARCHAR(160) DEFAULT '',
  `contact_phone` VARCHAR(60) DEFAULT '',
  `address` TEXT DEFAULT NULL,
  `status` ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `company_name_unique` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `coordinator_company` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `coordinator_id` INT NOT NULL,
  `company_id` INT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `coordinator_company_unique` (`coordinator_id`, `company_id`),
  CONSTRAINT `coordinator_company_coordinator_fk` FOREIGN KEY (`coordinator_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `coordinator_company_company_fk` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `coordinator_company_assignments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `coordinator_id` INT NOT NULL,
  `company_id` INT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `coordinator_company_assignments_unique` (`coordinator_id`, `company_id`),
  CONSTRAINT `coordinator_company_assignments_coordinator_fk` FOREIGN KEY (`coordinator_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `coordinator_company_assignments_company_fk` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `assignments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `student_id` INT NOT NULL,
  `company_id` INT DEFAULT NULL,
  `supervisor_id` INT DEFAULT NULL,
  `coordinator_id` INT DEFAULT NULL,
  `school_year_id` INT DEFAULT NULL,
  `program_code` VARCHAR(20) DEFAULT NULL,
  `internship_status` ENUM('Pending','Approved','Ongoing','Completed') NOT NULL DEFAULT 'Pending',
  `hours_completed` INT NOT NULL DEFAULT 0,
  `hours_required` INT NOT NULL DEFAULT 500,
  `evaluation_score` DECIMAL(5,2) DEFAULT NULL,
  `completion_cleared` TINYINT(1) NOT NULL DEFAULT 0,
  `remarks` TEXT DEFAULT NULL,
  `assigned_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `assignment_student_fk` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `assignment_company_fk` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE SET NULL,
  CONSTRAINT `assignment_supervisor_fk` FOREIGN KEY (`supervisor_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `assignment_coordinator_fk` FOREIGN KEY (`coordinator_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `assignment_school_year_fk` FOREIGN KEY (`school_year_id`) REFERENCES `school_years` (`id`) ON DELETE SET NULL,
  UNIQUE KEY `assignment_student_unique` (`student_id`),
  KEY `assignment_supervisor_idx` (`supervisor_id`),
  KEY `assignment_coordinator_idx` (`coordinator_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `attendance_logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `student_id` INT NOT NULL,
  `assignment_id` INT DEFAULT NULL,
  `log_date` DATE NOT NULL,
  `time_in` DATETIME DEFAULT NULL,
  `time_out` DATETIME DEFAULT NULL,
  `duration_minutes` INT DEFAULT NULL,
  `face_snapshot_in` LONGTEXT DEFAULT NULL,
  `face_snapshot_out` LONGTEXT DEFAULT NULL,
  `verification_status` ENUM('Verified','Failed','Pending') NOT NULL DEFAULT 'Pending',
  `status` ENUM('Present','Late','Absent','Excused') NOT NULL DEFAULT 'Present',
  `remarks` VARCHAR(255) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `attendance_student_fk` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `attendance_assignment_fk` FOREIGN KEY (`assignment_id`) REFERENCES `assignments` (`id`) ON DELETE SET NULL,
  UNIQUE KEY `attendance_daily_unique` (`student_id`, `log_date`),
  KEY `attendance_date_idx` (`log_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `tasks` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `title` VARCHAR(255) NOT NULL,
  `description` TEXT DEFAULT NULL,
  `supervisor_id` INT NOT NULL,
  `student_id` INT DEFAULT NULL,
  `assignee_type` ENUM('all','specific') NOT NULL DEFAULT 'all',
  `assignee_ids` TEXT DEFAULT NULL,
  `due_date` DATE DEFAULT NULL,
  `status` ENUM('Pending','Ongoing','Completed','Rejected / Needs Revision') NOT NULL DEFAULT 'Pending',
  `started_at` DATETIME DEFAULT NULL,
  `completed_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `task_supervisor_fk` FOREIGN KEY (`supervisor_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `task_student_fk` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  KEY `task_supervisor_status_idx` (`supervisor_id`, `status`),
  KEY `task_student_idx` (`student_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `task_submissions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `task_id` INT NOT NULL,
  `student_id` INT NOT NULL,
  `file_name` VARCHAR(255) DEFAULT NULL,
  `file_path` VARCHAR(500) DEFAULT NULL,
  `notes` TEXT DEFAULT NULL,
  `status` ENUM('Pending','For Review','Approved','Rejected') NOT NULL DEFAULT 'Pending',
  `is_late` TINYINT(1) NOT NULL DEFAULT 0,
  `supervisor_comment` TEXT DEFAULT NULL,
  `rejection_reason` TEXT DEFAULT NULL,
  `reviewed_by` INT DEFAULT NULL,
  `submitted_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reviewed_at` DATETIME DEFAULT NULL,
  CONSTRAINT `submission_task_fk` FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `submission_student_fk` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  UNIQUE KEY `submission_unique` (`task_id`, `student_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `evaluations` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `assignment_id` INT NOT NULL,
  `supervisor_id` INT NOT NULL,
  `score` DECIMAL(5,2) NOT NULL DEFAULT 0,
  `performance_rating` INT DEFAULT NULL,
  `punctuality` INT DEFAULT NULL,
  `quality_of_work` INT DEFAULT NULL,
  `teamwork` INT DEFAULT NULL,
  `communication` INT DEFAULT NULL,
  `remarks` TEXT DEFAULT NULL,
  `evaluated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `evaluation_assignment_fk` FOREIGN KEY (`assignment_id`) REFERENCES `assignments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `evaluation_supervisor_fk` FOREIGN KEY (`supervisor_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  UNIQUE KEY `evaluation_unique` (`assignment_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
