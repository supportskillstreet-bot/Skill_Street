<?php
require_once __DIR__ . '/_auth.php';

header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

if ($_SERVER['REQUEST_METHOD'] !== 'DELETE' || !isset($_GET['id'])
    || !ctype_digit((string) $_GET['id']) || (int) $_GET['id'] < 1) {
    api_json_response(400, ['error' => 'Invalid delete request']);
}

$user = firebase_authenticated_user();
$db_file = __DIR__ . '/../database.sqlite';
$uploads_dir = realpath(__DIR__ . '/../uploads');

try {
    $db = new PDO('sqlite:' . $db_file);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $columns = $db->query('PRAGMA table_info(uploads)')->fetchAll(PDO::FETCH_COLUMN, 1);
    if (!in_array('owner_uid', $columns, true)) {
        api_json_response(404, ['error' => 'File not found']);
    }

    $stmt = $db->prepare('SELECT id, owner_uid, stored_filename FROM uploads WHERE id = ?');
    $stmt->execute([(int) $_GET['id']]);
    $file = $stmt->fetch(PDO::FETCH_ASSOC);
} catch (PDOException $error) {
    error_log('File delete lookup failed: ' . $error->getMessage());
    api_json_response(500, ['error' => 'File deletion failed']);
}

if (!$file || !is_string($file['owner_uid']) || !hash_equals($file['owner_uid'], $user['uid'])) {
    api_json_response(404, ['error' => 'File not found']);
}

$stored_filename = basename((string) $file['stored_filename']);
$stored_path = $uploads_dir ? realpath($uploads_dir . DIRECTORY_SEPARATOR . $stored_filename) : false;
if (!$uploads_dir || !$stored_path || dirname($stored_path) !== $uploads_dir) {
    api_json_response(404, ['error' => 'File not found']);
}
if (is_file($stored_path) && !unlink($stored_path)) {
    api_json_response(500, ['error' => 'File deletion failed']);
}

try {
    $stmt = $db->prepare('DELETE FROM uploads WHERE id = ? AND owner_uid = ?');
    $stmt->execute([(int) $file['id'], $user['uid']]);
    api_json_response(200, ['success' => true]);
} catch (PDOException $error) {
    error_log('File delete failed: ' . $error->getMessage());
    api_json_response(500, ['error' => 'File deletion failed']);
}
?>
