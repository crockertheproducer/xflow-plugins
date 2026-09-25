<?php
declare(strict_types=1);

const XF_SCHEMA_VERSION = 2;

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;
    $c = cfg('db');
    if (!is_array($c) || empty($c['dsn'])) fail('not_configured', 'Falta la configuración de base de datos en config.php', 503);
    $pdo = new PDO($c['dsn'], $c['user'] ?? null, $c['pass'] ?? null, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
    if (db_driver($pdo) === 'sqlite') {
        $pdo->exec('PRAGMA foreign_keys = ON');
        $pdo->exec('PRAGMA busy_timeout = 5000');
    } else {
        $pdo->exec("SET time_zone = '+00:00'");
    }
    db_migrate($pdo);
    return $pdo;
}

function db_driver(?PDO $pdo = null): string
{
    return ($pdo ?? db())->getAttribute(PDO::ATTR_DRIVER_NAME);
}

function q(string $sql, array $params = []): PDOStatement
{
    $st = db()->prepare($sql);
    $st->execute($params);
    return $st;
}

function row(string $sql, array $params = []): ?array
{
    $r = q($sql, $params)->fetch();
    return $r === false ? null : $r;
}

function rows(string $sql, array $params = []): array
{
    return q($sql, $params)->fetchAll();
}

function insert(string $table, array $data): int
{
    $cols = array_keys($data);
    $sql = 'INSERT INTO ' . $table . ' (' . implode(',', $cols) . ') VALUES (' . implode(',', array_fill(0, count($cols), '?')) . ')';
    q($sql, array_values($data));
    return (int)db()->lastInsertId();
}

function update(string $table, array $data, string $where, array $whereParams = []): int
{
    $sets = [];
    foreach (array_keys($data) as $c) $sets[] = $c . ' = ?';
    $sql = 'UPDATE ' . $table . ' SET ' . implode(', ', $sets) . ' WHERE ' . $where;
    return q($sql, array_merge(array_values($data), $whereParams))->rowCount();
}

