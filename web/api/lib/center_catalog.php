<?php
declare(strict_types=1);

/**
 * Catálogo sincronizado con X-Flow Center.
 *
 * Tus plugins ya están subidos en la base de datos del Center (la misma que usa
 * soporte_api.php?accion=obtener_plugins). Aquí se leen (solo lectura) y se crean
 * o actualizan en la tienda, igual que hacía tu web anterior:
 *   - nombre, precio permanente (precio_perm), suscripción (precio_sub),
 *     descripción, imagen y versión vienen del Center;
 *   - descuentos, etiquetas, destacados, galería y packs se manejan en la tienda.
 * Un producto con "Sincronizar con X-Flow Center" apagado no se toca.
 */

const XF_CATALOG_SYNC_EVERY = 600; // segundos entre sincronizaciones automáticas

/** Base para convertir rutas relativas del Center (imagenes/x.png) en URLs completas. */
function center_public_base(): string
{
    $api = (string)cfg('legacy_api_url', '');
    if (preg_match('#^(https?://[^/]+)#i', $api, $m)) return $m[1] . '/';
    return '';
}

function center_abs_url(string $url): string
{
    $url = trim($url);
    if ($url === '' || preg_match('#^(https?:)?//#i', $url) || str_starts_with($url, 'data:')) return $url;
    $base = center_public_base();
    return $base !== '' ? $base . ltrim($url, '/') : $url;
}

function norm_name(string $s): string
{
    return preg_replace('/[^A-Z0-9]/', '', mb_strtoupper($s)) ?? '';
}

/** Lee los plugins del Center. Devuelve [lista, origen] o lanza ApiError. */
function center_catalog_fetch(): array
{
    $cat = get_setting('center')['catalog'] ?? [];
    $source = $cat['source'] ?? 'auto';
    if ($source === 'off') return [[], 'off'];

    $errors = [];
    if ($source === 'db' || $source === 'auto') {
        try {
            $list = center_catalog_from_db($cat);
            if ($list !== null) return [$list, 'db'];
            if ($source === 'db') throw new ApiError('catalog_db', 'No existe la tabla "' . ($cat['table'] ?? '') . '" en la base de datos del Center.', 400);
        } catch (ApiError $e) {
            if ($source === 'db') throw $e;
            $errors[] = $e->getMessage();
        } catch (Throwable $e) {
            if ($source === 'db') throw new ApiError('catalog_db', 'Error leyendo la tabla de plugins: ' . $e->getMessage(), 500);
            $errors[] = $e->getMessage();
        }
    }
    $list = center_catalog_from_api();
    if ($list === null) {
        throw new ApiError('catalog_unreachable', 'No se pudo leer el catálogo de X-Flow Center' . ($errors ? ' (' . implode(' · ', $errors) . ')' : '') . '.', 502);
    }
    return [$list, 'api'];
}

/** null si la tabla no existe. */
function center_catalog_from_db(array $m): ?array
{
    $pdo = center_pdo();
    $table = (string)($m['table'] ?? '');
    if ($table === '') return null;
    $t = center_quote_ident($pdo, $table);
    try {
        $st = $pdo->query("SELECT * FROM $t LIMIT 500");
    } catch (Throwable $e) {
        return null;
    }
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    $col = fn(string $k) => (string)($m[$k] ?? '');
    $out = [];
    foreach ($rows as $r) {
        $id = $col('col_id') !== '' ? ($r[$col('col_id')] ?? null) : null;
        $name = $col('col_name') !== '' ? ($r[$col('col_name')] ?? '') : '';
        if ($id === null || $id === '' || trim((string)$name) === '') continue;
        if ($col('col_active') !== '' && isset($r[$col('col_active')])) {
            $v = strtolower(trim((string)$r[$col('col_active')]));
            if (in_array($v, ['0', 'no', 'false', 'inactivo', 'oculto', 'hidden', 'draft', 'borrador'], true)) continue;
        }
        $out[] = center_plugin_normalize([
            'id' => $id,
            'nombre' => $name,
            'precio_perm' => $col('col_price') !== '' ? ($r[$col('col_price')] ?? null) : null,
            'precio_sub' => $col('col_price_sub') !== '' ? ($r[$col('col_price_sub')] ?? null) : null,
            'descripcion' => $col('col_desc') !== '' ? ($r[$col('col_desc')] ?? '') : '',
            'imagen_url' => $col('col_image') !== '' ? ($r[$col('col_image')] ?? '') : '',
            'version' => $col('col_version') !== '' ? ($r[$col('col_version')] ?? '') : '',
        ]);
    }
    return $out;
}

