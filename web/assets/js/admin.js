/* X-FLOW STORE — panel de administrador */
(function () {
  'use strict';
  const XF = window.XF;
  const esc = XF.esc, icon = XF.icon;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const root = $('#root');

  const A = { admin: null, section: 'resumen', products: [], settings: null, stats: null, centerPlugins: null, currency: 'USD' };
  const money = (v) => XF.money(v, A.currency);

  const NAV = [
    ['Tienda', null],
    ['resumen', 'Resumen', 'chart'],
    ['pedidos', 'Pedidos', 'receipt'],
    ['licencias', 'Licencias y regalos', 'key'],
    ['Catálogo', null],
    ['productos', 'Plugins', 'plug'],
    ['packs', 'Packs', 'layers'],
    ['ofertas', 'Ofertas y cupones', 'percent'],
    ['Configuración', null],
    ['pagos', 'Métodos de pago', 'wallet'],
    ['center', 'X-Flow Center', 'database'],
    ['apariencia', 'Apariencia y textos', 'sliders'],
    ['suscriptores', 'Suscriptores', 'mail'],
    ['registro', 'Registro', 'list'],
  ];
  const TITLES = Object.fromEntries(NAV.filter((n) => n[1]).map((n) => [n[0], n[1]]));

  const STATUS = {
    pending: ['Pendiente', 'warn'], awaiting_review: ['Por verificar', 'accent'], paid: ['Pagado', 'info'], fulfilled: ['Completado', 'ok'],
    failed: ['Fallido', 'bad'], cancelled: ['Cancelado', 'bad'], refunded: ['Reembolsado', 'bad'],
  };
  const pill = (st) => { const s = STATUS[st] || [st, '']; return '<span class="pill ' + s[1] + '">' + esc(s[0]) + '</span>'; };
  const methodLabel = (o) => o.method === 'manual' ? 'Manual · ' + o.manual_method : ({ paypal: 'PayPal', stripe: 'Tarjeta (Stripe)', binance: 'Binance Pay', free: 'Gratis' }[o.method] || o.method);

  /* ============================================================ login */
  function renderLogin(msg) {
    root.innerHTML = '<div class="login-wrap"><form class="login-card" id="login-form">' + XF.logoMark(44) +
      '<h1>Panel X-FLOW</h1><p class="muted" style="margin:0 0 20px">Acceso solo para administradores.</p>' +
      (XF.demo ? '<div class="notice warn" style="margin-bottom:16px">' + icon('info') + '<span>Laboratorio (GitHub Pages): entra con <b>admin@xflow.demo</b> / <b>demo1234</b>. Los cambios se guardan solo en este navegador.</span></div>' : '') +
      (msg ? '<div class="notice warn" style="margin-bottom:16px">' + icon('alert') + '<span>' + esc(msg) + '</span></div>' : '') +
      '<div style="display:grid;gap:12px"><label class="field"><span>Correo</span><input name="email" type="email" required autocomplete="username"></label>' +
      '<label class="field"><span>Contraseña</span><input name="password" type="password" required autocomplete="current-password"></label>' +
      '<button class="btn primary lg block">' + icon('lock') + 'Entrar</button></div>' +
      '<p class="dim" style="font-size:.78rem;margin:16px 0 0">Tu correo debe estar en <span class="mono">admin_emails</span> de <span class="mono">api/config.php</span>.</p>' +
      '<a class="link-more" style="margin-top:14px" href="../">' + icon('arrow-left') + 'Volver a la tienda</a></form></div>';
    $('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const b = e.target.querySelector('button');
      b.classList.add('is-busy');
      try {
        const r = await XF.api('admin_login', { email: e.target.email.value, password: e.target.password.value });
        A.admin = r.admin;
        await boot();
      } catch (err) { XF.toast(err.message, 'error'); } finally { b.classList.remove('is-busy'); }
    });
  }

  /* ============================================================ layout */
  function renderShell() {
    root.innerHTML = '<div class="adm"><aside class="side" id="side"><div class="side-brand">' + XF.logoMark(34) + '<div>X-FLOW<small>ADMIN</small></div></div><nav id="side-nav"></nav>' +
      '<div class="side-foot"><a class="btn ghost sm block" href="../" target="_blank" rel="noopener">' + icon('external') + 'Ver tienda</a><button class="btn ghost sm block" data-a="logout">' + icon('logout') + 'Salir</button></div></aside>' +
      '<div class="overlay-side" id="ov" data-a="side-close"></div>' +
      '<div class="main"><header class="top"><button class="btn-icon side-toggle" data-a="side-open" aria-label="Menú">' + icon('menu') + '</button><h1 id="title"></h1><div class="who">' + (XF.demo ? '<span class="pill accent">LABORATORIO</span>' : '') + '<span>' + esc(A.admin.email) + '</span></div></header><div class="content" id="content"></div></div></div>';
    renderNav();
  }
  function renderNav() {
    const review = A.stats ? A.stats.awaiting_review : 0;
    $('#side-nav').innerHTML = NAV.map((n) => n[1] === null ? '<div class="grp">' + esc(n[0]) + '</div>' :
      '<a href="#' + n[0] + '" class="' + (A.section === n[0] ? 'on' : '') + '">' + icon(n[2]) + esc(n[1]) + (n[0] === 'pedidos' && review ? '<span class="count">' + review + '</span>' : '') + '</a>').join('');
  }
  function sideOpen(o) { $('#side').classList.toggle('open', o); $('#ov').classList.toggle('on', o); }

  async function go() {
    const sec = (location.hash || '#resumen').slice(1).split('?')[0] || 'resumen';
    A.section = TITLES[sec] ? sec : 'resumen';
    $('#title').textContent = TITLES[A.section];
    renderNav();
    sideOpen(false);
    const c = $('#content');
    c.innerHTML = '<div class="skeleton" style="height:260px"></div>';
    try {
      await SECTIONS[A.section](c);
    } catch (e) {
      if (e.code === 'unauthorized' || e.code === 'csrf') { A.admin = null; renderLogin('Tu sesión expiró. Vuelve a entrar.'); return; }
      c.innerHTML = '<div class="notice warn">' + icon('alert') + '<span>' + esc(e.message) + '</span></div>';
    }
  }

  async function loadProducts() { A.products = (await XF.api('admin_products')).products; return A.products; }
  async function loadSettings() { A.settings = await XF.api('admin_settings'); A.currency = (A.settings.site && A.settings.site.currency) || 'USD'; XF.currency = A.currency; return A.settings; }

  /* ============================================================ secciones */
  const SECTIONS = {};

  SECTIONS.resumen = async (c) => {
    const s = A.stats = await XF.api('admin_stats');
    A.currency = s.currency || 'USD';
    renderNav();
    const max = Math.max(1, ...s.daily.map((d) => d.total));
    c.innerHTML = '<div class="kpis">' +
      kpi('Ingresos 30 días', money(s.revenue_30d), 'Total histórico ' + money(s.revenue_all), 'chart') +
      kpi('Pedidos 30 días', s.orders_30d, 'pagados', 'receipt') +
      kpi('Por verificar', s.awaiting_review, 'pagos manuales pendientes', 'clock', s.awaiting_review > 0) +
      kpi('Licencias activas', s.active_licenses, s.unsynced_licenses ? s.unsynced_licenses + ' sin sincronizar con el Center' : 'todas en X-Flow Center', 'key', s.unsynced_licenses > 0) +
      kpi('Suscriptores', s.subscribers, 'newsletter', 'mail') + '</div>' +
      '<div class="cols two"><div class="panel"><h2>' + icon('chart') + 'Ventas · últimos 14 días</h2><div class="chart">' + s.daily.map((d) => '<div class="col"><div class="bar" style="height:' + Math.max(2, (d.total / max) * 100) + '%" data-v="' + esc(money(d.total)) + '"></div><span>' + d.date.slice(8) + '</span></div>').join('') + '</div></div>' +
      '<div class="panel"><h2>' + icon('flame') + 'Más vendidos (30 días)</h2>' + (s.top.length ? '<div class="table-wrap"><table class="tbl"><tbody>' + s.top.map((t) => '<tr><td>' + esc(t.name) + '</td><td class="num">' + t.count + '×</td><td class="num">' + money(t.total) + '</td></tr>').join('') + '</tbody></table></div>' : '<div class="empty">' + icon('chart') + 'Aún no hay ventas.</div>') + '</div></div>' +
      '<div class="panel"><div class="panel-head"><h2>' + icon('receipt') + 'Últimos pedidos</h2><a class="btn ghost sm" href="#pedidos">Ver todos</a></div>' + ordersTable(s.recent) + '</div>' +
      '<div class="panel"><h2>' + icon('zap') + 'Accesos rápidos</h2><div class="bar-actions"><button class="btn primary" data-a="new-product" data-type="plugin">' + icon('plus') + 'Nuevo plugin</button><button class="btn ghost" data-a="new-product" data-type="bundle">' + icon('layers') + 'Nuevo pack</button><button class="btn ghost" data-a="gift">' + icon('gift') + 'Regalar licencia</button><a class="btn ghost" href="#ofertas">' + icon('percent') + 'Crear oferta</a></div></div>';
  };
  function kpi(label, value, sub, ic, alert) {
    return '<div class="kpi' + (alert ? ' alert' : '') + '"><div class="label">' + icon(ic) + esc(label) + '</div><b>' + esc(String(value)) + '</b><small>' + esc(sub) + '</small></div>';
  }

  /* ------------------------------------------------------------ pedidos */
  function ordersTable(list) {
    if (!list.length) return '<div class="empty">' + icon('receipt') + 'No hay pedidos.</div>';
    return '<div class="table-wrap"><table class="tbl"><thead><tr><th>Pedido</th><th>Fecha</th><th>Cliente</th><th>Productos</th><th>Método</th><th class="num">Total</th><th>Estado</th><th></th></tr></thead><tbody>' +
      list.map((o) => '<tr><td class="mono">' + esc(o.id) + '</td><td>' + XF.date(o.created_at, true) + '</td><td>' + esc(o.email) + (o.recipient_email ? '<br><small class="dim">' + icon('gift') + ' ' + esc(o.recipient_email) + '</small>' : '') + '</td><td>' + esc(o.items.map((i) => i.name + ' (' + i.plan_label + ')').join(', ')) + '</td><td>' + esc(methodLabel(o)) + (o.manual_reference ? '<br><small class="mono dim">Ref: ' + esc(o.manual_reference) + '</small>' : '') + '</td><td class="num">' + money(o.total) + '</td><td>' + pill(o.status) + '</td>' +
        '<td><div class="acts">' + (o.status === 'awaiting_review' || (o.status === 'pending' && o.method === 'manual') ? '<button class="btn ok sm" data-a="approve" data-id="' + esc(o.id) + '">' + icon('check') + 'Aprobar</button>' : '') + '<button class="btn ghost sm" data-a="order" data-id="' + esc(o.id) + '">Ver</button></div></td></tr>').join('') + '</tbody></table></div>';
  }
  SECTIONS.pedidos = async (c) => {
    const q = new URLSearchParams((location.hash.split('?')[1]) || '');
    const status = q.get('status') || '';
    const search = q.get('q') || '';
    const r = await XF.api('admin_orders', null, { query: { status, q: search } });
    A.orders = r.orders;
    c.innerHTML = '<div class="panel"><div class="filters"><select id="f-status" class="input"><option value="">Todos los estados</option>' + Object.keys(STATUS).map((k) => '<option value="' + k + '"' + (k === status ? ' selected' : '') + '>' + STATUS[k][0] + '</option>').join('') + '</select>' +
      '<input id="f-q" class="input" placeholder="Buscar correo, pedido, referencia…" value="' + esc(search) + '"><button class="btn ghost" data-a="filter-orders">' + icon('search') + 'Filtrar</button></div>' +
      '<p class="help">Los pagos con PayPal, tarjeta y Binance Pay se confirman y activan solos. Los manuales aparecen como <b>Por verificar</b>: revisa la referencia y pulsa <b>Aprobar</b> para activar las licencias en X-Flow Center.</p>' + ordersTable(r.orders) + '</div>';
  };
  function orderModal(o) {
    const m = XF.modal('<span class="eyebrow">Pedido</span><h3 class="m-title">' + esc(o.id) + '</h3><div style="margin-bottom:14px">' + pill(o.status) + '</div>' +
      '<dl class="kv"><dt>Cliente</dt><dd>' + esc(o.email) + (o.customer_name ? ' · ' + esc(o.customer_name) : '') + '</dd>' +
      (o.recipient_email ? '<dt>Regalo para</dt><dd>' + esc(o.recipient_email) + (o.gift_message ? '<br><i class="muted">“' + esc(o.gift_message) + '”</i>' : '') + '</dd>' : '') +
      '<dt>Método</dt><dd>' + esc(methodLabel(o)) + '</dd>' + (o.manual_reference ? '<dt>Referencia</dt><dd class="mono">' + esc(o.manual_reference) + '</dd>' : '') + (o.provider_ref ? '<dt>ID proveedor</dt><dd class="mono">' + esc(o.provider_ref) + '</dd>' : '') +
      '<dt>Productos</dt><dd>' + o.items.map((i) => esc(i.name) + ' · ' + esc(i.plan_label) + ' · ' + money(i.unit_cents / 100)).join('<br>') + '</dd>' +
      '<dt>Total</dt><dd><b>' + money(o.total) + '</b>' + (o.discount ? ' <span class="dim">(descuento ' + money(o.discount) + (o.coupon_code ? ' · ' + esc(o.coupon_code) : '') + ')</span>' : '') + '</dd>' +
      '<dt>Creado</dt><dd>' + XF.date(o.created_at, true) + '</dd>' + (o.paid_at ? '<dt>Pagado</dt><dd>' + XF.date(o.paid_at, true) + '</dd>' : '') + (o.admin_note ? '<dt>Nota</dt><dd>' + esc(o.admin_note) + '</dd>' : '') + '</dl>' +
      '<h4 class="label" style="margin:20px 0 8px">Licencias</h4>' + (o.licenses && o.licenses.length ? o.licenses.map((l) => '<div style="display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid var(--line)"><span>' + esc(l.product_name) + '</span><span>' + (l.center_synced ? '<span class="pill ok">En Center</span>' : '<span class="pill warn" title="' + esc(l.center_message) + '">Sin sincronizar</span>') + '</span></div>').join('') : '<p class="muted">Sin licencias aún.</p>') +
      '<div class="m-actions">' +
      (['awaiting_review', 'pending', 'paid', 'failed'].includes(o.status) ? '<button class="btn ok" data-m="approve">' + icon('check') + (o.status === 'paid' ? 'Reintentar entrega' : 'Aprobar y activar') + '</button>' : '') +
      (o.status === 'pending' && o.method !== 'manual' ? '<button class="btn ghost" data-m="sync">' + icon('refresh') + 'Consultar proveedor</button>' : '') +
      (['pending', 'awaiting_review'].includes(o.status) ? '<button class="btn danger" data-m="cancel">Cancelar</button>' : '') +
      (['fulfilled', 'paid'].includes(o.status) ? '<button class="btn danger" data-m="refund">Marcar reembolsado</button>' : '') + '</div>', { wide: true });
    m.el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-m]');
      if (!b) return;
      const act = b.dataset.m;
      b.classList.add('is-busy');
      try {
        if (act === 'approve') { await XF.api('admin_order_approve', { order_id: o.id }); XF.toast('Pedido aprobado: licencias activadas.', 'success'); }
        if (act === 'sync') { const r = await XF.api('admin_order_sync', { order_id: o.id }); XF.toast('Estado: ' + (STATUS[r.order.status] || [r.order.status])[0], 'info'); }
        if (act === 'cancel') { if (!(await XF.confirm('¿Cancelar este pedido?', 'Cancelar pedido'))) return; await XF.api('admin_order_status', { order_id: o.id, status: 'cancelled' }); }
        if (act === 'refund') {
          const revoke = await XF.confirm('Marcar como reembolsado. ¿Revocar también las licencias en X-Flow Center?', 'Sí, revocar');
          await XF.api('admin_order_status', { order_id: o.id, status: 'refunded', revoke_licenses: revoke });
        }
        m.close();
        go();
      } catch (err) { XF.toast(err.message, 'error'); } finally { b.classList.remove('is-busy'); }
    });
  }

  /* ------------------------------------------------------------ licencias */
  SECTIONS.licencias = async (c) => {
    const q = new URLSearchParams((location.hash.split('?')[1]) || '').get('q') || '';
    const r = await XF.api('admin_licenses', null, { query: { q } });
    if (!A.products.length) await loadProducts();
    c.innerHTML = '<div class="panel"><div class="panel-head"><h2>' + icon('key') + 'Licencias</h2><button class="btn primary" data-a="gift">' + icon('gift') + 'Regalar licencia</button></div>' +
      '<div class="filters"><input id="l-q" class="input" placeholder="Buscar por correo o producto…" value="' + esc(q) + '"><button class="btn ghost" data-a="filter-lic">' + icon('search') + 'Buscar</button></div>' +
      (r.licenses.length ? '<div class="table-wrap"><table class="tbl"><thead><tr><th>Correo</th><th>Producto</th><th>Tipo</th><th>Vence</th><th>Origen</th><th>X-Flow Center</th><th>Estado</th><th></th></tr></thead><tbody>' +
        r.licenses.map((l) => '<tr><td>' + esc(l.email) + '</td><td>' + esc(l.product_name) + (l.tier ? ' <span class="pill">' + esc(l.tier) + '</span>' : '') + '</td><td>' + (l.lifetime ? '<span class="pill info">Permanente</span>' : 'Por días') + '</td><td>' + (l.lifetime ? '—' : XF.date(l.expires_at)) + '</td><td>' + ({ purchase: 'Compra', gift: '<span class="pill accent">Regalo</span>', manual: 'Manual' }[l.source] || esc(l.source)) + (l.note ? '<br><small class="dim">' + esc(l.note) + '</small>' : '') + '</td>' +
          '<td>' + (l.center_synced ? '<span class="pill ok">Sincronizada</span>' : '<span class="pill warn" title="' + esc(l.center_message) + '">Pendiente</span>') + '<br><small class="dim">' + esc(l.center_message || '') + '</small></td><td>' + (l.status === 'active' ? '<span class="pill ok">Activa</span>' : l.status === 'expired' ? '<span class="pill warn">Vencida</span>' : '<span class="pill bad">' + esc(l.status) + '</span>') + '</td>' +
          '<td><div class="acts"><button class="btn ghost sm" data-a="lic-extend" data-id="' + l.id + '" title="Añadir días o hacer permanente">' + icon('plus') + '</button><button class="btn ghost sm" data-a="lic-resync" data-id="' + l.id + '" title="Reenviar a X-Flow Center">' + icon('refresh') + '</button>' + (l.status !== 'revoked' ? '<button class="btn danger sm" data-a="lic-revoke" data-id="' + l.id + '" title="Revocar">' + icon('ban') + '</button>' : '') + '</div></td></tr>').join('') + '</tbody></table></div>' : '<div class="empty">' + icon('key') + 'No hay licencias' + (q ? ' con ese filtro' : ' todavía') + '.</div>') + '</div>';
  };
  function giftModal() {
    const opts = A.products.filter((p) => p.type !== 'sample_pack').map((p) => '<option value="' + p.id + '">' + esc(p.name) + (p.type === 'bundle' ? ' (pack)' : '') + '</option>').join('');
    const m = XF.modal('<span class="eyebrow">Regalo</span><h3 class="m-title">Regalar licencia</h3><p class="m-text">Se activa directo en la cuenta de X-Flow Center de cada correo. Si eliges un pack, se regala cada plugin del pack.</p>' +
      '<form id="gift-form" style="display:grid;gap:12px"><label class="field"><span>Correo(s)</span><textarea name="emails" required placeholder="uno@correo.com, otro@correo.com" style="min-height:70px"></textarea><small>Separa varios con coma o salto de línea.</small></label>' +
      '<label class="field"><span>Producto o pack</span><select name="product_id" required>' + opts + '</select></label>' +
      '<div class="fgrid"><label class="field"><span>Tipo</span><select name="plan_type"><option value="lifetime">Permanente</option><option value="days">Por días</option></select></label><label class="field"><span>Días (si es por días)</span><input name="days" type="number" min="1" value="30"></label></div>' +
      '<label class="field"><span>Nota interna (opcional)</span><input name="note" placeholder="Ej: sorteo Instagram"></label>' +
      '<label class="check"><input type="checkbox" name="notify" checked> Avisar por correo al destinatario</label>' +
      '<div class="m-actions"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">' + icon('gift') + 'Regalar</button></div></form>');
    $('#gift-form', m.el).addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target, b = f.querySelector('button.primary');
      b.classList.add('is-busy');
      try {
        const r = await XF.api('admin_license_grant', { emails: f.emails.value, product_id: Number(f.product_id.value), plan_type: f.plan_type.value, days: Number(f.days.value), note: f.note.value, notify: f.notify.checked });
        XF.toast(r.licenses.length + ' licencia(s) regalada(s).', 'success');
        m.close();
        if (A.section === 'licencias') go();
      } catch (err) { XF.toast(err.message, 'error'); } finally { b.classList.remove('is-busy'); }
    });
  }
  function extendModal(id) {
    const m = XF.modal('<h3 class="m-title">Extender licencia</h3><form id="ext-form" style="display:grid;gap:12px"><div class="fgrid"><label class="field"><span>Tipo</span><select name="plan_type"><option value="days">Añadir días</option><option value="lifetime">Hacer permanente</option></select></label><label class="field"><span>Días</span><input name="days" type="number" min="1" value="30"></label></div><div class="m-actions"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Guardar</button></div></form>');
    $('#ext-form', m.el).addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await XF.api('admin_license_extend', { id, plan_type: e.target.plan_type.value, days: Number(e.target.days.value) }); XF.toast('Licencia actualizada.', 'success'); m.close(); go(); } catch (err) { XF.toast(err.message, 'error'); }
    });
  }

  /* ------------------------------------------------------------ productos / packs */
  function productsTable(list, type) {
    if (!list.length) return '<div class="empty">' + icon(type === 'bundle' ? 'layers' : 'plug') + 'Todavía no hay ' + (type === 'bundle' ? 'packs' : 'productos') + '.</div>';
    const stLabel = { published: ['Publicado', 'ok'], draft: ['Borrador', ''], coming_soon: ['Próximamente', 'accent'], hidden: ['Oculto', 'bad'] };
    return '<div class="table-wrap"><table class="tbl"><thead><tr><th></th><th>Nombre</th><th>' + (type === 'bundle' ? 'Incluye' : 'ID Center') + '</th><th>Precios</th><th>Oferta</th><th>Estado</th><th></th></tr></thead><tbody>' +
      list.map((p) => {
        const st = stLabel[p.status] || [p.status, ''];
        const inc = p.type === 'bundle' ? (p.bundle_all ? 'Todos los plugins' : (p.bundle_items || []).map((id) => (A.products.find((x) => x.id === id) || {}).name).filter(Boolean).join(', ') || '—') : '<span class="mono">' + esc(p.center_id || '—') + '</span>';
        return '<tr><td><div class="thumb">' + (p.image ? '<img src="' + esc(XF.asset(p.image)) + '" alt="">' : icon(p.type === 'bundle' ? 'layers' : 'plug')) + '</div></td>' +
          '<td class="name"><b>' + esc(p.name) + '</b><small>/' + esc(p.slug) + '</small>' + (p.badge ? ' <span class="pill grad-bg">' + esc(p.badge) + '</span>' : '') + (p.featured ? ' <span class="pill">Destacado</span>' : '') + '</td>' +
          '<td>' + inc + '</td><td>' + p.plans.map((pl) => esc(pl.label) + ': <b>' + money(pl.price) + '</b>').join('<br>') + '</td>' +
          '<td>' + (p.discount_percent ? '<span class="off">-' + p.discount_percent + '%</span>' + (p.discount_ends_at ? '<br><small class="dim">hasta ' + XF.date(p.discount_ends_at) + '</small>' : '') : '<span class="dim">—</span>') + '</td>' +
          '<td><span class="pill ' + st[1] + '">' + st[0] + '</span></td>' +
          '<td><div class="acts"><a class="btn ghost sm" href="../#/p/' + esc(p.slug) + '" target="_blank" rel="noopener" title="Ver en la tienda">' + icon('eye') + '</a><button class="btn ghost sm" data-a="edit-product" data-id="' + p.id + '">' + icon('edit') + 'Editar</button><button class="btn danger sm" data-a="del-product" data-id="' + p.id + '" title="Eliminar">' + icon('trash') + '</button></div></td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  SECTIONS.productos = async (c) => {
    await loadProducts();
    const list = A.products.filter((p) => p.type === 'plugin' || p.type === 'sample_pack');
    c.innerHTML = '<div class="panel"><div class="panel-head"><h2>' + icon('plug') + 'Plugins</h2><div class="bar-actions"><button class="btn ghost" data-a="import-center">' + icon('download') + 'Importar del Center</button><button class="btn primary" data-a="new-product" data-type="plugin">' + icon('plus') + 'Nuevo plugin</button></div></div>' +
      '<p class="help">Cada plugin necesita su <b>ID en X-Flow Center</b>: es el identificador que la tienda escribe en tu base de datos para activar la licencia. Usa “Importar del Center” para traer los plugins que ya tienes registrados.</p>' + productsTable(list, 'plugin') + '</div>';
  };
  SECTIONS.packs = async (c) => {
    await loadProducts();
    c.innerHTML = '<div class="panel"><div class="panel-head"><h2>' + icon('layers') + 'Packs</h2><button class="btn primary" data-a="new-product" data-type="bundle">' + icon('plus') + 'Nuevo pack</button></div>' +
      '<p class="help">Un pack junta uno o varios plugins a un solo precio, permanente o por suscripción. Con “Todo en uno” incluye todos los plugins, también los que publiques después.</p>' + productsTable(A.products.filter((p) => p.type === 'bundle'), 'bundle') + '</div>';
  };

  const PLAN_PRESETS = {
    lifetime: { id: 'lifetime', label: 'Permanente', type: 'lifetime', days: 0, price: 0 },
    monthly: { id: 'monthly', label: 'Mensual', type: 'days', days: 30, price: 0 },
    yearly: { id: 'yearly', label: 'Anual', type: 'days', days: 365, price: 0 },
    custom: { id: '', label: '', type: 'days', days: 7, price: 0 },
  };
  function planRow(pl) {
    return '<div class="plan-row"><label class="field"><span>Nombre</span><input data-k="label" value="' + esc(pl.label) + '" placeholder="Mensual"></label>' +
      '<label class="field"><span>Tipo</span><select data-k="type"><option value="lifetime"' + (pl.type === 'lifetime' ? ' selected' : '') + '>Permanente</option><option value="days"' + (pl.type === 'days' ? ' selected' : '') + '>Suscripción / días</option></select></label>' +
      '<label class="field"><span>Días</span><input data-k="days" type="number" min="1" value="' + (pl.days || '') + '"' + (pl.type === 'lifetime' ? ' disabled' : '') + '></label>' +
      '<label class="field"><span>Precio</span><input data-k="price" type="number" min="0" step="0.01" value="' + (pl.price ?? '') + '" required></label>' +
      '<label class="field"><span>Antes (tachado)</span><input data-k="compare_at" type="number" min="0" step="0.01" value="' + (pl.compare_at ?? '') + '"></label>' +
      '<label class="field"><span>ID</span><input data-k="id" value="' + esc(pl.id) + '" placeholder="monthly" style="font-family:var(--mono)"></label>' +
      '<label class="field"><span>Nivel (opcional)</span><input data-k="tier" value="' + esc(pl.tier || '') + '" placeholder="gold"></label>' +
      '<button type="button" class="btn danger sm" data-pe="rm" aria-label="Quitar precio">' + icon('trash') + '</button></div>';
  }
  function readPlans(el) {
    return $$('.plan-row', el).map((r) => {
      const v = (k) => { const i = $('[data-k="' + k + '"]', r); return i ? i.value : ''; };
      const type = v('type');
      const days = Number(v('days')) || 30;
      return { id: v('id') || (type === 'lifetime' ? 'lifetime' : 'd' + days), label: v('label') || (type === 'lifetime' ? 'Permanente' : days + ' días'), type, days: type === 'days' ? days : 0, price: Number(v('price')) || 0, compare_at: v('compare_at') === '' ? null : Number(v('compare_at')), tier: v('tier') };
    });
  }

  async function productEditor(p, type) {
    if (!A.products.length) await loadProducts();
    const isNew = !p;
    p = p || { type: type || 'plugin', name: '', slug: '', tagline: '', description: '', features: [], specs: { formats: 'VST3', os: 'Windows 10 / 11 (64-bit)', version: '1.0', size: '' }, image: '', gallery: [], video_url: '', category: '', center_id: '', plans: [Object.assign({}, PLAN_PRESETS.lifetime, { price: 19.99 })], discount_percent: 0, discount_ends_at: null, badge: '', bundle_items: [], bundle_all: false, featured: false, is_new: true, status: 'draft', sort_order: 10 };
    const specs = p.specs || {};
    const isBundle = p.type === 'bundle';
    const pluginsList = A.products.filter((x) => x.type === 'plugin');
    const dt = p.discount_ends_at ? new Date(p.discount_ends_at).toISOString().slice(0, 16) : '';
    const m = XF.modal('<span class="eyebrow">' + (isBundle ? 'Pack' : 'Producto') + '</span><h3 class="m-title">' + (isNew ? 'Nuevo ' + (isBundle ? 'pack' : 'producto') : esc(p.name)) + '</h3>' +
      '<form id="pe" style="display:grid;gap:18px">' +
      '<div class="fgrid"><label class="field"><span>Nombre</span><input name="name" required value="' + esc(p.name) + '"></label>' +
      '<label class="field"><span>Tipo</span><select name="type"><option value="plugin"' + (p.type === 'plugin' ? ' selected' : '') + '>Plugin</option><option value="bundle"' + (p.type === 'bundle' ? ' selected' : '') + '>Pack</option><option value="sample_pack"' + (p.type === 'sample_pack' ? ' selected' : '') + '>Sample pack</option></select></label>' +
      '<label class="field"><span>Estado</span><select name="status">' + [['published', 'Publicado'], ['draft', 'Borrador'], ['coming_soon', 'Próximamente'], ['hidden', 'Oculto']].map((s) => '<option value="' + s[0] + '"' + (p.status === s[0] ? ' selected' : '') + '>' + s[1] + '</option>').join('') + '</select></label>' +
      '<label class="field full"><span>Frase corta</span><input name="tagline" value="' + esc(p.tagline) + '" placeholder="Lo que hace en una línea"></label>' +
      '<label class="field"><span>Categoría</span><input name="category" value="' + esc(p.category) + '" list="cats" placeholder="Mezcla"></label>' +
      '<label class="field"><span>Etiqueta</span><input name="badge" value="' + esc(p.badge) + '" placeholder="NUEVO, MÁS VENDIDO…"></label>' +
      '<label class="field"><span>Orden</span><input name="sort_order" type="number" value="' + (p.sort_order || 0) + '"></label>' +
      '<label class="field"><span>URL (slug)</span><input name="slug" value="' + esc(p.slug) + '" placeholder="se genera solo"></label></div>' +
      '<datalist id="cats">' + Array.from(new Set(A.products.map((x) => x.category).filter(Boolean))).map((c) => '<option value="' + esc(c) + '">').join('') + '</datalist>' +

      '<div class="panel" style="margin:0" id="center-box"><h2 style="font-size:1rem">' + icon('database') + 'Activación en X-Flow Center</h2>' +
      '<label class="field"><span>ID del plugin en X-Flow Center</span><input name="center_id" list="center-ids" value="' + esc(p.center_id) + '" placeholder="ej: channelstrip" style="font-family:var(--mono)"><small>Debe coincidir con el identificador que usa tu base de datos del Center.' + (isBundle ? ' En packs no hace falta: se activa cada plugin incluido.' : '') + '</small></label><datalist id="center-ids"></datalist></div>' +

      '<div class="panel" style="margin:0"><div class="panel-head" style="margin-bottom:10px"><h2 style="font-size:1rem">' + icon('tag') + 'Precios</h2><div class="bar-actions"><button type="button" class="btn ghost sm" data-pe="add" data-p="lifetime">+ Permanente</button><button type="button" class="btn ghost sm" data-pe="add" data-p="monthly">+ Mensual</button><button type="button" class="btn ghost sm" data-pe="add" data-p="yearly">+ Anual</button><button type="button" class="btn ghost sm" data-pe="add" data-p="custom">+ Otro</button></div></div>' +
      '<div class="plan-rows" id="plan-rows">' + p.plans.map(planRow).join('') + '</div>' +
      '<div class="fgrid" style="margin-top:14px"><label class="field"><span>Descuento propio %</span><input name="discount_percent" type="number" min="0" max="100" value="' + (p.discount_percent || 0) + '"></label><label class="field"><span>Descuento hasta</span><input name="discount_ends_at" type="datetime-local" value="' + dt + '"></label></div></div>' +

      '<div class="panel" style="margin:0" id="bundle-box"' + (isBundle ? '' : ' hidden') + '><h2 style="font-size:1rem">' + icon('layers') + 'Contenido del pack</h2>' +
      '<label class="switch" style="margin-bottom:12px"><input type="checkbox" name="bundle_all"' + (p.bundle_all ? ' checked' : '') + '> Todo en uno: incluir todos los plugins (también los futuros)</label>' +
      '<div class="pick-list" id="bundle-items">' + pluginsList.map((x) => '<label><input type="checkbox" value="' + x.id + '"' + ((p.bundle_items || []).includes(x.id) ? ' checked' : '') + '>' + esc(x.name) + '</label>').join('') + '</div></div>' +

      '<div class="panel" style="margin:0"><h2 style="font-size:1rem">' + icon('image') + 'Imágenes y video</h2><div class="img-field"><div class="img-prev" id="img-prev">' + (p.image ? '<img src="' + esc(XF.asset(p.image)) + '" alt="">' : icon('image')) + '</div><div style="flex:1;display:grid;gap:8px"><label class="field"><span>Imagen principal (URL)</span><input name="image" value="' + esc(p.image) + '" placeholder="assets/img/plugins/mi-plugin.png o https://…"></label><label class="btn ghost sm" style="justify-self:start">' + icon('upload') + 'Subir imagen<input type="file" accept="image/*" id="img-up" hidden></label></div></div>' +
      '<div class="fgrid" style="margin-top:12px"><label class="field full"><span>Galería (una URL por línea)</span><textarea name="gallery" style="min-height:70px">' + esc((p.gallery || []).join('\n')) + '</textarea></label><label class="field full"><span>Video de YouTube (opcional)</span><input name="video_url" value="' + esc(p.video_url) + '" placeholder="https://youtube.com/watch?v=…"></label></div></div>' +

      '<div class="fgrid"><label class="field full"><span>Descripción</span><textarea name="description" style="min-height:130px">' + esc(p.description) + '</textarea></label>' +
      '<label class="field full"><span>Características (una por línea)</span><textarea name="features">' + esc((p.features || []).join('\n')) + '</textarea></label>' +
      '<label class="field"><span>Formato</span><input name="spec_formats" value="' + esc(specs.formats || '') + '"></label><label class="field"><span>Sistema</span><input name="spec_os" value="' + esc(specs.os || '') + '"></label><label class="field"><span>Versión</span><input name="spec_version" value="' + esc(specs.version || '') + '"></label><label class="field"><span>Tamaño</span><input name="spec_size" value="' + esc(specs.size || '') + '"></label></div>' +
      '<div class="bar-actions"><label class="switch"><input type="checkbox" name="featured"' + (p.featured ? ' checked' : '') + '> Destacado (portada)</label><label class="switch"><input type="checkbox" name="is_new"' + (p.is_new ? ' checked' : '') + '> Marcar como nuevo</label></div>' +
      '<div class="m-actions"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">' + icon('save') + 'Guardar</button></div></form>', { wide: true });

    const form = $('#pe', m.el);
    const syncType = () => { const t = form.type.value; $('#bundle-box', m.el).hidden = t !== 'bundle'; };
    form.type.addEventListener('change', syncType);
    // IDs sugeridos desde X-Flow Center
    (async () => {
      try {
        if (!A.centerPlugins) A.centerPlugins = (await XF.api('admin_center_plugins')).plugins;
        $('#center-ids', m.el).innerHTML = A.centerPlugins.map((cp) => '<option value="' + esc(cp.id) + '">' + esc(cp.name) + '</option>').join('');
      } catch (e) {}
    })();
    form.image.addEventListener('input', () => { $('#img-prev', m.el).innerHTML = form.image.value ? '<img src="' + esc(XF.asset(form.image.value)) + '" alt="">' : icon('image'); });
    $('#img-up', m.el).addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const fd = new FormData();
      fd.append('file', file);
      try {
        const r = await XF.api('admin_upload', null, { form: fd });
        form.image.value = r.url;
        form.image.dispatchEvent(new Event('input'));
        XF.toast('Imagen subida.', 'success');
      } catch (err) { XF.toast(err.message, 'error'); }
    });
    m.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pe]');
      if (!b) return;
      if (b.dataset.pe === 'rm') b.closest('.plan-row').remove();
      if (b.dataset.pe === 'add') {
        const pre = Object.assign({}, PLAN_PRESETS[b.dataset.p]);
        const used = readPlans(m.el).map((x) => x.id);
        if (pre.id && used.includes(pre.id)) { XF.toast('Ese precio ya existe.', 'error'); return; }
        $('#plan-rows', m.el).insertAdjacentHTML('beforeend', planRow(pre));
      }
    });
    m.el.addEventListener('change', (e) => {
      if (e.target.dataset.k === 'type') { const d = $('[data-k="days"]', e.target.closest('.plan-row')); d.disabled = e.target.value === 'lifetime'; if (!d.value) d.value = 30; }
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = form;
      const data = {
        id: p.id || 0, type: f.type.value, status: f.status.value, name: f.name.value, slug: f.slug.value, tagline: f.tagline.value, category: f.category.value, badge: f.badge.value,
        sort_order: Number(f.sort_order.value) || 0, center_id: f.center_id.value.trim(), plans: readPlans(m.el), discount_percent: Number(f.discount_percent.value) || 0,
        discount_ends_at: f.discount_ends_at.value ? new Date(f.discount_ends_at.value).toISOString() : '', bundle_all: f.bundle_all.checked,
        bundle_items: $$('#bundle-items input:checked', m.el).map((i) => Number(i.value)), image: f.image.value.trim(),
        gallery: f.gallery.value.split('\n').map((s) => s.trim()).filter(Boolean), video_url: f.video_url.value.trim(), description: f.description.value,
        features: f.features.value.split('\n').map((s) => s.trim()).filter(Boolean),
        specs: { formats: f.spec_formats.value, os: f.spec_os.value, version: f.spec_version.value, size: f.spec_size.value },
        featured: f.featured.checked, is_new: f.is_new.checked,
      };
      if (data.type === 'bundle' && !data.bundle_all && !data.bundle_items.length) { XF.toast('Elige los plugins del pack o activa “Todo en uno”.', 'error'); return; }
      const b = f.querySelector('button.primary');
      b.classList.add('is-busy');
      try {
        await XF.api('admin_product_save', { product: data });
        XF.toast('Guardado.', 'success');
        m.close();
        go();
      } catch (err) { XF.toast(err.message, 'error'); } finally { b.classList.remove('is-busy'); }
    });
  }

  /* ------------------------------------------------------------ ofertas y cupones */
  SECTIONS.ofertas = async (c) => {
    await Promise.all([loadProducts(), loadSettings()]);
    const coupons = (await XF.api('admin_coupons')).coupons;
    const sale = A.settings.sale || {};
    const ends = sale.ends_at ? new Date(sale.ends_at).toISOString().slice(0, 16) : '';
    const pickable = A.products.filter((p) => p.type !== 'sample_pack');
    c.innerHTML = '<div class="cols half"><form class="panel" id="sale-form"><h2>' + icon('flame') + 'Oferta general</h2><p class="help">Aplica un % de descuento a toda la tienda (o a una parte) con cuenta regresiva en la barra superior.</p>' +
      '<label class="switch" style="margin-bottom:14px"><input type="checkbox" name="active"' + (sale.active ? ' checked' : '') + '> Oferta activa</label>' +
      '<div class="fgrid"><label class="field full"><span>Título</span><input name="title" value="' + esc(sale.title || '') + '" placeholder="BLACK FRIDAY"></label>' +
      '<label class="field"><span>Descuento %</span><input name="percent" type="number" min="1" max="90" value="' + (sale.percent || 20) + '"></label>' +
      '<label class="field"><span>Termina</span><input name="ends_at" type="datetime-local" value="' + ends + '"></label>' +
      '<label class="field full"><span>Aplica a</span><select name="applies_to">' + [['all', 'Todo'], ['plugins', 'Solo plugins'], ['bundles', 'Solo packs'], ['selected', 'Productos elegidos']].map((o) => '<option value="' + o[0] + '"' + (sale.applies_to === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></label></div>' +
      '<div class="pick-list" id="sale-items" style="margin-top:12px"' + (sale.applies_to === 'selected' ? '' : ' hidden') + '>' + pickable.map((p) => '<label><input type="checkbox" value="' + p.id + '"' + ((sale.product_ids || []).includes(p.id) ? ' checked' : '') + '>' + esc(p.name) + '</label>').join('') + '</div>' +
      '<div class="save-bar" style="position:static"><button class="btn primary">' + icon('save') + 'Guardar oferta</button></div></form>' +
      '<div class="panel"><div class="panel-head"><h2>' + icon('tag') + 'Cupones</h2><button class="btn primary sm" data-a="coupon">' + icon('plus') + 'Nuevo cupón</button></div>' +
      (coupons.length ? '<div class="table-wrap"><table class="tbl"><thead><tr><th>Código</th><th>Descuento</th><th>Usos</th><th>Vence</th><th>Estado</th><th></th></tr></thead><tbody>' + coupons.map((cp) => '<tr><td class="mono"><b>' + esc(cp.code) + '</b></td><td>' + (cp.kind === 'percent' ? cp.value + '%' : money(cp.value)) + (cp.product_ids && cp.product_ids.length ? '<br><small class="dim">' + cp.product_ids.length + ' producto(s)</small>' : '') + '</td><td>' + cp.used + (cp.max_uses != null ? ' / ' + cp.max_uses : '') + '</td><td>' + (cp.expires_at ? XF.date(cp.expires_at) : '—') + '</td><td>' + (cp.active ? '<span class="pill ok">Activo</span>' : '<span class="pill">Inactivo</span>') + '</td><td><div class="acts"><button class="btn ghost sm" data-a="coupon" data-id="' + cp.id + '">' + icon('edit') + '</button><button class="btn danger sm" data-a="coupon-del" data-id="' + cp.id + '">' + icon('trash') + '</button></div></td></tr>').join('') + '</tbody></table></div>' : '<div class="empty">' + icon('tag') + 'Sin cupones.</div>') + '</div></div>' +
      '<div class="panel"><h2>' + icon('percent') + 'Descuento por producto</h2><p class="help">Descuento propio de cada producto (se usa el mayor entre este y la oferta general).</p><div class="table-wrap"><table class="tbl"><thead><tr><th>Producto</th><th>Precio base</th><th>Descuento %</th><th>Hasta</th><th></th></tr></thead><tbody>' +
      pickable.map((p) => '<tr data-pid="' + p.id + '"><td>' + esc(p.name) + '</td><td>' + money((p.plans[0] || {}).price || 0) + '</td><td><input class="input" type="number" min="0" max="100" value="' + (p.discount_percent || 0) + '" data-k="pct" style="width:90px"></td><td><input class="input" type="datetime-local" value="' + (p.discount_ends_at ? new Date(p.discount_ends_at).toISOString().slice(0, 16) : '') + '" data-k="ends" style="width:auto"></td><td><button class="btn ghost sm" data-a="quick-discount" data-id="' + p.id + '">' + icon('save') + 'Guardar</button></td></tr>').join('') + '</tbody></table></div></div>';
    $('#sale-form').applies_to.addEventListener('change', (e) => { $('#sale-items').hidden = e.target.value !== 'selected'; });
    $('#sale-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        await XF.api('admin_settings_save', { section: 'sale', value: { active: f.active.checked, title: f.title.value, percent: Number(f.percent.value), ends_at: f.ends_at.value ? new Date(f.ends_at.value).toISOString() : '', applies_to: f.applies_to.value, product_ids: $$('#sale-items input:checked').map((i) => Number(i.value)) } });
        XF.toast('Oferta guardada.', 'success');
      } catch (err) { XF.toast(err.message, 'error'); }
    });
  };
  function couponModal(cp) {
    cp = cp || { code: '', kind: 'percent', value: 10, product_ids: [], min_total: 0, max_uses: null, starts_at: null, expires_at: null, active: true };
    const toLocal = (v) => v ? new Date(v).toISOString().slice(0, 16) : '';
    const m = XF.modal('<h3 class="m-title">' + (cp.id ? 'Editar cupón' : 'Nuevo cupón') + '</h3><form id="cp-form" style="display:grid;gap:12px"><div class="fgrid">' +
      '<label class="field"><span>Código</span><input name="code" required value="' + esc(cp.code) + '" placeholder="VERANO25" style="text-transform:uppercase;font-family:var(--mono)"></label>' +
      '<label class="field"><span>Tipo</span><select name="kind"><option value="percent"' + (cp.kind === 'percent' ? ' selected' : '') + '>Porcentaje</option><option value="fixed"' + (cp.kind === 'fixed' ? ' selected' : '') + '>Monto fijo</option></select></label>' +
      '<label class="field"><span>Valor</span><input name="value" type="number" min="0" step="0.01" value="' + cp.value + '"></label>' +
      '<label class="field"><span>Compra mínima</span><input name="min_total" type="number" min="0" step="0.01" value="' + (cp.min_total || 0) + '"></label>' +
      '<label class="field"><span>Máx. usos</span><input name="max_uses" type="number" min="0" value="' + (cp.max_uses ?? '') + '" placeholder="ilimitado"></label>' +
      '<label class="field"><span>Desde</span><input name="starts_at" type="datetime-local" value="' + toLocal(cp.starts_at) + '"></label>' +
      '<label class="field"><span>Hasta</span><input name="expires_at" type="datetime-local" value="' + toLocal(cp.expires_at) + '"></label></div>' +
      '<div class="label">Solo para estos productos (vacío = todos)</div><div class="pick-list">' + A.products.filter((p) => p.type !== 'sample_pack').map((p) => '<label><input type="checkbox" value="' + p.id + '"' + ((cp.product_ids || []).includes(p.id) ? ' checked' : '') + '>' + esc(p.name) + '</label>').join('') + '</div>' +
      '<label class="switch"><input type="checkbox" name="active"' + (cp.active ? ' checked' : '') + '> Activo</label>' +
      '<div class="m-actions"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Guardar</button></div></form>', { wide: true });
    $('#cp-form', m.el).addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        await XF.api('admin_coupon_save', { coupon: { id: cp.id || 0, code: f.code.value, kind: f.kind.value, value: Number(f.value.value), min_total: Number(f.min_total.value) || 0, max_uses: f.max_uses.value, starts_at: f.starts_at.value ? new Date(f.starts_at.value).toISOString() : '', expires_at: f.expires_at.value ? new Date(f.expires_at.value).toISOString() : '', active: f.active.checked, product_ids: $$('.pick-list input:checked', m.el).map((i) => Number(i.value)) } });
        XF.toast('Cupón guardado.', 'success'); m.close(); go();
      } catch (err) { XF.toast(err.message, 'error'); }
    });
  }

  /* ------------------------------------------------------------ pagos */
  SECTIONS.pagos = async (c) => {
    const s = await loadSettings();
    const p = s.payments, locked = p._locked || [];
    const secret = (name, path, val, ph) => '<label class="field"><span>' + name + (locked.includes(path) ? ' <em class="soon">config.php</em>' : '') + '</span><input name="' + path + '" type="password" autocomplete="off" value="' + esc(val || '') + '" placeholder="' + esc(ph || '') + '"' + (locked.includes(path) ? ' disabled' : '') + '></label>';
    const hook = (url) => '<div class="field"><span>URL del webhook</span><div class="copy-field"><input class="input" readonly value="' + esc(url) + '"><button type="button" class="btn ghost sm" data-a="copy" data-v="' + esc(url) + '">' + icon('copy') + '</button></div></div>';
    c.innerHTML = '<form id="pay-form"><div class="panel"><h2>' + icon('wallet') + 'Métodos de pago</h2><p class="help">Activa los métodos que quieras mostrar en el checkout. Las claves secretas se guardan en el servidor y nunca llegan al navegador del cliente. Si las pones en <span class="mono">api/config.php</span> tienen prioridad.</p>' +
      '<div class="fgrid" style="max-width:420px"><label class="field"><span>Moneda de la tienda</span><select name="currency">' + ['USD', 'EUR', 'MXN', 'COP', 'ARS', 'CLP', 'PEN'].map((cur) => '<option' + (A.currency === cur ? ' selected' : '') + '>' + cur + '</option>').join('') + '</select><small>PayPal y Stripe cobran en esta moneda. Binance Pay cobra en cripto (1 USD ≈ 1 USDT).</small></label></div></div>' +

      '<div class="method-card"><header><b>' + icon('wallet') + 'PayPal Checkout</b><label class="switch"><input type="checkbox" name="paypal.enabled"' + (p.paypal.enabled ? ' checked' : '') + '> Activo</label></header><div class="fgrid">' +
      '<label class="field"><span>Modo</span><select name="paypal.mode"><option value="sandbox"' + (p.paypal.mode === 'sandbox' ? ' selected' : '') + '>Sandbox (pruebas)</option><option value="live"' + (p.paypal.mode === 'live' ? ' selected' : '') + '>Live (real)</option></select></label>' +
      '<label class="field"><span>Client ID</span><input name="paypal.client_id" value="' + esc(p.paypal.client_id) + '" autocomplete="off"></label>' + secret('Secret', 'paypal.secret', p.paypal.secret) + secret('Webhook ID (opcional)', 'paypal.webhook_id', p.paypal.webhook_id) +
      '<div class="full">' + hook(s.webhooks.paypal) + '</div></div><p class="dim" style="font-size:.8rem;margin:10px 0 0">Crea la app en developer.paypal.com → Apps & Credentials. El cobro se confirma al instante aunque no configures el webhook.</p></div>' +

      '<div class="method-card"><header><b>' + icon('card') + 'Tarjeta (Stripe Checkout)</b><label class="switch"><input type="checkbox" name="stripe.enabled"' + (p.stripe.enabled ? ' checked' : '') + '> Activo</label></header><div class="fgrid">' +
      secret('Secret key (sk_…)', 'stripe.secret_key', p.stripe.secret_key, 'sk_live_…') + secret('Webhook signing secret (whsec_…)', 'stripe.webhook_secret', p.stripe.webhook_secret, 'whsec_…') +
      '<div class="full">' + hook(s.webhooks.stripe) + '</div></div><p class="dim" style="font-size:.8rem;margin:10px 0 0">Evento del webhook: checkout.session.completed. Si no hay webhook, se confirma cuando el cliente vuelve a la tienda.</p></div>' +

      '<div class="method-card"><header><b>' + icon('coins') + 'Binance Pay (automático)</b><label class="switch"><input type="checkbox" name="binance.enabled"' + (p.binance.enabled ? ' checked' : '') + '> Activo</label></header><div class="fgrid">' +
      secret('API Key', 'binance.api_key', p.binance.api_key) + secret('Secret Key', 'binance.secret_key', p.binance.secret_key) +
      '<label class="field"><span>Cripto de cobro</span><select name="binance.currency">' + ['USDT', 'USDC', 'BUSD', 'BTC', 'BNB'].map((x) => '<option' + (p.binance.currency === x ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></label>' +
      '<div class="full">' + hook(s.webhooks.binance) + '</div></div><p class="dim" style="font-size:.8rem;margin:10px 0 0">Requiere cuenta Binance Pay Merchant. Si solo tienes Binance personal, usa el método manual de abajo.</p></div>' +

      '<div class="panel" style="margin-top:14px"><div class="panel-head"><h2>' + icon('bank') + 'Métodos manuales</h2><button type="button" class="btn ghost sm" data-a="add-manual">' + icon('plus') + 'Añadir método</button></div><p class="help">Transferencia, pago móvil, Zelle, Binance personal, Nequi… El cliente envía la referencia y tú apruebas el pedido en <b>Pedidos</b>.</p><div class="list-editor" id="manual-list">' + (p.manual || []).map(manualItem).join('') + '</div></div>' +
      '<div class="save-bar"><button class="btn primary lg">' + icon('save') + 'Guardar métodos de pago</button></div></form>';
    $('#pay-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const val = (n) => { const el = f.elements[n]; return el ? (el.type === 'checkbox' ? el.checked : el.value) : ''; };
      const payments = {
        paypal: { enabled: val('paypal.enabled'), mode: val('paypal.mode'), client_id: val('paypal.client_id').trim(), secret: val('paypal.secret'), webhook_id: val('paypal.webhook_id') },
        stripe: { enabled: val('stripe.enabled'), publishable_key: '', secret_key: val('stripe.secret_key'), webhook_secret: val('stripe.webhook_secret') },
        binance: { enabled: val('binance.enabled'), api_key: val('binance.api_key'), secret_key: val('binance.secret_key'), currency: val('binance.currency') },
        manual: $$('#manual-list .list-item').map((it) => ({ id: $('[data-k=id]', it).value, name: $('[data-k=name]', it).value, enabled: $('[data-k=enabled]', it).checked, instructions: $('[data-k=instructions]', it).value, account: $('[data-k=account]', it).value })),
      };
      const b = f.querySelector('.save-bar button');
      b.classList.add('is-busy');
      try {
        await XF.api('admin_settings_save', { section: 'payments', value: payments });
        if (val('currency') !== A.currency) {
          const site = Object.assign({}, A.settings.site, { currency: val('currency') });
          delete site._locked;
          await XF.api('admin_settings_save', { section: 'site', value: site });
        }
        XF.toast('Métodos de pago guardados.', 'success');
        go();
      } catch (err) { XF.toast(err.message, 'error'); } finally { b.classList.remove('is-busy'); }
    });
  };
  function manualItem(m) {
    m = m || { id: '', name: '', enabled: true, instructions: '', account: '' };
    return '<div class="list-item"><button type="button" class="btn danger sm rm" data-a="rm-item">' + icon('trash') + '</button><div class="fgrid"><label class="field"><span>Nombre visible</span><input data-k="name" value="' + esc(m.name) + '" placeholder="Zelle"></label><label class="field"><span>ID interno</span><input data-k="id" value="' + esc(m.id) + '" placeholder="zelle" style="font-family:var(--mono)"></label><label class="switch" style="align-self:end"><input type="checkbox" data-k="enabled"' + (m.enabled ? ' checked' : '') + '> Activo</label>' +
      '<label class="field full"><span>Instrucciones para el cliente</span><textarea data-k="instructions" style="min-height:60px">' + esc(m.instructions) + '</textarea></label><label class="field full"><span>Datos de la cuenta</span><textarea data-k="account" style="min-height:60px">' + esc(m.account) + '</textarea></label></div></div>';
  }

  /* ------------------------------------------------------------ X-Flow Center */
  SECTIONS.center = async (c) => {
    const s = await loadSettings();
    const ce = s.center, d = ce.db || {}, locked = ce._locked || [];
    const inp = (name, key, ph, help) => '<label class="field"><span>' + name + '</span><input name="db.' + key + '" value="' + esc(d[key] || '') + '" placeholder="' + esc(ph || '') + '" style="font-family:var(--mono)">' + (help ? '<small>' + help + '</small>' : '') + '</label>';
    c.innerHTML = '<form id="center-form"><div class="panel"><h2>' + icon('database') + 'Conexión con X-Flow Center</h2><p class="help">La base de datos del Center <b>ya existe</b>: la tienda no crea ni modifica sus tablas. Solo inserta o actualiza filas en la tabla de licencias que indiques aquí, para que cada compra aparezca activada en la app.</p>' +
      '<div class="fgrid" style="max-width:520px"><label class="field"><span>Modo</span><select name="mode"><option value="db"' + (ce.mode === 'db' ? ' selected' : '') + '>Directo a la base de datos (recomendado)</option><option value="http"' + (ce.mode === 'http' ? ' selected' : '') + '>Endpoint HTTP del Center</option><option value="none"' + (ce.mode === 'none' ? ' selected' : '') + '>Manual (no escribir en el Center)</option></select></label></div></div>' +
      '<div class="cols two"><div class="panel" id="db-box"><h2>' + icon('key') + 'Tabla de licencias</h2><div class="fgrid">' +
      inp('Tabla', 'table', 'licencias') + inp('Columna correo', 'col_email', 'email') + inp('Columna plugin', 'col_product', 'plugin', 'Aquí se guarda el “ID en X-Flow Center” de cada producto.') + inp('Columna nombre del plugin (opcional)', 'col_product_name', 'nombre_plugin') +
      '<label class="field"><span>Cómo guarda la duración</span><select name="db.expiry_mode"><option value="datetime"' + (d.expiry_mode === 'datetime' ? ' selected' : '') + '>Fecha de vencimiento</option><option value="days"' + (d.expiry_mode === 'days' ? ' selected' : '') + '>Número de días</option><option value="none"' + (d.expiry_mode === 'none' ? ' selected' : '') + '>No guarda duración</option></select></label>' +
      inp('Columna vencimiento / días', 'col_expiry', 'fecha_expiracion') + inp('Valor para permanente', 'lifetime_value', 'vacío = NULL', 'Para fecha: vacío guarda NULL. Para días: p. ej. PERMANENTE.') +
      inp('Columna estado (opcional)', 'col_status', 'estado') + inp('Valor estado activo', 'status_active', 'activo') + inp('Valor estado permanente', 'status_lifetime', 'permanente') +
      inp('Columna nivel/plan (opcional)', 'col_tier', 'plan') + inp('Columna fecha de alta (opcional)', 'col_created', 'fecha_creacion') + '</div></div>' +
      '<div class="panel"><div class="panel-head"><h2>' + icon('search') + 'Tablas detectadas</h2><button type="button" class="btn ghost sm" data-a="describe">' + icon('refresh') + 'Leer estructura</button></div><p class="help">Lee (solo lectura) las tablas y columnas de tu base de datos para rellenar el mapeo.</p><div class="tables-list" id="tables"></div></div></div>' +
      '<div class="panel" id="http-box"><h2>' + icon('globe') + 'Endpoint HTTP</h2><p class="help">La tienda envía un POST JSON firmado con HMAC-SHA256 (cabecera <span class="mono">X-XFlow-Signature</span>) con: email, product_id, lifetime, days, expires_at, tier, order_id. Tienes un receptor de ejemplo en <span class="mono">api/center_receiver_example.php</span>.</p><div class="fgrid"><label class="field"><span>URL</span><input name="http.url" value="' + esc((ce.http || {}).url || '') + '" placeholder="https://xflowbeats.online/store_hook.php"></label>' +
      '<label class="field"><span>Secreto compartido' + (locked.includes('http.secret') ? ' <em class="soon">config.php</em>' : '') + '</span><input name="http.secret" type="password" value="' + esc((ce.http || {}).secret || '') + '"' + (locked.includes('http.secret') ? ' disabled' : '') + '></label></div></div>' +
      '<div class="save-bar"><button type="button" class="btn ghost lg" data-a="center-test">' + icon('activity') + 'Probar conexión</button><button class="btn primary lg">' + icon('save') + 'Guardar</button></div></form>';
    const f = $('#center-form');
    const sync = () => { $('#db-box').style.display = f.mode.value === 'db' ? '' : 'none'; $('#http-box').style.display = f.mode.value === 'http' ? '' : 'none'; };
    f.mode.addEventListener('change', sync);
    sync();
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await saveCenter(); XF.toast('Conexión guardada.', 'success'); } catch (err) { XF.toast(err.message, 'error'); }
    });
  };
  function saveCenter() {
    const f = $('#center-form');
    const v = (n) => (f.elements[n] ? f.elements[n].value.trim() : '');
    const db = {};
    ['table', 'col_email', 'col_product', 'col_product_name', 'expiry_mode', 'col_expiry', 'lifetime_value', 'col_status', 'status_active', 'status_lifetime', 'col_tier', 'col_created'].forEach((k) => { db[k] = v('db.' + k); });
    return XF.api('admin_settings_save', { section: 'center', value: { mode: f.mode.value, db, http: { url: v('http.url'), secret: f.elements['http.secret'].value } } });
  }

  /* ------------------------------------------------------------ apariencia */
  SECTIONS.apariencia = async (c) => {
    const s = await loadSettings();
    const site = s.site, col = site.colors || {}, so = site.socials || {}, an = site.announcement || {};
    const color = (k, label) => '<label class="field"><span>' + label + '</span><div style="display:flex;gap:8px"><input type="color" name="c.' + k + '" value="' + esc(col[k] || '#000000') + '" style="width:52px;height:44px;padding:4px"><input class="input mono" data-mirror="c.' + k + '" value="' + esc(col[k] || '') + '"></div></label>';
    c.innerHTML = '<form id="site-form"><div class="cols half"><div class="panel"><h2>' + icon('home') + 'Portada</h2><div class="fgrid">' +
      '<label class="field full"><span>Nombre de la tienda</span><input name="name" value="' + esc(site.name) + '"></label>' +
      '<label class="field full"><span>Logo (URL, opcional)</span><input name="logo_url" value="' + esc(site.logo_url) + '" placeholder="Vacío = logo X por defecto"></label>' +
      '<label class="field full"><span>Etiqueta superior</span><input name="hero_eyebrow" value="' + esc(site.hero_eyebrow) + '"></label>' +
      '<label class="field full"><span>Título (admite &lt;br&gt; y &lt;span class="grad"&gt;)</span><input name="hero_title" value="' + esc(site.hero_title) + '"></label>' +
      '<label class="field full"><span>Subtítulo</span><textarea name="hero_subtitle" style="min-height:70px">' + esc(site.hero_subtitle) + '</textarea></label>' +
      '<label class="field full"><span>Cinta de texto (separado por comas)</span><input name="ticker" value="' + esc((site.ticker || []).join(', ')) + '"></label></div></div>' +
      '<div class="panel"><h2>' + icon('sliders') + 'Colores y secciones</h2><div class="fgrid">' + color('primary', 'Principal') + color('secondary', 'Secundario') + color('accent', 'Acento') + color('bg', 'Fondo') + '</div>' +
      '<div style="display:grid;gap:12px;margin-top:18px"><label class="switch"><input type="checkbox" name="sample_packs_enabled"' + (site.sample_packs_enabled ? ' checked' : '') + '> Sección Sample Packs activada <span class="dim" style="font-size:.8rem">(apagada = aparece como “Próximamente”)</span></label>' +
      '<label class="switch"><input type="checkbox" name="an_active"' + (an.active ? ' checked' : '') + '> Barra de anuncio superior</label>' +
      '<div class="fgrid"><label class="field"><span>Texto del anuncio</span><input name="an_text" value="' + esc(an.text || '') + '"></label><label class="field"><span>Enlace</span><input name="an_link" value="' + esc(an.link || '') + '" placeholder="#/plugins"></label></div>' +
      '<label class="field"><span>Descarga de X-Flow Center</span><input name="center_download_url" value="' + esc(site.center_download_url) + '"></label>' +
      '<label class="field"><span>Correo de soporte</span><input name="support_email" value="' + esc(site.support_email) + '"></label></div></div></div>' +
      '<div class="panel"><h2>' + icon('globe') + 'Redes</h2><div class="fgrid">' + ['instagram', 'youtube', 'tiktok', 'discord'].map((k) => '<label class="field"><span>' + k + '</span><input name="so.' + k + '" value="' + esc(so[k] || '') + '" placeholder="https://…"></label>').join('') + '</div></div>' +
      '<div class="cols half"><div class="panel"><div class="panel-head"><h2>' + icon('info') + 'Preguntas frecuentes</h2><button type="button" class="btn ghost sm" data-a="add-faq">' + icon('plus') + 'Añadir</button></div><div class="list-editor" id="faq-list">' + (site.faq || []).map(faqItem).join('') + '</div></div>' +
      '<div class="panel"><div class="panel-head"><h2>' + icon('star') + 'Testimonios</h2><button type="button" class="btn ghost sm" data-a="add-testi">' + icon('plus') + 'Añadir</button></div><div class="list-editor" id="testi-list">' + (site.testimonials || []).map(testiItem).join('') + '</div></div></div>' +
      '<div class="save-bar"><a class="btn ghost lg" href="../" target="_blank" rel="noopener">' + icon('eye') + 'Ver tienda</a><button class="btn primary lg">' + icon('save') + 'Guardar cambios</button></div></form>';
    const f = $('#site-form');
    f.addEventListener('input', (e) => {
      if (e.target.type === 'color') { const mir = $('[data-mirror="' + e.target.name + '"]', f); if (mir) mir.value = e.target.value; }
      if (e.target.dataset.mirror && /^#[0-9a-f]{6}$/i.test(e.target.value)) f.elements[e.target.dataset.mirror].value = e.target.value;
    });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = (n) => f.elements[n].value;
      const value = Object.assign({}, site, {
        name: v('name'), logo_url: v('logo_url').trim(), hero_eyebrow: v('hero_eyebrow'), hero_title: v('hero_title'), hero_subtitle: v('hero_subtitle'),
        ticker: v('ticker').split(',').map((x) => x.trim()).filter(Boolean),
        colors: { primary: v('c.primary'), secondary: v('c.secondary'), accent: v('c.accent'), bg: v('c.bg'), panel: (site.colors || {}).panel || '#140e18' },
        sample_packs_enabled: f.sample_packs_enabled.checked,
        announcement: { active: f.an_active.checked, text: v('an_text'), link: v('an_link') },
        center_download_url: v('center_download_url').trim(), support_email: v('support_email').trim(),
        socials: { instagram: v('so.instagram').trim(), youtube: v('so.youtube').trim(), tiktok: v('so.tiktok').trim(), discord: v('so.discord').trim() },
        faq: $$('#faq-list .list-item').map((it) => ({ q: $('[data-k=q]', it).value, a: $('[data-k=a]', it).value })).filter((x) => x.q),
        testimonials: $$('#testi-list .list-item').map((it) => ({ name: $('[data-k=name]', it).value, role: $('[data-k=role]', it).value, text: $('[data-k=text]', it).value, rating: Number($('[data-k=rating]', it).value) || 5 })).filter((x) => x.text),
      });
      delete value._locked;
      try { await XF.api('admin_settings_save', { section: 'site', value }); XF.toast('Apariencia guardada.', 'success'); } catch (err) { XF.toast(err.message, 'error'); }
    });
  };
  const faqItem = (x) => { x = x || { q: '', a: '' }; return '<div class="list-item"><button type="button" class="btn danger sm rm" data-a="rm-item">' + icon('trash') + '</button><label class="field"><span>Pregunta</span><input data-k="q" value="' + esc(x.q) + '"></label><label class="field"><span>Respuesta</span><textarea data-k="a" style="min-height:60px">' + esc(x.a) + '</textarea></label></div>'; };
  const testiItem = (x) => { x = x || { name: '', role: '', text: '', rating: 5 }; return '<div class="list-item"><button type="button" class="btn danger sm rm" data-a="rm-item">' + icon('trash') + '</button><div class="fgrid"><label class="field"><span>Nombre</span><input data-k="name" value="' + esc(x.name) + '"></label><label class="field"><span>Rol</span><input data-k="role" value="' + esc(x.role) + '"></label><label class="field"><span>Estrellas</span><input data-k="rating" type="number" min="1" max="5" value="' + (x.rating || 5) + '"></label></div><label class="field"><span>Texto</span><textarea data-k="text" style="min-height:60px">' + esc(x.text) + '</textarea></label></div>'; };

  /* ------------------------------------------------------------ suscriptores / registro */
  SECTIONS.suscriptores = async (c) => {
    const r = await XF.api('admin_subscribers');
    A.subs = r.subscribers;
    c.innerHTML = '<div class="panel"><div class="panel-head"><h2>' + icon('mail') + r.subscribers.length + ' suscriptores</h2><button class="btn ghost sm" data-a="export-subs"' + (r.subscribers.length ? '' : ' disabled') + '>' + icon('download') + 'Exportar CSV</button></div>' +
      (r.subscribers.length ? '<div class="table-wrap"><table class="tbl"><thead><tr><th>Correo</th><th>Fecha</th></tr></thead><tbody>' + r.subscribers.map((x) => '<tr><td>' + esc(x.email) + '</td><td>' + XF.date(x.created_at ? String(x.created_at).replace(' ', 'T') + (String(x.created_at).endsWith('Z') ? '' : 'Z') : null) + '</td></tr>').join('') + '</tbody></table></div>' : '<div class="empty">' + icon('mail') + 'Nadie se ha suscrito todavía.</div>') + '</div>';
  };
  SECTIONS.registro = async (c) => {
    const r = await XF.api('admin_log');
    c.innerHTML = '<div class="panel"><h2>' + icon('list') + 'Actividad del panel</h2>' + (r.log.length ? '<div class="table-wrap"><table class="tbl"><thead><tr><th>Fecha</th><th>Admin</th><th>Acción</th><th>Detalle</th></tr></thead><tbody>' + r.log.map((x) => '<tr><td>' + XF.date(x.created_at ? String(x.created_at).replace(' ', 'T') + (String(x.created_at).endsWith('Z') ? '' : 'Z') : null, true) + '</td><td>' + esc(x.admin) + '</td><td class="mono">' + esc(x.action) + '</td><td class="dim" style="max-width:420px;word-break:break-word">' + esc(x.detail || '') + '</td></tr>').join('') + '</tbody></table></div>' : '<div class="empty">' + icon('list') + 'Sin actividad.</div>') + '</div>';
  };

  /* ============================================================ eventos */
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-a]');
    if (!t) return;
    const a = t.dataset.a;
    try {
      switch (a) {
        case 'side-open': sideOpen(true); break;
        case 'side-close': sideOpen(false); break;
        case 'logout': await XF.api('admin_logout', {}); A.admin = null; renderLogin(); break;
        case 'new-product': productEditor(null, t.dataset.type); break;
        case 'edit-product': productEditor(A.products.find((p) => p.id === Number(t.dataset.id))); break;
        case 'del-product': {
          const p = A.products.find((x) => x.id === Number(t.dataset.id));
          if (!(await XF.confirm('¿Eliminar "' + (p ? p.name : '') + '"? Si ya tiene ventas se ocultará en vez de borrarse.', 'Eliminar'))) return;
          const r = await XF.api('admin_product_delete', { id: Number(t.dataset.id) });
          XF.toast(r.hidden ? 'Tenía ventas: se ocultó de la tienda.' : 'Eliminado.', 'success');
          go();
          break;
        }
        case 'import-center': {
          t.classList.add('is-busy');
          const r = await XF.api('admin_import_center_plugins', {});
          XF.toast(r.created ? r.created + ' plugin(s) importado(s) como borrador. Revísalos y publícalos.' : 'No hay plugins nuevos en el Center.', 'success');
          go();
          break;
        }
        case 'order': {
          const o = (A.orders || (A.stats && A.stats.recent) || []).find((x) => x.id === t.dataset.id);
          if (o) orderModal(o);
          break;
        }
        case 'approve':
          if (!(await XF.confirm('Aprobar el pedido ' + t.dataset.id + ' y activar sus licencias en X-Flow Center.', 'Aprobar'))) return;
          t.classList.add('is-busy');
          await XF.api('admin_order_approve', { order_id: t.dataset.id });
          XF.toast('Pedido aprobado.', 'success');
          go();
          break;
        case 'filter-orders': {
          const st = $('#f-status').value, q = $('#f-q').value.trim();
          location.hash = '#pedidos?' + new URLSearchParams({ status: st, q }).toString();
          break;
        }
        case 'filter-lic': location.hash = '#licencias?' + new URLSearchParams({ q: $('#l-q').value.trim() }).toString(); break;
        case 'gift': if (!A.products.length) await loadProducts(); giftModal(); break;
        case 'lic-extend': extendModal(Number(t.dataset.id)); break;
        case 'lic-resync': t.classList.add('is-busy'); { const r = await XF.api('admin_license_resync', { id: Number(t.dataset.id) }); XF.toast(r.license.center_message || 'Enviado', r.license.center_synced ? 'success' : 'error'); } go(); break;
        case 'lic-revoke':
          if (!(await XF.confirm('Revocar esta licencia (también en X-Flow Center).', 'Revocar'))) return;
          await XF.api('admin_license_revoke', { id: Number(t.dataset.id) });
          go();
          break;
        case 'coupon': {
          if (!A.products.length) await loadProducts();
          const list = (await XF.api('admin_coupons')).coupons;
          couponModal(list.find((x) => x.id === Number(t.dataset.id)));
          break;
        }
        case 'coupon-del':
          if (!(await XF.confirm('¿Eliminar este cupón?', 'Eliminar'))) return;
          await XF.api('admin_coupon_delete', { id: Number(t.dataset.id) });
          go();
          break;
        case 'quick-discount': {
          const tr = t.closest('tr');
          const p = A.products.find((x) => x.id === Number(t.dataset.id));
          const ends = $('[data-k=ends]', tr).value;
          await XF.api('admin_product_save', { product: Object.assign({}, p, { discount_percent: Number($('[data-k=pct]', tr).value) || 0, discount_ends_at: ends ? new Date(ends).toISOString() : '' }) });
          XF.toast('Descuento guardado.', 'success');
          break;
        }
        case 'add-manual': $('#manual-list').insertAdjacentHTML('beforeend', manualItem()); break;
        case 'add-faq': $('#faq-list').insertAdjacentHTML('beforeend', faqItem()); break;
        case 'add-testi': $('#testi-list').insertAdjacentHTML('beforeend', testiItem()); break;
        case 'rm-item': t.closest('.list-item').remove(); break;
        case 'copy': navigator.clipboard && navigator.clipboard.writeText(t.dataset.v).then(() => XF.toast('Copiado', 'success')); break;
        case 'describe': {
          t.classList.add('is-busy');
          const r = await XF.api('admin_center_describe');
          const own = r.tables.filter((tb) => !/^store_/.test(tb.table));
          $('#tables').innerHTML = own.length ? own.map((tb) => '<details><summary>' + esc(tb.table) + ' <span class="dim">(' + tb.columns.length + ' columnas)</span></summary><div class="cols-chips">' + tb.columns.map((cl) => '<span title="' + esc(cl.type) + '">' + esc(cl.name) + '</span>').join('') + '</div><button type="button" class="btn ghost sm" style="margin-top:10px" data-a="use-table" data-t="' + esc(tb.table) + '">Usar esta tabla</button></details>').join('') : '<p class="muted">No se encontraron tablas del Center en esta base de datos.</p>';
          t.classList.remove('is-busy');
          break;
        }
        case 'use-table': $('#center-form').elements['db.table'].value = t.dataset.t; XF.toast('Tabla seleccionada. Ajusta las columnas y guarda.', 'info'); break;
        case 'center-test': {
          t.classList.add('is-busy');
          await saveCenter();
          const r = await XF.api('admin_center_test', {});
          XF.toast(r.result.message, r.result.ok ? 'success' : 'error');
          t.classList.remove('is-busy');
          break;
        }
        case 'export-subs': {
          const csv = 'email,fecha\n' + (A.subs || []).map((x) => '"' + String(x.email).replace(/"/g, '""') + '",' + (x.created_at || '')).join('\n');
          const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
          const link = document.createElement('a');
          link.href = url; link.download = 'suscriptores-xflow.csv'; link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          break;
        }
        case 'demo-reset':
          if (await XF.confirm('Borrar todos los datos del laboratorio en este navegador.', 'Reiniciar')) { XF.demoBackend.reset(); location.reload(); }
          break;
      }
    } catch (err) {
      t.classList.remove('is-busy');
      if (err.code === 'unauthorized' || err.code === 'csrf') { A.admin = null; renderLogin('Tu sesión expiró.'); return; }
      XF.toast(err.message, 'error');
    }
  });
  window.addEventListener('hashchange', () => { if (A.admin) go(); });

  async function boot() {
    renderShell();
    try { A.stats = await XF.api('admin_stats'); A.currency = A.stats.currency || 'USD'; XF.currency = A.currency; } catch (e) {}
    await go();
    if (XF.demo) {
      const rib = document.createElement('div');
      rib.className = 'demo-ribbon';
      rib.style.left = 'auto'; rib.style.right = '12px';
      rib.innerHTML = icon('sparkles') + 'Laboratorio <button data-a="demo-reset">Reiniciar datos</button>';
      document.body.appendChild(rib);
    }
  }

  (async function init() {
    try {
      const r = await XF.api('admin_me');
      if (r.admin) { A.admin = r.admin; await boot(); return; }
    } catch (e) {
      if (e.code === 'not_configured' || e.code === 'network') { renderLogin(e.message); return; }
    }
    renderLogin();
  })();
})();
