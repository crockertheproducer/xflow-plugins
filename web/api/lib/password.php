<?php
declare(strict_types=1);

/**
 * Recuperar / cambiar contraseña de la cuenta de X-Flow Center.
 *
 * - El enlace lleva un token aleatorio de 256 bits; en la BD solo se guarda su SHA-256.
 * - Caduca en 30 minutos, sirve una sola vez y pedir otro invalida los anteriores.
 * - La respuesta es la misma exista o no el correo (no se puede averiguar quién tiene cuenta).
 * - Límites de intentos por IP y por correo.
 * - La nueva contraseña se guarda con el mismo formato que ya usa el Center, para que
 *   la app siga funcionando; se avisa por correo del cambio y se cierran las sesiones abiertas.
 */

const XF_RESET_TTL = 1800;

function password_reset_available(): bool
{
    try {
        return center_users_table_ok();
    } catch (Throwable $e) {
        return false;
    }
}

function password_forgot(string $email): void
{
    rate_limit('forgot_ip:' . client_ip(), 5, 900);
    rate_limit('forgot_mail:' . sha1($email), 3, 3600);
    if (!password_reset_available() || !center_user_exists($email)) {
        usleep(random_int(150000, 350000)); // mismo tiempo de respuesta aproximado
        return;
    }
    $now = now_utc();
    q('UPDATE store_password_resets SET used_at = ? WHERE email = ? AND used_at IS NULL', [$now, $email]);
    $token = random_token(32);
    insert('store_password_resets', [
        'email' => $email,
        'token_hash' => hash('sha256', $token),
        'expires_at' => gmdate('Y-m-d H:i:s', time() + XF_RESET_TTL),
        'ip' => client_ip(),
        'created_at' => $now,
    ]);
    $site = get_setting('site');
    $link = public_url('index.html#/restablecer/' . $token);
    $html = '<div style="font-family:Arial,sans-serif;background:#050206;color:#fff;padding:28px">'
        . '<h2 style="color:#ff1b4d;margin:0 0 14px">Restablecer tu contraseña</h2>'
        . '<p>Recibimos una solicitud para cambiar la contraseña de tu cuenta de <b>X-Flow Center</b> (' . h($email) . ').</p>'
        . '<p style="margin:24px 0"><a href="' . h($link) . '" style="background:#ff1b4d;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Crear nueva contraseña</a></p>'
        . '<p style="color:#aaa;font-size:13px">El enlace caduca en 30 minutos y solo funciona una vez. Si no lo pediste tú, ignora este correo: tu contraseña no cambia.</p>'
        . '<p style="color:#666;font-size:12px">Solicitado desde la IP ' . h(client_ip()) . '</p></div>';
    send_mail($email, 'Restablecer tu contraseña · ' . ($site['name'] ?? 'X-FLOW'), $html);
}

/** Devuelve el correo de la cuenta cambiada. */
function password_reset_with_token(string $token, string $newPassword): string
{
    rate_limit('reset_ip:' . client_ip(), 10, 900);
    if (!preg_match('/^[a-f0-9]{64}$/', $token)) fail('token_invalid', 'El enlace no es válido o ya caducó. Pide uno nuevo.');
    $r = row('SELECT * FROM store_password_resets WHERE token_hash = ?', [hash('sha256', $token)]);
    if (!$r || $r['used_at'] !== null || $r['expires_at'] < now_utc()) fail('token_invalid', 'El enlace no es válido o ya caducó. Pide uno nuevo.');
    if ($p = password_problem($newPassword, $r['email'])) fail('weak_password', $p);
    // Se marca como usado antes de cambiar nada: dos peticiones simultáneas no pueden usar el mismo enlace.
    $n = q('UPDATE store_password_resets SET used_at = ? WHERE id = ? AND used_at IS NULL', [now_utc(), (int)$r['id']])->rowCount();
    if ($n !== 1) fail('token_invalid', 'El enlace no es válido o ya caducó. Pide uno nuevo.');
    center_user_set_password($r['email'], $newPassword);
    after_password_changed($r['email']);
    return $r['email'];
}

function password_change_logged(string $email, string $current, string $new): void
{
    rate_limit('pwchange:' . sha1($email), 6, 900);
    if (!password_reset_available()) fail('users_table', 'Para cambiar la contraseña escríbenos a soporte.', 503);
    if (!customer_login($email, $current)) fail('bad_credentials', 'La contraseña actual no es correcta.', 401);
    if ($p = password_problem($new, $email)) fail('weak_password', $p);
    if (hash_equals($current, $new)) fail('weak_password', 'La nueva contraseña debe ser distinta de la actual.');
    center_user_set_password($email, $new);
    after_password_changed($email);
}

function after_password_changed(string $email): void
{
    $now = now_utc();
    q('UPDATE store_password_resets SET used_at = ? WHERE email = ? AND used_at IS NULL', [$now, $email]);
    $k = 'pwchg:' . sha1(mb_strtolower($email));
    q('DELETE FROM store_settings WHERE k = ?', [$k]);
    q('INSERT INTO store_settings (k, v, updated_at) VALUES (?, ?, ?)', [$k, (string)time(), $now]);
    send_mail($email, 'Tu contraseña se cambió', '<div style="font-family:Arial,sans-serif;background:#050206;color:#fff;padding:28px"><h2 style="color:#ff1b4d;margin:0 0 14px">Contraseña actualizada</h2><p>La contraseña de tu cuenta de X-Flow Center (' . h($email) . ') se cambió el ' . h(gmdate('d/m/Y H:i')) . ' UTC.</p><p style="color:#aaa;font-size:13px">Si no fuiste tú, escríbenos de inmediato a soporte.</p></div>');
}

/** Cierra la sesión del cliente si la contraseña cambió después de iniciarla. */
function enforce_password_epoch(): void
{
    $c = $_SESSION['customer'] ?? null;
    if (!$c) return;
    $r = row('SELECT v FROM store_settings WHERE k = ?', ['pwchg:' . sha1(mb_strtolower($c['email']))]);
    if ($r && (int)$r['v'] > (int)($_SESSION['customer_login_at'] ?? 0)) unset($_SESSION['customer']);
}
