<?php
declare(strict_types=1);

/* =============================================================================
 *  PAYPAL CHECKOUT (Orders API v2)
 *  El navegador muestra los botones de PayPal; el servidor crea y captura la
 *  orden con el importe calculado aquí, y solo entonces entrega las licencias.
 * ===========================================================================*/

function paypal_base(): string
{
    $p = get_setting('payments')['paypal'];
    return ($p['mode'] ?? 'sandbox') === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}

function paypal_token(): string
{
    $p = get_setting('payments')['paypal'];
    if (empty($p['client_id']) || empty($p['secret'])) fail('paypal_config', 'PayPal no está configurado.', 503);
    [$status, $body, $json] = http_request('POST', paypal_base() . '/v1/oauth2/token', [
        'Authorization: Basic ' . base64_encode($p['client_id'] . ':' . $p['secret']),
        'Content-Type: application/x-www-form-urlencoded',
    ], 'grant_type=client_credentials');
    if ($status !== 200 || empty($json['access_token'])) fail('paypal_auth', 'No se pudo conectar con PayPal (revisa Client ID / Secret).', 502);
    return $json['access_token'];
}

function paypal_create_order(array $order): string
{
    $token = paypal_token();
    $items = json_dec($order['items'], []);
    $desc = mb_substr(implode(', ', array_map(fn($l) => $l['name'] . ' (' . $l['plan_label'] . ')', $items)), 0, 120);
    $payload = json_col([
        'intent' => 'CAPTURE',
        'purchase_units' => [[
            'reference_id' => $order['public_id'],
            'custom_id' => $order['public_id'],
            'invoice_id' => $order['public_id'],
            'description' => $desc,
            'amount' => ['currency_code' => $order['currency'], 'value' => cents_to_str((int)$order['total_cents'])],
        ]],
        'application_context' => ['brand_name' => 'X-FLOW', 'shipping_preference' => 'NO_SHIPPING', 'user_action' => 'PAY_NOW'],
    ]);
    [$status, $body, $json] = http_request('POST', paypal_base() . '/v2/checkout/orders', [
        'Authorization: Bearer ' . $token,
        'Content-Type: application/json',
        'PayPal-Request-Id: create-' . $order['public_id'],
    ], $payload);
    if ($status < 200 || $status >= 300 || empty($json['id'])) fail('paypal_create', 'PayPal rechazó la orden: ' . mb_substr($body, 0, 200), 502);
    update('store_orders', ['provider_ref' => $json['id'], 'updated_at' => now_utc()], 'id = ?', [(int)$order['id']]);
    return $json['id'];
}

/** Captura y verifica importe. Devuelve el pedido actualizado. */
function paypal_capture(array $order): array
{
    if (in_array($order['status'], ['paid', 'fulfilled'], true)) return $order;
    $ppId = $order['provider_ref'];
    if ($ppId === '') fail('paypal_missing', 'Pedido sin orden de PayPal.');
    $token = paypal_token();
    [$status, $body, $json] = http_request('POST', paypal_base() . '/v2/checkout/orders/' . rawurlencode($ppId) . '/capture', [
        'Authorization: Bearer ' . $token,
        'Content-Type: application/json',
        'PayPal-Request-Id: capture-' . $order['public_id'],
    ], '{}');
    if ($status === 422 && str_contains($body, 'ORDER_ALREADY_CAPTURED')) {
        [$status, $body, $json] = http_request('GET', paypal_base() . '/v2/checkout/orders/' . rawurlencode($ppId), ['Authorization: Bearer ' . $token]);
    }
    if (!is_array($json) || ($json['status'] ?? '') !== 'COMPLETED') {
        fail('paypal_not_completed', 'PayPal no confirmó el pago (' . ($json['status'] ?? $status) . ').', 402);
    }
    $capture = $json['purchase_units'][0]['payments']['captures'][0] ?? null;
    if (!$capture || ($capture['status'] ?? '') !== 'COMPLETED') fail('paypal_pending', 'El pago de PayPal está pendiente de revisión por PayPal.', 402);
    $paid = to_cents($capture['amount']['value'] ?? 0);
    $currency = $capture['amount']['currency_code'] ?? '';
    if ($paid < (int)$order['total_cents'] || $currency !== $order['currency']) {
        update('store_orders', ['status' => 'failed', 'admin_note' => 'Importe PayPal no coincide: ' . $paid . ' ' . $currency, 'updated_at' => now_utc()], 'id = ?', [(int)$order['id']]);
        fail('paypal_amount', 'El importe pagado no coincide con el pedido.', 402);
    }
    return fulfill_order((int)$order['id'], $ppId);
}

