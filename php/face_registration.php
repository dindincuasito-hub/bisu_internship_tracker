<?php
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth.php';
header('Content-Type: application/json; charset=utf-8');

function ensureFaceRegistrationsTableExists(PDO $pdo): void
{
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
            UNIQUE KEY user_face_unique (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;"
    );
}

function findStudentUser(PDO $pdo, string $username, string $studentId, string $role): ?array
{
    if ($studentId !== '') {
        $stmt = $pdo->prepare('SELECT id, name, email, username, role, status, student_id FROM users WHERE student_id = ? AND role = ? LIMIT 1');
        $stmt->execute([$studentId, $role]);
        $user = $stmt->fetch();
        if ($user) {
            return $user;
        }
    }

    return getUserByUsernameAndRole($pdo, $username, $role);
}

function validateFaceImage(string $faceImage): bool
{
    return preg_match('/^data:image\/(jpeg|png);base64,[A-Za-z0-9+\/]+=*$/', $faceImage) === 1;
}

function decodeFaceImage(string $faceImage): array
{
    if (!validateFaceImage($faceImage)) {
        throw new RuntimeException('Captured face image is invalid.');
    }

    [, $encoded] = explode(',', $faceImage, 2);
    $decoded = base64_decode($encoded, true);
    if ($decoded === false || $decoded === '' || strlen($decoded) > 5 * 1024 * 1024) {
        throw new RuntimeException('Captured face image is empty or too large.');
    }

    $imageInfo = @getimagesizefromstring($decoded);
    $mime = $imageInfo['mime'] ?? '';
    $width = (int)($imageInfo[0] ?? 0);
    $height = (int)($imageInfo[1] ?? 0);
    if (!in_array($mime, ['image/jpeg', 'image/png'], true)
        || $width < 192
        || $height < 192
        || abs($width - $height) > max($width, $height) * 0.05) {
        throw new RuntimeException('A valid, square face crop of at least 192x192 pixels is required.');
    }

    return [$decoded, $mime === 'image/png' ? 'png' : 'jpg'];
}

function storedFaceImageIsValid(string $storedPath): bool
{
    if (!str_starts_with($storedPath, 'uploads/')) {
        return false;
    }

    $projectRoot = dirname(__DIR__);
    $absolutePath = realpath($projectRoot . '/' . ltrim($storedPath, '/'));
    $uploadRoot = realpath($projectRoot . '/uploads/face_registrations');
    if (!$absolutePath || !$uploadRoot || !str_starts_with($absolutePath, $uploadRoot . DIRECTORY_SEPARATOR) || !is_file($absolutePath)) {
        return false;
    }

    $imageInfo = @getimagesize($absolutePath);
    return in_array($imageInfo['mime'] ?? '', ['image/jpeg', 'image/png'], true)
        && ($imageInfo[0] ?? 0) >= 160
        && ($imageInfo[1] ?? 0) >= 120;
}

function faceEncodingIsValid($encoding): bool
{
    if (!is_array($encoding) || count($encoding) !== 128) {
        return false;
    }
    foreach ($encoding as $value) {
        if (!is_numeric($value) || !is_finite((float)$value)) {
            return false;
        }
    }
    return true;
}

function faceImageUrl(string $storedPath): string
{
    if (!str_starts_with($storedPath, 'uploads/')) {
        return $storedPath;
    }

    $projectRoot = dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/bisu_internship_tracker/php/face_registration.php'));
    return rtrim($projectRoot, '/') . '/' . ltrim($storedPath, '/');
}

