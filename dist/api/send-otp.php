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

if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['error' => 'A valid email is required.']);
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

    $db->prepare('DELETE FROM otp_codes WHERE expires_at < ?')->execute([time()]);

    $otp = (string) random_int(100000, 999999);
    $expiresAtSeconds = time() + (5 * 60);
    $expiresAtMs = $expiresAtSeconds * 1000;
    $otpHash = password_hash($otp, PASSWORD_DEFAULT);

    $stmt = $db->prepare('REPLACE INTO otp_codes (email, otp_hash, expires_at, verified, created_at) VALUES (?, ?, ?, 0, ?)');
    $stmt->execute([$email, $otpHash, $expiresAtSeconds, time()]);

    $host = $_SERVER['HTTP_HOST'] ?? 'skillstreetofficial.in';
    $from = getenv('OTP_MAIL_FROM') ?: 'no-reply@' . preg_replace('/^www\./', '', $host);
    $subject = 'SkillStreet email verification OTP';
    $message = "Your SkillStreet verification code is {$otp}.\n\nThis code will expire in 5 minutes.";
    $headers = [
        'From: SkillStreet <' . $from . '>',
        'Reply-To: ' . $from,
        'Content-Type: text/plain; charset=UTF-8',
    ];

    if (!mail($email, $subject, $message, implode("\r\n", $headers))) {
        $db->prepare('DELETE FROM otp_codes WHERE email = ?')->execute([$email]);
        http_response_code(500);
        echo json_encode(['error' => 'Unable to send OTP email. Please check server mail configuration.']);
        exit;
    }

    echo json_encode(['success' => true, 'expiresAt' => $expiresAtMs]);
} catch (Throwable $error) {
    error_log('Send OTP error: ' . $error->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Failed to send OTP.']);
}
?>
