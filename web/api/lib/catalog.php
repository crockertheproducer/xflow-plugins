<?php
declare(strict_types=1);

const XF_PRODUCT_TYPES = ['plugin', 'bundle', 'sample_pack'];
const XF_PRODUCT_STATUS = ['published', 'draft', 'coming_soon', 'hidden'];

function product_from_row(array $r): array
{
    return [
        'id' => (int)$r['id'],
        'type' => $r['type'],
        'slug' => $r['slug'],
        'name' => $r['name'],
        'tagline' => $r['tagline'],
        'description' => (string)($r['description'] ?? ''),
        'features' => json_dec($r['features'] ?? null, []),
        'specs' => json_dec($r['specs'] ?? null, (object)[]),
        'image' => $r['image'],
        'gallery' => json_dec($r['gallery'] ?? null, []),
        'video_url' => $r['video_url'],
        'category' => $r['category'],
        'center_id' => $r['center_id'],
        'plans' => normalize_plans(json_dec($r['plans'] ?? null, [])),
        'discount_percent' => (int)$r['discount_percent'],
        'discount_ends_at' => iso($r['discount_ends_at'] ?? null),
        'badge' => $r['badge'],
        'bundle_items' => array_map('intval', json_dec($r['bundle_items'] ?? null, [])),
        'bundle_all' => (bool)$r['bundle_all'],
        'featured' => (bool)$r['featured'],
        'is_new' => (bool)$r['is_new'],
        'status' => $r['status'],
        'sort_order' => (int)$r['sort_order'],
        'created_at' => iso($r['created_at'] ?? null),
        'updated_at' => iso($r['updated_at'] ?? null),
    ];
}

function normalize_plans($plans): array
{
    $out = [];
    if (!is_array($plans)) return $out;
    foreach ($plans as $p) {
        if (!is_array($p)) continue;
        $type = ($p['type'] ?? 'lifetime') === 'days' ? 'days' : 'lifetime';
        $days = $type === 'days' ? max(1, (int)($p['days'] ?? 30)) : 0;
        $price = round(max(0, (float)($p['price'] ?? 0)), 2);
        $compare = isset($p['compare_at']) && $p['compare_at'] !== '' && $p['compare_at'] !== null ? round((float)$p['compare_at'], 2) : null;
        $id = preg_replace('/[^a-z0-9_-]/', '', strtolower((string)($p['id'] ?? ''))) ?: ($type === 'lifetime' ? 'lifetime' : 'd' . $days);
        $out[] = [
            'id' => substr($id, 0, 40),
            'label' => mb_substr(trim((string)($p['label'] ?? ($type === 'lifetime' ? 'Permanente' : $days . ' días'))), 0, 60),
            'type' => $type,
            'days' => $days,
            'price' => $price,
            'compare_at' => $compare && $compare > $price ? $compare : null,
            'tier' => mb_substr(trim((string)($p['tier'] ?? '')), 0, 64),
        ];
    }
    return $out;
}

function all_products(bool $publicOnly = true): array
{
    $sql = 'SELECT * FROM store_products';
    if ($publicOnly) $sql .= " WHERE status IN ('published','coming_soon')";
    $sql .= ' ORDER BY sort_order ASC, id ASC';
    return array_map('product_from_row', rows($sql));
}

function product_by_id(int $id): ?array
{
    $r = row('SELECT * FROM store_products WHERE id = ?', [$id]);
    return $r ? product_from_row($r) : null;
}

/** % de descuento vigente para un producto (el mayor entre su oferta propia y la oferta global). */
function effective_discount(array $product, ?array $sale = null): int
{
    $pct = 0;
    if ($product['discount_percent'] > 0) {
        $ends = $product['discount_ends_at'] ? strtotime($product['discount_ends_at']) : null;
        if ($ends === null || $ends > time()) $pct = $product['discount_percent'];
    }
    $sale = $sale ?? get_setting('sale');
    if (sale_is_live($sale)) {
        $applies = $sale['applies_to'] ?? 'all';
        $hit = $applies === 'all'
            || ($applies === 'plugins' && $product['type'] === 'plugin')
            || ($applies === 'bundles' && $product['type'] === 'bundle')
            || ($applies === 'selected' && in_array($product['id'], array_map('intval', (array)($sale['product_ids'] ?? [])), true));
        if ($hit) $pct = max($pct, (int)$sale['percent']);
    }
    return max(0, min(100, $pct));
}

/** Precio final (centavos) de un plan de un producto + precio de referencia tachado. */
function plan_price(array $product, array $plan, ?array $sale = null): array
{
    $base = to_cents($plan['price']);
    $pct = effective_discount($product, $sale);
    $final = $pct > 0 ? (int)round($base * (100 - $pct) / 100) : $base;
    $compare = $plan['compare_at'] ? to_cents($plan['compare_at']) : ($pct > 0 ? $base : null);
    return ['cents' => $final, 'compare_cents' => ($compare !== null && $compare > $final) ? $compare : null, 'discount_percent' => $pct];
}

function find_plan(array $product, string $planId): ?array
{
    foreach ($product['plans'] as $p) if ($p['id'] === $planId) return $p;
    return null;
}

/** Plugins que incluye un producto (un plugin se incluye a sí mismo). */
function expand_product(array $product): array
{
    if ($product['type'] !== 'bundle') return [$product];
    if ($product['bundle_all']) {
        return array_values(array_filter(all_products(false), fn($p) => $p['type'] === 'plugin' && in_array($p['status'], ['published', 'hidden'], true)));
    }
    $out = [];
    foreach ($product['bundle_items'] as $id) {
        $p = product_by_id((int)$id);
        if ($p && $p['type'] === 'plugin') $out[] = $p;
    }
    return $out;
}