function paypal_webhook(): array
{
    $event = json_decode(raw_body(), true);
    if (!is_array($event)) fail('bad_request', 'Evento inválido');
    $p = get_setting('payments')['paypal'];
    if (empty($p['webhook_id'])) fail('paypal_webhook', 'Configura el Webhook ID de PayPal.', 503);
    $h = fn($k) => $_SERVER['HTTP_' . strtoupper(str_replace('-', '_', $k))] ?? '';
    $verify = json_col([
        'auth_algo' => $h('PAYPAL-AUTH-ALGO'),
        'cert_url' => $h('PAYPAL-CERT-URL'),
        'transmission_id' => $h('PAYPAL-TRANSMISSION-ID'),
        'transmission_sig' => $h('PAYPAL-TRANSMISSION-SIG'),
        'transmission_time' => $h('PAYPAL-TRANSMISSION-TIME'),
        'webhook_id' => $p['webhook_id'],
        'webhook_event' => $event,
    ]);
    [$status, , $json] = http_request('POST', paypal_base() . '/v1/notifications/verify-webhook-signature', [
        'Authorization: Bearer ' . paypal_token(), 'Content-Type: application/json',
    ], $verify);
    if ($status !== 200 || ($json['verification_status'] ?? '') !== 'SUCCESS') fail('paypal_signature', 'Firma inválida', 400);

    $type = $event['event_type'] ?? '';
    $res = $event['resource'] ?? [];
    $ppOrderId = $type === 'CHECKOUT.ORDER.APPROVED' ? ($res['id'] ?? '') : ($res['supplementary_data']['related_ids']['order_id'] ?? '');
    if ($ppOrderId === '') return ['ignored' => true];
    $order = row('SELECT * FROM store_orders WHERE provider_ref = ? AND method = ?', [$ppOrderId, 'paypal']);
    if (!$order) return ['ignored' => true];
    if (in_array($type, ['CHECKOUT.ORDER.APPROVED', 'PAYMENT.CAPTURE.COMPLETED'], true)) {
        try { paypal_capture($order); } catch (ApiError $e) { return ['error' => $e->getMessage()]; }
    }
    if (in_array($type, ['PAYMENT.CAPTURE.REFUNDED', 'PAYMENT.CAPTURE.REVERSED'], true)) {
        update('store_orders', ['status' => 'refunded', 'admin_note' => 'PayPal: ' . $type, 'updated_at' => now_utc()], 'id = ?', [(int)$order['id']]);
    }
    return ['ok' => true];
}

/* =============================================================================
 *  BINANCE PAY (Merchant API)
 * ===========================================================================*/

function binance_request(string $path, array $body): array
{
    $b = get_setting('payments')['binance'];
    if (empty($b['api_key']) || empty($b['secret_key'])) fail('binance_config', 'Binance Pay no está configurado.', 503);
    $json = json_col($body);
    $ts = (string)round(microtime(true) * 1000);
    $nonce = '';
    $chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    for ($i = 0; $i < 32; $i++) $nonce .= $chars[random_int(0, 51)];
    $sig = strtoupper(hash_hmac('sha512', $ts . "\n" . $nonce . "\n" . $json . "\n", $b['secret_key']));
    [$status, $raw, $resp] = http_request('POST', 'https://bpay.binanceapi.com' . $path, [
        'Content-Type: application/json',
        'BinancePay-Timestamp: ' . $ts,
        'BinancePay-Nonce: ' . $nonce,
        'BinancePay-Certificate-SN: ' . $b['api_key'],
        'BinancePay-Signature: ' . $sig,
    ], $json);
    if (!is_array($resp) || ($resp['status'] ?? '') !== 'SUCCESS') {
        fail('binance_error', 'Binance Pay: ' . ($resp['errorMessage'] ?? mb_substr($raw, 0, 200)), 502);
    }
    return $resp['data'] ?? [];
}

