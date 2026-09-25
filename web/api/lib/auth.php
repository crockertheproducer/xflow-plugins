<?php
declare(strict_types=1);

function start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) return;
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    $crossSite = cors_origin_allowed() !== null;
    session_name('XFSTORE');
    session_set_cookie_params([
        'lifetime' => 60 * 60 * 24 * 14,
        'path'     => '/',
        'secure'   => $https,
        'httponly' => true,
        'samesite' => ($crossSite && $https) ? 'None' : 'Lax',
    ]);
    session_start();
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = random_token(16);
}

function cors_origin_allowed(): ?string
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin === '') return null;
    $allowed = (array)cfg('allowed_origins', []);
    return in_array($origin, $allowed, true) ? $origin : null;
}

function send_cors_headers(): void
{
    $origin = cors_origin_allowed();
    if ($origin === null) return;
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Vary: Origin');
}

function require_csrf(): void
{
    $sent = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!is_string($sent) || $sent === '' || !hash_equals((string)($_SESSION['csrf'] ?? ''), $sent)) {
        fail('csrf', 'La sesión expiró. Recarga la página.', 403);
    }
}

/** Límite simple por clave (ip+acción). */
function rate_limit(string $key, int $max, int $windowSeconds): void
{
    $k = substr($key, 0, 120);
    $now = time();
    $r = row('SELECT hits, reset_at FROM store_rate WHERE k = ?', [$k]);
    if (!$r || (int)$r['reset_at'] < $now) {
        q('DELETE FROM store_rate WHERE k = ?', [$k]);
        q('INSERT INTO store_rate (k, hits, reset_at) VALUES (?, 1, ?)', [$k, $now + $windowSeconds]);
        return;
    }
    if ((int)$r['hits'] >= $max) {
        fail('rate_limited', 'Demasiados intentos. Espera unos minutos.', 429);
    }
    q('UPDATE store_rate SET hits = hits + 1 WHERE k = ?', [$k]);
}

/**
 * Valida usuario y clave contra el login actual de X-Flow Center (login.php).
 * Respuesta esperada: "ACCESO_CONCEDIDO|rol|aka|...|foto_url".
 * Devuelve ['status' => ok|denied|unreachable, 'user' => ?array]
 */
function legacy_login_detailed(string $email, string $password): array
{
    $url = (string)cfg('legacy_login_url', '');
    if ($url === '') return ['status' => 'unreachable', 'user' => null];
    $sep = str_contains($url, '?') ? '&' : '?';
    $params = http_build_query(['email' => $email, 'password' => $password]);
    // POST primero (la clave no queda en los logs del servidor); si login.php solo lee $_GET, se repite por GET.
    [$status, $body] = http_request('POST', $url, xf_http_headers(['Content-Type: application/x-www-form-urlencoded']), $params, 15);
    if (!str_contains((string)$body, 'ACCESO_CONCEDIDO')) {
        [$status2, $body2] = http_request('GET', $url . $sep . $params, xf_http_headers(), null, 15);
        if ($status2 !== 0) { $status = $status2; $body = $body2; }
    }
    if (str_contains((string)$body, 'ACCESO_CONCEDIDO')) {
        $parts = explode('|', trim((string)$body));
        return ['status' => 'ok', 'user' => [
            'email' => mb_strtolower($email),
            'rol' => $parts[1] ?? '',
            'aka' => $parts[2] ?? '',
            'photo' => isset($parts[4]) ? center_abs_url($parts[4]) : '',
        ]];
    }
    if ($status >= 200 && $status < 500 && $status !== 0) return ['status' => 'denied', 'user' => null];
    return ['status' => 'unreachable', 'user' => null];
}

function legacy_login(string $email, string $password): ?array
{
    $r = legacy_login_detailed($email, $password);
    return $r['status'] === 'ok' ? $r['user'] : null;
}

/** Reglas de contraseña nueva: 8+ caracteres, letras y números, distinta del correo y no común. */
function password_problem(string $pw, string $email = ''): ?string
{
    if (mb_strlen($pw) < 8) return 'La contraseña debe tener al menos 8 caracteres.';
    if (mb_strlen($pw) > 128) return 'La contraseña es demasiado larga.';
    if (!preg_match('/[A-Za-z]/', $pw) || !preg_match('/\d/', $pw)) return 'Usa letras y números.';
    $low = mb_strtolower($pw);
    $local = mb_strtolower(strstr($email, '@', true) ?: '');
    if ($local !== '' && mb_strlen($local) >= 4 && str_contains($low, $local)) return 'La contraseña no puede contener tu correo.';
    $common = ['12345678', '123456789', 'password1', 'contraseña1', 'qwerty123', 'abc12345', 'xflow123', 'xflow2026', 'password123', '11111111a', 'admin123'];
    if (in_array($low, $common, true)) return 'Esa contraseña es demasiado común.';
    return null;
}

/** Caducidad de sesiones: cliente 14 días sin uso, admin 2 h sin uso y 12 h como máximo. */
function enforce_session_timeouts(): void
{
    $now = time();
    if (!empty($_SESSION['customer'])) {
        $last = (int)($_SESSION['customer_seen'] ?? $now);
        if ($now - $last > 14 * 86400) unset($_SESSION['customer']);
        else $_SESSION['customer_seen'] = $now;
    }
    if (!empty($_SESSION['admin'])) {
        $last = (int)($_SESSION['admin_seen'] ?? $now);
        $since = (int)($_SESSION['admin']['since'] ?? $now);
        if ($now - $last > 2 * 3600 || $now - $since > 12 * 3600) unset($_SESSION['admin']);
        else $_SESSION['admin_seen'] = $now;
    }
}

function current_customer(): ?array
{
    return $_SESSION['customer'] ?? null;
}

function require_admin(): array
{
    $a = $_SESSION['admin'] ?? null;
    if (!$a) fail('unauthorized', 'Inicia sesión como administrador.', 401);
    require_csrf();
    return $a;
}

function is_admin_email(string $email): bool
{
    $list = array_map('mb_strtolower', array_map('trim', (array)cfg('admin_emails', [])));
    return in_array(mb_strtolower(trim($email)), $list, true);
}

function admin_log(string $action, $detail = null): void
{
    try {
        insert('store_admin_log', [
            'admin' => (string)($_SESSION['admin']['email'] ?? ''),
            'action' => $action,
            'detail' => $detail === null ? null : (is_string($detail) ? $detail : json_col($detail)),
            'created_at' => now_utc(),
        ]);
    } catch (Throwable $e) {
    }
}
