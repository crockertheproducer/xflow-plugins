<?php
declare(strict_types=1);

/**
 * Ajustes guardados en store_settings (JSON por sección).
 * Las claves secretas nunca salen en la API pública y en el panel se muestran enmascaradas.
 */

const XF_SECRET_MASK = '••••••••';

function settings_defaults(): array
{
    return [
        'site' => [
            'name' => 'X-FLOW',
            'logo_url' => '',
            'currency' => 'USD',
            'hero_eyebrow' => 'Plugins VST3 para productores',
            'hero_title' => 'SUENA COMO<br>EL <span class="grad">FUTURO</span>',
            'hero_subtitle' => 'Plugins de mezcla, análisis y creatividad hechos por productores. Compra y se activa al instante en X-Flow Center.',
            'announcement' => ['active' => true, 'text' => 'Activación instantánea en X-Flow Center en cada compra', 'link' => '#/plugins'],
            'colors' => ['primary' => '#ff1b4d', 'secondary' => '#9b1bff', 'accent' => '#ffb020', 'bg' => '#050206', 'panel' => '#140e18'],
            'sample_packs_enabled' => false,
            'center_download_url' => 'https://xflowbeats.online/descargas/xflowcenter.exe',
            'support_email' => 'soporte@xflowbeats.online',
            'socials' => ['instagram' => '', 'youtube' => '', 'tiktok' => '', 'discord' => ''],
            'ticker' => ['VST3', 'WINDOWS 10 / 11', 'ACTIVACIÓN INSTANTÁNEA', 'SIN DONGLE', 'ACTUALIZACIONES INCLUIDAS', 'SOPORTE EN ESPAÑOL'],
            'faq' => [
                ['q' => '¿Cómo recibo mi plugin después de pagar?', 'a' => 'La licencia se activa sola en tu cuenta de X-Flow Center con el mismo correo de la compra. Abre el Center, inicia sesión y el plugin aparece listo para instalar.'],
                ['q' => '¿Qué diferencia hay entre permanente y suscripción?', 'a' => 'Permanente es un solo pago y es tuyo para siempre. La suscripción te da acceso por 30 días (o el periodo que elijas) y puedes renovarla cuando quieras; los días se suman.'],
                ['q' => '¿Puedo regalar un plugin?', 'a' => 'Sí. En el checkout marca "Es un regalo" y escribe el correo de la persona: la licencia se activa en su cuenta de X-Flow Center.'],
                ['q' => '¿En qué sistemas funciona?', 'a' => 'Windows 10 y 11 de 64 bits, formato VST3, en cualquier DAW compatible (FL Studio, Ableton Live, Studio One, Reaper, Cubase…).'],
                ['q' => '¿Qué métodos de pago aceptan?', 'a' => 'PayPal, tarjeta, Binance y los métodos locales que ves en el checkout.'],
            ],
            'testimonials' => [
                ['name' => 'Productor verificado', 'role' => 'Trap / Reggaetón', 'text' => 'El Channelstrip me ahorra media hora por voz. Cargo, ajusto la entrada y listo.', 'rating' => 5],
                ['name' => 'Ingeniero de mezcla', 'role' => 'Estudio independiente', 'text' => 'El Analyzer con la vista de carro y teléfono me salvó varias mezclas antes de entregarlas.', 'rating' => 5],
                ['name' => 'Beatmaker', 'role' => 'FL Studio', 'text' => 'Compré el pack y a los dos minutos ya estaba todo activado en el Center.', 'rating' => 5],
            ],
        ],
        'sale' => [
            'active' => false,
            'title' => 'OFERTA DE LANZAMIENTO',
            'percent' => 30,
            'ends_at' => null,
            'applies_to' => 'all', // all | plugins | bundles | selected
            'product_ids' => [],
        ],
        'payments' => [
            'paypal' => ['enabled' => false, 'mode' => 'sandbox', 'client_id' => '', 'secret' => '', 'webhook_id' => ''],
            'stripe' => ['enabled' => false, 'publishable_key' => '', 'secret_key' => '', 'webhook_secret' => ''],
            'binance' => ['enabled' => false, 'api_key' => '', 'secret_key' => '', 'currency' => 'USDT'],
            'manual' => [
                ['id' => 'binance-manual', 'name' => 'Binance Pay (manual)', 'enabled' => false, 'instructions' => 'Envía el total en USDT a nuestro Binance Pay ID y pega el ID de la orden.', 'account' => 'Pay ID: 000000000'],
                ['id' => 'transferencia', 'name' => 'Transferencia / Pago móvil', 'enabled' => false, 'instructions' => 'Haz la transferencia y pega el número de referencia.', 'account' => 'Banco · Titular · Cuenta'],
            ],
        ],
        'center' => [
            'mode' => 'none', // none | db | http
            'db' => [
                'table' => 'licencias',
                'col_email' => 'email',
                'col_product' => 'plugin',
                'col_product_name' => '',
                'expiry_mode' => 'datetime', // datetime | days | none
                'col_expiry' => 'fecha_expiracion',
                'lifetime_value' => '',
                'col_status' => 'estado',
                'status_active' => 'activo',
                'status_lifetime' => 'permanente',
                'col_tier' => '',
                'col_created' => '',
            ],
            'http' => ['url' => '', 'secret' => ''],
            // Catálogo: de dónde se leen los plugins que ya tienes subidos en X-Flow Center.
            'catalog' => [
                'source' => 'auto', // auto (BD y si no la API) | db | api | off
                'table' => 'plugins',
                'col_id' => 'id',
                'col_name' => 'nombre',
                'col_price' => 'precio_perm',
                'col_price_sub' => 'precio_sub',
                'col_desc' => 'descripcion',
                'col_image' => 'imagen_url',
                'col_version' => 'version',
                'col_active' => '',
                'auto_publish' => true,
                'sub_days' => 30,
                'remote_plans_url' => 'https://remote.xflowbeats.online/api/planes',
            ],
            // Cuentas: dónde viven los usuarios de X-Flow Center (login y recuperar contraseña).
            'users' => [
                'source' => 'auto', // auto (login.php y si no la BD) | db | api
                'table' => 'usuarios',
                'col_email' => 'email',
                'col_password' => 'password',
                'col_aka' => 'aka',
                'col_role' => 'rol',
                'col_photo' => 'foto_url',
                'password_format' => 'auto', // auto | bcrypt | md5 | sha1 | sha256 | plain
            ],
        ],
    ];
}