$requestMethod = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($requestMethod !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

$action = trim($_POST['action'] ?? '');
$pdo = null;
$sessionUser = getSessionUser();
if (!$sessionUser || ($sessionUser['role'] ?? '') !== 'student') {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Student session is required']);
    exit;
}
$userId = (int)$sessionUser['id'];
$studentId = trim((string)($sessionUser['student_id'] ?? ''));

if ($action === 'status') {
    try {
        $pdo = getDbConnection(false, false);
        $userStmt = $pdo->prepare('SELECT id, name, email, username, role, status, student_id FROM users WHERE id=? AND role="student" AND status="Active" LIMIT 1');
        $userStmt->execute([$userId]);
        $user = $userStmt->fetch();
        if (!$user) {
            echo json_encode(['success' => false, 'message' => 'Student not found']);
            exit;
        }
        $registrationStmt = $pdo->prepare(
            "SELECT id,
                  CASE WHEN LOWER(TRIM(registration_status)) = 'registered'
                         OR LOWER(TRIM(status)) = 'registered'
                     THEN 'Registered'
                     ELSE COALESCE(NULLIF(registration_status, ''), status)
                  END AS status,
                    registered_by, remarks, registered_at, face_image, face_encoding
             FROM face_registrations
             WHERE user_id = ?
             ORDER BY CASE WHEN LOWER(TRIM(registration_status)) = 'registered'
                           OR LOWER(TRIM(status)) = 'registered'
                       THEN 0 ELSE 1 END,
                      id DESC
             LIMIT 1"
        );
        $registrationStmt->execute([(int)$user['id']]);
        $registration = $registrationStmt->fetch() ?: null;
        if (!$registration) {
            echo json_encode([
                'success' => true,
                'registered' => false,
                'status' => 'Not Registered',
                'history' => []
            ]);
            exit;
        }
        $registrationStatus = trim((string)($registration['status'] ?? 'Not Registered'));
        $isRegistered = strcasecmp($registrationStatus, 'Registered') === 0;
        $imageValid = !empty($registration['face_image']) && storedFaceImageIsValid($registration['face_image']);
        $faceEncodingValid = faceEncodingIsValid(json_decode((string)($registration['face_encoding'] ?? ''), true));
        $registrationValid = $isRegistered && $imageValid && $faceEncodingValid;
        $displayStatus = $isRegistered && !$registrationValid ? 'Needs Repair' : $registrationStatus;
        if (!$imageValid) {
            $physicalPath = dirname(__DIR__) . '/' . ($registration['face_image'] ?? '');
            error_log('Invalid registered face image: student_id=' . $user['student_id'] . ', database path=' . ($registration['face_image'] ?? '') . ', physical path=' . $physicalPath . ', file_exists=' . (is_file($physicalPath) ? 'TRUE' : 'FALSE'));
        }
        echo json_encode([
            'success' => true,
            'registered' => $registrationValid,
            'registrationLocked' => $isRegistered,
            'status' => $displayStatus,
            'registrationDate' => $registration['registered_at'],
            'registeredBy' => $registration['registered_by'],
            'remarks' => $registration['remarks'],
            'faceImage' => faceImageUrl($registration['face_image']),
            'face_image' => $registration['face_image'],
            'imageValid' => $imageValid,
            'faceEncodingValid' => $faceEncodingValid,
            'history' => getFaceRegistrationHistory($pdo, (int)$user['id']),
            'message' => $isRegistered && !$imageValid
                ? 'Registered face image could not be loaded. Please contact your coordinator.'
                : ($isRegistered && !$faceEncodingValid ? 'Your face is not registered. Please contact your coordinator.' : null)
        ]);
        exit;
    } catch (Throwable $e) {
        error_log('Face registration status error: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'registered' => false,
            'status' => 'Not Registered',
            'history' => [],
            'message' => 'Unable to load face registration status.'
        ]);
        exit;
    }
}

