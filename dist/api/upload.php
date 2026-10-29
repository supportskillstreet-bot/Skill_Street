<?php
require_once __DIR__ . '/_auth.php';

header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    api_json_response(405, ['error' => 'Method not allowed']);
}

$user = firebase_authenticated_user();
if (!isset($_FILES['file'])) {
    api_json_response(400, ['error' => 'No file uploaded']);
}

$file = $_FILES['file'];
if ($file['error'] !== UPLOAD_ERR_OK) {
    api_json_response(400, ['error' => 'File upload failed']);
}
if (!is_uploaded_file($file['tmp_name']) || $file['size'] <= 0 || $file['size'] > 200 * 1024 * 1024) {
    api_json_response(400, ['error' => 'File must be between 1 byte and 200MB']);
}

$extension = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
$allowed_extensions = [
    'pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'txt', 'csv',
    'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip',
    'mp4', 'mov', 'mp3',
];
if (!in_array($extension, $allowed_extensions, true)) {
    api_json_response(400, ['error' => 'This file type is not allowed']);
}

$uploads_dir = __DIR__ . '/../uploads';
if (!is_dir($uploads_dir) && !mkdir($uploads_dir, 0750, true) && !is_dir($uploads_dir)) {
    api_json_response(500, ['error' => 'Upload storage is unavailable']);
}

try {
    $stored_filename = bin2hex(random_bytes(16)) . '.' . $extension;
} catch (Exception $error) {
    api_json_response(500, ['error' => 'Could not safely name the uploaded file']);
}

$db_file = __DIR__ . '/../database.sqlite';
try {
    $db = new PDO('sqlite:' . $db_file);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $db->exec('CREATE TABLE IF NOT EXISTS uploads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        stored_filename TEXT NOT NULL,
        file_path TEXT NOT NULL,
        upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        file_size INTEGER,
        mime_type TEXT,
        owner_uid TEXT
    )');

    $columns = $db->query('PRAGMA table_info(uploads)')->fetchAll(PDO::FETCH_COLUMN, 1);
    if (!in_array('owner_uid', $columns, true)) {
        $db->exec('ALTER TABLE uploads ADD COLUMN owner_uid TEXT');
    }
} catch (PDOException $error) {
    error_log('Upload database setup failed: ' . $error->getMessage());
    api_json_response(500, ['error' => 'Upload storage is unavailable']);
}

$stored_path = $uploads_dir . DIRECTORY_SEPARATOR . $stored_filename;
if (!move_uploaded_file($file['tmp_name'], $stored_path)) {
    api_json_response(500, ['error' => 'Failed to store uploaded file']);
}

try {
    $mime_type = 'application/octet-stream';
    if (class_exists('finfo')) {
        $file_info = new finfo(FILEINFO_MIME_TYPE);
        $detected_type = $file_info->file($stored_path);
        if (is_string($detected_type)) {
            $mime_type = $detected_type;
        }
    }

    $stmt = $db->prepare('INSERT INTO uploads
        (username, original_filename, stored_filename, file_path, file_size, mime_type, owner_uid)
        VALUES (?, ?, ?, ?, ?, ?, ?)');
    $stmt->execute([
        'user_' . substr(hash('sha256', $user['uid']), 0, 16),
        basename($file['name']),
        $stored_filename,
        '',
        $file['size'],
        $mime_type,
        $user['uid'],
    ]);

    api_json_response(201, [
        'success' => true,
        'fileId' => (string) $db->lastInsertId(),
        'fileName' => $stored_filename,
        'originalFilename' => basename($file['name']),
    ]);
} catch (PDOException $error) {
    if (is_file($stored_path) && !unlink($stored_path)) {
        error_log('Failed to remove an upload after a database error: ' . $stored_path);
    }
    error_log('Upload record insert failed: ' . $error->getMessage());
    api_json_response(500, ['error' => 'Failed to save upload record']);
}
?>
