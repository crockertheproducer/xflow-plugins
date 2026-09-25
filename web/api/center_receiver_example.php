<?php
/**
 * EJEMPLO de receptor para el modo "Endpoint HTTP" de la conexión con X-Flow Center.
 *
 * Úsalo solo si la tienda NO puede escribir directo en la base de datos del Center
 * (por ejemplo, si la tienda está en otro hosting). Copia este archivo al servidor
 * del Center, ajusta la consulta SQL a TU tabla de licencias y pon la misma clave
 * en el panel (X-Flow Center → Endpoint HTTP → Secreto compartido).
 *
 * La tienda envía un POST JSON con la cabecera  X-XFlow-Signature: sha256=<hmac>
 *   { action: grant|revoke|ping, email, product_id, product_name, lifetime,
 *     days, expires_at, tier, order_id, source, timestamp }
 */
declare(strict_types=1);

const SHARED_SECRET = 'PON_AQUI_EL_MISMO_SECRETO_DEL_PANEL';

header('Content-Type: application/json; charset=utf-8');

$body = file_get_contents('php://input') ?: '';
$sig = $_SERVER['HTTP_X_XFLOW_SIGNATURE'] ?? '';
if (SHARED_SECRET === 'PON_AQUI_EL_MISMO_SECRETO_DEL_PANEL' || !hash_equals('sha256=' . hash_hmac('sha256', $body, SHARED_SECRET), $sig)) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'firma inválida']);
    exit;
}
$d = json_decode($body, true);
if (!is_array($d) || abs(time() - (int)($d['timestamp'] ?? 0)) > 600) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'petición vencida']);
    exit;
}
if (($d['action'] ?? '') === 'ping') {
    echo json_encode(['success' => true, 'pong' => true]);
    exit;
}

// ---- Ajusta la conexión y la tabla a tu base de datos existente ----
$pdo = new PDO('mysql:host=localhost;dbname=TU_BD;charset=utf8mb4', 'USUARIO', 'CLAVE', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$email = mb_strtolower((string)$d['email']);
$plugin = (string)$d['product_id'];

if (($d['action'] ?? '') === 'revoke') {
    $st = $pdo->prepare("UPDATE licencias SET estado = 'revocado' WHERE email = ? AND plugin = ?");
    $st->execute([$email, $plugin]);
    echo json_encode(['success' => true]);
    exit;
}

$st = $pdo->prepare('SELECT fecha_expiracion, estado FROM licencias WHERE email = ? AND plugin = ? LIMIT 1');
$st->execute([$email, $plugin]);
$row = $st->fetch(PDO::FETCH_ASSOC);

if (!empty($d['lifetime'])) {
    $exp = null;
    $estado = 'permanente';
} else {
    if ($row && $row['estado'] === 'permanente') {
        echo json_encode(['success' => true, 'note' => 'ya era permanente']);
        exit;
    }
    $base = ($row && $row['fecha_expiracion'] && strtotime($row['fecha_expiracion']) > time()) ? strtotime($row['fecha_expiracion']) : time();
    $exp = date('Y-m-d H:i:s', $base + ((int)$d['days']) * 86400);
    $estado = 'activo';
}

if ($row) {
    $st = $pdo->prepare('UPDATE licencias SET fecha_expiracion = ?, estado = ? WHERE email = ? AND plugin = ?');
    $st->execute([$exp, $estado, $email, $plugin]);
} else {
    $st = $pdo->prepare('INSERT INTO licencias (email, plugin, fecha_expiracion, estado) VALUES (?, ?, ?, ?)');
    $st->execute([$email, $plugin, $exp, $estado]);
}
echo json_encode(['success' => true]);
