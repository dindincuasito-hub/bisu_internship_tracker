<?php
require_once __DIR__ . '/../../auth.php';
header('Content-Type: text/html; charset=utf-8');
try {
    $user = requireAuth('coordinator');
} catch (Throwable $e) {
    header('Location: /bisu_internship_tracker/html/bisu_internship_tracker%20(1).html');
    exit;
}

$htmlFile = __DIR__ . '/../../../html/bisu_internship_tracker (1).html';
if (!file_exists($htmlFile)) {
    http_response_code(500);
    echo '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Missing File</title></head><body><h1>500 Internal Server Error</h1><p>Missing HTML entry file.</p></body></html>';
    exit;
}

$html = file_get_contents($htmlFile);
$html = str_replace(['href="css/','href="../css/'], ['href="../../../css/','href="../../../css/'], $html);
$html = str_replace(['src="js/','src="../js/'], ['src="../../../js/','src="../../../js/'], $html);
$html = str_replace('src="login-inline-changes.js"', 'src="../../../html/login-inline-changes.js"', $html);
echo $html;