/** soporte_api.php?accion=obtener_plugins (lo mismo que leía tu web anterior). */
function center_catalog_from_api(): ?array
{
    $url = (string)cfg('legacy_api_url', '');
    if ($url === '') return null;
    [$status, $body, $json] = http_request('GET', $url . (str_contains($url, '?') ? '&' : '?') . 'accion=obtener_plugins', xf_http_headers(), null, 20);
    if ($status !== 200 || !is_array($json)) return null;
    if (isset($json['data']) && is_array($json['data'])) $json = $json['data'];
    if (isset($json['plugins']) && is_array($json['plugins'])) $json = $json['plugins'];
    $out = [];
    foreach ($json as $p) {
        if (!is_array($p) || !isset($p['id']) || $p['id'] === '') continue;
        $out[] = center_plugin_normalize($p);
    }
    return $out;
}

function center_plugin_normalize(array $p): array
{
    $num = function ($v): ?float {
        if ($v === null || $v === '') return null;
        $f = (float)str_replace(',', '.', (string)$v);
        return $f > 0 ? round($f, 2) : null;
    };
    return [
        'id' => (string)$p['id'],
        'name' => trim((string)($p['nombre'] ?? $p['name'] ?? $p['id'])),
        'price' => $num($p['precio_perm'] ?? $p['precio'] ?? $p['price'] ?? null),
        'price_sub' => $num($p['precio_sub'] ?? null),
        'description' => trim((string)($p['descripcion'] ?? $p['desc'] ?? $p['description'] ?? '')),
        'image' => center_abs_url((string)($p['imagen_url'] ?? $p['imagen'] ?? $p['image'] ?? '')),
        'version' => trim((string)($p['version'] ?? '')),
    ];
}

/** Planes de X-Flow Remote (Bronze / Plata / Gold). */
function center_remote_plans(): array
{
    $fallback = [
        ['plan' => 'bronze', 'modalidad' => 'sub', 'precio' => 9.99], ['plan' => 'plata', 'modalidad' => 'sub', 'precio' => 19.99], ['plan' => 'gold', 'modalidad' => 'sub', 'precio' => 29.99],
        ['plan' => 'bronze', 'modalidad' => 'lifetime', 'precio' => 79], ['plan' => 'plata', 'modalidad' => 'lifetime', 'precio' => 149], ['plan' => 'gold', 'modalidad' => 'lifetime', 'precio' => 249],
    ];
    $url = (string)(get_setting('center')['catalog']['remote_plans_url'] ?? '');
    $rows = $fallback;
    if ($url !== '') {
        [$status, , $json] = http_request('GET', $url, xf_http_headers(), null, 12);
        if ($status === 200 && is_array($json) && $json && isset($json[0]['plan'])) $rows = $json;
    }
    $order = ['bronze' => 1, 'plata' => 2, 'gold' => 3];
    usort($rows, fn($a, $b) => [($a['modalidad'] ?? '') === 'lifetime' ? 1 : 0, $order[$a['plan'] ?? ''] ?? 9] <=> [($b['modalidad'] ?? '') === 'lifetime' ? 1 : 0, $order[$b['plan'] ?? ''] ?? 9]);
    $plans = [];
    foreach ($rows as $r) {
        $tier = strtolower((string)($r['plan'] ?? ''));
        if ($tier === '' || (float)($r['precio'] ?? 0) <= 0) continue;
        $life = ($r['modalidad'] ?? '') === 'lifetime';
        $plans[] = [
            'id' => $tier . ($life ? '-permanente' : '-mensual'),
            'label' => ucfirst($tier) . ($life ? ' · Permanente' : ' · Mensual'),
            'type' => $life ? 'lifetime' : 'days',
            'days' => $life ? 0 : 30,
            'price' => round((float)$r['precio'], 2),
            'compare_at' => null,
            'tier' => $tier,
        ];
    }
    return normalize_plans($plans);
}

/**
 * Crea / actualiza los productos de la tienda a partir del catálogo del Center.
 * Devuelve el resumen de la sincronización.
 */
