# X-FLOW STORE · Tienda de plugins

Tienda web para vender los plugins de X-FLOW con el estilo de xflowbeats.online (negro, rojo `#ff1b4d`, morado `#9b1bff` y dorado `#ffb020`). Incluye un panel de administrador y se conecta a la base de datos que **ya usa X-Flow Center**, así que cada compra aparece activada en la app.

Todo está en la carpeta **`web/`**. Esa carpeta es la que se sube al hosting.

```
web/
├── index.html            Tienda (inicio, plugins, packs, ofertas, checkout, mi cuenta…)
├── admin/index.html      Panel de administrador
├── assets/               Estilos, JavaScript e imágenes de los plugins
└── api/                  Backend PHP (pagos, licencias, panel)
    ├── config.sample.php Plantilla de configuración → cópiala como config.php
    ├── install.php       Comprobación de instalación + generador de contraseña
    ├── index.php         API (una sola entrada: api/index.php?action=…)
    └── center_receiver_example.php  Receptor opcional para el modo HTTP
```

## Qué incluye

**Tienda**
- Portada con carrusel de destacados, lanzamientos, pack destacado, catálogo, ofertas con cuenta regresiva, testimonios, preguntas frecuentes y newsletter.
- Sección **Sample Packs desactivada**: se ve como “Próximamente” y se puede activar después desde el panel.
- Página de cada plugin: galería, video de YouTube, licencias (permanente, mensual, anual o las que definas), características, requisitos y packs donde aparece.
- Carrito, cupones, checkout con **opción de regalo** (la licencia va al correo de otra persona).
- Pagos: **PayPal Checkout**, **tarjeta (Stripe)**, **Binance Pay** (automático) y **métodos manuales** (Binance personal, transferencia, pago móvil, Zelle…).
- Mi cuenta: los clientes entran con su **usuario de X-Flow Center** y ven sus licencias y pedidos.

**Panel de administrador** (`/admin`)
- Resumen de ventas (ingresos, pedidos, más vendidos, gráfico de 14 días).
- Plugins y **packs** (varios plugins o “todo en uno” a un solo precio), con precios **permanentes y de suscripción**.
- **Ofertas** generales con fecha de fin, descuento por producto y **cupones**.
- Pedidos: aprobar pagos manuales, consultar el proveedor, cancelar o reembolsar (con revocación opcional).
- **Licencias y regalos**: regalar una licencia o un pack a uno o varios correos, extender días, hacer permanente, revocar o reenviar al Center.
- **Métodos de pago**: claves de PayPal, Stripe y Binance Pay, y métodos manuales editables.
- **Conexión con X-Flow Center**: se indica qué tabla y columnas de tu base de datos guardan las licencias. El botón “Leer estructura” lista tus tablas en solo lectura.
- Apariencia: textos de portada, colores, barra de anuncio, redes, preguntas frecuentes y testimonios.

## Tus plugins salen solos (catálogo sincronizado)

La tienda lee los plugins que ya tienes subidos en X-Flow Center, igual que tu web anterior:

- Primero busca la **tabla de plugins de tu base de datos** (por defecto `plugins` con `id`, `nombre`, `precio_perm`, `precio_sub`, `descripcion`, `imagen_url`, `version`). Si no la encuentra, usa **`soporte_api.php?accion=obtener_plugins`**.
- Se sincroniza sola **cada 10 minutos**, y en cualquier momento desde *Panel → Plugins → Sincronizar con el Center*. Cada plugin nuevo que subas al Center aparece publicado en la tienda.
- Del Center vienen el nombre, el precio **permanente** (`precio_perm`) y el **mensual** (`precio_sub`), la imagen, la descripción y la versión. Si un plugin no tiene `precio_sub`, la suscripción de 30 días cuesta el 25 % del permanente, igual que en tu web anterior.
- **X-Flow Remote** se vende con sus planes Bronze, Plata y Gold, mensuales y permanentes (los lee de `remote.xflowbeats.online/api/planes`).
- La primera vez también importa lo que guardabas en tu web anterior (`leer_configuracion`): **descuentos, etiquetas de oferta, "nuevo", packs y reseñas**.
- En la tienda decides descuentos, etiquetas, destacados, galería, video y packs. Si quieres controlar un plugin a mano, desactiva *Sincronizar con X-Flow Center* en su ficha.
- Si tus tablas usan otros nombres, cámbialos en *Panel → X-Flow Center → Catálogo* (el botón *Leer estructura* te muestra tus tablas).

## Cuentas de X-Flow Center y contraseñas

- Los clientes entran con **su cuenta de X-Flow Center**. La tienda la valida con tu `login.php`, igual que la app. Si `login.php` no responde, la valida con tu **tabla de usuarios** (se configura en *Panel → X-Flow Center → Cuentas de clientes*).
- En **Mi cuenta** el cliente ve también las licencias que **ya tenía en el Center**, no solo las compradas en la tienda. Los plugins que ya tiene aparecen marcados con "Ya lo tienes".
- **Recuperar contraseña** (*Mi cuenta → ¿Olvidaste tu contraseña?*):
  - El enlace llega por correo, caduca en 30 minutos y sirve una sola vez. En la base de datos solo se guarda su huella SHA-256, nunca el enlace.
  - La respuesta es la misma exista o no el correo, así que nadie puede averiguar quién tiene cuenta.
  - Hay límite de intentos por IP y por correo.
  - La contraseña nueva debe tener 8 caracteres o más, con letras y números, y no puede ser una de las más comunes.
  - Se guarda en **el mismo formato que ya usa tu Center** (bcrypt, MD5, SHA1… lo detecta en cada cuenta), así la app sigue funcionando.
  - Al cambiarla se avisa por correo y se cierran las sesiones abiertas en la tienda.
