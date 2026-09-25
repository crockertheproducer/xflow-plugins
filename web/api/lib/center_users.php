<?php
declare(strict_types=1);

/**
 * Cuentas de X-Flow Center: login, licencias existentes y contraseña.
 * Solo SELECT sobre la tabla de usuarios, y UPDATE de la columna de contraseña
 * cuando el propio usuario la restablece o la cambia.
 */

function center_users_cfg(): array
{
    return get_setting('center')['users'] ?? [];
}

/** Fila del usuario en la tabla del Center, o null (también null si la tabla no está configurada). */
function center_user_row(string $email): ?array
{
    $m = center_users_cfg();
    if (empty($m['table']) || empty($m['col_email'])) return null;
    $pdo = center_pdo();
    $t = center_quote_ident($pdo, $m['table']);
    $ce = center_quote_ident($pdo, $m['col_email']);
    $st = $pdo->prepare("SELECT * FROM $t WHERE LOWER($ce) = ? LIMIT 1");
    $st->execute([mb_strtolower(trim($email))]);
    $r = $st->fetch(PDO::FETCH_ASSOC);
    return $r ?: null;
}

/** ¿Se puede usar la tabla de usuarios? (existe y tiene las columnas del mapeo) */
function center_users_table_ok(): bool
{
    static $ok = null;
    if ($ok !== null) return $ok;
    $m = center_users_cfg();
    try {
        if (empty($m['table']) || empty($m['col_email']) || empty($m['col_password'])) return $ok = false;
        $pdo = center_pdo();
        $t = center_quote_ident($pdo, $m['table']);
        $st = $pdo->query("SELECT * FROM $t LIMIT 1");
        $cols = [];
        for ($i = 0; $i < $st->columnCount(); $i++) $cols[] = $st->getColumnMeta($i)['name'] ?? '';
        if (!$cols) {
            // tabla vacía en algunos drivers no da metadatos: se comprueba con una consulta directa
            $pdo->query('SELECT ' . center_quote_ident($pdo, $m['col_email']) . ', ' . center_quote_ident($pdo, $m['col_password']) . " FROM $t LIMIT 1");
            return $ok = true;
        }
        return $ok = in_array($m['col_email'], $cols, true) && in_array($m['col_password'], $cols, true);
    } catch (Throwable $e) {
        return $ok = false;
    }
}

/** Formato en que el Center guarda las contraseñas (se respeta para no romper el login de la app). */
function password_format_of(string $stored): string
{
    if (preg_match('/^\$(2[aby]|argon2i|argon2id)\$/', $stored)) return 'bcrypt';
    if (preg_match('/^[a-f0-9]{32}$/i', $stored)) return 'md5';
    if (preg_match('/^[a-f0-9]{40}$/i', $stored)) return 'sha1';
    if (preg_match('/^[a-f0-9]{64}$/i', $stored)) return 'sha256';
    return 'plain';
}

function password_matches(string $input, string $stored): bool
{
    if ($stored === '') return false;
    switch (password_format_of($stored)) {
        case 'bcrypt': return password_verify($input, $stored);
        case 'md5': return hash_equals(strtolower($stored), md5($input));
        case 'sha1': return hash_equals(strtolower($stored), sha1($input));
        case 'sha256': return hash_equals(strtolower($stored), hash('sha256', $input));
        default: return hash_equals($stored, $input);
    }
}

function password_encode(string $plain, string $format): string
{
    switch ($format) {
        case 'md5': return md5($plain);
        case 'sha1': return sha1($plain);
        case 'sha256': return hash('sha256', $plain);
        case 'plain': return $plain;
        default: return password_hash($plain, PASSWORD_DEFAULT);
    }
}

/**
 * Login de cliente con su cuenta de X-Flow Center.
 * auto: primero login.php (la misma validación que usa la app); si no responde, la tabla de usuarios.
 */