function center_sync_catalog(bool $force = false): array
{
    $state = row("SELECT v FROM store_settings WHERE k = 'catalog_sync'");
    $prev = $state ? json_dec($state['v'], []) : [];
    if (!$force && !empty($prev['at']) && (time() - (int)$prev['at']) < XF_CATALOG_SYNC_EVERY) return $prev;

    $cat = get_setting('center')['catalog'] ?? [];
    $result = ['at' => time(), 'source' => '', 'found' => 0, 'created' => 0, 'updated' => 0, 'error' => ''];
    try {
        [$list, $source] = center_catalog_fetch();
        $result['source'] = $source;
        $result['found'] = count($list);
        if ($source !== 'off') {
            [$created, $updated] = center_apply_catalog($list, $cat);
            $result['created'] = $created;
            $result['updated'] = $updated;
        }
    } catch (Throwable $e) {
        $result['error'] = mb_substr($e->getMessage(), 0, 300);
    }
    q("DELETE FROM store_settings WHERE k = 'catalog_sync'");
    q("INSERT INTO store_settings (k, v, updated_at) VALUES ('catalog_sync', ?, ?)", [json_col($result), now_utc()]);

    // La primera vez que el catálogo se lee bien, se importan los ajustes de tu web anterior.
    if ($result['error'] === '' && $result['found'] > 0 && !row("SELECT k FROM store_settings WHERE k = 'legacy_import'")) {
        try { $result['legacy'] = center_import_legacy_config(); } catch (Throwable $e) { $result['legacy'] = ['error' => $e->getMessage()]; }
    }
    return $result;
}

function center_apply_catalog(array $list, array $cat): array
{
    $products = all_products(false);
    $byCenter = [];
    $byName = [];
    foreach ($products as $p) {
        if ($p['type'] !== 'plugin') continue;
        if ($p['center_id'] !== '') $byCenter[mb_strtolower($p['center_id'])] = $p;
        $byName[norm_name($p['name'])] = $p;
    }
    $subDays = max(1, (int)($cat['sub_days'] ?? 30));
    $created = 0;
    $updated = 0;
    $now = now_utc();

    foreach ($list as $cp) {
        $existing = $byCenter[mb_strtolower($cp['id'])] ?? $byName[norm_name($cp['name'])] ?? null;
        $isRemote = (bool)preg_match('/remote/i', $cp['name'] . ' ' . $cp['id']);
        $plans = $isRemote ? center_remote_plans() : center_plans_from($cp, $existing ? $existing['plans'] : [], $subDays);

        if ($existing) {
            if (!$existing['sync_center']) continue;
            $specs = is_array($existing['specs']) ? $existing['specs'] : [];
            if ($cp['version'] !== '') $specs['version'] = $cp['version'];
            $data = [
                'center_id' => $cp['id'],
                'name' => $cp['name'] !== '' ? mb_substr($cp['name'], 0, 160) : $existing['name'],
                'specs' => json_col($specs),
            ];
            if ($plans) $data['plans'] = json_col($plans);
            if ($cp['image'] !== '' && $existing['image'] === '') $data['image'] = $cp['image'];
            if (mb_strlen($cp['description']) >= 15 && trim($existing['description']) === '') $data['description'] = $cp['description'];
            $changed = false;
            foreach ($data as $k => $v) {
                $cur = in_array($k, ['specs', 'plans'], true) ? json_col($existing[$k]) : (string)$existing[$k];
                if ($cur !== (string)$v) { $changed = true; break; }
            }
            if ($changed) {
                $data['updated_at'] = $now;
                update('store_products', $data, 'id = ?', [$existing['id']]);
                $updated++;
            }
            continue;
        }

        if (!$plans) continue; // sin precio no se puede vender
        $slug = slugify($cp['name']);
        if (row('SELECT id FROM store_products WHERE slug = ?', [$slug])) $slug .= '-' . substr(random_token(2), 0, 4);
        insert('store_products', [
            'type' => 'plugin', 'slug' => $slug, 'name' => mb_substr($cp['name'], 0, 160),
            'tagline' => mb_substr(center_tagline($cp['description']), 0, 255),
            'description' => $cp['description'], 'features' => '[]',
            'specs' => json_col(['formats' => 'VST3', 'os' => 'Windows 10 / 11 (64-bit)', 'version' => $cp['version'] ?: '1.0', 'size' => '']),
            'image' => $cp['image'], 'gallery' => '[]', 'video_url' => '', 'category' => $isRemote ? 'Colaboración' : '',
            'center_id' => $cp['id'], 'plans' => json_col($plans), 'discount_percent' => 0, 'badge' => '',
            'bundle_items' => '[]', 'bundle_all' => 0, 'featured' => 0, 'is_new' => 0,
            'status' => !empty($cat['auto_publish']) ? 'published' : 'draft', 'sort_order' => 20,
            'sync_center' => 1, 'created_at' => $now, 'updated_at' => $now,
        ]);
        $created++;
    }
    return [$created, $updated];
}

