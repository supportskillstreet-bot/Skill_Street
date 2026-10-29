<?php
const FIREBASE_PROJECT_ID = 'skillstreetofficial';

function api_json_response($status, $payload) {
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($payload);
    exit;
}

function api_http_get($url, $headers = []) {
    if (function_exists('curl_init')) {
        $handle = curl_init($url);
        curl_setopt_array($handle, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_HTTPHEADER => $headers,
        ]);
        $body = curl_exec($handle);
        $status = (int) curl_getinfo($handle, CURLINFO_HTTP_CODE);
        $failed = $body === false;
        curl_close($handle);

        return $failed ? null : ['status' => $status, 'body' => $body];
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'header' => implode("\r\n", $headers),
            'timeout' => 10,
            'ignore_errors' => true,
        ],
    ]);
    $body = @file_get_contents($url, false, $context);

    if ($body === false) {
        return null;
    }

    $status = 0;
    foreach ($http_response_header as $header_line) {
        if (preg_match('/^HTTP\/\S+\s+(\d+)/', $header_line, $matches)) {
            $status = (int) $matches[1];
        }
    }

    return ['status' => $status, 'body' => $body];
}

function firebase_signing_certificates($refresh = false) {
    $cache_dir = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR)
        . DIRECTORY_SEPARATOR . 'skillstreet-firebase-' . hash('sha256', __DIR__);
    if (is_link($cache_dir)) {
        return null;
    }
    if (!is_dir($cache_dir) && !mkdir($cache_dir, 0700) && !is_dir($cache_dir)) {
        return null;
    }
    if (fileowner($cache_dir) !== getmyuid()) {
        return null;
    }
    chmod($cache_dir, 0700);

    $cache_file = $cache_dir . DIRECTORY_SEPARATOR . 'certificates.json';

    if (!$refresh && is_file($cache_file) && filemtime($cache_file) > time() - 3300) {
        $cached = json_decode(file_get_contents($cache_file), true);
        if (is_array($cached)) {
            return $cached;
        }
    }

    $response = api_http_get(
        'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
    );
    if ($response === null || $response['status'] !== 200) {
        return null;
    }

    $certificates = json_decode($response['body'], true);
    if (!is_array($certificates)) {
        return null;
    }

    if (file_put_contents($cache_file, json_encode($certificates), LOCK_EX) !== false) {
        chmod($cache_file, 0600);
    }
    return $certificates;
}

function base64url_decode_strict($value) {
    if (!is_string($value) || !preg_match('/^[A-Za-z0-9_-]+$/', $value)) {
        return false;
    }

    $decoded = base64_decode(strtr($value, '-_', '+/') . str_repeat('=', (4 - strlen($value) % 4) % 4), true);
    return $decoded === false ? false : $decoded;
}

function firebase_authenticated_user() {
    if (!function_exists('openssl_verify')) {
        api_json_response(503, ['error' => 'Authentication service is unavailable']);
    }

    $authorization = isset($_SERVER['HTTP_AUTHORIZATION']) ? $_SERVER['HTTP_AUTHORIZATION'] : '';
    if (!$authorization && function_exists('getallheaders')) {
        foreach (getallheaders() as $name => $value) {
            if (strtolower($name) === 'authorization') {
                $authorization = $value;
                break;
            }
        }
    }

    if (!preg_match('/^Bearer\s+(\S+)$/i', $authorization, $matches) || strlen($matches[1]) > 16384) {
        api_json_response(401, ['error' => 'Authentication required']);
    }

    $token = $matches[1];
    $parts = explode('.', $token);
    if (count($parts) !== 3) {
        api_json_response(401, ['error' => 'Invalid authentication token']);
    }

    $header = json_decode(base64url_decode_strict($parts[0]), true);
    $claims = json_decode(base64url_decode_strict($parts[1]), true);
    $signature = base64url_decode_strict($parts[2]);
    if (!is_array($header) || !is_array($claims) || $signature === false
        || !isset($header['alg'], $header['kid'])
        || $header['alg'] !== 'RS256'
        || !is_string($header['kid'])) {
        api_json_response(401, ['error' => 'Invalid authentication token']);
    }

    $now = time();
    if (!isset($claims['aud'], $claims['iss'], $claims['sub'], $claims['exp'], $claims['iat'])
        || $claims['aud'] !== FIREBASE_PROJECT_ID
        || $claims['iss'] !== 'https://securetoken.google.com/' . FIREBASE_PROJECT_ID
        || !is_string($claims['sub'])
        || $claims['sub'] === ''
        || strlen($claims['sub']) > 128
        || !is_numeric($claims['exp'])
        || (int) $claims['exp'] <= $now
        || !is_numeric($claims['iat'])
        || (int) $claims['iat'] > $now + 60) {
        api_json_response(401, ['error' => 'Invalid or expired authentication token']);
    }

    $certificates = firebase_signing_certificates();
    if (!is_array($certificates) || !isset($certificates[$header['kid']])) {
        $certificates = firebase_signing_certificates(true);
    }
    if (!is_array($certificates) || !isset($certificates[$header['kid']])) {
        api_json_response(503, ['error' => 'Authentication service is temporarily unavailable']);
    }

    $verified = openssl_verify(
        $parts[0] . '.' . $parts[1],
        $signature,
        $certificates[$header['kid']],
        OPENSSL_ALGO_SHA256
    );
    if ($verified !== 1) {
        api_json_response(401, ['error' => 'Invalid authentication token']);
    }

    return ['uid' => $claims['sub'], 'token' => $token];
}

function firestore_submission_contains_file($token, $submission_id, $file_id) {
    if (!is_string($submission_id) || $submission_id === '' || strlen($submission_id) > 1500
        || strpos($submission_id, '/') !== false) {
        return false;
    }

    $url = 'https://firestore.googleapis.com/v1/projects/' . FIREBASE_PROJECT_ID
        . '/databases/(default)/documents/submissions/' . rawurlencode($submission_id);
    $response = api_http_get($url, ['Authorization: Bearer ' . $token]);

    if ($response === null || $response['status'] >= 500 || $response['status'] === 0) {
        return null;
    }
    if ($response['status'] !== 200) {
        return false;
    }

    $document = json_decode($response['body'], true);
    foreach (['files', 'selectedFiles'] as $field_name) {
        $files = isset($document['fields'][$field_name]['arrayValue']['values'])
            ? $document['fields'][$field_name]['arrayValue']['values']
            : [];

        foreach ($files as $file) {
            $file_id_field = isset($file['mapValue']['fields']['fileId'])
                ? $file['mapValue']['fields']['fileId']
                : [];
            $stored_id = isset($file_id_field['stringValue'])
                ? $file_id_field['stringValue']
                : (isset($file_id_field['integerValue']) ? $file_id_field['integerValue'] : null);
            if ($stored_id !== null && (string) $stored_id === (string) $file_id) {
                return true;
            }
        }
    }

    return false;
}
?>