if ($action === 'register') {
    $pdo = null;
    $faceImage = trim($_POST['faceImage'] ?? '');
    $faceEncoding = trim($_POST['faceEncoding'] ?? '');
    $replace = trim($_POST['replace'] ?? '') === '1';
    if ($faceImage === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Face image is required']);
        exit;
    }
    if (!validateFaceImage($faceImage)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Captured face image is invalid']);
        exit;
    }
    $encoding = json_decode($faceEncoding, true);
    if (!faceEncodingIsValid($encoding)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'A valid face encoding is required.']);
        exit;
    }
    try {
        $pdo = getDbConnection(false, false);
        $pdo->beginTransaction();
        $userStmt = $pdo->prepare('SELECT id, name, email, username, role, status, student_id FROM users WHERE id=? AND role="student" AND status="Active" LIMIT 1 FOR UPDATE');
        $userStmt->execute([$userId]);
        $user = $userStmt->fetch();
        if (!$user) {
            $pdo->rollBack();
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Student not found']);
            exit;
        }
        $existingStmt = $pdo->prepare('SELECT id, registration_status, status, face_image FROM face_registrations WHERE user_id=? ORDER BY id DESC FOR UPDATE');
        $existingStmt->execute([(int)$user['id']]);
        $existingRows = $existingStmt->fetchAll();
        foreach ($existingRows as $registrationRow) {
            if (strcasecmp(trim((string)($registrationRow['registration_status'] ?? '')), 'Registered') === 0
                || strcasecmp(trim((string)($registrationRow['status'] ?? '')), 'Registered') === 0) {
                $pdo->rollBack();
                http_response_code(409);
                echo json_encode([
                    'success' => false,
                    'registered' => true,
                    'registration_status' => 'Registered',
                    'message' => 'Face registration is already complete and cannot be changed.'
                ]);
                exit;
            }
        }
        $existing = $existingRows[0] ?? null;
        $oldStoredPath = $existing['face_image'] ?? null;
        [$decodedImage, $extension] = decodeFaceImage($faceImage);
        $uploadDir = dirname(__DIR__) . '/uploads/face_registrations/';
        if (!is_dir($uploadDir) && !mkdir($uploadDir, 0755, true) && !is_dir($uploadDir)) {
            throw new RuntimeException('Unable to create face upload directory.');
        }
        $filename = 'student_' . (int)$user['id'] . '_' . date('Ymd_His') . '_' . bin2hex(random_bytes(6)) . '.' . $extension;
        $absolutePath = $uploadDir . $filename;
        if (file_put_contents($absolutePath, $decodedImage) === false) {
            throw new RuntimeException('Unable to save face image.');
        }
        $storedPath = 'uploads/face_registrations/' . $filename;

        if ($existing) {
            $stmt = $pdo->prepare('UPDATE face_registrations SET student_id=?, face_image=?, face_encoding=?, registration_status=?, status=?, registered_by=?, remarks=?, registered_at=?, updated_at=NOW() WHERE id=? AND user_id=?');
            $stmt->execute([
                $studentId ?: $user['student_id'],
                $storedPath,
                json_encode(array_map('floatval', $encoding), JSON_THROW_ON_ERROR),
                'Registered',
                'Registered',
                $user['name'],
                'Initial face registration',
                date('Y-m-d H:i:s'),
                $existing['id'],
                $user['id']
            ]);
        } else {
            saveFaceRegistration($pdo, $user['id'], $studentId ?: ($user['student_id'] ?? ''), $storedPath, json_encode(array_map('floatval', $encoding), JSON_THROW_ON_ERROR), $user['name'], 'Initial face registration');
        }
        if (!storedFaceImageIsValid($storedPath)) {
            throw new RuntimeException('Saved face image could not be verified.');
        }
        $pdo->commit();
        if ($oldStoredPath && str_starts_with($oldStoredPath, 'uploads/')) {
            $oldAbsolutePath = dirname(__DIR__) . '/' . $oldStoredPath;
            if ($oldAbsolutePath !== $absolutePath && is_file($oldAbsolutePath)) {
                @unlink($oldAbsolutePath);
            }
        }
        logActivity($pdo, (int)$user['id'], 'Face Registration', 'Registered face for attendance verification.');
        echo json_encode([
            'success' => true,
            'message' => 'Face registration saved successfully.',
            'registered' => true,
            'registration_status' => 'Registered',
            'registered_at' => date('Y-m-d H:i:s'),
            'faceImage' => faceImageUrl($storedPath),
            'face_image' => $storedPath
        ]);
        exit;
    } catch (Throwable $e) {
        if ($pdo instanceof PDO && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        if (isset($absolutePath) && is_file($absolutePath)) {
            @unlink($absolutePath);
        }
        error_log('Face registration error: ' . $e->getMessage());
        $databaseError = $e instanceof PDOException;
        http_response_code($databaseError ? 503 : 422);
        echo json_encode([
            'success' => false,
            'message' => $databaseError
                ? 'The registration database is temporarily unavailable. Please try again shortly.'
                : $e->getMessage()
        ]);
        exit;
    }
}

http_response_code(400);
echo json_encode(['success' => false, 'message' => 'Invalid action']);
