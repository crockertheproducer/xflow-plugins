<?php
declare(strict_types=1);

$configFile = __DIR__ . '/config.php';
if (!is_file($configFile)) {
    http_response_code(503);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => 'not_configured', 'message' => 'Falta api/config.php (copia config.sample.php y rellénalo).']);
    exit;
}
$GLOBALS['XF_CONFIG'] = require $configFile;

date_default_timezone_set('UTC');
ini_set('display_errors', '0');

require __DIR__ . '/lib/util.php';
require __DIR__ . '/lib/db.php';
require __DIR__ . '/lib/settings.php';
require __DIR__ . '/lib/auth.php';
require __DIR__ . '/lib/catalog.php';
require __DIR__ . '/lib/center.php';
require __DIR__ . '/lib/center_catalog.php';
require __DIR__ . '/lib/center_users.php';
require __DIR__ . '/lib/password.php';
require __DIR__ . '/lib/orders.php';
require __DIR__ . '/lib/payments.php';
