<?php
declare(strict_types=1);

const XF_ORDER_STATUSES = ['pending', 'awaiting_review', 'paid', 'fulfilled', 'failed', 'cancelled', 'refunded'];

function order_by_public(string $publicId): ?array
{
    return row('SELECT * FROM store_orders WHERE public_id = ?', [$publicId]);
}

function order_for_client(string $publicId, string $token): array
{
    $o = order_by_public($publicId);
    if (!$o || !hash_equals((string)$o['access_token'], $token)) fail('order_not_found', 'Pedido no encontrado.', 404);
    return $o;
}

function order_public(array $o, bool $withLicenses = true): array
{
    $out = [
        'id' => $o['public_id'],
        'email' => $o['email'],
        'recipient_email' => $o['recipient_email'],
        'items' => json_dec($o['items'], []),
        'subtotal' => (int)$o['subtotal_cents'] / 100,
        'discount' => (int)$o['discount_cents'] / 100,
        'total' => (int)$o['total_cents'] / 100,
        'currency' => $o['currency'],
        'coupon_code' => $o['coupon_code'],
        'method' => $o['method'],
        'manual_method' => $o['manual_method'],
        'status' => $o['status'],
        'created_at' => iso($o['created_at']),
        'paid_at' => iso($o['paid_at']),
    ];
    if ($withLicenses) {
        $out['licenses'] = array_map('license_public', rows('SELECT * FROM store_licenses WHERE order_id = ? ORDER BY id', [(int)$o['id']]));
    }
    return $out;
}

function order_admin(array $o): array
{
    $out = order_public($o);
    $out['db_id'] = (int)$o['id'];
    $out['customer_name'] = $o['customer_name'];
    $out['gift_message'] = $o['gift_message'];
    $out['provider_ref'] = $o['provider_ref'];
    $out['manual_reference'] = $o['manual_reference'];
    $out['admin_note'] = $o['admin_note'];
    $out['ip'] = $o['ip'];
    $out['fulfilled_at'] = iso($o['fulfilled_at']);
    return $out;
}

function license_public(array $l): array
{
    $expired = !(int)$l['lifetime'] && $l['expires_at'] && strtotime($l['expires_at'] . ' UTC') < time();
    return [
        'id' => (int)$l['id'],
        'email' => $l['email'],
        'product_id' => (int)$l['product_id'],
        'product_name' => $l['product_name'],
        'tier' => $l['tier'],
        'lifetime' => (bool)$l['lifetime'],
        'expires_at' => iso($l['expires_at']),
        'source' => $l['source'],
        'status' => $l['status'] === 'active' && $expired ? 'expired' : $l['status'],
        'center_synced' => (bool)$l['center_synced'],
        'center_message' => $l['center_message'],
        'note' => $l['note'],
        'created_at' => iso($l['created_at']),
        'updated_at' => iso($l['updated_at']),
    ];
}

/**
 * Crea el pedido con precios del servidor.
 */
function create_order(array $in): array
{
    $email = email_in($in, 'email');
    $name = str_in($in, 'name', 160);
    $gift = bool_in($in, 'is_gift');
    $recipient = $gift ? email_in($in, 'recipient_email') : null;
    if ($recipient === $email) $recipient = null;
    $giftMessage = $gift ? str_in($in, 'gift_message', 500) : '';
    $method = str_in($in, 'method', 80);
    $items = is_array($in['items'] ?? null) ? $in['items'] : [];
    $quote = quote_cart($items, str_in($in, 'coupon', 40));
    if ($quote['coupon_error']) fail('coupon', $quote['coupon_error']);

    $methods = array_column(public_settings()['payment_methods'], null, 'id');
    $isFree = $quote['total_cents'] === 0;
    if (!$isFree && !isset($methods[$method])) fail('method_unavailable', 'Elige un método de pago disponible.');

    $manualId = '';
    if (str_starts_with($method, 'manual:')) {
        $manualId = substr($method, 7);
        $method = 'manual';
    }
    if ($isFree) $method = 'free';

    $now = now_utc();
    $publicId = public_order_id();
    $token = random_token(24);
    $id = insert('store_orders', [
        'public_id' => $publicId,
        'access_token' => $token,
        'email' => $email,
        'customer_name' => $name,
        'recipient_email' => $recipient,
        'gift_message' => $giftMessage,
        'items' => json_col($quote['lines']),
        'subtotal_cents' => $quote['subtotal_cents'],
        'discount_cents' => $quote['discount_cents'],
        'total_cents' => $quote['total_cents'],
        'currency' => $quote['currency'],
        'coupon_code' => $quote['coupon']['code'] ?? '',
        'method' => $method,
        'manual_method' => $manualId,
        'status' => 'pending',
        'ip' => client_ip(),
        'created_at' => $now,
        'updated_at' => $now,
    ]);
    return row('SELECT * FROM store_orders WHERE id = ?', [$id]);
}

