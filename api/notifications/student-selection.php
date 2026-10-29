<?php
require_once __DIR__ . '/../_auth.php';

header('Content-Type: application/json');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Authorization, Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    api_json_response(405, ['error' => 'Method not allowed.']);
}

$user = firebase_authenticated_user();
$input = json_decode(file_get_contents('php://input'), true);
$submission_id = is_array($input) && isset($input['submissionId']) ? $input['submissionId'] : '';
if (!is_string($submission_id) || $submission_id === '' || strlen($submission_id) > 1500
    || strpos($submission_id, '/') !== false) {
    api_json_response(400, ['error' => 'A valid submission ID is required.']);
}

function selection_firestore_document($token, $collection, $document_id) {
    $url = 'https://firestore.googleapis.com/v1/projects/' . FIREBASE_PROJECT_ID
        . '/databases/(default)/documents/' . $collection . '/' . rawurlencode($document_id);
    $response = api_http_get($url, ['Authorization: Bearer ' . $token]);

    if ($response === null || $response['status'] === 0 || $response['status'] >= 500
        || $response['status'] === 429) {
        api_json_response(503, ['error' => 'Selection details are temporarily unavailable.']);
    }
    if ($response['status'] === 401) {
        api_json_response(401, ['error' => 'Your sign-in session is no longer valid.']);
    }
    if ($response['status'] === 403) {
        api_json_response(403, ['error' => 'You do not have permission to access this submission.']);
    }
    if ($response['status'] === 404) {
        return null;
    }
    if ($response['status'] !== 200) {
        api_json_response(502, ['error' => 'Unable to retrieve selection details.']);
    }

    $document = json_decode($response['body'], true);
    return is_array($document) ? ($document['fields'] ?? []) : null;
}

function selection_firestore_value($fields, $name, $default = '') {
    if (!isset($fields[$name]) || !is_array($fields[$name])) {
        return $default;
    }

    $value = $fields[$name];
    foreach (['stringValue', 'booleanValue', 'integerValue', 'doubleValue'] as $type) {
        if (array_key_exists($type, $value)) {
            return $value[$type];
        }
    }
    if (isset($value['arrayValue']['values']) && is_array($value['arrayValue']['values'])) {
        return array_map(function ($item) {
            return selection_firestore_value(['value' => $item], 'value', '');
        }, $value['arrayValue']['values']);
    }

    return $default;
}

$submission_fields = selection_firestore_document($user['token'], 'submissions', $submission_id);
if ($submission_fields === null) {
    api_json_response(404, ['error' => 'The selected submission could not be found.']);
}

$task_id = selection_firestore_value($submission_fields, 'taskId');
$student_id = selection_firestore_value($submission_fields, 'studentId');
if (!is_string($task_id) || $task_id === '' || !is_string($student_id) || $student_id === '') {
    api_json_response(400, ['error' => 'The selected submission is missing task or student details.']);
}

$task_fields = selection_firestore_document($user['token'], 'tasks', $task_id);
if ($task_fields === null) {
    api_json_response(404, ['error' => 'The task for this submission could not be found.']);
}
if (selection_firestore_value($task_fields, 'companyId') !== $user['uid']) {
    api_json_response(403, ['error' => 'You can only notify students about your own task submissions.']);
}

$student_name = selection_firestore_value($submission_fields, 'studentName', 'Student');
$student_email = selection_firestore_value($submission_fields, 'studentEmail', 'N/A');
$company_name = selection_firestore_value(
    $task_fields,
    'startupName',
    selection_firestore_value($task_fields, 'companyName', 'A startup')
);
$task_title = selection_firestore_value(
    $task_fields,
    'title',
    selection_firestore_value($submission_fields, 'taskTitle', 'your submitted work')
);
$reward_amount = selection_firestore_value($task_fields, 'prize', 'N/A');
$reward_types = selection_firestore_value($task_fields, 'rewardTypes', []);
if (!is_array($reward_types)) {
    $reward_types = [];
}
$selected_at = selection_firestore_value($submission_fields, 'selectedAt', gmdate('c'));

$host = isset($_SERVER['HTTP_HOST']) ? preg_replace('/^www\./', '', $_SERVER['HTTP_HOST']) : 'skillstreetofficial.in';
$from = getenv('SELECTION_MAIL_FROM') ?: (getenv('OTP_MAIL_FROM') ?: 'no-reply@' . $host);
if (!filter_var($from, FILTER_VALIDATE_EMAIL)) {
    error_log('Selection notification sender address is invalid.');
    api_json_response(503, ['error' => 'Selection notification email is not configured correctly.']);
}

$support_text = implode("\n", [
    'A company selected a student submission on SkillStreet.',
    '',
    'Company: ' . $company_name,
    'Company ID: ' . $user['uid'],
    '',
    'Student: ' . $student_name,
    'Student email: ' . $student_email,
    'Student ID: ' . $student_id,
    '',
    'Task: ' . $task_title,
    'Task ID: ' . $task_id,
    'Reward amount: ' . $reward_amount,
    'Reward types: ' . ($reward_types ? implode(', ', $reward_types) : 'N/A'),
    '',
    'Submission ID: ' . $submission_id,
    'Selected at: ' . $selected_at,
]);
$subject_task_title = trim(preg_replace('/[\r\n]+/', ' ', $task_title));
$subject = 'SkillStreet selection: ' . preg_replace('/[\r\n]+/', ' ', $student_name)
    . ' - ' . ($subject_task_title !== '' ? $subject_task_title : 'submission');
$headers = [
    'From: SkillStreet <' . $from . '>',
    'Reply-To: ' . $from,
    'Content-Type: text/plain; charset=UTF-8',
];

if (!mail('support.skillstreet@gmail.com', $subject, $support_text, implode("\r\n", $headers))) {
    error_log('Student selection notification email could not be sent.');
    api_json_response(503, ['error' => 'Unable to send the student selection notification.']);
}

api_json_response(200, ['success' => true]);
?>