function customer_login(string $email, string $password): ?array
{
    $m = center_users_cfg();
    $source = $m['source'] ?? 'auto';

    if ($source === 'api' || $source === 'auto') {
        $r = legacy_login_detailed($email, $password);
        if ($r['status'] === 'ok') return $r['user'];
        // Si login.php responde "denegado" su decisión manda (cuenta bloqueada, clave mala…).
        // Solo si no responde se valida contra la tabla de usuarios.
        if ($r['status'] === 'denied' || $source === 'api') return null;
    }
    if (!center_users_table_ok()) return null;
    $row = center_user_row($email);
    if (!$row) return null;
    $stored = (string)($row[$m['col_password']] ?? '');
    if (!password_matches($password, $stored)) return null;
    return [
        'email' => mb_strtolower($email),
        'rol' => !empty($m['col_role']) ? (string)($row[$m['col_role']] ?? '') : '',
        'aka' => !empty($m['col_aka']) ? (string)($row[$m['col_aka']] ?? '') : '',
        'photo' => !empty($m['col_photo']) ? center_abs_url((string)($row[$m['col_photo']] ?? '')) : '',
    ];
}

/** ¿Existe esta cuenta en el Center? (para recuperar contraseña) */
function center_user_exists(string $email): bool
{
    if (!center_users_table_ok()) return false;
    return center_user_row($email) !== null;
}

/** Guarda la nueva contraseña con el mismo formato que ya usa el Center para ese usuario. */
function center_user_set_password(string $email, string $newPassword): void
{
    $m = center_users_cfg();
    if (!center_users_table_ok()) throw new ApiError('users_table', 'La tienda no tiene acceso a la tabla de usuarios del Center.', 503);
    $row = center_user_row($email);
    if (!$row) throw new ApiError('not_found', 'Cuenta no encontrada.', 404);
    $format = $m['password_format'] ?? 'auto';
    if ($format === 'auto' || $format === '') $format = password_format_of((string)($row[$m['col_password']] ?? ''));
    $pdo = center_pdo();
    $t = center_quote_ident($pdo, $m['table']);
    $cp = center_quote_ident($pdo, $m['col_password']);
    $ce = center_quote_ident($pdo, $m['col_email']);
    $st = $pdo->prepare("UPDATE $t SET $cp = ? WHERE LOWER($ce) = ?");
    $st->execute([password_encode($newPassword, $format), mb_strtolower(trim($email))]);
}

/**
 * Licencias que el usuario YA tiene en X-Flow Center (compradas antes de la tienda,
 * activadas a mano, etc.). Se leen de la tabla de licencias del mapeo o, si no, de
 * soporte_api.php?accion=obtener_licencias_usuario.
 */
function center_licenses_for(string $email): array
{
    $email = mb_strtolower(trim($email));
    $out = [];
    $cfg = get_setting('center');
    $m = $cfg['db'] ?? [];
    $read = false;
    if (!empty($m['table']) && !empty($m['col_email']) && !empty($m['col_product'])) {
        try {
            $pdo = center_pdo();
            $t = center_quote_ident($pdo, $m['table']);
            $ce = center_quote_ident($pdo, $m['col_email']);
            $st = $pdo->prepare("SELECT * FROM $t WHERE LOWER($ce) = ? LIMIT 300");
            $st->execute([$email]);
            foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) {
                $out[] = center_license_normalize([
                    'id_plugin' => $r[$m['col_product']] ?? '',
                    'nombre' => !empty($m['col_product_name']) ? ($r[$m['col_product_name']] ?? '') : '',
                    'estado' => !empty($m['col_status']) ? ($r[$m['col_status']] ?? '') : '',
                    'expira' => !empty($m['col_expiry']) ? ($r[$m['col_expiry']] ?? null) : null,
                ], $m);
            }
            $read = true;
        } catch (Throwable $e) {
            $read = false;
        }
    }
    if (!$read) {
        $url = (string)cfg('legacy_api_url', '');
        if ($url !== '') {
            [$status, , $json] = http_request('GET', $url . (str_contains($url, '?') ? '&' : '?') . 'accion=obtener_licencias_usuario&email=' . rawurlencode($email), xf_http_headers(), null, 15);
            if ($status === 200 && is_array($json)) {
                foreach ($json as $r) if (is_array($r)) $out[] = center_license_normalize($r, $m);
            }
        }
    }
    return array_values(array_filter($out, fn($l) => $l['center_id'] !== ''));
}