/** Precio permanente y suscripción del Center; conserva los planes extra que hayas creado en la tienda. */
function center_plans_from(array $cp, array $current, int $subDays): array
{
    // "Permanente" y "Mensual" vienen del Center (precio_perm / precio_sub). Otros planes creados en la tienda (anual, etc.) se conservan.
    $plans = array_values(array_filter($current, fn($p) => !in_array($p['id'], ['lifetime', 'monthly'], true)));
    $keep = fn(string $id, string $field, $default) => array_values(array_filter($current, fn($p) => $p['id'] === $id))[0][$field] ?? $default;
    if ($cp['price']) {
        array_unshift($plans, ['id' => 'lifetime', 'label' => $keep('lifetime', 'label', 'Permanente'), 'type' => 'lifetime', 'days' => 0, 'price' => $cp['price'], 'compare_at' => $keep('lifetime', 'compare_at', null), 'tier' => '']);
    }
    // Igual que tu web anterior: sin precio_sub, la suscripción de 30 días cuesta el 25 % del permanente.
    $sub = $cp['price_sub'] ?: ($cp['price'] ? round($cp['price'] * 0.25, 2) : null);
    if ($sub) {
        $plans[] = ['id' => 'monthly', 'label' => $keep('monthly', 'label', 'Mensual'), 'type' => 'days', 'days' => $subDays, 'price' => $sub, 'compare_at' => $keep('monthly', 'compare_at', null), 'tier' => ''];
    }
    usort($plans, fn($a, $b) => ($a['type'] === 'lifetime' ? 0 : 1) <=> ($b['type'] === 'lifetime' ? 0 : 1) ?: ($a['days'] <=> $b['days']));
    return normalize_plans($plans);
}

function center_tagline(string $desc): string
{
    $desc = trim(preg_replace('/\s+/', ' ', $desc) ?? '');
    if ($desc === '') return '';
    $cut = preg_split('/(?<=[.!?])\s/', $desc)[0] ?? $desc;
    return mb_strlen($cut) > 140 ? mb_substr($cut, 0, 137) . '…' : $cut;
}

/**
 * Importa lo que guardabas en tu web anterior (soporte_api.php?accion=leer_configuracion):
 * descuentos, etiquetas de oferta, "nuevo", descripciones y packs.
 */
