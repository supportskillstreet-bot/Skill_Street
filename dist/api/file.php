<?php
require_once __DIR__ . '/_auth.php';

header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

if ($_SERVER['REQUEST_METHOD'] !== 'GET' || !isset($_GET['id'])
    || !ctype_digit((string) $_GET['id']) || (int) $_GET['id'] < 1) {
    api_json_response(400, ['error' => 'Invalid file request']);
}

$user = firebase_authenticated_user();
$db_file = __DIR__ . '/../database.sqlite';
try {
    $db = new PDO('sqlite:' . $db_file);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $columns = $db->query('PRAGMA table_info(uploads)')->fetchAll(PDO::FETCH_COLUMN, 1);
    $owner_column = in_array('owner_uid', $columns, true) ? 'owner_uid' : 'NULL AS owner_uid';
    $stmt = $db->prepare("SELECT id, $owner_column, original_filename, stored_filename, file_size, mime_type FROM uploads WHERE id = ?");
    $stmt->execute([(int) $_GET['id']]);
    $file = $stmt->fetch(PDO::FETCH_ASSOC);
} catch (PDOException $error) {
    error_log('File lookup failed: ' . $error->getMessage());
    api_json_response(500, ['error' => 'File lookup failed']);
}

if (!$file) {
    api_json_response(404, ['error' => 'File not found']);
}

if (!is_string($file['owner_uid']) || !hash_equals($file['owner_uid'], $user['uid'])) {
    $submission_id = isset($_GET['submissionId']) ? (string) $_GET['submissionId'] : '';
    $authorized = firestore_submission_contains_file($user['token'], $submission_id, (string) $file['id']);
    if ($authorized === null) {
        api_json_response(503, ['error' => 'File authorization is temporarily unavailable']);
    }
    if (!$authorized) {
        api_json_response(404, ['error' => 'File not found']);
    }
}

$uploads_dir = realpath(__DIR__ . '/../uploads');
$stored_filename = basename((string) $file['stored_filename']);
$stored_path = $uploads_dir ? realpath($uploads_dir . DIRECTORY_SEPARATOR . $stored_filename) : false;
if (!$uploads_dir || !$stored_path || dirname($stored_path) !== $uploads_dir || !is_file($stored_path)) {
    api_json_response(404, ['error' => 'File not found']);
}

$download_name = str_replace(["\r", "\n", '"'], ['', '', ''], basename((string) $file['original_filename']));
$safe_mime_types = [
    'pdf' => 'application/pdf',
    'png' => 'image/png',
    'jpg' => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'gif' => 'image/gif',
    'webp' => 'image/webp',
    'txt' => 'text/plain; charset=utf-8',
    'csv' => 'text/csv; charset=utf-8',
];
$extension = strtolower(pathinfo($stored_filename, PATHINFO_EXTENSION));
header('Content-Type: ' . (isset($safe_mime_types[$extension]) ? $safe_mime_types[$extension] : 'application/octet-stream'));
header('Content-Length: ' . filesize($stored_path));
header("Content-Disposition: attachment; filename*=UTF-8''" . rawurlencode($download_name));
readfile($stored_path);
?>