function center_license_normalize(array $r, array $m): array
{
    $centerId = (string)($r['id_plugin'] ?? $r['plugin'] ?? $r['plugin_id'] ?? '');
    $estado = mb_strtolower(trim((string)($r['estado'] ?? '')));
    $exp = $r['expira'] ?? $r['fecha_expiracion'] ?? $r['vence'] ?? null;
    $dias = $r['dias'] ?? null;
    $lifetimeVal = mb_strtolower((string)($m['lifetime_value'] ?? ''));
    $lifetime = in_array($estado, ['lifetime', 'permanente', mb_strtolower((string)($m['status_lifetime'] ?? 'permanente'))], true)
        || (is_string($dias) && mb_strtoupper($dias) === 'PERMANENTE')
        || (is_string($exp) && $lifetimeVal !== '' && mb_strtolower($exp) === $lifetimeVal)
        || (($m['expiry_mode'] ?? '') === 'days' && is_string($exp) && mb_strtoupper($exp) === 'PERMANENTE');
    $expiresAt = null;
    if (!$lifetime) {
        if (($m['expiry_mode'] ?? 'datetime') === 'days' && is_numeric($exp)) {
            $expiresAt = gmdate('Y-m-d H:i:s', time() + (int)$exp * 86400);
        } elseif (is_string($exp) && $exp !== '' && strtotime($exp) !== false) {
            $expiresAt = gmdate('Y-m-d H:i:s', (int)strtotime($exp . (preg_match('/[zZ]|[+-]\d\d:?\d\d$/', $exp) ? '' : ' UTC')));
        } elseif (is_numeric($dias)) {
            $expiresAt = gmdate('Y-m-d H:i:s', time() + (int)$dias * 86400);
        }
    }
    $blocked = in_array($estado, ['revocado', 'bloqueado', 'blocked', 'inactivo', 'cancelado'], true) || (is_string($dias) && mb_strtoupper($dias) === 'BLOQUEADO');
    $expired = !$lifetime && $expiresAt !== null && strtotime($expiresAt . ' UTC') < time();
    return [
        'center_id' => $centerId,
        'product_name' => trim((string)($r['nombre'] ?? $r['nombre_plugin'] ?? '')),
        'lifetime' => $lifetime,
        'expires_at' => $expiresAt,
        'status' => $blocked ? 'revoked' : ($expired ? 'expired' : 'active'),
    ];
}

/** Une las licencias de la tienda con las que ya existen en el Center (sin duplicar). */
function merged_licenses_for(string $email): array
{
    $email = mb_strtolower(trim($email));
    $storeRows = rows('SELECT * FROM store_licenses WHERE email = ? ORDER BY updated_at DESC', [$email]);
    $list = array_map('license_public', $storeRows);
    $have = [];
    foreach ($storeRows as $r) $have[mb_strtolower($r['center_id'])] = true;
    $products = all_products(false);
    $byCenter = [];
    foreach ($products as $p) if ($p['center_id'] !== '') $byCenter[mb_strtolower($p['center_id'])] = $p;
    try {
        $center = center_licenses_for($email);
    } catch (Throwable $e) {
        $center = [];
    }
    foreach ($center as $c) {
        $key = mb_strtolower($c['center_id']);
        if (isset($have[$key])) continue;
        $have[$key] = true;
        $p = $byCenter[$key] ?? null;
        $list[] = [
            'id' => 0,
            'email' => $email,
            'product_id' => $p ? $p['id'] : 0,
            'product_name' => $p ? $p['name'] : ($c['product_name'] !== '' ? $c['product_name'] : $c['center_id']),
            'tier' => '',
            'lifetime' => $c['lifetime'],
            'expires_at' => iso($c['expires_at']),
            'source' => 'center',
            'status' => $c['status'],
            'center_synced' => true,
            'center_message' => 'Licencia existente en X-Flow Center.',
            'note' => '',
            'created_at' => null,
            'updated_at' => null,
        ];
    }
    return $list;
}