function binance_create_order(array $order): array
{
    $b = get_setting('payments')['binance'];
    $items = json_dec($order['items'], []);
    $return = public_url('index.html?order=' . $order['public_id'] . '&t=' . $order['access_token']);
    $data = binance_request('/binancepay/openapi/v3/order', [
        'env' => ['terminalType' => 'WEB'],
        'merchantTradeNo' => $order['public_id'],
        'orderAmount' => (float)cents_to_str((int)$order['total_cents']),
        'currency' => $b['currency'] ?: 'USDT',
        'description' => mb_substr('X-FLOW ' . $order['public_id'], 0, 256),
        'goodsDetails' => array_map(fn($l) => [
            'goodsType' => '02',
            'goodsCategory' => 'Z000',
            'referenceGoodsId' => (string)$l['product_id'],
            'goodsName' => mb_substr($l['name'] . ' ' . $l['plan_label'], 0, 256),
        ], $items),
        'returnUrl' => $return,
        'cancelUrl' => $return,
        'webhookUrl' => public_url('api/index.php?action=webhook_binance'),
    ]);
    update('store_orders', ['provider_ref' => (string)($data['prepayId'] ?? $order['public_id']), 'updated_at' => now_utc()], 'id = ?', [(int)$order['id']]);
    return ['checkout_url' => $data['checkoutUrl'] ?? '', 'qr' => $data['qrcodeLink'] ?? '', 'universal_url' => $data['universalUrl'] ?? ''];
}

/** Consulta el estado real en Binance y entrega si está pagado. */
function binance_sync(array $order): array
{
    if (in_array($order['status'], ['paid', 'fulfilled'], true)) return $order;
    $data = binance_request('/binancepay/openapi/v2/order/query', ['merchantTradeNo' => $order['public_id']]);
    $st = $data['status'] ?? '';
    if ($st === 'PAID') {
        $paid = to_cents($data['orderAmount'] ?? 0);
        if ($paid < (int)$order['total_cents']) {
            update('store_orders', ['status' => 'failed', 'admin_note' => 'Binance: importe menor al pedido', 'updated_at' => now_utc()], 'id = ?', [(int)$order['id']]);
            return row('SELECT * FROM store_orders WHERE id = ?', [(int)$order['id']]);
        }
        return fulfill_order((int)$order['id'], (string)($data['prepayId'] ?? $order['provider_ref']));
    }
    if (in_array($st, ['CANCELED', 'EXPIRED', 'ERROR'], true)) {
        update('store_orders', ['status' => 'cancelled', 'updated_at' => now_utc()], 'id = ? AND status = ?', [(int)$order['id'], 'pending']);
    }
    return row('SELECT * FROM store_orders WHERE id = ?', [(int)$order['id']]);
}

/** El webhook solo sirve de aviso: el estado se confirma consultando a Binance con nuestra firma. */
function binance_webhook(): array
{
    $evt = json_decode(raw_body(), true);
    $data = is_array($evt) ? json_decode((string)($evt['data'] ?? ''), true) : null;
    $tradeNo = is_array($data) ? (string)($data['merchantTradeNo'] ?? '') : '';
    if ($tradeNo !== '') {
        $order = order_by_public($tradeNo);
        if ($order && $order['method'] === 'binance') {
            try { binance_sync($order); } catch (Throwable $e) { /* se reintenta al consultar el estado */ }
        }
    }
    return ['returnCode' => 'SUCCESS', 'returnMessage' => null];
}

/* =============================================================================
 *  STRIPE CHECKOUT (tarjetas)
 * ===========================================================================*/

function stripe_request(string $method, string $path, array $form = []): array
{
    $s = get_setting('payments')['stripe'];
    if (empty($s['secret_key'])) fail('stripe_config', 'Stripe no está configurado.', 503);
    [$status, $raw, $json] = http_request($method, 'https://api.stripe.com' . $path, [
        'Authorization: Bearer ' . $s['secret_key'],
        'Content-Type: application/x-www-form-urlencoded',
    ], $form ? http_build_query($form) : null);
    if ($status < 200 || $status >= 300 || !is_array($json)) fail('stripe_error', 'Stripe: ' . ($json['error']['message'] ?? mb_substr($raw, 0, 200)), 502);
    return $json;
}