/** Rutas de claves secretas por sección => clave en config.php['secrets'] */
function settings_secret_paths(): array
{
    return [
        'payments' => [
            'paypal.secret' => 'paypal_secret',
            'paypal.webhook_id' => 'paypal_webhook_id',
            'stripe.secret_key' => 'stripe_secret_key',
            'stripe.webhook_secret' => 'stripe_webhook_secret',
            'binance.api_key' => 'binance_api_key',
            'binance.secret_key' => 'binance_secret_key',
        ],
        'center' => [
            'http.secret' => 'center_http_secret',
        ],
    ];
}

function arr_get(array $a, string $path, $default = null)
{
    foreach (explode('.', $path) as $p) {
        if (!is_array($a) || !array_key_exists($p, $a)) return $default;
        $a = $a[$p];
    }
    return $a;
}

function arr_set(array &$a, string $path, $value): void
{
    $ref = &$a;
    foreach (explode('.', $path) as $p) {
        if (!isset($ref[$p]) || !is_array($ref[$p])) $ref[$p] = $ref[$p] ?? [];
        $ref = &$ref[$p];
    }
    $ref = $value;
}

/** Mezcla recursiva: listas (arrays con índices numéricos) se reemplazan completas. */
function merge_settings(array $base, array $over): array
{
    foreach ($over as $k => $v) {
        if (is_array($v) && isset($base[$k]) && is_array($base[$k]) && !array_is_list($v) && !array_is_list($base[$k])) {
            $base[$k] = merge_settings($base[$k], $v);
        } else {
            $base[$k] = $v;
        }
    }
    return $base;
}

