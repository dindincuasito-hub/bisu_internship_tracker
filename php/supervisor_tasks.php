<?php
/**
 * supervisor_tasks.php — Simple CRUD for supervisor_tasks table
 */
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth.php';

header('Content-Type: application/json; charset=utf-8');

try {
    $pdo = getDbConnection();
} catch (Exception $e) {
    http_response_code(503);
    echo json_encode(['success' => false, 'message' => 'Database unavailable.']);
    exit;
}

function taskSend(array $payload, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = $pdo->query('SELECT * FROM supervisor_tasks ORDER BY id DESC');
    taskSend(['success' => true, 'tasks' => $stmt->fetchAll()]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    taskSend(['success' => false, 'message' => 'Method not allowed.'], 405);
}

$action = trim($_POST['action'] ?? 'create');

switch ($action) {
    case 'create':
        $task = trim($_POST['task'] ?? '');
        $assignee = trim($_POST['assignee'] ?? '');
        $dueDate = trim($_POST['due_date'] ?? '');
        $submissions = trim($_POST['submissions'] ?? '0/0');
        $status = 'Not Started';
        if (!$task || !$assignee || !$dueDate) {
            taskSend(['success' => false, 'message' => 'Task, assignee and due date are required.'], 400);
        }
        $duplicateCheck = $pdo->prepare('SELECT id FROM supervisor_tasks WHERE task=? AND assignee=? AND due_date=? LIMIT 1');
        $duplicateCheck->execute([$task, $assignee, $dueDate]);
        if ($duplicateCheck->fetchColumn()) {
            taskSend(['success' => false, 'message' => 'This task has already been assigned.',], 409);
        }
        $stmt = $pdo->prepare('INSERT INTO supervisor_tasks (task, assignee, due_date, submissions, status) VALUES (?,?,?,?,?)');
        $stmt->execute([$task, $assignee, $dueDate, $submissions, $status]);
        taskSend(['success' => true, 'message' => 'Task created.', 'id' => (int)$pdo->lastInsertId()]);
        break;

    case 'update':
        $id = intval($_POST['id'] ?? 0);
        if ($id <= 0) taskSend(['success' => false, 'message' => 'Invalid ID.'], 400);
        $task = trim($_POST['task'] ?? '');
        $assignee = trim($_POST['assignee'] ?? '');
        $dueDate = trim($_POST['due_date'] ?? '');
        $submissions = trim($_POST['submissions'] ?? '0/0');
        $status = trim($_POST['status'] ?? '');
        if (!in_array($status, ['Not Started', 'Ongoing', 'Completed'], true)) {
            taskSend(['success' => false, 'message' => 'Invalid task status.'], 400);
        }
        $stmt = $pdo->prepare('UPDATE supervisor_tasks SET task=?, assignee=?, due_date=?, submissions=?, status=? WHERE id=?');
        $stmt->execute([$task, $assignee, $dueDate, $submissions, $status, $id]);
        taskSend(['success' => true, 'message' => 'Task updated.']);
        break;

    case 'delete':
        $id = intval($_POST['id'] ?? 0);
        if ($id <= 0) taskSend(['success' => false, 'message' => 'Invalid ID.'], 400);
        $pdo->prepare('DELETE FROM supervisor_tasks WHERE id=?')->execute([$id]);
        taskSend(['success' => true, 'message' => 'Task deleted.']);
        break;

    default:
        taskSend(['success' => false, 'message' => 'Unknown action.'], 400);
}