function center_import_legacy_config(): array
{
    $url = (string)cfg('legacy_api_url', '');
    if ($url === '') throw new ApiError('legacy', 'Falta legacy_api_url en config.php.', 400);
    [$status, $body] = http_request('GET', $url . (str_contains($url, '?') ? '&' : '?') . 'accion=leer_configuracion', xf_http_headers(), null, 20);
    if ($status !== 200) throw new ApiError('legacy', 'No se pudo leer la configuración de tu web anterior (HTTP ' . $status . ').', 502);
    $cloud = json_decode((string)$body, true);
    $conf = null;
    if (is_array($cloud)) {
        if (isset($cloud['plugins']) || isset($cloud['packs']) || isset($cloud['heroTitle'])) $conf = $cloud;
        elseif (!empty($cloud['data']) && is_array($cloud['data'])) $conf = $cloud['data'];
        elseif (isset($cloud['config_data'])) $conf = is_string($cloud['config_data']) ? json_decode($cloud['config_data'], true) : $cloud['config_data'];
        else $conf = $cloud;
    }
    if (!is_array($conf)) throw new ApiError('legacy', 'La configuración de tu web anterior no tiene un formato reconocible.', 502);

    $products = all_products(false);
    $findPlugin = function (string $id, string $name = '') use ($products) {
        foreach ($products as $p) if ($p['type'] === 'plugin' && mb_strtolower($p['center_id']) === mb_strtolower($id)) return $p;
        if ($name !== '') foreach ($products as $p) if ($p['type'] === 'plugin' && norm_name($p['name']) === norm_name($name)) return $p;
        return null;
    };

    $updated = 0;
    foreach ((array)($conf['plugins'] ?? []) as $lp) {
        if (!is_array($lp) || empty($lp['id'])) continue;
        $p = $findPlugin((string)$lp['id'], (string)($lp['name'] ?? ''));
        if (!$p) continue;
        $data = [];
        $disc = (int)round((float)($lp['discount'] ?? 0));
        if ($disc > 0 && $p['discount_percent'] === 0) $data['discount_percent'] = min(90, $disc);
        if (!empty($lp['isNew']) && !$p['is_new']) $data['is_new'] = 1;
        $tag = mb_strtoupper(trim((string)($lp['etiqueta_oferta'] ?? '')));
        if ($tag !== '' && $p['badge'] === '') $data['badge'] = mb_substr($tag, 0, 40);
        $desc = trim((string)($lp['desc'] ?? ''));
        if (mb_strlen($desc) >= 15 && mb_strlen($desc) > mb_strlen(trim($p['description']))) $data['description'] = $desc;
        if ($data) {
            $data['updated_at'] = now_utc();
            update('store_products', $data, 'id = ?', [$p['id']]);
            $updated++;
        }
    }

    $packs = 0;
    foreach ((array)($conf['packs'] ?? []) as $pk) {
        if (!is_array($pk) || trim((string)($pk['name'] ?? '')) === '') continue;
        $items = [];
        foreach ((array)($pk['includes'] ?? []) as $id) {
            $p = $findPlugin((string)$id, (string)$id);
            if ($p) $items[] = $p['id'];
        }
        if (!$items) continue;
        $slug = slugify((string)$pk['name']);
        if (row('SELECT id FROM store_products WHERE slug = ?', [$slug])) continue; // ya importado
        $price = round((float)($pk['price'] ?? 0), 2);
        if ($price <= 0) continue;
        insert('store_products', [
            'type' => 'bundle', 'slug' => $slug, 'name' => mb_substr(mb_strtoupper(trim((string)$pk['name'])), 0, 160),
            'tagline' => mb_substr(center_tagline((string)($pk['desc'] ?? '')), 0, 255), 'description' => (string)($pk['desc'] ?? ''),
            'features' => '[]', 'specs' => '{}', 'image' => center_abs_url((string)($pk['imagen_url'] ?? '')), 'gallery' => '[]', 'video_url' => '',
            'category' => 'Pack', 'center_id' => '',
            'plans' => json_col(normalize_plans([['id' => 'lifetime', 'label' => 'Permanente', 'type' => 'lifetime', 'price' => $price]])),
            'discount_percent' => max(0, min(90, (int)round((float)($pk['discount'] ?? 0)))), 'badge' => 'PACK',
            'bundle_items' => json_col(array_values(array_unique($items))), 'bundle_all' => 0, 'featured' => 0, 'is_new' => !empty($pk['isNew']) ? 1 : 0,
            'status' => 'published', 'sort_order' => 5, 'sync_center' => 0, 'created_at' => now_utc(), 'updated_at' => now_utc(),
        ]);
        $packs++;
    }

    $reviews = 0;
    $site = get_setting('site');
    $fromCloud = array_values(array_filter((array)($conf['reviews'] ?? []), fn($r) => is_array($r) && trim((string)($r['text'] ?? '')) !== ''));
    if ($fromCloud) {
        $site['testimonials'] = array_map(fn($r) => [
            'name' => mb_substr((string)($r['name'] ?? 'Productor'), 0, 80),
            'role' => mb_substr((string)($r['role'] ?? ''), 0, 80),
            'text' => mb_substr((string)$r['text'], 0, 500),
            'rating' => max(1, min(5, (int)($r['stars'] ?? $r['rating'] ?? 5))),
        ], array_slice($fromCloud, 0, 12));
        save_setting('site', $site);
        $reviews = count($site['testimonials']);
    }

    $summary = ['plugins_updated' => $updated, 'packs_created' => $packs, 'reviews' => $reviews, 'at' => time()];
    q("DELETE FROM store_settings WHERE k = 'legacy_import'");
    q("INSERT INTO store_settings (k, v, updated_at) VALUES ('legacy_import', ?, ?)", [json_col($summary), now_utc()]);
    return $summary;
}