function db_migrate(PDO $pdo): void
{
    try {
        $st = $pdo->query("SELECT v FROM store_settings WHERE k = '_schema'");
        $v = $st ? $st->fetchColumn() : false;
        if ($v !== false && (int)$v >= XF_SCHEMA_VERSION) return;
    } catch (Throwable $e) {
        // la tabla aún no existe
    }

    $sqlite = db_driver($pdo) === 'sqlite';
    $pk = $sqlite ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY';
    $text = $sqlite ? 'TEXT' : 'MEDIUMTEXT';
    $tail = $sqlite ? '' : ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

    $tables = [
        "CREATE TABLE IF NOT EXISTS store_settings (
            k VARCHAR(64) NOT NULL PRIMARY KEY,
            v $text NOT NULL,
            updated_at DATETIME NULL
        )$tail",
        "CREATE TABLE IF NOT EXISTS store_products (
            id $pk,
            type VARCHAR(16) NOT NULL DEFAULT 'plugin',
            slug VARCHAR(120) NOT NULL,
            name VARCHAR(160) NOT NULL,
            tagline VARCHAR(255) NOT NULL DEFAULT '',
            description $text NULL,
            features $text NULL,
            specs $text NULL,
            image VARCHAR(500) NOT NULL DEFAULT '',
            gallery $text NULL,
            video_url VARCHAR(500) NOT NULL DEFAULT '',
            category VARCHAR(64) NOT NULL DEFAULT '',
            center_id VARCHAR(160) NOT NULL DEFAULT '',
            plans $text NULL,
            discount_percent INT NOT NULL DEFAULT 0,
            discount_ends_at DATETIME NULL,
            badge VARCHAR(40) NOT NULL DEFAULT '',
            bundle_items $text NULL,
            bundle_all TINYINT NOT NULL DEFAULT 0,
            featured TINYINT NOT NULL DEFAULT 0,
            is_new TINYINT NOT NULL DEFAULT 0,
            status VARCHAR(16) NOT NULL DEFAULT 'published',
            sort_order INT NOT NULL DEFAULT 0,
            created_at DATETIME NULL,
            updated_at DATETIME NULL
        )$tail",
        "CREATE TABLE IF NOT EXISTS store_coupons (
            id $pk,
            code VARCHAR(40) NOT NULL,
            kind VARCHAR(10) NOT NULL DEFAULT 'percent',
            value DECIMAL(10,2) NOT NULL DEFAULT 0,
            product_ids $text NULL,
            min_total DECIMAL(10,2) NOT NULL DEFAULT 0,
            max_uses INT NULL,
            used INT NOT NULL DEFAULT 0,
            starts_at DATETIME NULL,
            expires_at DATETIME NULL,
            active TINYINT NOT NULL DEFAULT 1,
            created_at DATETIME NULL
        )$tail",
        "CREATE TABLE IF NOT EXISTS store_orders (
            id $pk,
            public_id VARCHAR(24) NOT NULL,
            access_token VARCHAR(64) NOT NULL,
            email VARCHAR(190) NOT NULL,
            customer_name VARCHAR(160) NOT NULL DEFAULT '',
            recipient_email VARCHAR(190) NULL,
            gift_message VARCHAR(500) NOT NULL DEFAULT '',
            items $text NOT NULL,
            subtotal_cents INT NOT NULL DEFAULT 0,
            discount_cents INT NOT NULL DEFAULT 0,
            total_cents INT NOT NULL DEFAULT 0,
            currency VARCHAR(8) NOT NULL DEFAULT 'USD',
            coupon_code VARCHAR(40) NOT NULL DEFAULT '',
            method VARCHAR(32) NOT NULL DEFAULT '',
            manual_method VARCHAR(64) NOT NULL DEFAULT '',
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            provider_ref VARCHAR(191) NOT NULL DEFAULT '',
            manual_reference VARCHAR(255) NOT NULL DEFAULT '',
            admin_note VARCHAR(500) NOT NULL DEFAULT '',
            ip VARCHAR(64) NOT NULL DEFAULT '',
            created_at DATETIME NULL,
            updated_at DATETIME NULL,
            paid_at DATETIME NULL,
            fulfilled_at DATETIME NULL
        )$tail",
        "CREATE TABLE IF NOT EXISTS store_licenses (
            id $pk,
            email VARCHAR(190) NOT NULL,
            product_id INT NOT NULL,
            product_name VARCHAR(160) NOT NULL DEFAULT '',
            center_id VARCHAR(160) NOT NULL DEFAULT '',
            tier VARCHAR(64) NOT NULL DEFAULT '',
            lifetime TINYINT NOT NULL DEFAULT 0,
            expires_at DATETIME NULL,
            source VARCHAR(16) NOT NULL DEFAULT 'purchase',
            order_id INT NULL,
            note VARCHAR(500) NOT NULL DEFAULT '',
            status VARCHAR(16) NOT NULL DEFAULT 'active',
            center_synced TINYINT NOT NULL DEFAULT 0,
            center_message VARCHAR(500) NOT NULL DEFAULT '',
            created_at DATETIME NULL,
            updated_at DATETIME NULL
        )$tail",
        "CREATE TABLE IF NOT EXISTS store_subscribers (
            id $pk,
            email VARCHAR(190) NOT NULL,
            created_at DATETIME NULL
        )$tail",
        "CREATE TABLE IF NOT EXISTS store_rate (
            k VARCHAR(120) NOT NULL PRIMARY KEY,
            hits INT NOT NULL DEFAULT 0,
            reset_at INT NOT NULL DEFAULT 0
        )$tail",
        "CREATE TABLE IF NOT EXISTS store_admin_log (
            id $pk,
            admin VARCHAR(190) NOT NULL DEFAULT '',
            action VARCHAR(64) NOT NULL DEFAULT '',
            detail $text NULL,
            created_at DATETIME NULL
        )$tail",
    ];
    foreach ($tables as $sql) $pdo->exec($sql);

    $indexes = [
        'CREATE UNIQUE INDEX ux_products_slug ON store_products (slug)',
        'CREATE UNIQUE INDEX ux_coupons_code ON store_coupons (code)',
        'CREATE UNIQUE INDEX ux_orders_public ON store_orders (public_id)',
        'CREATE INDEX ix_orders_email ON store_orders (email)',
        'CREATE INDEX ix_orders_ref ON store_orders (provider_ref)',
        'CREATE UNIQUE INDEX ux_licenses_email_product ON store_licenses (email, product_id)',
        'CREATE UNIQUE INDEX ux_subscribers_email ON store_subscribers (email)',
    ];
    foreach ($indexes as $sql) {
        try { $pdo->exec($sql); } catch (Throwable $e) { /* ya existe */ }
    }

    // ---- v2: sincronización con el catálogo del Center + recuperación de contraseña
    try { $pdo->exec('ALTER TABLE store_products ADD COLUMN sync_center TINYINT NOT NULL DEFAULT 1'); } catch (Throwable $e) { /* ya existe */ }
    $pdo->exec("CREATE TABLE IF NOT EXISTS store_password_resets (
            id $pk,
            email VARCHAR(190) NOT NULL,
            token_hash CHAR(64) NOT NULL,
            expires_at DATETIME NOT NULL,
            used_at DATETIME NULL,
            ip VARCHAR(64) NOT NULL DEFAULT '',
            created_at DATETIME NULL
        )$tail");
    foreach (['CREATE UNIQUE INDEX ux_resets_token ON store_password_resets (token_hash)', 'CREATE INDEX ix_resets_email ON store_password_resets (email)'] as $sql) {
        try { $pdo->exec($sql); } catch (Throwable $e) { /* ya existe */ }
    }

    $hasProducts = (int)$pdo->query('SELECT COUNT(*) FROM store_products')->fetchColumn();
    if ($hasProducts === 0) seed_catalog($pdo);

    $st = $pdo->prepare("DELETE FROM store_settings WHERE k = '_schema'");
    $st->execute();
    $st = $pdo->prepare("INSERT INTO store_settings (k, v, updated_at) VALUES ('_schema', ?, ?)");
    $st->execute([(string)XF_SCHEMA_VERSION, now_utc()]);
}

