<?php
declare(strict_types=1);

final class ApiError extends RuntimeException
{
    public int $status;
    public string $codeName;

    public function __construct(string $codeName, string $message, int $status = 400)
    {
        parent::__construct($message);
        $this->codeName = $codeName;
        $this->status = $status;
    }
}

function cfg(string $key, $default = null)
{
    $c = $GLOBALS['XF_CONFIG'] ?? [];
    foreach (explode('.', $key) as $part) {
        if (!is_array($c) || !array_key_exists($part, $c)) return $default;
        $c = $c[$part];
    }
    return $c;
}

function fail(string $code, string $message, int $status = 400): void
{
    throw new ApiError($code, $message, $status);
}

function json_out(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: no-referrer');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

/** Cuerpo JSON de la petición (o $_POST si viene como formulario). */
function input(): array
{
    static $data = null;
    if ($data !== null) return $data;
    $raw = file_get_contents('php://input') ?: '';
    $GLOBALS['XF_RAW_BODY'] = $raw;
    $type = $_SERVER['CONTENT_TYPE'] ?? '';
    if (stripos($type, 'application/json') !== false && $raw !== '') {
        $decoded = json_decode($raw, true);
        $data = is_array($decoded) ? $decoded : [];
    } else {
        $data = $_POST ?: [];
    }
    return $data;
}

function raw_body(): string
{
    if (!isset($GLOBALS['XF_RAW_BODY'])) input();
    return (string)($GLOBALS['XF_RAW_BODY'] ?? '');
}

function str_in(array $src, string $key, int $max = 500, string $default = ''): string
{
    $v = $src[$key] ?? $default;
    if (is_bool($v)) $v = $v ? '1' : '0';
    if (!is_scalar($v)) return $default;
    $v = trim((string)$v);
    if (mb_strlen($v) > $max) $v = mb_substr($v, 0, $max);
    return $v;
}

function int_in(array $src, string $key, int $default = 0): int
{
    $v = $src[$key] ?? $default;
    return is_numeric($v) ? (int)$v : $default;
}

function bool_in(array $src, string $key, bool $default = false): bool
{
    if (!array_key_exists($key, $src)) return $default;
    $v = $src[$key];
    return $v === true || $v === 1 || $v === '1' || $v === 'true' || $v === 'on';
}

function email_in(array $src, string $key, bool $required = true): string
{
    $v = mb_strtolower(str_in($src, $key, 190));
    if ($v === '') {
        if ($required) fail('invalid_email', 'Escribe un correo electrónico.');
        return '';
    }
    if (!filter_var($v, FILTER_VALIDATE_EMAIL)) fail('invalid_email', 'El correo "' . $v . '" no es válido.');
    return $v;
}

function now_utc(): string
{
    return gmdate('Y-m-d H:i:s');
}

/** Acepta "2026-10-01", "2026-10-01T18:00" o "" y devuelve fecha UTC o null. */
function parse_datetime(?string $v): ?string
{
    $v = trim((string)$v);
    if ($v === '') return null;
    $ts = strtotime($v . (preg_match('/[zZ]|[+-]\d\d:?\d\d$/', $v) ? '' : ' UTC'));
    if ($ts === false) return null;
    return gmdate('Y-m-d H:i:s', $ts);
}

function iso(?string $dt): ?string
{
    if (!$dt) return null;
    return str_replace(' ', 'T', $dt) . 'Z';
}

function to_cents($amount): int
{
    return (int)round(((float)$amount) * 100);
}

function cents_to_str(int $cents): string
{
    return number_format($cents / 100, 2, '.', '');
}

function slugify(string $s): string
{
    $s = mb_strtolower(trim($s));
    $s = strtr($s, ['á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ñ' => 'n', 'ü' => 'u']);
    $s = preg_replace('/[^a-z0-9]+/', '-', $s) ?? '';
    return trim($s, '-') ?: 'producto';
}

function random_token(int $bytes = 16): string
{
    return bin2hex(random_bytes($bytes));
}

function public_order_id(): string
{
    $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $s = 'XF';
    for ($i = 0; $i < 10; $i++) $s .= $alphabet[random_int(0, strlen($alphabet) - 1)];
    return $s;
}

function json_col($value): string
{
    return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: 'null';
}

function json_dec(?string $s, $default = [])
{
    if ($s === null || $s === '') return $default;
    $v = json_decode($s, true);
    return $v === null ? $default : $v;
}

function client_ip(): string
{
    return substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 64);
}

function public_url(string $path = ''): string
{
    $base = rtrim((string)cfg('public_url', ''), '/');
    if ($base === '') {
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $dir = rtrim(str_replace('\\', '/', dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/api/index.php'))), '/');
        $base = ($https ? 'https' : 'http') . '://' . $host . $dir;
    }
    return $base . ($path !== '' ? '/' . ltrim($path, '/') : '');
}

/** Petición HTTP saliente (pagos, Center). Devuelve [status, body, json|null]. */
function http_request(string $method, string $url, array $headers = [], ?string $body = null, int $timeout = 25): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => $timeout,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_FOLLOWLOCATION => false,
    ]);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    $resp = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($resp === false) {
        return [0, $err, null];
    }
    $json = json_decode((string)$resp, true);
    return [$status, (string)$resp, is_array($json) ? $json : null];
}

/** Cabeceras para las llamadas a tu servidor del Center (algunos hostings bloquean peticiones sin User-Agent). */
function xf_http_headers(array $extra = []): array
{
    return array_merge([
        'User-Agent: Mozilla/5.0 (compatible; XFlowStore/1.0; +' . public_url() . ')',
        'Accept: application/json, text/plain, */*',
    ], $extra);
}

function send_mail(string $to, string $subject, string $html): bool
{
    // Solo para pruebas: guarda los correos en un archivo en vez de enviarlos.
    $log = (string)cfg('mail_log', '');
    if ($log !== '') {
        @file_put_contents($log, json_encode(['to' => $to, 'subject' => $subject, 'html' => $html, 'at' => gmdate('c')], JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND | LOCK_EX);
        return true;
    }
    if (!cfg('send_emails', true) || !function_exists('mail')) return false;
    $from = (string)cfg('mail_from', 'X-FLOW <no-reply@localhost>');
    $headers = [
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=UTF-8',
        'From: ' . $from,
    ];
    $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
    return @mail($to, $encodedSubject, $html, implode("\r\n", $headers));
}

function h(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
}
