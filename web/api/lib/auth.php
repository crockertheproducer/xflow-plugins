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
 */
function legacy_login(string $email, string $password): ?array
{
    $url = (string)cfg('legacy_login_url', '');
    if ($url === '') return null;
    $sep = str_contains($url, '?') ? '&' : '?';
    // login.php acepta GET y POST; enviamos por POST para que la clave no quede en logs.
    [$status, $body] = http_request('POST', $url, ['Content-Type: application/x-www-form-urlencoded'], http_build_query(['email' => $email, 'password' => $password]), 15);
    if ($status === 0 || !str_contains((string)$body, 'ACCESO_CONCEDIDO')) {
        // compatibilidad: algunos login.php solo leen $_GET
        [$status, $body] = http_request('GET', $url . $sep . http_build_query(['email' => $email, 'password' => $password]), [], null, 15);
    }
    if (!str_contains((string)$body, 'ACCESO_CONCEDIDO')) return null;
    $parts = explode('|', trim((string)$body));
    return [
        'email' => $email,
        'rol'   => $parts[1] ?? '',
        'aka'   => $parts[2] ?? '',
        'photo' => $parts[4] ?? '',
    ];
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
