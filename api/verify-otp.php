<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed.']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
$email = strtolower(trim($input['email'] ?? ''));
$otp = trim($input['otp'] ?? '');

if (!$email || !$otp) {
    http_response_code(400);
    echo json_encode(['error' => 'Email and OTP are required.']);
    exit;
}

try {
    $db = new PDO('sqlite:' . __DIR__ . '/../database.sqlite');
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $db->exec("CREATE TABLE IF NOT EXISTS otp_codes (
        email TEXT PRIMARY KEY,
        otp_hash TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        verified INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL
    )");

    $stmt = $db->prepare('SELECT otp_hash, expires_at FROM otp_codes WHERE email = ?');
    $stmt->execute([$email]);
    $record = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$record) {
        http_response_code(404);
        echo json_encode(['error' => 'OTP not found. Request a new one.']);
        exit;
    }

    if ((int) $record['expires_at'] < time()) {
        $db->prepare('DELETE FROM otp_codes WHERE email = ?')->execute([$email]);
        http_response_code(410);
        echo json_encode(['error' => 'OTP has expired. Request a new one.']);
        exit;
    }

    if (!password_verify($otp, $record['otp_hash'])) {
        http_response_code(401);
        echo json_encode(['error' => 'Invalid OTP.']);
        exit;
    }

    $db->prepare('UPDATE otp_codes SET verified = 1 WHERE email = ?')->execute([$email]);
    echo json_encode(['success' => true]);
} catch (Throwable $error) {
    error_log('Verify OTP error: ' . $error->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Failed to verify OTP.']);
}
?>
