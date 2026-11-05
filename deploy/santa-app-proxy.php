<?php
set_time_limit(180);

// Edit these for your host, then copy this file into the web root.
$prefix = '/your-prefix';
$backend = 'http://127.0.0.1:3001';
$forwardedHost = 'example.com';

$uri = isset($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : '/';
$path = parse_url($uri, PHP_URL_PATH);
if (!is_string($path) || $path === '') {
    $path = '/';
}

if ($path !== $prefix && strpos($path, $prefix . '/') !== 0) {
    header('HTTP/1.1 404 Not Found');
    echo 'Not found';
    exit;
}

$backendHost = parse_url($backend, PHP_URL_HOST);
$backendPort = parse_url($backend, PHP_URL_PORT);
$hostHeader = $backendHost;
if ($backendPort) {
    $hostHeader .= ':' . $backendPort;
}

$url = $backend . $uri;
$method = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';
$headers = array(
    'Host: ' . $hostHeader,
    'Connection: close',
    'Accept-Encoding:',
    'X-Forwarded-Proto: https',
    'X-Forwarded-Host: ' . $forwardedHost,
);
if (function_exists('getallheaders')) {
    foreach (getallheaders() as $name => $value) {
        $lower = strtolower($name);
        if ($lower === 'host' || $lower === 'content-length' || $lower === 'connection' || $lower === 'accept-encoding') {
            continue;
        }
        if (strpos($lower, 'x-forwarded-') === 0) {
            continue;
        }
        $headers[] = $name . ': ' . $value;
    }
}
$remote = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '';
if ($remote !== '') {
    $headers[] = 'X-Forwarded-For: ' . $remote;
}

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HEADER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, false);
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
curl_setopt($ch, CURLOPT_TIMEOUT, 170);

if ($method === 'POST' || $method === 'PUT' || $method === 'PATCH' || $method === 'DELETE') {
    // .htaccess must set enable_post_data_reading Off for this file.
    $body = file_get_contents('php://input');
    if ($body !== false && $body !== '') {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    }
}

$response = curl_exec($ch);
if ($response === false) {
    header('HTTP/1.1 502 Bad Gateway');
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Private Santa is not running';
    exit;
}

$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
curl_close($ch);

$rawHeaders = substr($response, 0, $headerSize);
$body = substr($response, $headerSize);
// PHP 5.6's http_response_code() does not know 308 and turns it into 500.
$reasons = array(
    200 => 'OK',
    201 => 'Created',
    204 => 'No Content',
    301 => 'Moved Permanently',
    302 => 'Found',
    303 => 'See Other',
    304 => 'Not Modified',
    307 => 'Temporary Redirect',
    308 => 'Permanent Redirect',
    400 => 'Bad Request',
    401 => 'Unauthorized',
    403 => 'Forbidden',
    404 => 'Not Found',
    405 => 'Method Not Allowed',
    409 => 'Conflict',
    422 => 'Unprocessable Entity',
    429 => 'Too Many Requests',
    500 => 'Internal Server Error',
    502 => 'Bad Gateway',
);
$reason = isset($reasons[$status]) ? $reasons[$status] : 'OK';
header('HTTP/1.1 ' . intval($status) . ' ' . $reason);

$skip = array(
    'transfer-encoding' => true,
    'connection' => true,
    'content-length' => true,
    'keep-alive' => true,
);
foreach (preg_split("/\r\n|\n|\r/", $rawHeaders) as $line) {
    $colon = strpos($line, ':');
    if ($colon === false) {
        continue;
    }
    $name = trim(substr($line, 0, $colon));
    $value = trim(substr($line, $colon + 1));
    if (isset($skip[strtolower($name)])) {
        continue;
    }
    header($name . ': ' . $value, false);
}

echo $body;