/** Catálogo inicial: los plugins de X-FLOW y dos packs. Todo se edita luego desde /admin. */
function seed_catalog(PDO $pdo): void
{
    $now = now_utc();
    $plans = function (float $life, ?float $month, ?float $year = null): string {
        $p = [['id' => 'lifetime', 'label' => 'Permanente', 'type' => 'lifetime', 'days' => 0, 'price' => $life, 'compare_at' => null, 'tier' => '']];
        if ($month !== null) $p[] = ['id' => 'monthly', 'label' => 'Mensual', 'type' => 'days', 'days' => 30, 'price' => $month, 'compare_at' => null, 'tier' => ''];
        if ($year !== null) $p[] = ['id' => 'yearly', 'label' => 'Anual', 'type' => 'days', 'days' => 365, 'price' => $year, 'compare_at' => null, 'tier' => ''];
        return json_col($p);
    };
    $specs = json_col(['formats' => 'VST3', 'os' => 'Windows 10 / 11 (64-bit)', 'version' => '1.0', 'size' => '']);

    $products = [
        [
            'slug' => 'x-flow-channelstrip', 'name' => 'X-FLOW CHANNELSTRIP', 'category' => 'Mezcla',
            'tagline' => 'Cuatro módulos de consola clásica en un solo rack.',
            'description' => "Preamp de color, EQ musical de tres bandas, de-esser natural y limitador FET con VU real. Todo lo que necesita una pista para sonar terminada, en el orden correcto y sin abrir cinco plugins distintos.\n\nPensado para voces, baterías y buses: carga el preset, ajusta el nivel de entrada y deja que el rack haga el trabajo pesado.",
            'features' => ['Preamp modular con saturación y mezcla paralela', 'EQ de 3 bandas con filtros de estilo clásico', 'De-esser por bandas con modo audición', 'Limitador FET con ratios 4 / 8 / 12 / 20 y VU animado', 'Bypass independiente en cada módulo'],
            'image' => 'assets/img/plugins/channelstrip.png', 'center_id' => 'channelstrip', 'plans' => $plans(49.99, 5.99, 44.99),
            'badge' => 'MÁS VENDIDO', 'featured' => 1, 'is_new' => 0, 'sort' => 1,
        ],
        [
            'slug' => 'x-flow-analyzer', 'name' => 'X-FLOW ANALYZER', 'category' => 'Utilidad',
            'tagline' => 'Mira tu mezcla: espectro, loudness y fase en tiempo real.',
            'description' => "Analizador de 64 bandas con curva suavizada, medición LUFS integrada/short-term, true peak y correlación estéreo. Cambia entre vistas Stereo / Mid / Side y compara cómo se traduce tu mezcla en teléfono, carro o discoteca.",
            'features' => ['Espectro de 16 a 64 bandas con rango ajustable', 'LUFS integrado, short-term y true peak', 'Medidor de correlación de fase', 'Vistas Stereo, Mid y Side con EQ M/S', 'Simulación de escucha: teléfono, carro y discoteca'],
            'image' => 'assets/img/plugins/analyzer.png', 'center_id' => 'xflowanalizer', 'plans' => $plans(19.99, 2.99),
            'badge' => 'NUEVO', 'featured' => 1, 'is_new' => 1, 'sort' => 2,
        ],
        [
            'slug' => 'x-flow-sidechain', 'name' => 'X-FLOW SIDECHAIN', 'category' => 'Ritmo',
            'tagline' => 'Dibuja la curva y deja que el bombeo haga el resto.',
            'description' => "Modulador de volumen por curva sincronizado al tempo, con filtro resonante y mezcla paralela. Dibuja el envolvente, elige la división (1/4, 1/8, 1/16…) o dispáralo por MIDI para bombear exactamente con tu kick.",
            'features' => ['Editor de curva libre con puntos y tensión', 'Sincronía al tempo del DAW', 'Filtro con cutoff y resonancia', 'Disparo por MIDI', 'Control de mezcla dry/wet'],
            'image' => 'assets/img/plugins/sidechain.png', 'center_id' => 'sidechain', 'plans' => $plans(19.99, 2.99),
            'badge' => '', 'featured' => 0, 'is_new' => 0, 'sort' => 3,
        ],
        [
            'slug' => 'x-flow-clean', 'name' => 'X-FLOW CLEAN', 'category' => 'Mezcla',
            'tagline' => 'Una perilla para limpiar ruido y dejar la voz clara.',
            'description' => "Limpieza dinámica de ruido de fondo, siseo y resonancias con un solo control. Activa el modo HQ para máxima calidad en la exportación final.",
            'features' => ['Control único de cantidad de limpieza', 'Modo HQ para exportar', 'Bypass rápido para comparar', 'Latencia mínima para grabar en vivo'],
            'image' => 'assets/img/plugins/clean.png', 'center_id' => 'clean', 'plans' => $plans(24.99, 3.49),
            'badge' => '', 'featured' => 0, 'is_new' => 0, 'sort' => 4,
        ],
        [
            'slug' => 'x-flow-drop', 'name' => 'X-FLOW DROP', 'category' => 'Creativo',
            'tagline' => 'Pega un enlace, saca el audio y arrástralo al DAW.',
            'description' => "Importa audio desde un enlace directamente dentro de tu proyecto: pega la URL, pulsa extraer y arrastra el archivo a la pista. Úsalo solo con material que tengas derecho a usar.",
            'features' => ['Extracción directa dentro del DAW', 'Arrastrar y soltar a cualquier pista', 'Vista previa con carátula', 'Historial de extracciones'],
            'image' => 'assets/img/plugins/drop.png', 'center_id' => 'drop', 'plans' => $plans(29.99, 3.99),
            'badge' => '', 'featured' => 0, 'is_new' => 0, 'sort' => 5,
        ],
    ];

    $ids = [];
    foreach ($products as $p) {
        $st = $pdo->prepare('INSERT INTO store_products (type, slug, name, tagline, description, features, specs, image, gallery, video_url, category, center_id, plans, discount_percent, badge, bundle_items, bundle_all, featured, is_new, status, sort_order, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
        $st->execute(['plugin', $p['slug'], $p['name'], $p['tagline'], $p['description'], json_col($p['features']), $specs, $p['image'], '[]', '', $p['category'], $p['center_id'], $p['plans'], 0, $p['badge'], '[]', 0, $p['featured'], $p['is_new'], 'published', $p['sort'], $now, $now]);
        $ids[$p['slug']] = (int)$pdo->lastInsertId();
    }

    $bundles = [
        [
            'slug' => 'x-flow-all-access', 'name' => 'X-FLOW ALL ACCESS', 'category' => 'Pack',
            'tagline' => 'Todos los plugins X-FLOW, hoy y los que vengan.',
            'description' => "Una sola licencia para todo el catálogo. Incluye automáticamente cada plugin nuevo que salga mientras tu acceso esté activo.",
            'features' => ['Todos los plugins actuales', 'Plugins nuevos incluidos automáticamente', 'Activación instantánea en X-Flow Center', 'Actualizaciones incluidas'],
            'items' => [], 'all' => 1, 'plans' => $plans(99.99, 9.99, 89.99), 'badge' => 'TODO EN UNO', 'featured' => 1, 'sort' => 0,
        ],
        [
            'slug' => 'x-flow-mix-essentials', 'name' => 'MIX ESSENTIALS', 'category' => 'Pack',
            'tagline' => 'Channelstrip + Clean + Analyzer para mezclar de principio a fin.',
            'description' => "Las tres herramientas que más usamos en cada mezcla: limpia la toma, dale carácter en el channelstrip y verifica con el analizador.",
            'features' => ['X-FLOW CHANNELSTRIP', 'X-FLOW CLEAN', 'X-FLOW ANALYZER'],
            'items' => [$ids['x-flow-channelstrip'], $ids['x-flow-clean'], $ids['x-flow-analyzer']], 'all' => 0, 'plans' => $plans(69.99, null), 'badge' => 'PACK', 'featured' => 0, 'sort' => 1,
        ],
    ];
    foreach ($bundles as $b) {
        $st = $pdo->prepare('INSERT INTO store_products (type, slug, name, tagline, description, features, specs, image, gallery, video_url, category, center_id, plans, discount_percent, badge, bundle_items, bundle_all, featured, is_new, status, sort_order, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
        $st->execute(['bundle', $b['slug'], $b['name'], $b['tagline'], $b['description'], json_col($b['features']), $specs, '', '[]', '', $b['category'], '', $b['plans'], 0, $b['badge'], json_col($b['items']), $b['all'], $b['featured'], 0, 'published', $b['sort'], $now, $now]);
    }
}
