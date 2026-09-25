<?php
/**
 * X-FLOW STORE — configuración del servidor.
 *
 * 1. Copia este archivo como  config.php  (en la misma carpeta /api).
 * 2. Rellena los datos de tu base de datos MySQL (la MISMA que usa X-Flow Center
 *    si quieres que las licencias se activen directo en su tabla).
 * 3. Nunca subas config.php a GitHub: ya está en .gitignore.
 *
 * Las claves de PayPal / Binance / Stripe se pueden poner aquí (recomendado)
 * o desde el panel de administrador. Si las pones aquí, el panel no las puede
 * sobrescribir.
 */
return [

    // ---------------------------------------------------------------- BASE DE DATOS
    'db' => [
        'dsn'  => 'mysql:host=localhost;dbname=NOMBRE_DE_TU_BD;charset=utf8mb4',
        'user' => 'USUARIO_BD',
        'pass' => 'CLAVE_BD',
    ],

    // Base de datos donde vive la tabla de licencias de X-Flow Center.
    // null = la misma de arriba. Si el Center usa otra BD, pon aquí su dsn/user/pass.
    'center_db' => null,

    // ---------------------------------------------------------------- ADMINISTRADOR
    // Solo estos correos pueden entrar al panel /admin.
    'admin_emails' => [
        'tu-correo-admin@ejemplo.com',
    ],
    // Hash de la contraseña del panel. Genéralo abriendo  /api/install.php
    // o en consola:  php -r "echo password_hash('TU_CLAVE', PASSWORD_DEFAULT);"
    'admin_password_hash' => '',
    // true = un admin también puede entrar con su usuario/clave de X-Flow Center
    // (se valida contra legacy_login_url). El correo igual debe estar en admin_emails.
    'admin_allow_center_login' => true,

    // ---------------------------------------------------------------- URLS
    // URL pública donde está la tienda (sin barra final). Se usa para los
    // retornos de pago y los webhooks.
    'public_url' => 'https://xflowbeats.online/tienda',

    // Login de clientes: se reutiliza el login de X-Flow Center para que el
    // cliente compre con la MISMA cuenta que usa en la app.
    'legacy_login_url' => 'https://xflowbeats.online/login.php',
    // API actual del Center (para leer la lista de plugins y abrir tickets de soporte).
    'legacy_api_url'   => 'https://xflowbeats.online/soporte_api.php',

    // Si pruebas la tienda desde otro dominio (p. ej. GitHub Pages) contra este
    // servidor, añade aquí ese origen:  'https://tuusuario.github.io'
    'allowed_origins' => [],

    // ---------------------------------------------------------------- CORREO
    'mail_from' => 'X-FLOW <no-reply@xflowbeats.online>',
    'send_emails' => true,

    // ---------------------------------------------------------------- CLAVES SECRETAS (opcional)
    // Si las rellenas aquí tienen prioridad sobre las del panel.
    'secrets' => [
        'paypal_client_id'      => '',
        'paypal_secret'         => '',
        'paypal_webhook_id'     => '',
        'binance_api_key'       => '',
        'binance_secret_key'    => '',
        'stripe_secret_key'     => '',
        'stripe_webhook_secret' => '',
        'center_http_secret'    => '',
    ],

    // Muestra errores detallados en las respuestas JSON (solo para pruebas).
    'debug' => false,
];
