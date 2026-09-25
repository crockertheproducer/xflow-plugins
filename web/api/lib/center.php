<?php
declare(strict_types=1);

/**
 * Puente con X-Flow Center.
 *
 * La base de datos del Center YA EXISTE: aquí nunca se crean, borran ni alteran
 * sus tablas. Solo se hace SELECT / INSERT / UPDATE sobre la tabla de licencias
 * que el administrador indique en el panel (Conexión X-Flow Center).
 *
 *  - mode "db":   escribe directo en la tabla de licencias del Center.
 *  - mode "http": envía un POST firmado (HMAC-SHA256) a un endpoint del Center.
 *  - mode "none": solo se guarda en store_licenses (el admin activa a mano).
 */

function center_pdo(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;
    $c = cfg('center_db');
    if (!is_array($c) || empty($c['dsn'])) return $pdo = db();
    $pdo = new PDO($c['dsn'], $c['user'] ?? null, $c['pass'] ?? null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return $pdo;
}

function center_ident(string $name): string
{
    if (!preg_match('/^[A-Za-z0-9_]{1,64}$/', $name)) {
        throw new ApiError('center_mapping', 'Nombre de tabla/columna inválido en la conexión con X-Flow Center: "' . $name . '"', 400);
    }
    return '`' . $name . '`';
}

function center_quote_ident(PDO $pdo, string $name): string
{
    $q = center_ident($name);
    return $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite' ? '"' . $name . '"' : $q;
}

/**
 * Activa / extiende una licencia en X-Flow Center.
 * $lic = ['email','center_id','product_name','lifetime'(bool),'days'(int, días añadidos),'expires_at'(UTC|null),'tier','order_id','source']
 * Devuelve [bool ok, string mensaje]
 */
function center_grant(array $lic): array
{
    $cfg = get_setting('center');
    $mode = $cfg['mode'] ?? 'none';
    if ($lic['center_id'] === '') return [false, 'El producto no tiene "ID en X-Flow Center" configurado.'];
    try {
        if ($mode === 'db') return center_grant_db($cfg['db'] ?? [], $lic);
        if ($mode === 'http') return center_grant_http($cfg['http'] ?? [], $lic, 'grant');
        return [false, 'Conexión con X-Flow Center desactivada (modo manual).'];
    } catch (Throwable $e) {
        return [false, 'Error Center: ' . mb_substr($e->getMessage(), 0, 300)];
    }
}

function center_revoke(array $lic): array
{
    $cfg = get_setting('center');
    $mode = $cfg['mode'] ?? 'none';
    if ($lic['center_id'] === '') return [false, 'Sin ID de Center.'];
    try {
        if ($mode === 'db') {
            $m = $cfg['db'];
            $pdo = center_pdo();
            $t = center_quote_ident($pdo, $m['table']);
            $ce = center_quote_ident($pdo, $m['col_email']);
            $cp = center_quote_ident($pdo, $m['col_product']);
            if (!empty($m['col_status'])) {
                $cs = center_quote_ident($pdo, $m['col_status']);
                $st = $pdo->prepare("UPDATE $t SET $cs = ? WHERE LOWER($ce) = ? AND $cp = ?");
                $st->execute(['revocado', mb_strtolower($lic['email']), $lic['center_id']]);
            } else {
                $st = $pdo->prepare("DELETE FROM $t WHERE LOWER($ce) = ? AND $cp = ?");
                $st->execute([mb_strtolower($lic['email']), $lic['center_id']]);
            }
            return [true, 'Licencia revocada en X-Flow Center.'];
        }
        if ($mode === 'http') return center_grant_http($cfg['http'] ?? [], $lic, 'revoke');
        return [false, 'Modo manual.'];
    } catch (Throwable $e) {
        return [false, 'Error Center: ' . mb_substr($e->getMessage(), 0, 300)];
    }
}

function center_grant_db(array $m, array $lic): array
{
    $pdo = center_pdo();
    $t = center_quote_ident($pdo, $m['table'] ?? '');
    $ce = center_quote_ident($pdo, $m['col_email'] ?? '');
    $cp = center_quote_ident($pdo, $m['col_product'] ?? '');
    $email = mb_strtolower($lic['email']);
    $expiryMode = $m['expiry_mode'] ?? 'datetime';

    $st = $pdo->prepare("SELECT * FROM $t WHERE LOWER($ce) = ? AND $cp = ? LIMIT 1");
    $st->execute([$email, $lic['center_id']]);
    $existing = $st->fetch() ?: null;

    $data = [];
    if (!empty($m['col_product_name'])) $data[$m['col_product_name']] = $lic['product_name'];
    if (!empty($m['col_tier']) && $lic['tier'] !== '') $data[$m['col_tier']] = $lic['tier'];
    if (!empty($m['col_status'])) {
        $data[$m['col_status']] = $lic['lifetime'] ? ($m['status_lifetime'] ?: $m['status_active']) : $m['status_active'];
    }

    if ($expiryMode === 'datetime' && !empty($m['col_expiry'])) {
        $data[$m['col_expiry']] = $lic['lifetime'] ? (($m['lifetime_value'] ?? '') === '' ? null : $m['lifetime_value']) : $lic['expires_at'];
    } elseif ($expiryMode === 'days' && !empty($m['col_expiry'])) {
        if ($lic['lifetime']) {
            $data[$m['col_expiry']] = ($m['lifetime_value'] ?? '') !== '' ? $m['lifetime_value'] : 'PERMANENTE';
        } else {
            $current = $existing[$m['col_expiry']] ?? null;
            $lifetimeVal = ($m['lifetime_value'] ?? '') !== '' ? $m['lifetime_value'] : 'PERMANENTE';
            if ($existing && (string)$current === (string)$lifetimeVal) {
                return [true, 'Ya tenía licencia permanente en X-Flow Center.'];
            }
            $data[$m['col_expiry']] = (is_numeric($current) ? max(0, (int)$current) : 0) + (int)$lic['days'];
        }
    }

    if ($existing) {
        // Nunca degradar una licencia permanente del Center a temporal.
        if (!$lic['lifetime'] && !empty($m['col_status']) && ($m['status_lifetime'] ?? '') !== ''
            && (string)$m['status_lifetime'] !== (string)$m['status_active']
            && (string)($existing[$m['col_status']] ?? '') === (string)$m['status_lifetime']) {
            return [true, 'Ya tenía licencia permanente en X-Flow Center.'];
        }
        if ($expiryMode === 'datetime' && !$lic['lifetime'] && !empty($m['col_expiry'])) {
            $cur = $existing[$m['col_expiry']] ?? null;
            $lifetimeVal = (string)($m['lifetime_value'] ?? '');
            $looksPermanent = ($cur === null || $cur === '') ? $lifetimeVal === '' : ($lifetimeVal !== '' && (string)$cur === $lifetimeVal);
            $statusSaysActive = !empty($m['col_status']) && (string)($existing[$m['col_status']] ?? '') === (string)$m['status_active'];
            if ($looksPermanent && !$statusSaysActive) {
                return [true, 'Ya tenía licencia permanente en X-Flow Center.'];
            }
            // Sumar los días sobre la fecha que ya tiene el Center (si sigue vigente).
            $curTs = ($cur !== null && $cur !== '') ? strtotime((string)$cur . ' UTC') : false;
            $base = ($curTs !== false && $curTs > time()) ? $curTs : time();
            $data[$m['col_expiry']] = gmdate('Y-m-d H:i:s', $base + ((int)$lic['days']) * 86400);
        }
        if (!$data) return [true, 'Licencia ya existente en X-Flow Center.'];
        $sets = [];
        foreach (array_keys($data) as $col) $sets[] = center_quote_ident($pdo, $col) . ' = ?';
        $st = $pdo->prepare("UPDATE $t SET " . implode(', ', $sets) . " WHERE LOWER($ce) = ? AND $cp = ?");
        $st->execute(array_merge(array_values($data), [$email, $lic['center_id']]));
        return [true, 'Licencia actualizada en X-Flow Center.'];
    }

    $data[$m['col_email']] = $email;
    $data[$m['col_product']] = $lic['center_id'];
    if (!empty($m['col_created'])) $data[$m['col_created']] = now_utc();
    $cols = array_map(fn($c) => center_quote_ident($pdo, $c), array_keys($data));
    $st = $pdo->prepare("INSERT INTO $t (" . implode(', ', $cols) . ') VALUES (' . implode(', ', array_fill(0, count($data), '?')) . ')');
    $st->execute(array_values($data));
    return [true, 'Licencia creada en X-Flow Center.'];
}

function center_grant_http(array $h, array $lic, string $action): array
{
    $url = trim((string)($h['url'] ?? ''));
    if ($url === '' || !preg_match('#^https?://#i', $url)) return [false, 'Falta la URL del endpoint de X-Flow Center.'];
    $secret = (string)($h['secret'] ?? '');
    $payload = json_col([
        'action' => $action,
        'email' => mb_strtolower($lic['email']),
        'product_id' => $lic['center_id'],
        'product_name' => $lic['product_name'],
        'lifetime' => (bool)$lic['lifetime'],
        'days' => (int)($lic['days'] ?? 0),
        'expires_at' => $lic['expires_at'] ?? null,
        'tier' => $lic['tier'] ?? '',
        'order_id' => $lic['order_id'] ?? null,
        'source' => $lic['source'] ?? 'purchase',
        'timestamp' => time(),
    ]);
    $sig = hash_hmac('sha256', $payload, $secret);
    [$status, $body, $json] = http_request('POST', $url, [
        'Content-Type: application/json',
        'X-XFlow-Signature: sha256=' . $sig,
    ], $payload, 20);
    if ($status >= 200 && $status < 300 && (!$json || !isset($json['success']) || $json['success'])) {
        return [true, 'X-Flow Center respondió OK.'];
    }
    return [false, 'X-Flow Center respondió ' . $status . ': ' . mb_substr((string)$body, 0, 200)];
}

/** Lista tablas y columnas para configurar el mapeo desde el panel (solo lectura). */
function center_describe(): array
{
    $pdo = center_pdo();
    $driver = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
    $out = [];
    if ($driver === 'sqlite') {
        $tables = $pdo->query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")->fetchAll(PDO::FETCH_COLUMN);
        foreach ($tables as $tb) {
            $cols = $pdo->query('PRAGMA table_info("' . str_replace('"', '', $tb) . '")')->fetchAll();
            $out[] = ['table' => $tb, 'columns' => array_map(fn($c) => ['name' => $c['name'], 'type' => $c['type']], $cols)];
        }
    } else {
        $tables = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
        foreach ($tables as $tb) {
            if (!preg_match('/^[A-Za-z0-9_]+$/', $tb)) continue;
            $cols = $pdo->query('SHOW COLUMNS FROM `' . $tb . '`')->fetchAll();
            $out[] = ['table' => $tb, 'columns' => array_map(fn($c) => ['name' => $c['Field'], 'type' => $c['Type']], $cols)];
        }
    }
    return $out;
}

/** Comprueba que la tabla y columnas del mapeo existen. */
function center_test(): array
{
    $cfg = get_setting('center');
    $mode = $cfg['mode'] ?? 'none';
    if ($mode === 'none') return ['ok' => false, 'message' => 'Modo manual: la tienda no escribe en X-Flow Center.'];
    if ($mode === 'http') {
        $h = $cfg['http'] ?? [];
        if (empty($h['url'])) return ['ok' => false, 'message' => 'Falta la URL.'];
        $payload = json_col(['action' => 'ping', 'timestamp' => time()]);
        [$status, $body] = http_request('POST', $h['url'], ['Content-Type: application/json', 'X-XFlow-Signature: sha256=' . hash_hmac('sha256', $payload, (string)($h['secret'] ?? ''))], $payload, 15);
        return ['ok' => $status >= 200 && $status < 300, 'message' => 'HTTP ' . $status . ' · ' . mb_substr((string)$body, 0, 160)];
    }
    $m = $cfg['db'];
    $tables = center_describe();
    $found = null;
    foreach ($tables as $t) if ($t['table'] === $m['table']) $found = $t;
    if (!$found) return ['ok' => false, 'message' => 'No existe la tabla "' . $m['table'] . '" en la base de datos del Center.'];
    $names = array_column($found['columns'], 'name');
    $missing = [];
    foreach (['col_email', 'col_product', 'col_product_name', 'col_expiry', 'col_status', 'col_tier', 'col_created'] as $k) {
        $col = $m[$k] ?? '';
        if ($col === '' || ($k === 'col_expiry' && ($m['expiry_mode'] ?? '') === 'none')) continue;
        if (!in_array($col, $names, true)) $missing[] = $col;
    }
    if ($missing) return ['ok' => false, 'message' => 'Columnas que no existen en "' . $m['table'] . '": ' . implode(', ', $missing)];
    return ['ok' => true, 'message' => 'Tabla "' . $m['table'] . '" encontrada con todas las columnas del mapeo.'];
}

/** Plugins registrados hoy en X-Flow Center (soporte_api.php?accion=obtener_plugins). */
function center_plugins(): array
{
    $url = (string)cfg('legacy_api_url', '');
    if ($url === '') return [];
    [$status, , $json] = http_request('GET', $url . (str_contains($url, '?') ? '&' : '?') . 'accion=obtener_plugins', [], null, 15);
    if ($status !== 200 || !is_array($json)) return [];
    $out = [];
    foreach ($json as $p) {
        if (!is_array($p) || empty($p['id'])) continue;
        $out[] = [
            'id' => (string)$p['id'],
            'name' => (string)($p['nombre'] ?? $p['name'] ?? $p['id']),
            'price' => (float)($p['precio_perm'] ?? $p['price'] ?? 0),
            'description' => (string)($p['descripcion'] ?? $p['desc'] ?? ''),
        ];
    }
    return $out;
}