- **Cambiar contraseña** desde *Mi cuenta*, pidiendo la contraseña actual.
- Para que se envíen los correos, pon en `mail_from` un remitente de tu dominio. Si tu hosting no envía correo con `mail()`, avísame y lo conecto por SMTP.

## Cómo se conecta con X-Flow Center (licencias)

- La tienda usa **la misma base de datos MySQL** del Center. Solo añade tablas nuevas con prefijo `store_` y **no modifica ni borra las tablas existentes**.
- Cuando se confirma un pago, escribe la licencia en **tu tabla de licencias actual** (se configura en *Panel → X-Flow Center*): inserta la fila si no existe, suma días si es una suscripción o la marca como permanente. Nunca cambia una licencia permanente a temporal.
- Cada plugin de la tienda tiene un **“ID en X-Flow Center”**, que es el valor que se escribe en la columna del plugin. *Panel → Plugins → Importar del Center* trae los plugins que ya tienes registrados (a través de `soporte_api.php?accion=obtener_plugins`).
- El login de clientes y administradores usa tu `login.php` actual. Así el cliente compra con la misma cuenta que usa en el Center.
- Si la tienda está en otro servidor, puedes usar el modo **HTTP**: la tienda envía un POST firmado (HMAC-SHA256) a un endpoint del Center. Hay un ejemplo en `api/center_receiver_example.php`.

## Instalación en tu hosting (xflowbeats.online)

1. Sube el contenido de `web/` a una carpeta, por ejemplo `public_html/tienda/`.
2. Copia `api/config.sample.php` como `api/config.php` y rellena:
   - `db`: los datos de la **base de datos existente** del Center.
   - `admin_emails`: tu correo de administrador.
   - `public_url`: por ejemplo `https://xflowbeats.online/tienda`.
3. Abre `https://xflowbeats.online/tienda/api/install.php`. Comprueba que todo esté en verde y genera el hash de la contraseña del panel. Pégalo en `admin_password_hash` y después **borra `install.php`**.
4. Entra a `https://xflowbeats.online/tienda/admin/` y configura:
   - **X-Flow Center**: modo *Directo a la base de datos*, pulsa *Leer estructura*, elige tu tabla de licencias y sus columnas, y luego *Probar conexión*.
   - **Plugins**: revisa que cada plugin tenga su *ID en X-Flow Center* correcto.
   - **Métodos de pago**: activa PayPal, Stripe, Binance Pay y/o los métodos manuales. Copia las URLs de webhook en cada proveedor.
5. Haz una compra de prueba (PayPal en modo *Sandbox* o un cupón del 100 %) y comprueba que aparezca en X-Flow Center.

Requisitos: PHP 8.0 o superior con `pdo_mysql`, `curl`, `mbstring`, `openssl` y `fileinfo` (lo normal en cualquier hosting con cPanel).

## Laboratorio de pruebas en GitHub Pages

El workflow `.github/workflows/pages.yml` publica `web/` en GitHub Pages cada vez que se sube un cambio. Como GitHub Pages no ejecuta PHP, la tienda y el panel arrancan solos en **modo laboratorio**:

- Intenta leer **en vivo** tus plugins, tu login y tus licencias reales desde `xflowbeats.online`. Tu navegador solo lo permite si tu servidor responde con la cabecera CORS. Para activarlo, añade esta línea al principio de `soporte_api.php` y de `login.php` (cambia el usuario si tu GitHub es otro):
  ```php
  header('Access-Control-Allow-Origin: https://crockertheproducer.github.io');
  ```
  Si no la pones, el laboratorio usa datos de ejemplo y te avisa en el panel.
- Los datos de ejemplo se guardan en el navegador de quien lo abre (botón *Reiniciar* para empezar de cero).
- Los pagos se simulan y no se cobra nada. No se toca tu base de datos real.
- Panel: `…/admin/` con **admin@xflow.demo / demo1234**.

Para activarlo la primera vez: en GitHub ve a **Settings → Pages → Source: GitHub Actions**. Si publicas desde una rama que no sea `main`, añádela también en **Settings → Environments → github-pages → Deployment branches**.

En tu servidor real el modo laboratorio **nunca** se activa: si la API falla, la tienda muestra “Tienda no disponible” en lugar de simular compras.

## Seguridad

- Las claves de PayPal, Stripe y Binance se guardan en el servidor y nunca llegan al navegador. En el panel se muestran ocultas (`••••1234`). Si las pones en `config.php`, tienen prioridad y no se pueden cambiar desde el panel.
- El precio siempre lo calcula el servidor. Un cliente no puede cambiar el precio desde el navegador.
- Las licencias solo se entregan cuando el proveedor confirma el pago: PayPal con captura verificada, Stripe consultando la sesión y Binance consultando la orden con firma. Cada pedido se entrega una sola vez, aunque llegue el webhook repetido.
- Todas las acciones que cambian algo exigen un token CSRF por sesión, y la cookie es `HttpOnly` y `SameSite`.
- Hay límite de intentos de login por IP y por correo, tanto en la tienda como en el panel.
- La sesión del panel caduca tras 2 horas sin uso (12 horas como máximo). La de los clientes caduca tras 14 días sin uso.
- `.htaccess` añade cabeceras de seguridad, impide ver `config.php` y `lib/`, y bloquea la ejecución de código en `uploads/`.
- ⚠️ **Tu web anterior** tiene la clave maestra (`masterKey`) escrita en el JavaScript público y llama a `listar_usuarios_admin` desde el navegador. Cualquiera puede verla y descargar la lista de usuarios. Cámbiala en tu servidor y quita esa clave del HTML antiguo.
