<?php
/**
 * Instalador / comprobación de X-FLOW STORE.
 *  - Verifica PHP, extensiones y conexión a la base de datos EXISTENTE.
 *  - Crea SOLO las tablas nuevas "store_*" (no toca las tablas de X-Flow Center).
 *  - Genera el hash de la contraseña del panel para pegarlo en config.php.
 * Cuando termines puedes borrar este archivo del servidor.
 */
declare(strict_types=1);
header('Content-Type: text/html; charset=utf-8');
header('X-Robots-Tag: noindex');

$checks = [];
$checks[] = ['PHP 8.0 o superior', version_compare(PHP_VERSION, '8.0.0', '>='), PHP_VERSION];
foreach (['pdo_mysql', 'curl', 'json', 'mbstring', 'openssl', 'fileinfo'] as $ext) {
    $checks[] = ['Extensión ' . $ext, extension_loaded($ext), extension_loaded($ext) ? 'OK' : 'Falta'];
}
$hasConfig = is_file(__DIR__ . '/config.php');
$checks[] = ['Archivo api/config.php', $hasConfig, $hasConfig ? 'Encontrado' : 'Copia config.sample.php como config.php'];

$dbMsg = 'Sin probar';
$dbOk = false;
$tablesCreated = [];
if ($hasConfig) {
    $GLOBALS['XF_CONFIG'] = require __DIR__ . '/config.php';
    require __DIR__ . '/lib/util.php';
    require __DIR__ . '/lib/db.php';
    require __DIR__ . '/lib/settings.php';
    try {
        $pdo = db();
        $dbOk = true;
        $dbMsg = 'Conectado (' . $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) . '). Tablas de la tienda listas.';
        $list = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite'
            ? $pdo->query("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'store_%'")->fetchAll(PDO::FETCH_COLUMN)
            : $pdo->query("SHOW TABLES LIKE 'store\\_%'")->fetchAll(PDO::FETCH_COLUMN);
        $tablesCreated = $list;
    } catch (Throwable $e) {
        $dbMsg = 'Error: ' . $e->getMessage();
    }
    $checks[] = ['Conexión a la base de datos', $dbOk, $dbMsg];
    $admins = (array)($GLOBALS['XF_CONFIG']['admin_emails'] ?? []);
    $adminOk = $admins && !in_array('tu-correo-admin@ejemplo.com', $admins, true);
    $checks[] = ['Correo(s) de administrador', $adminOk, $adminOk ? implode(', ', $admins) : 'Edita admin_emails en config.php'];
    $hashOk = !empty($GLOBALS['XF_CONFIG']['admin_password_hash']);
    $checks[] = ['Contraseña del panel', $hashOk || !empty($GLOBALS['XF_CONFIG']['admin_allow_center_login']), $hashOk ? 'Configurada' : 'Genera el hash abajo (o entra con tu cuenta del Center)'];
}

$hash = '';
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    $pw = (string)($_POST['pw'] ?? '');
    if (strlen($pw) >= 10) $hash = password_hash($pw, PASSWORD_DEFAULT);
}
?><!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Instalación X-FLOW STORE</title>
<style>
body{background:#050206;color:#eee;font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:760px;margin:40px auto;padding:0 16px}
h1{font-size:22px;letter-spacing:.08em}h1 span{color:#ff1b4d}
table{width:100%;border-collapse:collapse;margin:16px 0}td{padding:10px;border-bottom:1px solid #241621;font-size:14px}
.ok{color:#34d399;font-weight:700}.bad{color:#ff1b4d;font-weight:700}
.box{background:#140e18;border:1px solid #241621;border-radius:12px;padding:16px;margin:16px 0}
input{background:#08090b;color:#fff;border:1px solid #333;border-radius:8px;padding:10px;width:70%}
button{background:#ff1b4d;color:#fff;border:0;border-radius:8px;padding:10px 16px;font-weight:700;cursor:pointer}
code{background:#08090b;padding:10px;display:block;border-radius:8px;word-break:break-all;color:#ffb020}
</style></head><body>
<h1>X-FLOW <span>STORE</span> · Instalación</h1>
<table>
<?php foreach ($checks as [$label, $ok, $msg]): ?>
<tr><td><?= htmlspecialchars($label) ?></td><td class="<?= $ok ? 'ok' : 'bad' ?>"><?= $ok ? '✔' : '✘' ?></td><td><?= htmlspecialchars((string)$msg) ?></td></tr>
<?php endforeach; ?>
</table>
<?php if ($tablesCreated): ?>
<div class="box">Tablas de la tienda en tu base de datos: <b><?= htmlspecialchars(implode(', ', $tablesCreated)) ?></b><br><small>Tus tablas existentes de X-Flow Center no se modifican.</small></div>
<?php endif; ?>
<div class="box">
<b>Generar contraseña del panel /admin</b>
<form method="post" style="margin-top:10px"><input type="password" name="pw" placeholder="Contraseña (mínimo 10 caracteres)" minlength="10" required> <button>Generar</button></form>
<?php if ($hash): ?><p>Pega esto en <b>config.php</b> → <b>admin_password_hash</b>:</p><code><?= htmlspecialchars($hash) ?></code><?php endif; ?>
</div>
<p style="color:#888;font-size:13px">Cuando todo esté en verde, borra <b>api/install.php</b> del servidor.</p>
</body></html>