function stripe_create_session(array $order): string
{
    $items = json_dec($order['items'], []);
    $return = public_url('index.html?order=' . $order['public_id'] . '&t=' . $order['access_token']);
    $session = stripe_request('POST', '/v1/checkout/sessions', [
        'mode' => 'payment',
        'success_url' => $return,
        'cancel_url' => $return,
        'customer_email' => $order['email'],
        'client_reference_id' => $order['public_id'],
        'metadata' => ['order' => $order['public_id']],
        'line_items' => [[
            'quantity' => 1,
            'price_data' => [
                'currency' => strtolower($order['currency']),
                'unit_amount' => (int)$order['total_cents'],
                'product_data' => [
                    'name' => 'X-FLOW · Pedido ' . $order['public_id'],
                    'description' => mb_substr(implode(', ', array_map(fn($l) => $l['name'] . ' (' . $l['plan_label'] . ')', $items)), 0, 480),
                ],
            ],
        ]],
    ]);
    update('store_orders', ['provider_ref' => $session['id'], 'updated_at' => now_utc()], 'id = ?', [(int)$order['id']]);
    return (string)$session['url'];
}

function stripe_sync(array $order): array
{
    if (in_array($order['status'], ['paid', 'fulfilled'], true) || $order['provider_ref'] === '') return $order;
    $s = stripe_request('GET', '/v1/checkout/sessions/' . rawurlencode($order['provider_ref']));
    if (($s['payment_status'] ?? '') === 'paid'
        && (int)($s['amount_total'] ?? 0) >= (int)$order['total_cents']
        && strtoupper((string)($s['currency'] ?? '')) === strtoupper($order['currency'])
        && ($s['client_reference_id'] ?? '') === $order['public_id']) {
        return fulfill_order((int)$order['id'], (string)$s['id']);
    }
    if (($s['status'] ?? '') === 'expired') {
        update('store_orders', ['status' => 'cancelled', 'updated_at' => now_utc()], 'id = ? AND status = ?', [(int)$order['id'], 'pending']);
    }
    return row('SELECT * FROM store_orders WHERE id = ?', [(int)$order['id']]);
}

function stripe_webhook(): array
{
    $secret = (string)(get_setting('payments')['stripe']['webhook_secret'] ?? '');
    $payload = raw_body();
    $header = (string)($_SERVER['HTTP_STRIPE_SIGNATURE'] ?? '');
    if ($secret === '') fail('stripe_webhook', 'Falta el webhook secret de Stripe.', 503);
    $t = null;
    $sigs = [];
    foreach (explode(',', $header) as $part) {
        [$k, $v] = array_pad(explode('=', trim($part), 2), 2, '');
        if ($k === 't') $t = (int)$v;
        if ($k === 'v1') $sigs[] = $v;
    }
    if (!$t || abs(time() - $t) > 300) fail('stripe_signature', 'Firma vencida', 400);
    $expected = hash_hmac('sha256', $t . '.' . $payload, $secret);
    $valid = false;
    foreach ($sigs as $s) if (hash_equals($expected, $s)) $valid = true;
    if (!$valid) fail('stripe_signature', 'Firma inválida', 400);

    $event = json_decode($payload, true);
    if (($event['type'] ?? '') === 'checkout.session.completed' || ($event['type'] ?? '') === 'checkout.session.async_payment_succeeded') {
        $ref = (string)($event['data']['object']['client_reference_id'] ?? '');
        $order = $ref !== '' ? order_by_public($ref) : null;
        if ($order && $order['method'] === 'stripe') stripe_sync($order);
    }
    return ['received' => true];
}

/** Revisa el estado real con el proveedor (lo usa la página del pedido). */
function sync_order_with_provider(array $order): array
{
    if ($order['status'] !== 'pending') return $order;
    try {
        if ($order['method'] === 'binance') return binance_sync($order);
        if ($order['method'] === 'stripe') return stripe_sync($order);
    } catch (ApiError $e) {
        // si el proveedor no responde, se mantiene pendiente
    }
    return $order;
}
