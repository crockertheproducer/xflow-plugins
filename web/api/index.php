<?php
/**
 * X-FLOW STORE API — un solo punto de entrada:  api/index.php?action=NOMBRE
 */
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$action = (string)($_GET['action'] ?? '');

send_cors_headers();
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$webhooks = [
    'webhook_paypal' => 'paypal_webhook',
    'webhook_binance' => 'binance_webhook',
    'webhook_stripe' => 'stripe_webhook',
];

try {
    if (isset($webhooks[$action])) {
        json_out($webhooks[$action]());
        exit;
    }

    start_session();
    $in = input();
    $isPost = ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST';

    $routes = xf_routes();
    if (!isset($routes[$action])) fail('unknown_action', 'Acción desconocida.', 404);
    [$needsPost, $handler] = $routes[$action];
    if ($needsPost && !$isPost) fail('method', 'Usa POST.', 405);
    $result = $handler($in);
    session_write_close();
    json_out(['ok' => true] + (is_array($result) ? $result : ['data' => $result]));
} catch (ApiError $e) {
    json_out(['ok' => false, 'error' => $e->codeName, 'message' => $e->getMessage()], $e->status);
} catch (Throwable $e) {
    error_log('[xflow-store] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    json_out(['ok' => false, 'error' => 'server', 'message' => cfg('debug') ? $e->getMessage() : 'Error interno del servidor.'], 500);
}

function xf_routes(): array
{
    return [
        // ------------------------------------------------------------ TIENDA
        'bootstrap' => [false, function () {
            $sale = get_setting('sale');
            $all = all_products(true);
            return [
                'settings' => public_settings(),
                'products' => array_map(fn($p) => product_public($p, $sale, $all), $all),
                'customer' => current_customer(),
                'csrf' => $_SESSION['csrf'],
                'server_time' => gmdate('c'),
            ];
        }],
        'quote' => [true, function ($in) {
            return ['quote' => quote_cart(is_array($in['items'] ?? null) ? $in['items'] : [], str_in($in, 'coupon', 40))];
        }],
        'login' => [true, function ($in) {
            $email = email_in($in, 'email');
            $pass = str_in($in, 'password', 200);
            rate_limit('login:' . client_ip(), 10, 600);
            $u = legacy_login($email, $pass);
            if (!$u) fail('bad_credentials', 'Correo o contraseña incorrectos.', 401);
            session_regenerate_id(true);
            $_SESSION['customer'] = ['email' => $email, 'aka' => $u['aka'], 'photo' => $u['photo']];
            return ['customer' => $_SESSION['customer'], 'csrf' => $_SESSION['csrf']];
        }],
        'logout' => [true, function () {
            unset($_SESSION['customer']);
            return [];
        }],
        'me' => [false, fn() => ['customer' => current_customer(), 'csrf' => $_SESSION['csrf']]],
        'my_licenses' => [false, function () {
            $c = current_customer();
            if (!$c) fail('unauthorized', 'Inicia sesión.', 401);
            return ['licenses' => array_map('license_public', rows('SELECT * FROM store_licenses WHERE email = ? ORDER BY updated_at DESC', [$c['email']]))];
        }],
        'my_orders' => [false, function () {
            $c = current_customer();
            if (!$c) fail('unauthorized', 'Inicia sesión.', 401);
            $list = rows('SELECT * FROM store_orders WHERE email = ? OR recipient_email = ? ORDER BY id DESC LIMIT 100', [$c['email'], $c['email']]);
            return ['orders' => array_map(fn($o) => order_public($o, false) + ['token' => $o['email'] === $c['email'] ? $o['access_token'] : null], $list)];
        }],
        'checkout_start' => [true, function ($in) {
            rate_limit('checkout:' . client_ip(), 30, 600);
            $order = create_order($in);
            $resp = ['order_id' => $order['public_id'], 'token' => $order['access_token'], 'method' => $order['method'], 'total' => (int)$order['total_cents'] / 100];
            switch ($order['method']) {
                case 'free':
                    fulfill_order((int)$order['id'], 'free');
                    $resp['status'] = 'fulfilled';
                    break;
                case 'paypal':
                    $resp['paypal_order_id'] = paypal_create_order($order);
                    break;
                case 'binance':
                    $resp += binance_create_order($order);
                    $resp['redirect_url'] = $resp['checkout_url'];
                    break;
                case 'stripe':
                    $resp['redirect_url'] = stripe_create_session($order);
                    break;
                case 'manual':
                    $m = null;
                    foreach (get_setting('payments')['manual'] ?? [] as $mm) if (($mm['id'] ?? '') === $order['manual_method']) $m = $mm;
                    $resp['manual'] = $m ? ['name' => $m['name'], 'instructions' => $m['instructions'], 'account' => $m['account']] : null;
                    break;
            }
            return $resp;
        }],
        'paypal_capture' => [true, function ($in) {
            $order = order_for_client(str_in($in, 'order_id', 24), str_in($in, 'token', 64));
            if ($order['method'] !== 'paypal') fail('bad_method', 'Este pedido no es de PayPal.');
            $order = paypal_capture($order);
            return ['order' => order_public($order)];
        }],
        'manual_submit' => [true, function ($in) {
            $order = order_for_client(str_in($in, 'order_id', 24), str_in($in, 'token', 64));
            if ($order['method'] !== 'manual') fail('bad_method', 'Este pedido no es de pago manual.');
            $ref = str_in($in, 'reference', 255);
            if (mb_strlen($ref) < 4) fail('reference', 'Escribe el número de referencia / ID de la transacción.');
            if (!in_array($order['status'], ['pending', 'awaiting_review'], true)) fail('order_closed', 'Este pedido ya fue procesado.');
            update('store_orders', ['manual_reference' => $ref, 'status' => 'awaiting_review', 'updated_at' => now_utc()], 'id = ?', [(int)$order['id']]);
            $admins = (array)cfg('admin_emails', []);
            foreach ($admins as $a) {
                send_mail((string)$a, 'Pago manual por revisar · ' . $order['public_id'], '<p>' . h($order['email']) . ' reportó un pago de ' . h(cents_to_str((int)$order['total_cents'])) . ' ' . h($order['currency']) . ' por ' . h($order['manual_method']) . '.</p><p>Referencia: <b>' . h($ref) . '</b></p>');
            }
            return ['order' => order_public(order_by_public($order['public_id']))];
        }],
        'order_status' => [false, function ($in) {
            $order = order_for_client(str_in($_GET, 'order_id', 24), str_in($_GET, 'token', 64));
            $order = sync_order_with_provider($order);
            return ['order' => order_public($order)];
        }],
        'subscribe' => [true, function ($in) {
            rate_limit('sub:' . client_ip(), 10, 3600);
            $email = email_in($in, 'email');
            if (!row('SELECT id FROM store_subscribers WHERE email = ?', [$email])) {
                insert('store_subscribers', ['email' => $email, 'created_at' => now_utc()]);
            }
            return [];
        }],
        'support_ticket' => [true, function ($in) {
            rate_limit('ticket:' . client_ip(), 5, 3600);
            $email = email_in($in, 'email');
            $name = str_in($in, 'name', 120);
            $subject = str_in($in, 'subject', 160) ?: 'Soporte tienda';
            $message = str_in($in, 'message', 4000);
            if (mb_strlen($message) < 5) fail('message', 'Escribe tu mensaje.');
            $url = (string)cfg('legacy_api_url', '');
            $sent = false;
            if ($url !== '') {
                [$status] = http_request('POST', $url . (str_contains($url, '?') ? '&' : '?') . 'accion=abrir_ticket', ['Content-Type: application/x-www-form-urlencoded'], http_build_query([
                    'nombre' => $name, 'name' => $name, 'email' => $email, 'user_email' => $email, 'remitente' => $email,
                    'asunto' => $subject, 'subject' => $subject, 'mensaje' => $message, 'message' => $message,
                ]), 15);
                $sent = $status >= 200 && $status < 300;
            }
            if (!$sent) {
                foreach ((array)cfg('admin_emails', []) as $a) send_mail((string)$a, '[Soporte] ' . $subject, '<p><b>' . h($name) . '</b> &lt;' . h($email) . '&gt;</p><p>' . nl2br(h($message)) . '</p>');
            }
            return [];
        }],

        // ------------------------------------------------------------ ADMIN
        'admin_login' => [true, function ($in) {
            $email = email_in($in, 'email');
            $pass = str_in($in, 'password', 200);
            rate_limit('admin_login:' . client_ip(), 8, 900);
            if (!is_admin_email($email)) fail('bad_credentials', 'Credenciales incorrectas.', 401);
            $hash = (string)cfg('admin_password_hash', '');
            $ok = $hash !== '' && password_verify($pass, $hash);
            if (!$ok && cfg('admin_allow_center_login', true)) $ok = legacy_login($email, $pass) !== null;
            if (!$ok) fail('bad_credentials', 'Credenciales incorrectas.', 401);
            session_regenerate_id(true);
            $_SESSION['admin'] = ['email' => $email, 'since' => time()];
            $_SESSION['csrf'] = random_token(16);
            admin_log('login');
            return ['admin' => $_SESSION['admin'], 'csrf' => $_SESSION['csrf']];
        }],
        'admin_logout' => [true, function () {
            unset($_SESSION['admin']);
            return [];
        }],
        'admin_me' => [false, fn() => ['admin' => $_SESSION['admin'] ?? null, 'csrf' => $_SESSION['csrf']]],

        'admin_stats' => [false, function () {
            require_admin();
            $since30 = gmdate('Y-m-d H:i:s', time() - 30 * 86400);
            $paid = "status IN ('paid','fulfilled')";
            $revenue30 = (int)(row("SELECT COALESCE(SUM(total_cents),0) s FROM store_orders WHERE $paid AND paid_at >= ?", [$since30])['s'] ?? 0);
            $revenueAll = (int)(row("SELECT COALESCE(SUM(total_cents),0) s FROM store_orders WHERE $paid")['s'] ?? 0);
            $orders30 = (int)(row("SELECT COUNT(*) c FROM store_orders WHERE $paid AND paid_at >= ?", [$since30])['c'] ?? 0);
            $review = (int)(row("SELECT COUNT(*) c FROM store_orders WHERE status = 'awaiting_review'")['c'] ?? 0);
            $licenses = (int)(row("SELECT COUNT(*) c FROM store_licenses WHERE status = 'active'")['c'] ?? 0);
            $unsynced = (int)(row("SELECT COUNT(*) c FROM store_licenses WHERE status = 'active' AND center_synced = 0")['c'] ?? 0);
            $subs = (int)(row('SELECT COUNT(*) c FROM store_subscribers')['c'] ?? 0);
            $daily = [];
            for ($i = 13; $i >= 0; $i--) $daily[gmdate('Y-m-d', time() - $i * 86400)] = 0;
            foreach (rows("SELECT paid_at, total_cents FROM store_orders WHERE $paid AND paid_at >= ?", [gmdate('Y-m-d 00:00:00', time() - 13 * 86400)]) as $r) {
                $d = substr((string)$r['paid_at'], 0, 10);
                if (isset($daily[$d])) $daily[$d] += (int)$r['total_cents'];
            }
            $top = [];
            foreach (rows("SELECT items FROM store_orders WHERE $paid AND paid_at >= ?", [$since30]) as $r) {
                foreach (json_dec($r['items'], []) as $l) {
                    $k = $l['name'];
                    $top[$k] = ($top[$k] ?? ['name' => $k, 'count' => 0, 'cents' => 0]);
                    $top[$k]['count']++;
                    $top[$k]['cents'] += (int)$l['unit_cents'];
                }
            }
            usort($top, fn($a, $b) => $b['cents'] <=> $a['cents']);
            $recent = array_map('order_admin', rows('SELECT * FROM store_orders ORDER BY id DESC LIMIT 8'));
            return [
                'revenue_30d' => $revenue30 / 100, 'revenue_all' => $revenueAll / 100, 'orders_30d' => $orders30,
                'awaiting_review' => $review, 'active_licenses' => $licenses, 'unsynced_licenses' => $unsynced, 'subscribers' => $subs,
                'daily' => array_map(fn($d, $c) => ['date' => $d, 'total' => $c / 100], array_keys($daily), $daily),
                'top' => array_slice(array_map(fn($t) => ['name' => $t['name'], 'count' => $t['count'], 'total' => $t['cents'] / 100], $top), 0, 6),
                'recent' => $recent,
                'currency' => get_setting('site')['currency'] ?? 'USD',
            ];
        }],

        // productos y packs
        'admin_products' => [false, function () {
            require_admin();
            return ['products' => all_products(false)];
        }],
        'admin_product_save' => [true, function ($in) {
            require_admin();
            $p = is_array($in['product'] ?? null) ? $in['product'] : [];
            $id = int_in($p, 'id');
            $type = in_array($p['type'] ?? '', XF_PRODUCT_TYPES, true) ? $p['type'] : 'plugin';
            $name = str_in($p, 'name', 160);
            if ($name === '') fail('name', 'El producto necesita un nombre.');
            $slug = slugify(str_in($p, 'slug', 120) ?: $name);
            $clash = row('SELECT id FROM store_products WHERE slug = ? AND id <> ?', [$slug, $id]);
            if ($clash) $slug .= '-' . substr(random_token(2), 0, 4);
            $plans = normalize_plans($p['plans'] ?? []);
            if (!$plans && $type !== 'sample_pack') fail('plans', 'Añade al menos un precio (permanente o suscripción).');
            $ids = array_column($plans, 'id');
            if (count($ids) !== count(array_unique($ids))) fail('plans', 'Cada precio necesita un ID distinto.');
            $status = in_array($p['status'] ?? '', XF_PRODUCT_STATUS, true) ? $p['status'] : 'published';
            $features = array_values(array_filter(array_map(fn($f) => mb_substr(trim((string)$f), 0, 200), (array)($p['features'] ?? [])), fn($f) => $f !== ''));
            $gallery = array_values(array_filter(array_map(fn($f) => mb_substr(trim((string)$f), 0, 500), (array)($p['gallery'] ?? [])), fn($f) => $f !== ''));
            $specs = is_array($p['specs'] ?? null) ? array_map(fn($v) => mb_substr(trim((string)$v), 0, 120), $p['specs']) : [];
            $data = [
                'type' => $type,
                'slug' => $slug,
                'name' => $name,
                'tagline' => str_in($p, 'tagline', 255),
                'description' => str_in($p, 'description', 20000),
                'features' => json_col($features),
                'specs' => json_col($specs),
                'image' => str_in($p, 'image', 500),
                'gallery' => json_col($gallery),
                'video_url' => str_in($p, 'video_url', 500),
                'category' => str_in($p, 'category', 64),
                'center_id' => str_in($p, 'center_id', 160),
                'plans' => json_col($plans),
                'discount_percent' => max(0, min(100, int_in($p, 'discount_percent'))),
                'discount_ends_at' => parse_datetime(str_in($p, 'discount_ends_at', 40)),
                'badge' => mb_strtoupper(str_in($p, 'badge', 40)),
                'bundle_items' => json_col(array_values(array_unique(array_map('intval', (array)($p['bundle_items'] ?? []))))),
                'bundle_all' => bool_in($p, 'bundle_all') ? 1 : 0,
                'featured' => bool_in($p, 'featured') ? 1 : 0,
                'is_new' => bool_in($p, 'is_new') ? 1 : 0,
                'status' => $status,
                'sort_order' => int_in($p, 'sort_order'),
                'updated_at' => now_utc(),
            ];
            if ($type === 'plugin' && $data['center_id'] === '') fail('center_id', 'Indica el ID del plugin en X-Flow Center (para activar la licencia).');
            if ($id > 0) {
                if (!product_by_id($id)) fail('not_found', 'Producto no encontrado.', 404);
                update('store_products', $data, 'id = ?', [$id]);
            } else {
                $data['created_at'] = now_utc();
                $id = insert('store_products', $data);
            }
            admin_log('product_save', ['id' => $id, 'name' => $name]);
            return ['product' => product_by_id($id)];
        }],
        'admin_product_delete' => [true, function ($in) {
            require_admin();
            $id = int_in($in, 'id');
            $sold = row('SELECT id FROM store_licenses WHERE product_id = ? LIMIT 1', [$id]);
            if ($sold) {
                update('store_products', ['status' => 'hidden', 'updated_at' => now_utc()], 'id = ?', [$id]);
                admin_log('product_hide', ['id' => $id]);
                return ['hidden' => true];
            }
            q('DELETE FROM store_products WHERE id = ?', [$id]);
            admin_log('product_delete', ['id' => $id]);
            return ['deleted' => true];
        }],
        'admin_center_plugins' => [false, function () {
            require_admin();
            return ['plugins' => center_plugins()];
        }],
        'admin_import_center_plugins' => [true, function () {
            require_admin();
            $existing = array_map(fn($p) => mb_strtolower($p['center_id']), all_products(false));
            $created = 0;
            foreach (center_plugins() as $cp) {
                if (in_array(mb_strtolower($cp['id']), $existing, true)) continue;
                $slug = slugify($cp['name']);
                if (row('SELECT id FROM store_products WHERE slug = ?', [$slug])) $slug .= '-' . substr(random_token(2), 0, 4);
                insert('store_products', [
                    'type' => 'plugin', 'slug' => $slug, 'name' => $cp['name'], 'tagline' => '', 'description' => $cp['description'],
                    'features' => '[]', 'specs' => json_col(['formats' => 'VST3', 'os' => 'Windows 10 / 11 (64-bit)']), 'image' => '', 'gallery' => '[]',
                    'video_url' => '', 'category' => '', 'center_id' => $cp['id'],
                    'plans' => json_col(normalize_plans([['id' => 'lifetime', 'label' => 'Permanente', 'type' => 'lifetime', 'price' => $cp['price'] ?: 19.99]])),
                    'discount_percent' => 0, 'badge' => '', 'bundle_items' => '[]', 'bundle_all' => 0, 'featured' => 0, 'is_new' => 0,
                    'status' => 'draft', 'sort_order' => 50, 'created_at' => now_utc(), 'updated_at' => now_utc(),
                ]);
                $created++;
            }
            admin_log('import_center', ['created' => $created]);
            return ['created' => $created];
        }],
        'admin_upload' => [true, function () {
            require_admin();
            $f = $_FILES['file'] ?? null;
            if (!$f || ($f['error'] ?? 1) !== UPLOAD_ERR_OK) fail('upload', 'No se recibió el archivo.');
            if ($f['size'] > 8 * 1024 * 1024) fail('upload', 'Máximo 8 MB.');
            $mime = (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
            $ext = ['image/png' => 'png', 'image/jpeg' => 'jpg', 'image/webp' => 'webp', 'image/gif' => 'gif'][$mime] ?? null;
            if (!$ext) fail('upload', 'Solo imágenes PNG, JPG, WEBP o GIF.');
            $dir = __DIR__ . '/uploads';
            if (!is_dir($dir)) mkdir($dir, 0755, true);
            $name = gmdate('Ymd') . '-' . random_token(6) . '.' . $ext;
            if (!move_uploaded_file($f['tmp_name'], $dir . '/' . $name)) fail('upload', 'No se pudo guardar el archivo.');
            admin_log('upload', $name);
            return ['url' => 'api/uploads/' . $name];
        }],

        // cupones
        'admin_coupons' => [false, function () {
            require_admin();
            return ['coupons' => array_map(fn($c) => [
                'id' => (int)$c['id'], 'code' => $c['code'], 'kind' => $c['kind'], 'value' => (float)$c['value'],
                'product_ids' => array_map('intval', json_dec($c['product_ids'], [])), 'min_total' => (float)$c['min_total'],
                'max_uses' => $c['max_uses'] === null ? null : (int)$c['max_uses'], 'used' => (int)$c['used'],
                'starts_at' => iso($c['starts_at']), 'expires_at' => iso($c['expires_at']), 'active' => (bool)$c['active'],
            ], rows('SELECT * FROM store_coupons ORDER BY id DESC'))];
        }],
        'admin_coupon_save' => [true, function ($in) {
            require_admin();
            $c = is_array($in['coupon'] ?? null) ? $in['coupon'] : [];
            $id = int_in($c, 'id');
            $code = strtoupper(preg_replace('/[^A-Za-z0-9_-]/', '', str_in($c, 'code', 40)) ?? '');
            if (strlen($code) < 3) fail('code', 'El código debe tener al menos 3 caracteres (letras, números, - o _).');
            if (row('SELECT id FROM store_coupons WHERE code = ? AND id <> ?', [$code, $id])) fail('code', 'Ya existe un cupón con ese código.');
            $kind = ($c['kind'] ?? '') === 'fixed' ? 'fixed' : 'percent';
            $value = max(0, (float)($c['value'] ?? 0));
            if ($kind === 'percent' && $value > 100) $value = 100;
            $data = [
                'code' => $code, 'kind' => $kind, 'value' => $value,
                'product_ids' => json_col(array_values(array_map('intval', (array)($c['product_ids'] ?? [])))),
                'min_total' => max(0, (float)($c['min_total'] ?? 0)),
                'max_uses' => ($c['max_uses'] ?? '') === '' || $c['max_uses'] === null ? null : max(0, (int)$c['max_uses']),
                'starts_at' => parse_datetime(str_in($c, 'starts_at', 40)),
                'expires_at' => parse_datetime(str_in($c, 'expires_at', 40)),
                'active' => bool_in($c, 'active', true) ? 1 : 0,
            ];
            if ($id > 0) update('store_coupons', $data, 'id = ?', [$id]);
            else { $data['created_at'] = now_utc(); $id = insert('store_coupons', $data); }
            admin_log('coupon_save', $code);
            return ['id' => $id];
        }],
        'admin_coupon_delete' => [true, function ($in) {
            require_admin();
            q('DELETE FROM store_coupons WHERE id = ?', [int_in($in, 'id')]);
            admin_log('coupon_delete', int_in($in, 'id'));
            return [];
        }],

        // pedidos
        'admin_orders' => [false, function () {
            require_admin();
            $status = str_in($_GET, 'status', 20);
            $search = mb_strtolower(str_in($_GET, 'q', 120));
            $sql = 'SELECT * FROM store_orders WHERE 1=1';
            $params = [];
            if ($status !== '' && in_array($status, XF_ORDER_STATUSES, true)) { $sql .= ' AND status = ?'; $params[] = $status; }
            if ($search !== '') {
                $sql .= ' AND (LOWER(email) LIKE ? OR LOWER(recipient_email) LIKE ? OR public_id LIKE ? OR LOWER(manual_reference) LIKE ? OR provider_ref LIKE ?)';
                $like = '%' . $search . '%';
                array_push($params, $like, $like, '%' . strtoupper($search) . '%', $like, $like);
            }
            $sql .= ' ORDER BY id DESC LIMIT 300';
            return ['orders' => array_map('order_admin', rows($sql, $params))];
        }],
        'admin_order_approve' => [true, function ($in) {
            require_admin();
            $o = order_by_public(str_in($in, 'order_id', 24));
            if (!$o) fail('not_found', 'Pedido no encontrado.', 404);
            if (in_array($o['status'], ['fulfilled', 'refunded', 'cancelled'], true)) fail('order_closed', 'Este pedido ya está ' . $o['status'] . '.');
            $o = fulfill_order((int)$o['id'], $o['provider_ref'] ?: ('manual:' . $o['manual_reference']), true);
            admin_log('order_approve', $o['public_id']);
            return ['order' => order_admin($o)];
        }],
        'admin_order_status' => [true, function ($in) {
            require_admin();
            $o = order_by_public(str_in($in, 'order_id', 24));
            if (!$o) fail('not_found', 'Pedido no encontrado.', 404);
            $status = str_in($in, 'status', 20);
            if (!in_array($status, ['cancelled', 'refunded', 'failed', 'pending'], true)) fail('status', 'Estado no permitido.');
            $note = str_in($in, 'note', 500);
            update('store_orders', ['status' => $status, 'admin_note' => $note ?: $o['admin_note'], 'updated_at' => now_utc()], 'id = ?', [(int)$o['id']]);
            if ($status === 'refunded' && bool_in($in, 'revoke_licenses')) {
                foreach (rows('SELECT * FROM store_licenses WHERE order_id = ?', [(int)$o['id']]) as $l) {
                    center_revoke($l);
                    update('store_licenses', ['status' => 'revoked', 'updated_at' => now_utc()], 'id = ?', [(int)$l['id']]);
                }
            }
            admin_log('order_status', ['order' => $o['public_id'], 'status' => $status]);
            return ['order' => order_admin(order_by_public($o['public_id']))];
        }],
        'admin_order_sync' => [true, function ($in) {
            require_admin();
            $o = order_by_public(str_in($in, 'order_id', 24));
            if (!$o) fail('not_found', 'Pedido no encontrado.', 404);
            if ($o['method'] === 'paypal' && $o['status'] === 'pending' && $o['provider_ref'] !== '') {
                try { $o = paypal_capture($o); } catch (ApiError $e) { fail($e->codeName, $e->getMessage(), 400); }
            } else {
                $o = sync_order_with_provider($o);
            }
            return ['order' => order_admin($o)];
        }],

        // licencias
        'admin_licenses' => [false, function () {
            require_admin();
            $search = mb_strtolower(str_in($_GET, 'q', 120));
            $sql = 'SELECT * FROM store_licenses';
            $params = [];
            if ($search !== '') { $sql .= ' WHERE LOWER(email) LIKE ? OR LOWER(product_name) LIKE ?'; $params = ['%' . $search . '%', '%' . $search . '%']; }
            $sql .= ' ORDER BY updated_at DESC LIMIT 500';
            return ['licenses' => array_map('license_public', rows($sql, $params))];
        }],
        'admin_license_grant' => [true, function ($in) {
            $admin = require_admin();
            $emails = array_values(array_unique(array_filter(array_map(fn($e) => mb_strtolower(trim($e)), preg_split('/[\s,;]+/', str_in($in, 'emails', 5000)) ?: []))));
            if (!$emails) fail('emails', 'Escribe al menos un correo.');
            foreach ($emails as $e) if (!filter_var($e, FILTER_VALIDATE_EMAIL)) fail('emails', 'Correo inválido: ' . $e);
            $product = product_by_id(int_in($in, 'product_id'));
            if (!$product) fail('product', 'Elige un producto o pack.');
            $lifetime = str_in($in, 'plan_type', 20) === 'lifetime';
            $days = $lifetime ? 0 : max(1, int_in($in, 'days', 30));
            $note = str_in($in, 'note', 400) ?: 'Regalo de ' . $admin['email'];
            $granted = [];
            foreach ($emails as $email) {
                foreach (expand_product($product) as $plugin) {
                    $granted[] = license_public(grant_license([
                        'email' => $email, 'product' => $plugin, 'lifetime' => $lifetime, 'days' => $days,
                        'tier' => str_in($in, 'tier', 64), 'source' => 'gift', 'order_id' => null, 'note' => $note,
                    ]));
                }
                if (bool_in($in, 'notify', true)) {
                    $site = get_setting('site');
                    send_mail($email, '🎁 Te regalaron ' . $product['name'], '<div style="font-family:Arial,sans-serif;background:#050206;color:#fff;padding:24px"><h2 style="color:#ff1b4d">¡Tienes un regalo de X-FLOW!</h2><p><b>' . h($product['name']) . '</b> — ' . ($lifetime ? 'licencia permanente' : $days . ' días') . '.</p><p>Abre X-Flow Center con este correo para instalarlo.</p>' . (!empty($site['center_download_url']) ? '<p><a style="color:#ffb020" href="' . h($site['center_download_url']) . '">Descargar X-Flow Center</a></p>' : '') . '</div>');
                }
            }
            admin_log('license_gift', ['emails' => $emails, 'product' => $product['name'], 'lifetime' => $lifetime, 'days' => $days]);
            return ['licenses' => $granted];
        }],
        'admin_license_revoke' => [true, function ($in) {
            require_admin();
            $l = row('SELECT * FROM store_licenses WHERE id = ?', [int_in($in, 'id')]);
            if (!$l) fail('not_found', 'Licencia no encontrada.', 404);
            [$ok, $msg] = center_revoke($l);
            update('store_licenses', ['status' => 'revoked', 'center_message' => mb_substr($msg, 0, 500), 'updated_at' => now_utc()], 'id = ?', [(int)$l['id']]);
            admin_log('license_revoke', ['id' => (int)$l['id'], 'email' => $l['email']]);
            return ['license' => license_public(row('SELECT * FROM store_licenses WHERE id = ?', [(int)$l['id']]))];
        }],
        'admin_license_extend' => [true, function ($in) {
            require_admin();
            $l = row('SELECT * FROM store_licenses WHERE id = ?', [int_in($in, 'id')]);
            if (!$l) fail('not_found', 'Licencia no encontrada.', 404);
            $product = product_by_id((int)$l['product_id']) ?? ['id' => (int)$l['product_id'], 'name' => $l['product_name'], 'center_id' => $l['center_id']];
            $lifetime = str_in($in, 'plan_type', 20) === 'lifetime';
            $new = grant_license([
                'email' => $l['email'], 'product' => $product, 'lifetime' => $lifetime, 'days' => $lifetime ? 0 : max(1, int_in($in, 'days', 30)),
                'tier' => $l['tier'], 'source' => 'manual', 'order_id' => $l['order_id'] ? (int)$l['order_id'] : null, 'note' => $l['note'],
            ]);
            admin_log('license_extend', ['id' => (int)$l['id']]);
            return ['license' => license_public($new)];
        }],
        'admin_license_resync' => [true, function ($in) {
            require_admin();
            return ['license' => license_public(resync_license(int_in($in, 'id')))];
        }],

        // ajustes
        'admin_settings' => [false, function () {
            require_admin();
            return ['site' => settings_for_admin('site'), 'sale' => get_setting('sale'), 'payments' => settings_for_admin('payments'), 'center' => settings_for_admin('center'),
                'webhooks' => [
                    'paypal' => public_url('api/index.php?action=webhook_paypal'),
                    'stripe' => public_url('api/index.php?action=webhook_stripe'),
                    'binance' => public_url('api/index.php?action=webhook_binance'),
                ]];
        }],
        'admin_settings_save' => [true, function ($in) {
            require_admin();
            $section = str_in($in, 'section', 20);
            if (!in_array($section, ['site', 'sale', 'payments', 'center'], true)) fail('section', 'Sección inválida.');
            $value = is_array($in['value'] ?? null) ? $in['value'] : [];
            if ($section === 'sale') {
                $value['percent'] = max(0, min(90, (int)($value['percent'] ?? 0)));
                $value['ends_at'] = parse_datetime((string)($value['ends_at'] ?? ''));
                $value['product_ids'] = array_values(array_map('intval', (array)($value['product_ids'] ?? [])));
            }
            if ($section === 'payments' && isset($value['manual']) && is_array($value['manual'])) {
                $value['manual'] = array_values(array_map(fn($m) => [
                    'id' => slugify((string)($m['id'] ?? '') ?: (string)($m['name'] ?? 'metodo')),
                    'name' => mb_substr(trim((string)($m['name'] ?? '')), 0, 60),
                    'enabled' => !empty($m['enabled']),
                    'instructions' => mb_substr(trim((string)($m['instructions'] ?? '')), 0, 1000),
                    'account' => mb_substr(trim((string)($m['account'] ?? '')), 0, 500),
                ], array_filter($value['manual'], 'is_array')));
            }
            if ($section === 'center' && isset($value['db']) && is_array($value['db'])) {
                foreach (['table', 'col_email', 'col_product', 'col_product_name', 'col_expiry', 'col_status', 'col_tier', 'col_created'] as $k) {
                    $v = trim((string)($value['db'][$k] ?? ''));
                    if ($v !== '' && !preg_match('/^[A-Za-z0-9_]{1,64}$/', $v)) fail('center_mapping', 'Nombre inválido: ' . $v);
                    $value['db'][$k] = $v;
                }
            }
            settings_save_from_admin($section, $value);
            admin_log('settings_save', $section);
            return ['value' => in_array($section, ['payments', 'center', 'site'], true) ? settings_for_admin($section) : get_setting($section)];
        }],
        'admin_center_test' => [true, function () {
            require_admin();
            return ['result' => center_test()];
        }],
        'admin_center_describe' => [false, function () {
            require_admin();
            return ['tables' => center_describe()];
        }],
        'admin_subscribers' => [false, function () {
            require_admin();
            return ['subscribers' => rows('SELECT email, created_at FROM store_subscribers ORDER BY id DESC LIMIT 5000')];
        }],
        'admin_log' => [false, function () {
            require_admin();
            return ['log' => rows('SELECT admin, action, detail, created_at FROM store_admin_log ORDER BY id DESC LIMIT 200')];
        }],
    ];
}
