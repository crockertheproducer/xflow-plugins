/* X-FLOW STORE — backend simulado para el laboratorio (GitHub Pages / sin PHP).
 * Imita la API real (api/index.php) guardando todo en localStorage de ESTE navegador.
 * No procesa pagos reales ni toca la base de datos de X-Flow Center. */
(function () {
  'use strict';
  const XF = window.XF;
  const KEY = 'xf_demo_db_v1';

  function err(code, message) { const e = new Error(message); e.code = code; return e; }
  function now() { return new Date().toISOString(); }
  function cents(v) { return Math.round(Number(v || 0) * 100); }
  function rid(n) { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }
  function slugify(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'producto'; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function plans(life, month, year) {
    const p = [{ id: 'lifetime', label: 'Permanente', type: 'lifetime', days: 0, price: life, compare_at: null, tier: '' }];
    if (month != null) p.push({ id: 'monthly', label: 'Mensual', type: 'days', days: 30, price: month, compare_at: null, tier: '' });
    if (year != null) p.push({ id: 'yearly', label: 'Anual', type: 'days', days: 365, price: year, compare_at: null, tier: '' });
    return p;
  }
  const SPECS = { formats: 'VST3', os: 'Windows 10 / 11 (64-bit)', version: '1.0', size: '' };

  function seed() {
    const t = now();
    const base = { specs: SPECS, gallery: [], video_url: '', discount_percent: 0, discount_ends_at: null, bundle_items: [], bundle_all: false, status: 'published', sync_center: true, created_at: t, updated_at: t };
    const products = [
      Object.assign({}, base, { id: 1, type: 'plugin', slug: 'x-flow-channelstrip', name: 'X-FLOW CHANNELSTRIP', category: 'Mezcla', tagline: 'Cuatro módulos de consola clásica en un solo rack.', description: 'Preamp de color, EQ musical de tres bandas, de-esser natural y limitador FET con VU real. Todo lo que necesita una pista para sonar terminada, en el orden correcto y sin abrir cinco plugins distintos.\n\nPensado para voces, baterías y buses: carga el preset, ajusta el nivel de entrada y deja que el rack haga el trabajo pesado.', features: ['Preamp modular con saturación y mezcla paralela', 'EQ de 3 bandas con filtros de estilo clásico', 'De-esser por bandas con modo audición', 'Limitador FET con ratios 4 / 8 / 12 / 20 y VU animado', 'Bypass independiente en cada módulo'], image: 'assets/img/plugins/channelstrip.png', center_id: 'channelstrip', plans: plans(49.99, 5.99, 44.99), badge: 'MÁS VENDIDO', featured: true, is_new: false, sort_order: 1 }),
      Object.assign({}, base, { id: 2, type: 'plugin', slug: 'x-flow-analyzer', name: 'X-FLOW ANALYZER', category: 'Utilidad', tagline: 'Mira tu mezcla: espectro, loudness y fase en tiempo real.', description: 'Analizador de 64 bandas con curva suavizada, medición LUFS integrada/short-term, true peak y correlación estéreo. Cambia entre vistas Stereo / Mid / Side y compara cómo se traduce tu mezcla en teléfono, carro o discoteca.', features: ['Espectro de 16 a 64 bandas con rango ajustable', 'LUFS integrado, short-term y true peak', 'Medidor de correlación de fase', 'Vistas Stereo, Mid y Side con EQ M/S', 'Simulación de escucha: teléfono, carro y discoteca'], image: 'assets/img/plugins/analyzer.png', center_id: 'xflowanalizer', plans: plans(19.99, 2.99), badge: 'NUEVO', featured: true, is_new: true, sort_order: 2 }),
      Object.assign({}, base, { id: 3, type: 'plugin', slug: 'x-flow-sidechain', name: 'X-FLOW SIDECHAIN', category: 'Ritmo', tagline: 'Dibuja la curva y deja que el bombeo haga el resto.', description: 'Modulador de volumen por curva sincronizado al tempo, con filtro resonante y mezcla paralela. Dibuja el envolvente, elige la división (1/4, 1/8, 1/16…) o dispáralo por MIDI para bombear exactamente con tu kick.', features: ['Editor de curva libre con puntos y tensión', 'Sincronía al tempo del DAW', 'Filtro con cutoff y resonancia', 'Disparo por MIDI', 'Control de mezcla dry/wet'], image: 'assets/img/plugins/sidechain.png', center_id: 'sidechain', plans: plans(19.99, 2.99), badge: '', featured: false, is_new: false, sort_order: 3 }),
      Object.assign({}, base, { id: 4, type: 'plugin', slug: 'x-flow-clean', name: 'X-FLOW CLEAN', category: 'Mezcla', tagline: 'Una perilla para limpiar ruido y dejar la voz clara.', description: 'Limpieza dinámica de ruido de fondo, siseo y resonancias con un solo control. Activa el modo HQ para máxima calidad en la exportación final.', features: ['Control único de cantidad de limpieza', 'Modo HQ para exportar', 'Bypass rápido para comparar', 'Latencia mínima para grabar en vivo'], image: 'assets/img/plugins/clean.png', center_id: 'clean', plans: plans(24.99, 3.49), badge: '', featured: false, is_new: false, sort_order: 4 }),
      Object.assign({}, base, { id: 5, type: 'plugin', slug: 'x-flow-drop', name: 'X-FLOW DROP', category: 'Creativo', tagline: 'Pega un enlace, saca el audio y arrástralo al DAW.', description: 'Importa audio desde un enlace directamente dentro de tu proyecto: pega la URL, pulsa extraer y arrastra el archivo a la pista. Úsalo solo con material que tengas derecho a usar.', features: ['Extracción directa dentro del DAW', 'Arrastrar y soltar a cualquier pista', 'Vista previa con carátula', 'Historial de extracciones'], image: 'assets/img/plugins/drop.png', center_id: 'drop', plans: plans(29.99, 3.99), badge: '', featured: false, is_new: false, sort_order: 5 }),
      Object.assign({}, base, { id: 6, type: 'bundle', slug: 'x-flow-all-access', name: 'X-FLOW ALL ACCESS', category: 'Pack', tagline: 'Todos los plugins X-FLOW, hoy y los que vengan.', description: 'Una sola licencia para todo el catálogo. Incluye automáticamente cada plugin nuevo que salga mientras tu acceso esté activo.', features: ['Todos los plugins actuales', 'Plugins nuevos incluidos automáticamente', 'Activación instantánea en X-Flow Center', 'Actualizaciones incluidas'], image: '', center_id: '', plans: plans(99.99, 9.99, 89.99), badge: 'TODO EN UNO', bundle_all: true, featured: true, is_new: false, sort_order: 0 }),
      Object.assign({}, base, { id: 7, type: 'bundle', slug: 'x-flow-mix-essentials', name: 'MIX ESSENTIALS', category: 'Pack', tagline: 'Channelstrip + Clean + Analyzer para mezclar de principio a fin.', description: 'Las tres herramientas que más usamos en cada mezcla: limpia la toma, dale carácter en el channelstrip y verifica con el analizador.', features: ['X-FLOW CHANNELSTRIP', 'X-FLOW CLEAN', 'X-FLOW ANALYZER'], image: '', center_id: '', plans: plans(69.99, null), badge: 'PACK', bundle_items: [1, 4, 2], featured: false, is_new: false, sort_order: 1 }),
    ];
    const ends = new Date(Date.now() + 5 * 86400000 + 7 * 3600000).toISOString();
    return {
      nextId: { product: 8, coupon: 2, license: 1, order: 1 },
      products,
      coupons: [{ id: 1, code: 'XFLOW10', kind: 'percent', value: 10, product_ids: [], min_total: 0, max_uses: null, used: 0, starts_at: null, expires_at: null, active: true }],
      orders: [],
      licenses: [],
      subscribers: [],
      log: [],
      settings: {
        site: {
          name: 'X-FLOW', logo_url: '', currency: 'USD',
          hero_eyebrow: 'Plugins VST3 para productores',
          hero_title: 'SUENA COMO<br>EL <span class="grad">FUTURO</span>',
          hero_subtitle: 'Plugins de mezcla, análisis y creatividad hechos por productores. Compra y se activa al instante en X-Flow Center.',
          announcement: { active: true, text: 'Activación instantánea en X-Flow Center en cada compra', link: '#/plugins' },
          colors: { primary: '#ff1b4d', secondary: '#9b1bff', accent: '#ffb020', bg: '#050206', panel: '#140e18' },
          sample_packs_enabled: false,
          center_download_url: 'https://xflowbeats.online/descargas/xflowcenter.exe',
          support_email: 'soporte@xflowbeats.online',
          socials: { instagram: 'https://instagram.com', youtube: 'https://youtube.com', tiktok: '', discord: '' },
          ticker: ['VST3', 'WINDOWS 10 / 11', 'ACTIVACIÓN INSTANTÁNEA', 'SIN DONGLE', 'ACTUALIZACIONES INCLUIDAS', 'SOPORTE EN ESPAÑOL'],
          faq: [
            { q: '¿Cómo recibo mi plugin después de pagar?', a: 'La licencia se activa sola en tu cuenta de X-Flow Center con el mismo correo de la compra. Abre el Center, inicia sesión y el plugin aparece listo para instalar.' },
            { q: '¿Qué diferencia hay entre permanente y suscripción?', a: 'Permanente es un solo pago y es tuyo para siempre. La suscripción te da acceso por 30 días (o el periodo que elijas) y puedes renovarla cuando quieras; los días se suman.' },
            { q: '¿Puedo regalar un plugin?', a: 'Sí. En el checkout marca "Es un regalo" y escribe el correo de la persona: la licencia se activa en su cuenta de X-Flow Center.' },
            { q: '¿En qué sistemas funciona?', a: 'Windows 10 y 11 de 64 bits, formato VST3, en cualquier DAW compatible (FL Studio, Ableton Live, Studio One, Reaper, Cubase…).' },
            { q: '¿Qué métodos de pago aceptan?', a: 'PayPal, tarjeta, Binance y los métodos locales que ves en el checkout.' },
          ],
          testimonials: [
            { name: 'Productor verificado', role: 'Trap / Reggaetón', text: 'El Channelstrip me ahorra media hora por voz. Cargo, ajusto la entrada y listo.', rating: 5 },
            { name: 'Ingeniero de mezcla', role: 'Estudio independiente', text: 'El Analyzer con la vista de carro y teléfono me salvó varias mezclas antes de entregarlas.', rating: 5 },
            { name: 'Beatmaker', role: 'FL Studio', text: 'Compré el pack y a los dos minutos ya estaba todo activado en el Center.', rating: 5 },
          ],
        },
        sale: { active: true, title: 'OFERTA DE LANZAMIENTO', percent: 30, ends_at: ends, applies_to: 'plugins', product_ids: [] },
        payments: {
          paypal: { enabled: true, mode: 'sandbox', client_id: 'demo', secret: '', webhook_id: '' },
          stripe: { enabled: true, publishable_key: '', secret_key: '', webhook_secret: '' },
          binance: { enabled: true, api_key: '', secret_key: '', currency: 'USDT' },
          manual: [
            { id: 'binance-manual', name: 'Binance Pay (manual)', enabled: true, instructions: 'Envía el total en USDT a nuestro Binance Pay ID y pega el ID de la orden.', account: 'Pay ID: 000000000' },
            { id: 'transferencia', name: 'Transferencia / Pago móvil', enabled: true, instructions: 'Haz la transferencia y pega el número de referencia.', account: 'Banco · Titular · Cuenta' },
          ],
        },
        center: {
          mode: 'db',
          db: { table: 'licencias', col_email: 'email', col_product: 'plugin', col_product_name: '', expiry_mode: 'datetime', col_expiry: 'fecha_expiracion', lifetime_value: '', col_status: 'estado', status_active: 'activo', status_lifetime: 'permanente', col_tier: '', col_created: '' },
          http: { url: '', secret: '' },
        },
      },
      session: { customer: null, admin: null },
    };
  }

  let DB = XF.store.get(KEY, null);
  if (!DB || !DB.products) { DB = seed(); save(); }
  function save() { XF.store.set(KEY, DB); }

  /* ------------------------------------------------ precios (igual que lib/catalog.php) */
  function saleLive(s) { return s && s.active && Number(s.percent) > 0 && (!s.ends_at || new Date(s.ends_at) > new Date()); }
  function effectiveDiscount(p) {
    let pct = 0;
    if (p.discount_percent > 0 && (!p.discount_ends_at || new Date(p.discount_ends_at) > new Date())) pct = p.discount_percent;
    const s = DB.settings.sale;
    if (saleLive(s)) {
      const a = s.applies_to || 'all';
      const hit = a === 'all' || (a === 'plugins' && p.type === 'plugin') || (a === 'bundles' && p.type === 'bundle') || (a === 'selected' && (s.product_ids || []).map(Number).includes(p.id));
      if (hit) pct = Math.max(pct, Number(s.percent));
    }
    return Math.max(0, Math.min(100, pct));
  }
  function planPrice(p, plan) {
    const base = cents(plan.price);
    const pct = effectiveDiscount(p);
    const fin = pct > 0 ? Math.round(base * (100 - pct) / 100) : base;
    const cmp = plan.compare_at ? cents(plan.compare_at) : pct > 0 ? base : null;
    return { cents: fin, compare: cmp != null && cmp > fin ? cmp : null, pct };
  }
  function productById(id) { return DB.products.find((p) => p.id === Number(id)) || null; }
  function expand(p) {
    if (p.type !== 'bundle') return [p];
    if (p.bundle_all) return DB.products.filter((x) => x.type === 'plugin' && (x.status === 'published' || x.status === 'hidden'));
    return (p.bundle_items || []).map(productById).filter((x) => x && x.type === 'plugin');
  }
  function productPublic(p) {
    const o = clone(p);
    o.plans = p.plans.map((pl) => { const pr = planPrice(p, pl); return Object.assign({}, pl, { final_price: pr.cents / 100, final_compare: pr.compare != null ? pr.compare / 100 : null }); });
    o.discount_active = effectiveDiscount(p);
    delete o.center_id;
    if (p.type === 'bundle') {
      const items = p.bundle_all ? DB.products.filter((x) => x.type === 'plugin' && x.status === 'published') : (p.bundle_items || []).map(productById).filter(Boolean);
      o.includes = items.map((x) => ({ id: x.id, name: x.name, slug: x.slug, image: x.image, value: (x.plans[0] || {}).price || 0 }));
    }
    return o;
  }
  function applyCoupon(code, lines, subtotal) {
    const c = DB.coupons.find((x) => x.code === String(code).toUpperCase().trim());
    if (!c || !c.active) throw err('coupon_invalid', 'El cupón no existe o está desactivado.');
    if (c.starts_at && new Date(c.starts_at) > new Date()) throw err('coupon_not_started', 'Este cupón aún no está activo.');
    if (c.expires_at && new Date(c.expires_at) < new Date()) throw err('coupon_expired', 'Este cupón ya expiró.');
    if (c.max_uses != null && c.used >= c.max_uses) throw err('coupon_used_up', 'Este cupón ya alcanzó su límite de usos.');
    if (subtotal < cents(c.min_total)) throw err('coupon_min', 'Este cupón requiere una compra mínima de ' + Number(c.min_total).toFixed(2) + '.');
    const only = (c.product_ids || []).map(Number);
    let eligible = 0;
    lines.forEach((l) => { if (!only.length || only.includes(l.product_id)) eligible += l.unit_cents; });
    if (eligible <= 0) throw err('coupon_not_applicable', 'El cupón no aplica a los productos del carrito.');
    const d = c.kind === 'fixed' ? Math.min(eligible, cents(c.value)) : Math.round(eligible * Math.min(100, c.value) / 100);
    return [c, d];
  }
  function quote(items, code) {
    if (!items || !items.length) throw err('empty_cart', 'Tu carrito está vacío.');
    const lines = []; const seen = {}; let subtotal = 0;
    items.forEach((it) => {
      const k = it.product_id + ':' + it.plan_id; if (seen[k]) return; seen[k] = 1;
      const p = productById(it.product_id);
      if (!p || p.status !== 'published') throw err('product_unavailable', 'Un producto del carrito ya no está disponible.');
      const plan = p.plans.find((x) => x.id === it.plan_id);
      if (!plan) throw err('plan_unavailable', 'El plan elegido para ' + p.name + ' ya no existe.');
      const pr = planPrice(p, plan); subtotal += pr.cents;
      lines.push({ product_id: p.id, type: p.type, name: p.name, image: p.image, plan_id: plan.id, plan_label: plan.label, plan_type: plan.type, days: plan.days, tier: plan.tier || '', unit_cents: pr.cents, compare_cents: pr.compare, discount_percent: pr.pct });
    });
    let discount = 0, coupon = null, couponError = null;
    if (code) { try { const r = applyCoupon(code, lines, subtotal); coupon = r[0]; discount = r[1]; } catch (e) { couponError = e.message; } }
    return { lines, subtotal_cents: subtotal, discount_cents: discount, total_cents: Math.max(0, subtotal - discount), currency: DB.settings.site.currency || 'USD', coupon: coupon ? { code: coupon.code, kind: coupon.kind, value: coupon.value } : null, coupon_error: couponError };
  }
  function publicMethods() {
    const p = DB.settings.payments; const m = [];
    if (p.paypal.enabled) m.push({ id: 'paypal', name: 'PayPal', kind: 'paypal', client_id: 'demo' });
    if (p.stripe.enabled) m.push({ id: 'stripe', name: 'Tarjeta de crédito / débito', kind: 'redirect' });
    if (p.binance.enabled) m.push({ id: 'binance', name: 'Binance Pay', kind: 'redirect', currency: p.binance.currency });
    (p.manual || []).forEach((x) => { if (x.enabled) m.push({ id: 'manual:' + x.id, name: x.name, kind: 'manual', instructions: x.instructions, account: x.account }); });
    return m;
  }

  /* ------------------------------------------------ licencias / pedidos */
  function licensePublic(l) {
    const expired = !l.lifetime && l.expires_at && new Date(l.expires_at) < new Date();
    return Object.assign({}, l, { status: l.status === 'active' && expired ? 'expired' : l.status });
  }
  function grant(g) {
    const email = g.email.toLowerCase(); const p = g.product;
    let l = DB.licenses.find((x) => x.email === email && x.product_id === p.id);
    let lifetime = !!g.lifetime, expires = null;
    if (l && l.lifetime && l.status === 'active') lifetime = true;
    else if (!lifetime) {
      let base = Date.now();
      if (l && l.status === 'active' && l.expires_at && new Date(l.expires_at).getTime() > base) base = new Date(l.expires_at).getTime();
      expires = new Date(base + g.days * 86400000).toISOString();
    }
    const synced = !!p.center_id;
    const data = { product_name: p.name, center_id: p.center_id || '', tier: g.tier || '', lifetime, expires_at: lifetime ? null : expires, source: g.source, order_id: g.order_id || null, note: g.note || '', status: 'active', center_synced: synced, center_message: synced ? 'Simulado: licencia activada en X-Flow Center (modo demo).' : 'El producto no tiene ID de X-Flow Center.', updated_at: now() };
    if (l) Object.assign(l, data);
    else { l = Object.assign({ id: DB.nextId.license++, email, product_id: p.id, created_at: now() }, data); DB.licenses.push(l); }
    return l;
  }
  function orderPublic(o, withLic) {
    const out = { id: o.public_id, email: o.email, recipient_email: o.recipient_email, items: o.items, subtotal: o.subtotal_cents / 100, discount: o.discount_cents / 100, total: o.total_cents / 100, currency: o.currency, coupon_code: o.coupon_code, method: o.method, manual_method: o.manual_method, status: o.status, created_at: o.created_at, paid_at: o.paid_at };
    if (withLic !== false) out.licenses = DB.licenses.filter((l) => l.order_id === o.id).map(licensePublic);
    return out;
  }
  function orderAdmin(o) { return Object.assign(orderPublic(o), { db_id: o.id, customer_name: o.customer_name, gift_message: o.gift_message, provider_ref: o.provider_ref, manual_reference: o.manual_reference, admin_note: o.admin_note, ip: '127.0.0.1 (demo)', fulfilled_at: o.fulfilled_at }); }
  function fulfill(o, ref, retry) {
    if (!['pending', 'awaiting_review', 'failed'].includes(o.status) && !(retry && o.status === 'paid')) return o;
    o.status = 'paid'; o.paid_at = now(); if (ref) o.provider_ref = ref;
    const owner = o.recipient_email || o.email;
    o.items.forEach((line) => {
      const p = productById(line.product_id); if (!p) return;
      expand(p).forEach((pl) => grant({ email: owner, product: pl, lifetime: line.plan_type === 'lifetime', days: line.days, tier: line.tier, source: o.recipient_email ? 'gift' : 'purchase', order_id: o.id, note: o.recipient_email ? 'Regalo de ' + o.email : '' }));
    });
    if (o.coupon_code) { const c = DB.coupons.find((x) => x.code === o.coupon_code); if (c) c.used++; }
    o.status = 'fulfilled'; o.fulfilled_at = now();
    return o;
  }
  function findOrder(id, token) {
    const o = DB.orders.find((x) => x.public_id === id);
    if (!o || o.access_token !== token) throw err('order_not_found', 'Pedido no encontrado.');
    return o;
  }
  function requireAdmin() { if (!DB.session.admin) throw err('unauthorized', 'Inicia sesión como administrador.'); return DB.session.admin; }
  function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '')); }
  function adminLog(action, detail) { DB.log.unshift({ admin: DB.session.admin ? DB.session.admin.email : '', action, detail: typeof detail === 'string' ? detail : JSON.stringify(detail || ''), created_at: now() }); DB.log = DB.log.slice(0, 200); }
  function mask(v) { return v ? '••••••••' + String(v).slice(-4) : ''; }

  /* ------------------------------------------------ lectura en vivo de X-Flow Center (solo lectura) */
  const LIVE_KEY = 'xf_demo_live_v1';
  function liveState() { return XF.store.get(LIVE_KEY, { at: 0, ok: false, found: 0, error: '' }); }
  function normName(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function absCenter(url) {
    url = String(url || '').trim();
    if (!url || /^(https?:)?\/\//i.test(url) || url.startsWith('data:')) return url;
    const m = String(XF.cfg.centerApi || '').match(/^(https?:\/\/[^/]+)/i);
    return m ? m[1] + '/' + url.replace(/^\//, '') : url;
  }
  async function fetchJson(url, ms) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms || 7000);
    try {
      const r = await fetch(url, { signal: ctl.signal, credentials: 'omit', cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  }
  function applyCenterCatalog(list) {
    let created = 0, updated = 0;
    list.forEach((raw) => {
      if (!raw || raw.id === undefined || raw.id === '') return;
      const cp = { id: String(raw.id), name: String(raw.nombre || raw.name || raw.id).trim(), price: Number(raw.precio_perm ?? raw.precio ?? raw.price) || 0, sub: Number(raw.precio_sub) || 0, desc: String(raw.descripcion || raw.desc || ''), image: absCenter(raw.imagen_url || raw.imagen || ''), version: String(raw.version || '') };
      let p = DB.products.find((x) => x.type === 'plugin' && String(x.center_id).toLowerCase() === cp.id.toLowerCase()) || DB.products.find((x) => x.type === 'plugin' && normName(x.name) === normName(cp.name));
      const sub = cp.sub || (cp.price ? Math.round(cp.price * 25) / 100 : 0);
      const basePlans = (cur) => {
        const keep = (cur || []).filter((pl) => pl.id !== 'lifetime' && pl.id !== 'monthly');
        const out = [];
        if (cp.price) out.push({ id: 'lifetime', label: 'Permanente', type: 'lifetime', days: 0, price: cp.price, compare_at: null, tier: '' });
        if (sub) out.push({ id: 'monthly', label: 'Mensual', type: 'days', days: 30, price: sub, compare_at: null, tier: '' });
        return out.concat(keep);
      };
      if (p) {
        if (p.sync_center === false) return;
        p.center_id = cp.id; p.name = cp.name || p.name;
        if (cp.price) p.plans = basePlans(p.plans);
        if (cp.image && !p.image) p.image = cp.image;
        if (cp.desc.length >= 15 && !String(p.description || '').trim()) p.description = cp.desc;
        if (cp.version) p.specs = Object.assign({}, p.specs, { version: cp.version });
        updated++;
        return;
      }
      if (!cp.price) return;
      DB.products.push({ id: DB.nextId.product++, type: 'plugin', slug: slugify(cp.name), name: cp.name, tagline: cp.desc.split(/(?<=[.!?])\s/)[0].slice(0, 140), description: cp.desc, features: [], specs: Object.assign({}, SPECS, { version: cp.version || '1.0' }), image: cp.image, gallery: [], video_url: '', category: '', center_id: cp.id, plans: basePlans([]), discount_percent: 0, discount_ends_at: null, badge: '', bundle_items: [], bundle_all: false, featured: false, is_new: false, status: 'published', sync_center: true, sort_order: 20, created_at: now(), updated_at: now() });
      created++;
    });
    save();
    return { created, updated };
  }
  /** Intenta leer tus plugins reales (obtener_plugins). Se repite como mucho cada 10 minutos. */
  async function liveSync(force) {
    const st = liveState();
    if (!force && st.at && Date.now() - st.at < 600000) return st;
    const next = { at: Date.now(), ok: false, found: 0, created: 0, updated: 0, error: '' };
    try {
      let list = await fetchJson(XF.cfg.centerApi + '?accion=obtener_plugins');
      if (list && list.data) list = list.data;
      if (!Array.isArray(list)) throw new Error('respuesta no válida');
      Object.assign(next, { ok: true, found: list.length }, applyCenterCatalog(list));
    } catch (e) {
      next.error = 'Tu servidor no permite leerlo desde GitHub Pages (CORS) o no respondió. Se muestran datos de ejemplo.';
    }
    XF.store.set(LIVE_KEY, next);
    return next;
  }
  async function liveLogin(email, password) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 7000);
      const r = await fetch(XF.cfg.centerLogin + '?email=' + encodeURIComponent(email) + '&password=' + encodeURIComponent(password), { signal: ctl.signal, credentials: 'omit', cache: 'no-store' });
      clearTimeout(t);
      const txt = await r.text();
      if (txt.includes('ACCESO_CONCEDIDO')) { const parts = txt.trim().split('|'); return { status: 'ok', aka: parts[2] || '', photo: absCenter(parts[4] || '') }; }
      return { status: 'denied' };
    } catch (e) { return { status: 'unreachable' }; }
  }
  async function liveLicenses(email) {
    try {
      const list = await fetchJson(XF.cfg.centerApi + '?accion=obtener_licencias_usuario&email=' + encodeURIComponent(email));
      if (!Array.isArray(list)) return [];
      return list.map((l) => {
        const cid = String(l.id_plugin || l.plugin || '');
        const est = String(l.estado || '').toLowerCase();
        const p = DB.products.find((x) => String(x.center_id).toLowerCase() === cid.toLowerCase());
        const life = ['lifetime', 'permanente'].includes(est) || String(l.dias || '').toUpperCase() === 'PERMANENTE';
        return { id: 0, email, product_id: p ? p.id : 0, product_name: p ? p.name : (l.nombre || cid), tier: '', lifetime: life, expires_at: null, source: 'center', status: ['bloqueado', 'revocado'].includes(est) ? 'revoked' : 'active', center_synced: true, center_message: 'Licencia existente en X-Flow Center.' };
      }).filter((l) => l.product_name);
    } catch (e) { return []; }
  }
  async function mergedLicenses(email) {
    const mine = DB.licenses.filter((l) => l.email === email).map(licensePublic);
    const have = new Set(mine.map((l) => String(l.center_id || '').toLowerCase()));
    const live = DB.session.customer && DB.session.customer.live ? await liveLicenses(email) : [];
    live.forEach((l) => { const p = DB.products.find((x) => x.id === l.product_id); const k = p ? String(p.center_id).toLowerCase() : l.product_name; if (!have.has(k)) { have.add(k); mine.push(l); } });
    return mine;
  }

  const H = {
    async bootstrap() {
      await liveSync(false);
      const c = DB.session.customer;
      const owned = c ? (await mergedLicenses(c.email)).filter((l) => l.status === 'active' && l.product_id).map((l) => ({ product_id: l.product_id, lifetime: l.lifetime, expires_at: l.expires_at })) : [];
      const out = H._bootstrap();
      out.owned = owned;
      out.settings.password_reset = true;
      out.live = liveState();
      return out;
    },
    _bootstrap() {
      const pub = DB.products.filter((p) => ['published', 'coming_soon'].includes(p.status)).sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
      return { settings: { site: DB.settings.site, sale: saleLive(DB.settings.sale) ? DB.settings.sale : { active: false }, payment_methods: publicMethods(), currency: DB.settings.site.currency }, products: pub.map(productPublic), customer: DB.session.customer, csrf: 'demo', server_time: now(), demo: true };
    },
    quote(d) { return { quote: quote(d.items || [], d.coupon || '') }; },
    async login(d) {
      if (!validEmail(d.email) || String(d.password || '').length < 4) throw err('bad_credentials', 'Correo o contraseña incorrectos.');
      const email = d.email.toLowerCase();
      const live = await liveLogin(email, d.password);
      if (live.status === 'denied') throw err('bad_credentials', 'Correo o contraseña incorrectos (validado con tu X-Flow Center).');
      DB.session.customer = { email, aka: live.status === 'ok' ? (live.aka || email.split('@')[0]) : email.split('@')[0].toUpperCase(), photo: live.photo || '', live: live.status === 'ok' };
      save();
      return { customer: DB.session.customer, csrf: 'demo', live: live.status };
    },
    logout() { DB.session.customer = null; save(); return {}; },
    me() { return { customer: DB.session.customer, csrf: 'demo' }; },
    async my_licenses() { const c = DB.session.customer; if (!c) throw err('unauthorized', 'Inicia sesión.'); return { licenses: await mergedLicenses(c.email) }; },
    password_forgot(d) {
      if (!validEmail(d.email)) throw err('invalid_email', 'Correo inválido.');
      return { message: 'Si ese correo tiene una cuenta de X-Flow Center, te enviamos un enlace para crear una nueva contraseña. (Laboratorio: no se envían correos; en tu servidor sí.)' };
    },
    password_reset(d) {
      if (!/^[a-f0-9]{64}$/.test(String(d.token || ''))) throw err('token_invalid', 'El enlace no es válido o ya caducó. Pide uno nuevo.');
      return { message: 'Laboratorio: aquí se guardaría tu nueva contraseña en X-Flow Center.' };
    },
    password_change(d) {
      if (!DB.session.customer) throw err('unauthorized', 'Inicia sesión.');
      if (String(d.current || '').length < 4) throw err('bad_credentials', 'La contraseña actual no es correcta.');
      return { message: 'Laboratorio: la contraseña se cambiaría en X-Flow Center.' };
    },
    my_orders() { const c = DB.session.customer; if (!c) throw err('unauthorized', 'Inicia sesión.'); return { orders: DB.orders.filter((o) => o.email === c.email || o.recipient_email === c.email).slice().reverse().map((o) => Object.assign(orderPublic(o, false), { token: o.email === c.email ? o.access_token : null })) }; },
    checkout_start(d) {
      if (!validEmail(d.email)) throw err('invalid_email', 'Escribe un correo electrónico válido.');
      if (d.is_gift && !validEmail(d.recipient_email)) throw err('invalid_email', 'Escribe el correo de la persona que recibe el regalo.');
      const q = quote(d.items || [], d.coupon || '');
      if (q.coupon_error) throw err('coupon', q.coupon_error);
      const methods = publicMethods().map((m) => m.id);
      const free = q.total_cents === 0;
      if (!free && !methods.includes(d.method)) throw err('method_unavailable', 'Elige un método de pago disponible.');
      let method = d.method, manual = '';
      if (String(method).startsWith('manual:')) { manual = method.slice(7); method = 'manual'; }
      if (free) method = 'free';
      const recipient = d.is_gift && d.recipient_email.toLowerCase() !== d.email.toLowerCase() ? d.recipient_email.toLowerCase() : null;
      const o = { id: DB.nextId.order++, public_id: 'XF' + rid(10), access_token: rid(32), email: d.email.toLowerCase(), customer_name: d.name || '', recipient_email: recipient, gift_message: d.gift_message || '', items: q.lines, subtotal_cents: q.subtotal_cents, discount_cents: q.discount_cents, total_cents: q.total_cents, currency: q.currency, coupon_code: q.coupon ? q.coupon.code : '', method, manual_method: manual, status: 'pending', provider_ref: '', manual_reference: '', admin_note: '', created_at: now(), updated_at: now(), paid_at: null, fulfilled_at: null };
      DB.orders.push(o);
      const resp = { order_id: o.public_id, token: o.access_token, method, total: o.total_cents / 100 };
      if (method === 'free') { fulfill(o, 'free'); resp.status = 'fulfilled'; }
      if (method === 'paypal') { o.provider_ref = 'DEMO-PP-' + rid(8); resp.paypal_order_id = o.provider_ref; }
      if (method === 'stripe' || method === 'binance') { o.provider_ref = 'DEMO-' + method.toUpperCase() + '-' + rid(8); resp.demo_simulated = true; }
      if (method === 'manual') { const m = DB.settings.payments.manual.find((x) => x.id === manual); resp.manual = m ? { name: m.name, instructions: m.instructions, account: m.account } : null; }
      save();
      return resp;
    },
    paypal_capture(d) { const o = findOrder(d.order_id, d.token); fulfill(o, o.provider_ref); save(); return { order: orderPublic(o) }; },
    demo_pay(d) { const o = findOrder(d.order_id, d.token); fulfill(o, o.provider_ref); save(); return { order: orderPublic(o) }; },
    manual_submit(d) {
      const o = findOrder(d.order_id, d.token);
      if (String(d.reference || '').trim().length < 4) throw err('reference', 'Escribe el número de referencia / ID de la transacción.');
      if (!['pending', 'awaiting_review'].includes(o.status)) throw err('order_closed', 'Este pedido ya fue procesado.');
      o.manual_reference = String(d.reference).trim(); o.status = 'awaiting_review'; o.updated_at = now(); save();
      return { order: orderPublic(o) };
    },
    order_status(d, q) { const o = findOrder(q.order_id, q.token); return { order: orderPublic(o) }; },
    subscribe(d) { if (!validEmail(d.email)) throw err('invalid_email', 'Correo inválido.'); if (!DB.subscribers.find((s) => s.email === d.email)) DB.subscribers.unshift({ email: d.email, created_at: now() }); save(); return {}; },
    support_ticket(d) { if (!validEmail(d.email)) throw err('invalid_email', 'Correo inválido.'); if (String(d.message || '').length < 5) throw err('message', 'Escribe tu mensaje.'); return {}; },

    admin_login(d) {
      if (String(d.email || '').toLowerCase() !== 'admin@xflow.demo' || d.password !== 'demo1234') throw err('bad_credentials', 'Credenciales incorrectas. En el laboratorio usa admin@xflow.demo / demo1234');
      DB.session.admin = { email: 'admin@xflow.demo', since: Date.now() }; adminLog('login'); save();
      return { admin: DB.session.admin, csrf: 'demo' };
    },
    admin_logout() { DB.session.admin = null; save(); return {}; },
    admin_me() { return { admin: DB.session.admin, csrf: 'demo' }; },
    admin_stats() {
      requireAdmin();
      const paid = DB.orders.filter((o) => ['paid', 'fulfilled'].includes(o.status));
      const since = Date.now() - 30 * 86400000;
      const p30 = paid.filter((o) => new Date(o.paid_at).getTime() >= since);
      const daily = [];
      for (let i = 13; i >= 0; i--) { const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10); daily.push({ date: d, total: 0 }); }
      paid.forEach((o) => { const d = (o.paid_at || '').slice(0, 10); const x = daily.find((z) => z.date === d); if (x) x.total += o.total_cents / 100; });
      const top = {};
      p30.forEach((o) => o.items.forEach((l) => { top[l.name] = top[l.name] || { name: l.name, count: 0, total: 0 }; top[l.name].count++; top[l.name].total += l.unit_cents / 100; }));
      return { revenue_30d: p30.reduce((s, o) => s + o.total_cents, 0) / 100, revenue_all: paid.reduce((s, o) => s + o.total_cents, 0) / 100, orders_30d: p30.length, awaiting_review: DB.orders.filter((o) => o.status === 'awaiting_review').length, active_licenses: DB.licenses.filter((l) => l.status === 'active').length, unsynced_licenses: DB.licenses.filter((l) => l.status === 'active' && !l.center_synced).length, subscribers: DB.subscribers.length, daily, top: Object.values(top).sort((a, b) => b.total - a.total).slice(0, 6), recent: DB.orders.slice().reverse().slice(0, 8).map(orderAdmin), currency: DB.settings.site.currency };
    },
    admin_products() { requireAdmin(); return { products: clone(DB.products).sort((a, b) => a.sort_order - b.sort_order || a.id - b.id) }; },
    admin_product_save(d) {
      requireAdmin();
      const p = d.product || {};
      if (!String(p.name || '').trim()) throw err('name', 'El producto necesita un nombre.');
      const type = ['plugin', 'bundle', 'sample_pack'].includes(p.type) ? p.type : 'plugin';
      const planList = (p.plans || []).map((x) => ({ id: String(x.id || (x.type === 'days' ? 'd' + x.days : 'lifetime')).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40), label: String(x.label || (x.type === 'days' ? x.days + ' días' : 'Permanente')).slice(0, 60), type: x.type === 'days' ? 'days' : 'lifetime', days: x.type === 'days' ? Math.max(1, Number(x.days) || 30) : 0, price: Math.max(0, Math.round(Number(x.price || 0) * 100) / 100), compare_at: x.compare_at && Number(x.compare_at) > Number(x.price) ? Number(x.compare_at) : null, tier: String(x.tier || '').slice(0, 64) }));
      if (!planList.length && type !== 'sample_pack') throw err('plans', 'Añade al menos un precio (permanente o suscripción).');
      if (new Set(planList.map((x) => x.id)).size !== planList.length) throw err('plans', 'Cada precio necesita un ID distinto.');
      if (type === 'plugin' && !String(p.center_id || '').trim()) throw err('center_id', 'Indica el ID del plugin en X-Flow Center (para activar la licencia).');
      let slug = slugify(p.slug || p.name);
      if (DB.products.some((x) => x.slug === slug && x.id !== Number(p.id))) slug += '-' + rid(4).toLowerCase();
      const data = { type, slug, name: String(p.name).trim().slice(0, 160), tagline: String(p.tagline || ''), description: String(p.description || ''), features: (p.features || []).map((f) => String(f).trim()).filter(Boolean), specs: p.specs || {}, image: String(p.image || ''), gallery: (p.gallery || []).filter(Boolean), video_url: String(p.video_url || ''), category: String(p.category || ''), center_id: String(p.center_id || ''), plans: planList, discount_percent: Math.max(0, Math.min(100, Number(p.discount_percent) || 0)), discount_ends_at: p.discount_ends_at ? new Date(p.discount_ends_at).toISOString() : null, badge: String(p.badge || '').toUpperCase().slice(0, 40), bundle_items: [...new Set((p.bundle_items || []).map(Number))], bundle_all: !!p.bundle_all, featured: !!p.featured, is_new: !!p.is_new, sync_center: p.sync_center !== false, status: ['published', 'draft', 'coming_soon', 'hidden'].includes(p.status) ? p.status : 'published', sort_order: Number(p.sort_order) || 0, updated_at: now() };
      let prod = productById(p.id);
      if (prod) Object.assign(prod, data);
      else { prod = Object.assign({ id: DB.nextId.product++, created_at: now() }, data); DB.products.push(prod); }
      adminLog('product_save', { id: prod.id, name: prod.name }); save();
      return { product: clone(prod) };
    },
    admin_product_delete(d) {
      requireAdmin();
      const id = Number(d.id);
      if (DB.licenses.some((l) => l.product_id === id)) { const p = productById(id); if (p) p.status = 'hidden'; save(); return { hidden: true }; }
      DB.products = DB.products.filter((p) => p.id !== id); adminLog('product_delete', { id }); save();
      return { deleted: true };
    },
    admin_center_plugins() { requireAdmin(); return { plugins: DB.products.filter((p) => p.type === 'plugin').map((p) => ({ id: p.center_id, name: p.name, price: (p.plans[0] || {}).price || 0, description: '' })).concat([{ id: 'saturn', name: 'X-FLOW SATURN (ejemplo del Center)', price: 34.99, description: 'Plugin de ejemplo que existe en el Center pero aún no en la tienda.' }]) }; },
    admin_import_center_plugins() {
      requireAdmin();
      const have = DB.products.map((p) => String(p.center_id).toLowerCase());
      let created = 0;
      H.admin_center_plugins().plugins.forEach((cp) => {
        if (have.includes(cp.id.toLowerCase())) return;
        DB.products.push({ id: DB.nextId.product++, type: 'plugin', slug: slugify(cp.name), name: cp.name.replace(/ \(.*\)$/, ''), tagline: '', description: cp.description, features: [], specs: SPECS, image: '', gallery: [], video_url: '', category: '', center_id: cp.id, plans: plans(cp.price || 19.99, null), discount_percent: 0, discount_ends_at: null, badge: '', bundle_items: [], bundle_all: false, featured: false, is_new: false, status: 'draft', sort_order: 50, created_at: now(), updated_at: now() });
        created++;
      });
      save();
      return { created };
    },
    admin_coupons() { requireAdmin(); return { coupons: clone(DB.coupons).reverse() }; },
    admin_coupon_save(d) {
      requireAdmin();
      const c = d.coupon || {};
      const code = String(c.code || '').toUpperCase().replace(/[^A-Z0-9_-]/g, '');
      if (code.length < 3) throw err('code', 'El código debe tener al menos 3 caracteres (letras, números, - o _).');
      if (DB.coupons.some((x) => x.code === code && x.id !== Number(c.id))) throw err('code', 'Ya existe un cupón con ese código.');
      const kind = c.kind === 'fixed' ? 'fixed' : 'percent';
      let value = Math.max(0, Number(c.value) || 0); if (kind === 'percent') value = Math.min(100, value);
      const data = { code, kind, value, product_ids: (c.product_ids || []).map(Number), min_total: Math.max(0, Number(c.min_total) || 0), max_uses: c.max_uses === '' || c.max_uses == null ? null : Math.max(0, Number(c.max_uses)), starts_at: c.starts_at ? new Date(c.starts_at).toISOString() : null, expires_at: c.expires_at ? new Date(c.expires_at).toISOString() : null, active: c.active !== false };
      let x = DB.coupons.find((y) => y.id === Number(c.id));
      if (x) Object.assign(x, data); else { x = Object.assign({ id: DB.nextId.coupon++, used: 0 }, data); DB.coupons.push(x); }
      adminLog('coupon_save', code); save();
      return { id: x.id };
    },
    admin_coupon_delete(d) { requireAdmin(); DB.coupons = DB.coupons.filter((c) => c.id !== Number(d.id)); save(); return {}; },
    admin_orders(d, q) {
      requireAdmin();
      let list = DB.orders.slice().reverse();
      if (q.status) list = list.filter((o) => o.status === q.status);
      if (q.q) { const s = String(q.q).toLowerCase(); list = list.filter((o) => [o.email, o.recipient_email, o.public_id, o.manual_reference, o.provider_ref].some((v) => String(v || '').toLowerCase().includes(s))); }
      return { orders: list.map(orderAdmin) };
    },
    admin_order_approve(d) {
      requireAdmin();
      const o = DB.orders.find((x) => x.public_id === d.order_id); if (!o) throw err('not_found', 'Pedido no encontrado.');
      if (['fulfilled', 'refunded', 'cancelled'].includes(o.status)) throw err('order_closed', 'Este pedido ya está ' + o.status + '.');
      fulfill(o, o.provider_ref || 'manual:' + o.manual_reference, true); adminLog('order_approve', o.public_id); save();
      return { order: orderAdmin(o) };
    },
    admin_order_status(d) {
      requireAdmin();
      const o = DB.orders.find((x) => x.public_id === d.order_id); if (!o) throw err('not_found', 'Pedido no encontrado.');
      if (!['cancelled', 'refunded', 'failed', 'pending'].includes(d.status)) throw err('status', 'Estado no permitido.');
      o.status = d.status; if (d.note) o.admin_note = d.note;
      if (d.status === 'refunded' && d.revoke_licenses) DB.licenses.filter((l) => l.order_id === o.id).forEach((l) => { l.status = 'revoked'; l.center_message = 'Simulado: revocada en X-Flow Center.'; });
      save();
      return { order: orderAdmin(o) };
    },
    admin_order_sync(d) { requireAdmin(); const o = DB.orders.find((x) => x.public_id === d.order_id); if (!o) throw err('not_found', 'Pedido no encontrado.'); return { order: orderAdmin(o) }; },
    admin_licenses(d, q) {
      requireAdmin();
      let list = DB.licenses.slice().sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
      if (q.q) { const s = String(q.q).toLowerCase(); list = list.filter((l) => l.email.includes(s) || l.product_name.toLowerCase().includes(s)); }
      return { licenses: list.map(licensePublic) };
    },
    admin_license_grant(d) {
      const admin = requireAdmin();
      const emails = [...new Set(String(d.emails || '').split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
      if (!emails.length) throw err('emails', 'Escribe al menos un correo.');
      emails.forEach((e) => { if (!validEmail(e)) throw err('emails', 'Correo inválido: ' + e); });
      const p = productById(d.product_id); if (!p) throw err('product', 'Elige un producto o pack.');
      const lifetime = d.plan_type === 'lifetime';
      const out = [];
      emails.forEach((email) => expand(p).forEach((pl) => out.push(licensePublic(grant({ email, product: pl, lifetime, days: lifetime ? 0 : Math.max(1, Number(d.days) || 30), tier: d.tier || '', source: 'gift', order_id: null, note: d.note || 'Regalo de ' + admin.email })))));
      adminLog('license_gift', { emails, product: p.name }); save();
      return { licenses: out };
    },
    admin_license_revoke(d) { requireAdmin(); const l = DB.licenses.find((x) => x.id === Number(d.id)); if (!l) throw err('not_found', 'Licencia no encontrada.'); l.status = 'revoked'; l.center_message = 'Simulado: revocada en X-Flow Center.'; l.updated_at = now(); save(); return { license: licensePublic(l) }; },
    admin_license_extend(d) {
      requireAdmin();
      const l = DB.licenses.find((x) => x.id === Number(d.id)); if (!l) throw err('not_found', 'Licencia no encontrada.');
      const p = productById(l.product_id) || { id: l.product_id, name: l.product_name, center_id: l.center_id };
      if (l.status !== 'active') l.status = 'active';
      const lifetime = d.plan_type === 'lifetime';
      const n = grant({ email: l.email, product: p, lifetime, days: lifetime ? 0 : Math.max(1, Number(d.days) || 30), tier: l.tier, source: 'manual', order_id: l.order_id, note: l.note });
      save(); return { license: licensePublic(n) };
    },
    admin_license_resync(d) { requireAdmin(); const l = DB.licenses.find((x) => x.id === Number(d.id)); if (!l) throw err('not_found', 'Licencia no encontrada.'); l.center_synced = !!l.center_id; l.center_message = 'Simulado: sincronizada de nuevo.'; save(); return { license: licensePublic(l) }; },
    admin_settings() {
      requireAdmin();
      const pay = clone(DB.settings.payments);
      pay.paypal.secret = mask(pay.paypal.secret); pay.paypal.webhook_id = mask(pay.paypal.webhook_id);
      pay.stripe.secret_key = mask(pay.stripe.secret_key); pay.stripe.webhook_secret = mask(pay.stripe.webhook_secret);
      pay.binance.api_key = mask(pay.binance.api_key); pay.binance.secret_key = mask(pay.binance.secret_key);
      pay._locked = [];
      const center = clone(DB.settings.center); center.http.secret = mask(center.http.secret); center._locked = [];
      const base = location.origin + location.pathname.replace(/admin\/?(index\.html)?$/, '');
      return { site: clone(DB.settings.site), sale: clone(DB.settings.sale), payments: pay, center, webhooks: { paypal: base + 'api/index.php?action=webhook_paypal', stripe: base + 'api/index.php?action=webhook_stripe', binance: base + 'api/index.php?action=webhook_binance' } };
    },
    admin_settings_save(d) {
      requireAdmin();
      const sec = d.section; const v = clone(d.value || {}); delete v._locked;
      if (!['site', 'sale', 'payments', 'center'].includes(sec)) throw err('section', 'Sección inválida.');
      const keepSecret = (obj, cur, key) => { if (String(obj[key] || '').startsWith('••••')) obj[key] = cur[key]; };
      if (sec === 'payments') {
        const cur = DB.settings.payments;
        keepSecret(v.paypal, cur.paypal, 'secret'); keepSecret(v.paypal, cur.paypal, 'webhook_id');
        keepSecret(v.stripe, cur.stripe, 'secret_key'); keepSecret(v.stripe, cur.stripe, 'webhook_secret');
        keepSecret(v.binance, cur.binance, 'api_key'); keepSecret(v.binance, cur.binance, 'secret_key');
        v.manual = (v.manual || []).map((m) => ({ id: slugify(m.id || m.name), name: String(m.name || '').slice(0, 60), enabled: !!m.enabled, instructions: String(m.instructions || ''), account: String(m.account || '') }));
      }
      if (sec === 'center') {
        keepSecret(v.http, DB.settings.center.http, 'secret');
        Object.keys(v.db || {}).forEach((k) => { if (/^(table|col_)/.test(k) && v.db[k] && !/^[A-Za-z0-9_]{1,64}$/.test(v.db[k])) throw err('center_mapping', 'Nombre inválido: ' + v.db[k]); });
      }
      if (sec === 'sale') { v.percent = Math.max(0, Math.min(90, Number(v.percent) || 0)); v.ends_at = v.ends_at ? new Date(v.ends_at).toISOString() : null; v.product_ids = (v.product_ids || []).map(Number); }
      DB.settings[sec] = v; adminLog('settings_save', sec); save();
      return { value: sec === 'sale' ? v : H.admin_settings()[sec] };
    },
    admin_center_test() {
      requireAdmin();
      const c = DB.settings.center;
      if (c.mode === 'none') return { result: { ok: false, message: 'Modo manual: la tienda no escribe en X-Flow Center.' } };
      return { result: { ok: true, message: 'Modo demo: en el servidor real aquí se comprueba la tabla "' + (c.mode === 'db' ? c.db.table : c.http.url) + '" de tu base de datos existente.' } };
    },
    admin_center_describe() {
      requireAdmin();
      return { tables: [
        { table: 'licencias', columns: ['id', 'email', 'plugin', 'fecha_expiracion', 'estado', 'fecha_creacion'].map((n) => ({ name: n, type: 'demo' })) },
        { table: 'usuarios', columns: ['id', 'email', 'password', 'aka', 'rol', 'foto_url'].map((n) => ({ name: n, type: 'demo' })) },
        { table: 'plugins', columns: ['id', 'nombre', 'precio_perm', 'descripcion'].map((n) => ({ name: n, type: 'demo' })) },
      ] };
    },
    admin_subscribers() { requireAdmin(); return { subscribers: DB.subscribers }; },
    admin_log() { requireAdmin(); return { log: DB.log }; },
    admin_upload() { throw err('upload', 'En el laboratorio no se suben archivos: pega la URL de la imagen.'); },
    async admin_center_sync() {
      requireAdmin();
      const r = await liveSync(true);
      return { result: { at: Math.floor(r.at / 1000), source: 'api', found: r.found, created: r.created || 0, updated: r.updated || 0, error: r.ok ? '' : r.error } };
    },
    admin_catalog_status() {
      requireAdmin();
      const r = liveState();
      return { sync: r.at ? { at: Math.floor(r.at / 1000), source: 'api', found: r.found, created: r.created || 0, updated: r.updated || 0, error: r.ok ? '' : r.error } : null, legacy: null };
    },
    async admin_import_legacy() {
      requireAdmin();
      try {
        const cloud = await fetchJson(XF.cfg.centerApi + '?accion=leer_configuracion');
        const conf = cloud && (cloud.plugins || cloud.packs) ? cloud : cloud && cloud.data ? cloud.data : cloud && cloud.config_data ? (typeof cloud.config_data === 'string' ? JSON.parse(cloud.config_data) : cloud.config_data) : cloud;
        let upd = 0, packs = 0;
        (conf.plugins || []).forEach((lp) => {
          const p = DB.products.find((x) => x.type === 'plugin' && String(x.center_id).toLowerCase() === String(lp.id).toLowerCase());
          if (!p) return;
          if (Number(lp.discount) > 0 && !p.discount_percent) p.discount_percent = Math.min(90, Math.round(lp.discount));
          if (lp.isNew) p.is_new = true;
          if (lp.etiqueta_oferta && !p.badge) p.badge = String(lp.etiqueta_oferta).toUpperCase();
          upd++;
        });
        (conf.packs || []).forEach((pk) => {
          const items = (pk.includes || []).map((id) => DB.products.find((x) => x.type === 'plugin' && String(x.center_id).toLowerCase() === String(id).toLowerCase())).filter(Boolean).map((x) => x.id);
          if (!items.length || !Number(pk.price) || DB.products.some((x) => x.slug === slugify(pk.name))) return;
          DB.products.push({ id: DB.nextId.product++, type: 'bundle', slug: slugify(pk.name), name: String(pk.name).toUpperCase(), tagline: String(pk.desc || '').slice(0, 140), description: String(pk.desc || ''), features: [], specs: {}, image: absCenter(pk.imagen_url || ''), gallery: [], video_url: '', category: 'Pack', center_id: '', plans: plans(Number(pk.price), null), discount_percent: Math.round(Number(pk.discount) || 0), discount_ends_at: null, badge: 'PACK', bundle_items: items, bundle_all: false, featured: false, is_new: !!pk.isNew, status: 'published', sync_center: false, sort_order: 5, created_at: now(), updated_at: now() });
          packs++;
        });
        save();
        return { result: { plugins_updated: upd, packs_created: packs, reviews: 0 } };
      } catch (e) {
        throw err('legacy', 'No se pudo leer tu web anterior desde GitHub Pages (tu servidor no permite CORS). En tu hosting sí funciona.');
      }
    },
    admin_users_test() { requireAdmin(); return { result: { ok: true, message: 'Laboratorio: en tu servidor aquí se comprueba la tabla de usuarios de tu base de datos.' } }; },
    demo_reset() { DB = seed(); save(); XF.store.del(LIVE_KEY); return {}; },
  };

  XF.demoBackend = {
    handle(action, data, query) {
      const fn = H[action];
      if (!fn) throw err('unknown_action', 'Acción desconocida: ' + action);
      return fn(data || {}, query || {});
    },
    reset() { DB = seed(); save(); XF.store.del(LIVE_KEY); },
  };
})();