/**
 * Marca como pagado y entrega licencias. Idempotente: si ya se procesó no repite.
 */
function fulfill_order(int $orderId, string $providerRef = '', bool $retryPaid = false): array
{
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $n = q("UPDATE store_orders SET status = 'paid', paid_at = ?, updated_at = ?" . ($providerRef !== '' ? ', provider_ref = ?' : '') .
            " WHERE id = ? AND status IN ('pending','awaiting_review','failed')",
            $providerRef !== '' ? [now_utc(), now_utc(), $providerRef, $orderId] : [now_utc(), now_utc(), $orderId])->rowCount();
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    $order = row('SELECT * FROM store_orders WHERE id = ?', [$orderId]);
    // Ya procesado. Con $retryPaid se reintenta la entrega de un pedido que quedó en "paid".
    if ($n === 0 && !($retryPaid && $order['status'] === 'paid')) return $order;

    $owner = $order['recipient_email'] ?: $order['email'];
    foreach (json_dec($order['items'], []) as $line) {
        $product = product_by_id((int)$line['product_id']);
        if (!$product) continue;
        foreach (expand_product($product) as $plugin) {
            grant_license([
                'email' => $owner,
                'product' => $plugin,
                'lifetime' => $line['plan_type'] === 'lifetime',
                'days' => (int)$line['days'],
                'tier' => (string)($line['tier'] ?? ''),
                'source' => $order['recipient_email'] ? 'gift' : 'purchase',
                'order_id' => (int)$order['id'],
                'note' => $order['recipient_email'] ? 'Regalo de ' . $order['email'] : '',
            ]);
        }
    }
    if ($order['coupon_code'] !== '') q('UPDATE store_coupons SET used = used + 1 WHERE code = ?', [$order['coupon_code']]);
    q("UPDATE store_orders SET status = 'fulfilled', fulfilled_at = ?, updated_at = ? WHERE id = ?", [now_utc(), now_utc(), $orderId]);
    $order = row('SELECT * FROM store_orders WHERE id = ?', [$orderId]);
    notify_order_emails($order);
    return $order;
}

/**
 * Crea o extiende la licencia en la tienda y la sincroniza con X-Flow Center.
 * $g = ['email','product'(array),'lifetime'(bool),'days'(int),'tier','source','order_id','note']
 */