function get_setting(string $section): array
{
    $cache = &$GLOBALS['XF_SETTINGS_CACHE'];
    if (!is_array($cache)) $cache = [];
    if (isset($cache[$section])) return $cache[$section];
    $defaults = settings_defaults()[$section] ?? [];
    $r = row('SELECT v FROM store_settings WHERE k = ?', [$section]);
    $stored = $r ? json_dec($r['v'], []) : [];
    $value = is_array($stored) ? merge_settings($defaults, $stored) : $defaults;

    // Las claves de config.php tienen prioridad.
    foreach (settings_secret_paths()[$section] ?? [] as $path => $cfgKey) {
        $fromCfg = (string)cfg('secrets.' . $cfgKey, '');
        if ($fromCfg !== '') arr_set($value, $path, $fromCfg);
    }
    if ($section === 'payments') {
        $cid = (string)cfg('secrets.paypal_client_id', '');
        if ($cid !== '') $value['paypal']['client_id'] = $cid;
    }
    return $cache[$section] = $value;
}

function save_setting(string $section, array $value): void
{
    unset($GLOBALS['XF_SETTINGS_CACHE'][$section]);
    q('DELETE FROM store_settings WHERE k = ?', [$section]);
    q('INSERT INTO store_settings (k, v, updated_at) VALUES (?, ?, ?)', [$section, json_col($value), now_utc()]);
}

/** Versión para el panel: secretos enmascarados y marcados si vienen de config.php */
function settings_for_admin(string $section): array
{
    $v = get_setting($section);
    $locked = [];
    foreach (settings_secret_paths()[$section] ?? [] as $path => $cfgKey) {
        $current = (string)arr_get($v, $path, '');
        if ((string)cfg('secrets.' . $cfgKey, '') !== '') $locked[] = $path;
        arr_set($v, $path, $current === '' ? '' : XF_SECRET_MASK . substr($current, -4));
    }
    $v['_locked'] = $locked;
    return $v;
}

/** Guarda desde el panel conservando secretos si llegan enmascarados o vacíos. */
function settings_save_from_admin(string $section, array $incoming): array
{
    unset($incoming['_locked']);
    $next = merge_settings(settings_defaults()[$section] ?? [], $incoming);
    $r = row('SELECT v FROM store_settings WHERE k = ?', [$section]);
    $stored = $r ? json_dec($r['v'], []) : [];
    foreach (settings_secret_paths()[$section] ?? [] as $path => $cfgKey) {
        $val = (string)arr_get($next, $path, '');
        // Enmascarado = sin cambios: se conserva lo guardado. Vacío = se borra.
        if (str_starts_with($val, XF_SECRET_MASK)) {
            arr_set($next, $path, (string)arr_get(is_array($stored) ? $stored : [], $path, ''));
        }
    }
    save_setting($section, $next);
    return $next;
}

/** Ajustes públicos para la tienda. */
function public_settings(): array
{
    $site = get_setting('site');
    $sale = get_setting('sale');
    $pay = get_setting('payments');

    $methods = [];
    if (!empty($pay['paypal']['enabled']) && $pay['paypal']['client_id'] !== '') {
        $methods[] = ['id' => 'paypal', 'name' => 'PayPal', 'kind' => 'paypal', 'client_id' => $pay['paypal']['client_id']];
    }
    if (!empty($pay['stripe']['enabled']) && $pay['stripe']['secret_key'] !== '') {
        $methods[] = ['id' => 'stripe', 'name' => 'Tarjeta de crédito / débito', 'kind' => 'redirect'];
    }
    if (!empty($pay['binance']['enabled']) && $pay['binance']['api_key'] !== '' && $pay['binance']['secret_key'] !== '') {
        $methods[] = ['id' => 'binance', 'name' => 'Binance Pay', 'kind' => 'redirect', 'currency' => $pay['binance']['currency'] ?? 'USDT'];
    }
    foreach ($pay['manual'] ?? [] as $m) {
        if (!empty($m['enabled'])) {
            $methods[] = ['id' => 'manual:' . $m['id'], 'name' => $m['name'], 'kind' => 'manual', 'instructions' => $m['instructions'] ?? '', 'account' => $m['account'] ?? ''];
        }
    }

    return [
        'site' => $site,
        'sale' => sale_is_live($sale) ? $sale : ['active' => false],
        'payment_methods' => $methods,
        'currency' => $site['currency'] ?? 'USD',
    ];
}

function sale_is_live(array $sale): bool
{
    if (empty($sale['active']) || (int)($sale['percent'] ?? 0) <= 0) return false;
    if (!empty($sale['ends_at']) && strtotime($sale['ends_at'] . ' UTC') < time()) return false;
    return true;
}