/**
 * Calcula el carrito con precios del servidor (nunca se confía en el precio del navegador).
 * $items = [ ['product_id'=>1,'plan_id'=>'lifetime'], ... ]
 */
function quote_cart(array $items, string $couponCode = ''): array
{
    if (!$items) fail('empty_cart', 'Tu carrito está vacío.');
    if (count($items) > 50) fail('cart_too_big', 'Demasiados productos en el carrito.');
    $sale = get_setting('sale');
    $lines = [];
    $seen = [];
    $subtotal = 0;
    foreach ($items as $it) {
        if (!is_array($it)) continue;
        $pid = (int)($it['product_id'] ?? 0);
        $planId = (string)($it['plan_id'] ?? '');
        $key = $pid . ':' . $planId;
        if (isset($seen[$key])) continue;
        $seen[$key] = true;
        $p = product_by_id($pid);
        if (!$p || $p['status'] !== 'published') fail('product_unavailable', 'Un producto del carrito ya no está disponible.');
        $plan = find_plan($p, $planId);
        if (!$plan) fail('plan_unavailable', 'El plan elegido para ' . $p['name'] . ' ya no existe.');
        $price = plan_price($p, $plan, $sale);
        $subtotal += $price['cents'];
        $lines[] = [
            'product_id' => $p['id'],
            'type' => $p['type'],
            'name' => $p['name'],
            'image' => $p['image'],
            'plan_id' => $plan['id'],
            'plan_label' => $plan['label'],
            'plan_type' => $plan['type'],
            'days' => $plan['days'],
            'tier' => $plan['tier'],
            'unit_cents' => $price['cents'],
            'compare_cents' => $price['compare_cents'],
            'discount_percent' => $price['discount_percent'],
        ];
    }
    if (!$lines) fail('empty_cart', 'Tu carrito está vacío.');

    $discount = 0;
    $coupon = null;
    $couponError = null;
    if ($couponCode !== '') {
        try {
            [$coupon, $discount] = apply_coupon($couponCode, $lines, $subtotal);
        } catch (ApiError $e) {
            $couponError = $e->getMessage();
        }
    }
    $total = max(0, $subtotal - $discount);
    return [
        'lines' => $lines,
        'subtotal_cents' => $subtotal,
        'discount_cents' => $discount,
        'total_cents' => $total,
        'currency' => get_setting('site')['currency'] ?? 'USD',
        'coupon' => $coupon ? ['code' => $coupon['code'], 'kind' => $coupon['kind'], 'value' => (float)$coupon['value']] : null,
        'coupon_error' => $couponError,
    ];
}

function apply_coupon(string $code, array $lines, int $subtotal): array
{
    $code = strtoupper(trim($code));
    $c = row('SELECT * FROM store_coupons WHERE code = ?', [$code]);
    if (!$c || !(int)$c['active']) fail('coupon_invalid', 'El cupón no existe o está desactivado.');
    $now = now_utc();
    if ($c['starts_at'] && $c['starts_at'] > $now) fail('coupon_not_started', 'Este cupón aún no está activo.');
    if ($c['expires_at'] && $c['expires_at'] < $now) fail('coupon_expired', 'Este cupón ya expiró.');
    if ($c['max_uses'] !== null && (int)$c['used'] >= (int)$c['max_uses']) fail('coupon_used_up', 'Este cupón ya alcanzó su límite de usos.');
    if ($subtotal < to_cents($c['min_total'])) fail('coupon_min', 'Este cupón requiere una compra mínima de ' . cents_to_str(to_cents($c['min_total'])) . '.');

    $only = array_map('intval', json_dec($c['product_ids'] ?? null, []));
    $eligible = 0;
    foreach ($lines as $l) {
        if (!$only || in_array($l['product_id'], $only, true)) $eligible += $l['unit_cents'];
    }
    if ($eligible <= 0) fail('coupon_not_applicable', 'El cupón no aplica a los productos del carrito.');
    $discount = $c['kind'] === 'fixed'
        ? min($eligible, to_cents($c['value']))
        : (int)round($eligible * min(100, (float)$c['value']) / 100);
    return [$c, $discount];
}

/** Producto listo para la tienda: precios calculados por plan. */
function product_public(array $p, ?array $sale = null, ?array $all = null): array
{
    $sale = $sale ?? get_setting('sale');
    $out = $p;
    $out['plans'] = array_map(function ($plan) use ($p, $sale) {
        $pr = plan_price($p, $plan, $sale);
        return $plan + ['final_price' => $pr['cents'] / 100, 'final_compare' => $pr['compare_cents'] !== null ? $pr['compare_cents'] / 100 : null];
    }, $p['plans']);
    $out['discount_active'] = effective_discount($p, $sale);
    unset($out['center_id']);
    if ($p['type'] === 'bundle') {
        $items = $p['bundle_all']
            ? array_values(array_filter($all ?? all_products(), fn($x) => $x['type'] === 'plugin' && $x['status'] === 'published'))
            : array_values(array_filter(array_map(fn($id) => product_by_id((int)$id), $p['bundle_items'])));
        $out['includes'] = array_map(fn($x) => ['id' => $x['id'], 'name' => $x['name'], 'slug' => $x['slug'], 'image' => $x['image'], 'value' => ($x['plans'][0]['price'] ?? 0)], $items);
    }
    return $out;
}