function grant_license(array $g): array
{
    $email = mb_strtolower($g['email']);
    $p = $g['product'];
    $now = now_utc();
    $existing = row('SELECT * FROM store_licenses WHERE email = ? AND product_id = ?', [$email, $p['id']]);
    $lifetime = (bool)$g['lifetime'];
    $days = max(0, (int)$g['days']);

    if ($existing && (int)$existing['lifetime'] && $existing['status'] === 'active') {
        // ya es permanente: no se degrada
        $lifetime = true;
        $expires = null;
    } elseif ($lifetime) {
        $expires = null;
    } else {
        $base = time();
        if ($existing && $existing['status'] === 'active' && $existing['expires_at'] && strtotime($existing['expires_at'] . ' UTC') > $base) {
            $base = strtotime($existing['expires_at'] . ' UTC');
        }
        $expires = gmdate('Y-m-d H:i:s', $base + $days * 86400);
    }

    [$ok, $msg] = center_grant([
        'email' => $email,
        'center_id' => (string)$p['center_id'],
        'product_name' => $p['name'],
        'lifetime' => $lifetime,
        'days' => $days,
        'expires_at' => $expires,
        'tier' => (string)($g['tier'] ?? ''),
        'order_id' => $g['order_id'] ?? null,
        'source' => $g['source'] ?? 'purchase',
    ]);

    $data = [
        'product_name' => $p['name'],
        'center_id' => (string)$p['center_id'],
        'tier' => (string)($g['tier'] ?? ''),
        'lifetime' => $lifetime ? 1 : 0,
        'expires_at' => $expires,
        'source' => $g['source'] ?? 'purchase',
        'order_id' => $g['order_id'] ?? null,
        'note' => mb_substr((string)($g['note'] ?? ''), 0, 500),
        'status' => 'active',
        'center_synced' => $ok ? 1 : 0,
        'center_message' => mb_substr($msg, 0, 500),
        'updated_at' => $now,
    ];
    if ($existing) {
        update('store_licenses', $data, 'id = ?', [(int)$existing['id']]);
        $id = (int)$existing['id'];
    } else {
        $data['email'] = $email;
        $data['product_id'] = $p['id'];
        $data['created_at'] = $now;
        $id = insert('store_licenses', $data);
    }
    return row('SELECT * FROM store_licenses WHERE id = ?', [$id]);
}

function resync_license(int $id): array
{
    $l = row('SELECT * FROM store_licenses WHERE id = ?', [$id]);
    if (!$l) fail('not_found', 'Licencia no encontrada.', 404);
    $days = 0;
    if (!(int)$l['lifetime'] && $l['expires_at']) {
        $days = max(0, (int)ceil((strtotime($l['expires_at'] . ' UTC') - time()) / 86400));
    }
    $center = get_setting('center');
    $m = $center['db'] ?? [];
    // En modo "días" re-sincronizar sumaría días otra vez: se envía 0 si ya estaba sincronizada.
    if (($center['mode'] ?? '') === 'db' && ($m['expiry_mode'] ?? '') === 'days' && (int)$l['center_synced']) $days = 0;
    [$ok, $msg] = center_grant([
        'email' => $l['email'], 'center_id' => $l['center_id'], 'product_name' => $l['product_name'],
        'lifetime' => (bool)$l['lifetime'], 'days' => $days, 'expires_at' => $l['expires_at'],
        'tier' => $l['tier'], 'order_id' => $l['order_id'], 'source' => $l['source'],
    ]);
    update('store_licenses', ['center_synced' => $ok ? 1 : 0, 'center_message' => mb_substr($msg, 0, 500), 'updated_at' => now_utc()], 'id = ?', [$id]);
    return row('SELECT * FROM store_licenses WHERE id = ?', [$id]);
}

function notify_order_emails(array $order): void
{
    $site = get_setting('site');
    $licenses = rows('SELECT * FROM store_licenses WHERE order_id = ?', [(int)$order['id']]);
    $list = '';
    foreach ($licenses as $l) {
        $list .= '<li><b>' . h($l['product_name']) . '</b> — ' . ((int)$l['lifetime'] ? 'Permanente' : 'Hasta ' . h(substr((string)$l['expires_at'], 0, 10))) . '</li>';
    }
    $download = h((string)($site['center_download_url'] ?? ''));
    $body = '<div style="font-family:Arial,sans-serif;background:#050206;color:#fff;padding:24px">'
        . '<h2 style="color:#ff1b4d;margin:0 0 12px">¡Tus plugins ya están activos!</h2>'
        . '<p>Pedido <b>' . h($order['public_id']) . '</b></p><ul>' . $list . '</ul>'
        . '<p>Abre <b>X-Flow Center</b> con este correo y los verás listos para instalar.</p>'
        . ($download ? '<p><a style="color:#ffb020" href="' . $download . '">Descargar X-Flow Center</a></p>' : '')
        . '</div>';
    $to = $order['recipient_email'] ?: $order['email'];
    send_mail($to, ($order['recipient_email'] ? '🎁 Te regalaron plugins X-FLOW' : 'Tu compra en X-FLOW') . ' · ' . $order['public_id'], $body);
    if ($order['recipient_email']) {
        send_mail($order['email'], 'Tu regalo fue entregado · ' . $order['public_id'], $body);
    }
}
