/* X-FLOW STORE — tienda (SPA con rutas #/...) */
(function () {
  'use strict';
  const XF = window.XF;
  const esc = XF.esc, icon = XF.icon, money = (v) => XF.money(v, S.currency);
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));

  const S = {
    settings: null,
    site: {},
    products: [],
    customer: null,
    currency: 'USD',
    cart: XF.store.get('xf_cart', []),
    coupon: XF.store.get('xf_coupon', ''),
    quote: null,
    quoteError: '',
    filter: { cat: 'Todos', sort: 'featured', q: '' },
    method: '',
    timers: [],
    owned: [],
  };

  /* ================================================================ datos */
  const byId = (id) => S.products.find((p) => p.id === Number(id));
  const bySlug = (slug) => S.products.find((p) => p.slug === slug);
  const plugins = () => S.products.filter((p) => p.type === 'plugin' && p.status === 'published');
  const bundles = () => S.products.filter((p) => p.type === 'bundle' && p.status === 'published');
  const samplePacks = () => S.products.filter((p) => p.type === 'sample_pack');
  const lifetimePlan = (p) => p.plans.find((x) => x.type === 'lifetime') || p.plans[0];
  const subPlan = (p) => p.plans.filter((x) => x.type === 'days').sort((a, b) => a.days - b.days)[0];
  const saleLive = () => S.settings && S.settings.sale && S.settings.sale.active;
  /** Licencia activa del cliente para este producto (compras en la tienda o licencias previas del Center). */
  const ownedOf = (p) => S.owned.find((o) => o.product_id === p.id) || null;

  /* ================================================================ piezas */
  function mediaHTML(p, cls) {
    if (p.image) return '<img src="' + esc(XF.asset(p.image)) + '" alt="' + esc(p.name) + '" loading="lazy" class="' + (cls || '') + '">';
    if (p.type === 'bundle' && p.includes && p.includes.length) {
      const imgs = p.includes.filter((i) => i.image).slice(0, 4).map((i) => '<img src="' + esc(XF.asset(i.image)) + '" alt="" loading="lazy">').join('');
      return '<div class="collage">' + imgs + '<span class="pill grad-bg count">' + icon('layers') + p.includes.length + ' plugins</span></div>';
    }
    return '<div class="empty" style="padding:0">' + icon(p.type === 'sample_pack' ? 'music' : 'plug') + '</div>';
  }

  function priceHTML(p) {
    const lp = lifetimePlan(p);
    if (!lp) return '<div class="price"><b>—</b></div>';
    const sp = subPlan(p);
    let sub = '';
    if (sp && sp !== lp) sub = '<small>o ' + money(sp.final_price) + XF.planSuffix(sp) + '</small>';
    const suffix = lp.type === 'days' ? XF.planSuffix(lp) : '';
    return '<div class="price">' + (lp.final_compare ? '<s>' + money(lp.final_compare) + '</s>' : '') + '<b>' + money(lp.final_price) + '<span style="font-size:.6em;color:var(--muted)">' + suffix + '</span></b>' + sub + '</div>';
  }

  function card(p) {
    const soon = p.status === 'coming_soon';
    const lp = lifetimePlan(p);
    const flags = [];
    if (p.badge) flags.push('<span class="pill grad-bg">' + esc(p.badge) + '</span>');
    else if (p.is_new) flags.push('<span class="pill grad-bg">NUEVO</span>');
    else flags.push('<span></span>');
    const own = ownedOf(p);
    if (own) flags.push('<span class="pill ok">' + icon('check') + (own.lifetime ? 'YA LO TIENES' : 'ACTIVO') + '</span>');
    else if (p.discount_active > 0) flags.push('<span class="off">-' + p.discount_active + '%</span>');
    const cat = p.type === 'bundle' ? 'PACK · ' + (p.includes ? p.includes.length : 0) + ' PLUGINS' : (p.category ? esc(p.category) + ' · ' : '') + esc((p.specs && p.specs.formats) || 'VST3');
    return '<article class="pcard' + (soon ? ' soon-card' : '') + ' reveal">' +
      '<a class="pcard-media" href="#/p/' + esc(p.slug) + '"><div class="pcard-flags">' + flags.join('') + '</div>' + mediaHTML(p) + '</a>' +
      '<div class="pcard-body"><span class="pcard-cat">' + cat + '</span>' +
      '<h3><a href="#/p/' + esc(p.slug) + '">' + esc(p.name) + '</a></h3>' +
      (p.tagline ? '<p>' + esc(p.tagline) + '</p>' : '') +
      '<div class="pcard-foot">' + (soon ? '<div class="price"><b style="font-size:1rem;color:var(--accent)">PRÓXIMAMENTE</b></div>' : priceHTML(p)) +
      (own && own.lifetime ? '<a class="add-btn" href="#/cuenta" aria-label="Ya tienes ' + esc(p.name) + '" style="background:color-mix(in srgb,var(--ok) 25%,var(--panel))">' + icon('check') + '</a>' :
        soon || !lp ? '<button class="add-btn" disabled aria-label="Próximamente">' + icon('clock') + '</button>' : '<button class="add-btn" data-action="add" data-id="' + p.id + '" data-plan="' + esc(lp.id) + '" aria-label="Añadir ' + esc(p.name) + ' al carrito">' + icon('plus') + '</button>') +
      '</div></div></article>';
  }

  function sectionHead(eyebrow, title, sub, link) {
    return '<div class="sec-head"><div><span class="eyebrow">' + esc(eyebrow) + '</span><h2>' + title + '</h2>' + (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>' + (link ? '<a class="link-more" href="' + link[0] + '">' + esc(link[1]) + icon('arrow-right') + '</a>' : '') + '</div>';
  }

  function countdownHTML(endsAt, id) {
    if (!endsAt) return '';
    return '<div class="countdown" data-countdown="' + esc(endsAt) + '" id="' + (id || '') + '">' + ['días', 'horas', 'min', 'seg'].map((l) => '<div><b>--</b><span>' + l + '</span></div>').join('') + '</div>';
  }
  function tickCountdowns() {
    $$('[data-countdown]').forEach((el) => {
      const ms = new Date(el.getAttribute('data-countdown')).getTime() - Date.now();
      const v = ms > 0 ? [Math.floor(ms / 86400000), Math.floor(ms / 3600000) % 24, Math.floor(ms / 60000) % 60, Math.floor(ms / 1000) % 60] : [0, 0, 0, 0];
      const bs = $$('b', el);
      if (bs.length === 4) v.forEach((n, i) => { bs[i].textContent = String(n).padStart(2, '0'); });
      else el.textContent = (v[0] ? v[0] + 'd ' : '') + [v[1], v[2], v[3]].map((n) => String(n).padStart(2, '0')).join(':');
    });
  }

  /* ================================================================ layout */
  function renderChrome() {
    const site = S.site;
    XF.applyColors(site.colors);
    document.title = (site.name || 'X-FLOW') + ' · Plugins VST3';
    $('#brand').innerHTML = site.logo_url ? '<img src="' + esc(XF.asset(site.logo_url)) + '" alt="' + esc(site.name) + '">' : XF.logoMark(34) + '<span>' + esc(site.name || 'X-FLOW') + '<small>PLUGINS</small></span>';

    const spOn = !!site.sample_packs_enabled;
    const links = [
      ['#/plugins', 'Plugins'],
      ['#/packs', 'Packs'],
      ['#/ofertas', 'Ofertas'],
      spOn ? ['#/sample-packs', 'Sample Packs'] : null,
      ['#/center', 'X-Flow Center'],
      ['#/soporte', 'Soporte'],
    ].filter(Boolean);
    $('#nav').innerHTML = links.map((l) => '<a href="' + l[0] + '">' + esc(l[1]) + '</a>').join('') +
      (spOn ? '' : '<span class="disabled" title="Muy pronto">Sample Packs <em class="soon">PRONTO</em></span>');
    $('#mnav-panel').innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><a class="brand" href="#/">' + XF.logoMark(30) + '<span>' + esc(site.name || 'X-FLOW') + '</span></a><button class="btn-icon" data-action="menu-close" aria-label="Cerrar">' + icon('x') + '</button></div>' +
      [['#/', 'Inicio', 'home'], ['#/plugins', 'Plugins', 'plug'], ['#/packs', 'Packs', 'layers'], ['#/ofertas', 'Ofertas', 'flame'], ['#/center', 'X-Flow Center', 'download'], ['#/soporte', 'Soporte', 'message'], ['#/cuenta', 'Mi cuenta', 'user']]
        .map((l) => '<a href="' + l[0] + '" data-action="menu-close">' + icon(l[2]) + esc(l[1]) + '</a>').join('') +
      (spOn ? '<a href="#/sample-packs" data-action="menu-close">' + icon('music') + 'Sample Packs</a>' : '<span class="disabled">' + icon('music') + 'Sample Packs <em class="soon">PRONTO</em></span>');

    renderAnnouncement();
    renderFooter();
    updateAccountBtn();
  }

  function renderAnnouncement() {
    const el = $('#annc');
    const sale = S.settings.sale;
    const a = S.site.announcement || {};
    let dismissed = false;
    try { dismissed = sessionStorage.getItem('xf_annc_x') === '1'; } catch (e) {}
    if (dismissed) { el.innerHTML = ''; return; }
    if (sale && sale.active) {
      el.innerHTML = '<div class="annc"><div class="wrap">' + icon('flame') + '<span>' + esc(sale.title || 'OFERTA') + ' · -' + Number(sale.percent) + '%</span>' +
        (sale.ends_at ? '<span class="cd" data-countdown="' + esc(sale.ends_at) + '"></span>' : '') + '<a href="#/ofertas">Ver ofertas</a></div><button class="annc-x" data-action="annc-x" aria-label="Cerrar anuncio">' + icon('x') + '</button></div>';
    } else if (a.active && a.text) {
      el.innerHTML = '<div class="annc"><div class="wrap">' + icon('zap') + '<span>' + esc(a.text) + '</span>' + (a.link ? '<a href="' + esc(a.link) + '">Ver más</a>' : '') + '</div><button class="annc-x" data-action="annc-x" aria-label="Cerrar anuncio">' + icon('x') + '</button></div>';
    } else el.innerHTML = '';
  }

  function renderFooter() {
    const site = S.site, so = site.socials || {};
    const socials = [['instagram', 'instagram'], ['youtube', 'youtube'], ['tiktok', 'music'], ['discord', 'message']].filter((s) => so[s[0]])
      .map((s) => '<a class="btn-icon" href="' + esc(so[s[0]]) + '" target="_blank" rel="noopener" aria-label="' + s[0] + '">' + icon(s[1]) + '</a>').join('');
    const methods = (S.settings.payment_methods || []).map((m) => '<span>' + esc(m.name.replace(/\s*\(.*\)/, '')) + '</span>').join('');
    $('#footer').innerHTML = '<div class="wrap"><div class="ftr-grid">' +
      '<div style="grid-column:span 2;min-width:0"><a class="brand" href="#/">' + XF.logoMark(34) + '<span>' + esc(site.name || 'X-FLOW') + '<small>PLUGINS</small></span></a><p class="muted" style="max-width:26em;font-size:.92rem">Plugins VST3 hechos por productores para productores. Cada compra se activa sola en X-Flow Center.</p><div class="socials">' + socials + '</div></div>' +
      '<div><h4>Tienda</h4><ul><li><a href="#/plugins">Plugins</a></li><li><a href="#/packs">Packs</a></li><li><a href="#/ofertas">Ofertas</a></li><li>' + (site.sample_packs_enabled ? '<a href="#/sample-packs">Sample Packs</a>' : '<span>Sample Packs <em class="soon">PRONTO</em></span>') + '</li></ul></div>' +
      '<div><h4>Ayuda</h4><ul><li><a href="#/center">X-Flow Center</a></li><li><a href="#/soporte">Soporte y FAQ</a></li><li><a href="#/cuenta">Mi cuenta</a></li>' + (site.support_email ? '<li><a href="mailto:' + esc(site.support_email) + '">' + esc(site.support_email) + '</a></li>' : '') + '</ul></div>' +
      '<div><h4>Legal</h4><ul><li><a href="#/terminos">Términos y licencias</a></li><li><a href="#/terminos">Reembolsos</a></li><li><a href="#/terminos">Privacidad</a></li></ul></div>' +
      '</div><div class="ftr-bottom"><span>© ' + new Date().getFullYear() + ' ' + esc(site.name || 'X-FLOW') + '. Todos los derechos reservados.</span><div class="pay-logos">' + methods + '</div></div></div>';
  }

  function updateAccountBtn() {
    const b = $('#acct-btn');
    if (!b) return;
    b.innerHTML = S.customer ? icon('user') + esc(S.customer.aka || S.customer.email.split('@')[0]) : icon('user') + 'Mi cuenta';
  }

  /* ================================================================ páginas */
  function pageHome() {
    const site = S.site;
    const feat = S.products.filter((p) => p.featured && p.status === 'published');
    const show = (feat.length ? feat : plugins()).filter((p) => p.image || (p.includes && p.includes.length)).slice(0, 5);
    const newest = plugins().slice().sort((a, b) => (b.is_new - a.is_new) || String(b.created_at).localeCompare(String(a.created_at))).slice(0, 4);
    const allAccess = bundles().find((b) => b.bundle_all) || bundles()[0];
    const sale = S.settings.sale;
    const onSale = S.products.filter((p) => p.discount_active > 0 && p.status === 'published');
    const ticker = (site.ticker || []).map((t) => '<span>' + esc(t) + '</span>').join('');

    let h = '';
    // HERO
    h += '<section class="hero"><div class="wrap"><div>' +
      '<span class="pill grad-bg">' + icon('sparkles') + esc(site.hero_eyebrow || 'Plugins VST3') + '</span>' +
      '<h1>' + (site.hero_title || 'X-FLOW') + '</h1>' +
      '<p class="lead">' + esc(site.hero_subtitle || '') + '</p>' +
      '<div class="hero-ctas"><a class="btn primary lg" href="#/plugins">' + icon('plug') + 'Ver plugins</a>' + (allAccess ? '<a class="btn ghost lg" href="#/p/' + esc(allAccess.slug) + '">' + icon('layers') + esc(allAccess.name) + '</a>' : '') + '</div>' +
      '<div class="hero-stats"><div><b>' + plugins().length + '</b><span>Plugins VST3</span></div><div><b>1 CLIC</b><span>Activación en el Center</span></div><div><b>x64</b><span>Windows 10 / 11</span></div></div>' +
      '</div>';
    if (show.length) {
      const f = show[0];
      h += '<div class="showcase"><div class="show-card"><a class="show-media" id="show-media" href="#/p/' + esc(f.slug) + '">' + mediaHTML(f) + '</a>' +
        '<div class="show-meta"><div><span class="pill" id="show-badge">' + esc(f.badge || (f.type === 'bundle' ? 'PACK' : 'DESTACADO')) + '</span><h3 id="show-name">' + esc(f.name) + '</h3><p id="show-tag">' + esc(f.tagline || '') + '</p></div>' +
        '<div style="display:flex;gap:10px;align-items:center"><div id="show-price">' + priceHTML(f) + '</div><button class="add-btn" id="show-add" data-action="add" data-id="' + f.id + '" data-plan="' + esc(lifetimePlan(f).id) + '" aria-label="Añadir al carrito">' + icon('plus') + '</button></div></div></div>' +
        (show.length > 1 ? '<div class="show-dots" id="show-dots">' + show.map((p, i) => '<button class="' + (i === 0 ? 'on' : '') + '" data-action="show" data-i="' + i + '" aria-label="' + esc(p.name) + '"></button>').join('') + '</div>' : '') + '</div>';
    }
    h += '</div><div class="eq" aria-hidden="true">' + Array.from({ length: 48 }, (_, i) => '<i style="animation-delay:-' + ((i * 137) % 1600) / 1000 + 's;animation-duration:' + (1.1 + ((i * 53) % 90) / 100) + 's"></i>').join('') + '</div></section>';

    if (ticker) h += '<div class="ticker" aria-hidden="true"><div class="ticker-track">' + ticker + ticker + ticker + ticker + '</div></div>';

    // NUEVOS
    h += '<section class="sec"><div class="wrap">' + sectionHead('Recién salidos', 'Lo <span class="grad">nuevo</span>', 'Los últimos plugins del laboratorio X-FLOW.', ['#/plugins', 'Ver todos']) + '<div class="grid">' + newest.map(card).join('') + '</div></div></section>';

    // PACK DESTACADO
    if (allAccess) {
      const lp = lifetimePlan(allAccess);
      const value = (allAccess.includes || []).reduce((s, i) => s + Number(i.value || 0), 0);
      const sp = subPlan(allAccess);
      h += '<section class="sec tight"><div class="wrap"><div class="bundle-banner reveal"><div><span class="pill accent">' + icon('layers') + esc(allAccess.badge || 'PACK') + '</span><h2>' + esc(allAccess.name) + '</h2><p>' + esc(allAccess.tagline || allAccess.description || '') + '</p>' +
        '<div class="bb-prices"><b>' + money(lp.final_price) + '</b>' + (value > lp.final_price ? '<s>' + money(value) + ' por separado</s><span class="pill ok">Ahorras ' + money(value - lp.final_price) + '</span>' : '') + '</div>' +
        '<div class="hero-ctas"><button class="btn primary" data-action="add" data-id="' + allAccess.id + '" data-plan="' + esc(lp.id) + '">' + icon('cart') + 'Añadir al carrito</button>' + (sp ? '<button class="btn ghost" data-action="add" data-id="' + allAccess.id + '" data-plan="' + esc(sp.id) + '">o ' + money(sp.final_price) + XF.planSuffix(sp) + '</button>' : '') + '</div></div>' +
        '<div class="bb-thumbs">' + (allAccess.includes || []).map((i) => '<a href="#/p/' + esc(i.slug) + '">' + (i.image ? '<img src="' + esc(XF.asset(i.image)) + '" alt="" loading="lazy">' : icon('plug')) + '<span>' + esc(i.name) + '</span></a>').join('') + '</div></div></div></section>';
    }

    // OFERTAS
    if (saleLive() && onSale.length) {
      h += '<section class="sec"><div class="wrap"><div class="sale-box reveal"><div class="sec-head"><div><span class="eyebrow" style="color:var(--accent)">Tiempo limitado</span><h2>' + esc(sale.title || 'Ofertas') + ' <span class="grad">-' + Number(sale.percent) + '%</span></h2></div>' + countdownHTML(sale.ends_at) + '</div><div class="grid">' + onSale.slice(0, 4).map(card).join('') + '</div></div></div></section>';
    }

    // TODOS
    h += '<section class="sec" id="catalogo"><div class="wrap">' + sectionHead('Catálogo', 'Todos los <span class="grad">plugins</span>', 'Compra permanente o por suscripción. Elige lo que te funcione.', ['#/plugins', 'Filtrar catálogo']) + '<div class="grid">' + plugins().map(card).join('') + '</div></div></section>';

    // SAMPLE PACKS
    h += samplePacksBlock();

    // CENTER
    h += centerBand();

    // TESTIMONIOS
    if ((site.testimonials || []).length) {
      h += '<section class="sec"><div class="wrap">' + sectionHead('Productores', 'Lo que <span class="grad">dicen</span>', '') + '<div class="quotes">' + site.testimonials.map((t) => '<figure class="quote reveal" style="margin:0"><div class="stars">' + Array.from({ length: Math.max(1, Math.min(5, t.rating || 5)) }, () => icon('star')).join('') + '</div><p>“' + esc(t.text) + '”</p><footer><b>' + esc(t.name) + '</b>' + esc(t.role || '') + '</footer></figure>').join('') + '</div></div></section>';
    }

    // FAQ
    h += faqBlock();
    h += newsletterBlock();
    return h;
  }

  function samplePacksBlock() {
    if (S.site.sample_packs_enabled) {
      const packs = samplePacks().filter((p) => p.status !== 'draft' && p.status !== 'hidden');
      if (!packs.length) return '';
      return '<section class="sec"><div class="wrap">' + sectionHead('Sonidos', 'Sample <span class="grad">Packs</span>', '', ['#/sample-packs', 'Ver todos']) + '<div class="grid">' + packs.map(card).join('') + '</div></div></section>';
    }
    return '<section class="sec"><div class="wrap">' + sectionHead('Muy pronto', 'Sample <span class="grad">Packs</span>', 'Kits, loops y one-shots firmados por X-FLOW. Esta sección se abrirá pronto.') +
      '<div class="locked-sec" aria-disabled="true"><div class="locked-grid">' + Array.from({ length: 4 }, () => '<div class="ph"></div>').join('') + '</div><div class="locked-over"><div>' + icon('lock') + '<h3>Próximamente</h3><p>Los sample packs están desactivados por ahora.</p></div></div></div></div></section>';
  }

  function centerBand() {
    const url = S.site.center_download_url;
    const demoRows = plugins().slice(0, 4).map((p, i) => '<div class="row"><span>' + esc(p.name) + '</span><span class="pill ' + (i === 0 ? 'ok' : i === 1 ? 'info' : 'ok') + '">' + (i === 1 ? 'INSTALANDO…' : 'ACTIVO') + '</span></div>').join('');
    return '<section class="sec"><div class="wrap"><div class="center-band reveal"><div><span class="eyebrow">X-Flow Center</span><h2>Compras aquí.<br><span class="grad">Aparece allá.</span></h2>' +
      '<p class="muted">Cada compra se activa automáticamente en tu cuenta de X-Flow Center. Abre la app con el mismo correo y tus plugins estarán listos para instalar — sin claves ni dongles.</p>' +
      '<div class="hero-ctas" style="margin-top:22px">' + (url ? '<a class="btn primary" href="' + esc(url) + '" target="_blank" rel="noopener">' + icon('download') + 'Descargar Center</a>' : '') + '<a class="btn ghost" href="#/center">Cómo funciona</a></div></div>' +
      '<div class="fake-app" aria-hidden="true"><div class="bar"><i></i><i></i><i></i><span style="margin-left:8px">X-FLOW CENTER · MIS PLUGINS</span></div>' + demoRows + '</div></div></div></section>';
  }

  function faqBlock() {
    const faq = S.site.faq || [];
    if (!faq.length) return '';
    return '<section class="sec"><div class="wrap">' + sectionHead('Preguntas', 'Preguntas <span class="grad">frecuentes</span>', '') + '<div class="faq">' + faq.map((f) => '<details><summary>' + esc(f.q) + icon('plus') + '</summary><p>' + esc(f.a) + '</p></details>').join('') + '</div></div></section>';
  }

  function newsletterBlock() {
    return '<section class="sec tight"><div class="wrap"><div class="news reveal"><div><h2>Entérate primero</h2><p>Lanzamientos, ofertas y códigos solo para la lista. Sin spam.</p></div>' +
      '<form data-form="subscribe"><label class="sr-only" for="nl-email">Correo</label><input id="nl-email" name="email" type="email" required placeholder="tu@correo.com" autocomplete="email"><button class="btn">Suscribirme</button></form></div></div></section>';
  }

  function pageCatalog(kind) {
    const isPacks = kind === 'packs';
    const list = isPacks ? bundles() : plugins();
    const cats = ['Todos'].concat(Array.from(new Set(list.map((p) => p.category).filter(Boolean))));
    if (!cats.includes(S.filter.cat)) S.filter.cat = 'Todos';
    const title = isPacks ? 'Packs <span class="grad">todo en uno</span>' : 'Todos los <span class="grad">plugins</span>';
    const sub = isPacks ? 'Varios plugins, un solo precio. Permanente o por suscripción.' : 'Mezcla, análisis, ritmo y creatividad. Filtra y elige.';
    return '<div class="wrap"><div class="page-title"><span class="eyebrow">' + (isPacks ? 'Packs' : 'Catálogo') + '</span><h1>' + title + '</h1><p>' + sub + '</p></div>' +
      '<div class="toolbar" style="margin-top:24px"><div class="chips">' + (isPacks ? '' : cats.map((c) => '<button class="chip' + (c === S.filter.cat ? ' on' : '') + '" data-action="cat" data-cat="' + esc(c) + '">' + esc(c) + '</button>').join('')) + '</div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap"><label class="sr-only" for="q">Buscar</label><input class="input" id="q" placeholder="Buscar…" value="' + esc(S.filter.q) + '" style="width:200px">' +
      '<select id="sort" aria-label="Ordenar"><option value="featured">Destacados</option><option value="price-asc">Precio: menor a mayor</option><option value="price-desc">Precio: mayor a menor</option><option value="new">Más nuevos</option><option value="name">Nombre</option></select></div></div>' +
      '<div class="grid" id="catalog-grid"></div></div>' + (isPacks ? '' : bundleStrip()) + '<div style="height:40px"></div>';
  }
  function filteredList(kind) {
    let list = kind === 'packs' ? bundles() : plugins();
    if (S.filter.cat !== 'Todos' && kind !== 'packs') list = list.filter((p) => p.category === S.filter.cat);
    const q = S.filter.q.trim().toLowerCase();
    if (q) list = list.filter((p) => (p.name + ' ' + p.tagline + ' ' + p.category + ' ' + p.description).toLowerCase().includes(q));
    const price = (p) => (lifetimePlan(p) || { final_price: 0 }).final_price;
    const sorts = {
      featured: (a, b) => (b.featured - a.featured) || (a.sort_order - b.sort_order),
      'price-asc': (a, b) => price(a) - price(b),
      'price-desc': (a, b) => price(b) - price(a),
      new: (a, b) => (b.is_new - a.is_new) || String(b.created_at).localeCompare(String(a.created_at)),
      name: (a, b) => a.name.localeCompare(b.name),
    };
    return list.slice().sort(sorts[S.filter.sort] || sorts.featured);
  }
  function renderCatalogGrid(kind) {
    const g = $('#catalog-grid');
    if (!g) return;
    const list = filteredList(kind);
    g.innerHTML = list.length ? list.map(card).join('') : '<div class="empty" style="grid-column:1/-1">' + icon('search') + 'No encontramos productos con ese filtro.</div>';
    reveal();
  }
  function bundleStrip() {
    const b = bundles();
    if (!b.length) return '';
    return '<section class="sec"><div class="wrap">' + sectionHead('Ahorra más', 'Mejor en <span class="grad">pack</span>', '', ['#/packs', 'Ver packs']) + '<div class="grid">' + b.map(card).join('') + '</div></div></section>';
  }

  function pageDeals() {
    const sale = S.settings.sale;
    const list = S.products.filter((p) => p.discount_active > 0 && p.status === 'published');
    const withCompare = S.products.filter((p) => p.status === 'published' && !p.discount_active && p.plans.some((pl) => pl.final_compare));
    const all = list.concat(withCompare);
    return '<div class="wrap"><div class="page-title"><span class="eyebrow" style="color:var(--accent)">Ofertas</span><h1>' + (saleLive() ? esc(sale.title) + ' <span class="grad">-' + Number(sale.percent) + '%</span>' : 'Ofertas <span class="grad">activas</span>') + '</h1><p>' + (saleLive() ? 'Precios rebajados por tiempo limitado.' : 'Descuentos disponibles ahora mismo.') + '</p>' +
      (saleLive() && sale.ends_at ? '<div style="margin-top:20px">' + countdownHTML(sale.ends_at) + '</div>' : '') + '</div>' +
      '<div class="grid" style="margin-top:28px">' + (all.length ? all.map(card).join('') : '<div class="empty" style="grid-column:1/-1">' + icon('tag') + 'No hay ofertas activas en este momento. Suscríbete para enterarte de la próxima.</div>') + '</div></div>' + bundleStrip() + newsletterBlock();
  }

  function pageSamplePacks() {
    if (S.site.sample_packs_enabled) {
      const packs = samplePacks().filter((p) => p.status !== 'draft' && p.status !== 'hidden');
      return '<div class="wrap"><div class="page-title"><span class="eyebrow">Sonidos</span><h1>Sample <span class="grad">Packs</span></h1></div><div class="grid" style="margin-top:28px">' + (packs.length ? packs.map(card).join('') : '<div class="empty" style="grid-column:1/-1">' + icon('music') + 'Aún no hay sample packs publicados.</div>') + '</div></div>';
    }
    return '<div class="wrap"><div class="page-title"><span class="eyebrow">Sonidos</span><h1>Sample <span class="grad">Packs</span></h1><p>Esta sección está desactivada por ahora. Muy pronto: kits, loops y one-shots firmados por X-FLOW.</p></div>' +
      '<div class="locked-sec" style="margin-top:28px"><div class="locked-grid">' + Array.from({ length: 8 }, () => '<div class="ph"></div>').join('') + '</div><div class="locked-over"><div>' + icon('lock') + '<h3>Próximamente</h3><p>Mientras tanto, mira los plugins.</p><a class="btn primary" style="margin-top:16px" href="#/plugins">Ver plugins</a></div></div></div></div>' + newsletterBlock();
  }

  function pageProduct(slug) {
    const p = bySlug(slug);
    if (!p) return pageNotFound();
    const soon = p.status === 'coming_soon';
    const plans = p.plans;
    const defPlan = lifetimePlan(p);
    const media = [];
    if (p.image) media.push({ type: 'img', src: p.image });
    (p.gallery || []).forEach((g) => media.push({ type: 'img', src: g }));
    const yt = XF.youtubeId(p.video_url);
    if (yt) media.push({ type: 'yt', id: yt });
    const inBundles = p.type === 'plugin' ? bundles().filter((b) => b.includes && b.includes.some((i) => i.id === p.id)) : [];
    const related = (p.type === 'bundle' ? bundles() : plugins()).filter((x) => x.id !== p.id).slice(0, 4);
    const specs = p.specs || {};

    let h = '<div class="wrap"><nav class="crumbs"><a href="#/">Inicio</a>' + icon('chevron-right') + '<a href="#/' + (p.type === 'bundle' ? 'packs' : 'plugins') + '">' + (p.type === 'bundle' ? 'Packs' : 'Plugins') + '</a>' + icon('chevron-right') + '<span>' + esc(p.name) + '</span></nav>';
    h += '<div class="pdp"><div><div class="gallery-main" id="gmain">' + (media.length ? mediaItem(media[0]) : mediaHTML(p)) + '</div>' +
      (media.length > 1 ? '<div class="thumbs">' + media.map((m, i) => '<button class="' + (i === 0 ? 'on' : '') + '" data-action="gal" data-i="' + i + '" aria-label="Imagen ' + (i + 1) + '">' + (m.type === 'yt' ? '<span class="pill grad-bg">' + icon('play') + 'VIDEO</span>' : '<img src="' + esc(XF.asset(m.src)) + '" alt="">') + '</button>').join('') + '</div>' : '') + '</div>';

    h += '<aside class="buy-box"><div style="display:flex;gap:8px;flex-wrap:wrap">' + (p.badge ? '<span class="pill grad-bg">' + esc(p.badge) + '</span>' : '') + (p.discount_active ? '<span class="off">-' + p.discount_active + '%</span>' : '') + '<span class="pill">' + esc(p.type === 'bundle' ? 'PACK' : p.category || 'PLUGIN') + '</span></div>' +
      '<h1>' + esc(p.name) + '</h1><p class="tag">' + esc(p.tagline || '') + '</p>';
    const own = ownedOf(p);
    if (own) h += '<div class="notice ok" style="margin-bottom:14px">' + icon('check-circle') + '<span>' + (own.lifetime ? 'Ya tienes este plugin de forma <b>permanente</b> en tu cuenta de X-Flow Center.' : 'Tienes acceso activo hasta el <b>' + XF.date(own.expires_at) + '</b>. Si compras de nuevo, los días se suman.') + '</span></div>';
    if (soon) {
      h += '<div class="notice warn">' + icon('clock') + '<span>Este producto sale muy pronto. Suscríbete abajo para enterarte del lanzamiento.</span></div>';
    } else if (plans.length) {
      h += '<div class="plans" role="radiogroup" aria-label="Tipo de licencia">' + plans.map((pl) => '<label class="plan' + (pl.id === defPlan.id ? ' on' : '') + '"><input type="radio" name="plan" value="' + esc(pl.id) + '"' + (pl.id === defPlan.id ? ' checked' : '') + '><div class="plan-info"><b>' + esc(pl.label) + (pl.tier ? ' · ' + esc(pl.tier) : '') + '</b><span>' + esc(XF.planDesc(pl)) + '</span></div><div class="plan-price">' + (pl.final_compare ? '<s>' + money(pl.final_compare) + '</s>' : '') + '<b>' + money(pl.final_price) + '</b><span class="muted" style="font-size:.72rem">' + XF.planSuffix(pl) + '</span></div></label>').join('') + '</div>' +
        '<div class="buy-actions"><button class="btn primary lg block" data-action="add-selected" data-id="' + p.id + '">' + icon('cart') + 'Añadir al carrito</button><button class="btn ghost block" data-action="buy-now" data-id="' + p.id + '">' + icon('zap') + 'Comprar ahora</button></div>';
    }
    h += '<ul class="trust"><li>' + icon('check-circle') + 'Se activa sola en X-Flow Center con tu correo</li><li>' + icon('check-circle') + 'Pago seguro: ' + esc((S.settings.payment_methods || []).map((m) => m.name.replace(/\s*\(.*\)/, '')).filter((v, i, a) => a.indexOf(v) === i).join(', ') || 'varios métodos') + '</li><li>' + icon('gift') + 'Puedes enviarlo como regalo</li></ul></aside></div>';

    if (p.type === 'bundle' && p.includes && p.includes.length) {
      const value = p.includes.reduce((s, i) => s + Number(i.value || 0), 0);
      h += '<section class="pdp-sec"><h2>Incluye ' + p.includes.length + ' plugins</h2>' + (value > defPlan.final_price ? '<p class="muted" style="margin-top:-8px">Valor por separado: <s>' + money(value) + '</s> · Ahorras <b style="color:var(--ok)">' + money(value - defPlan.final_price) + '</b></p>' : '') + (p.bundle_all ? '<div class="notice ok" style="margin-bottom:16px">' + icon('sparkles') + '<span>Incluye automáticamente los plugins nuevos que salgan mientras tu acceso esté activo.</span></div>' : '') +
        '<div class="grid">' + p.includes.map((i) => { const x = byId(i.id); return x ? card(x) : ''; }).join('') + '</div></section>';
    }
    if (p.description) h += '<section class="pdp-sec"><h2>Descripción</h2><div class="desc">' + esc(p.description) + '</div></section>';
    if ((p.features || []).length) h += '<section class="pdp-sec"><h2>Características</h2><div class="feat-grid">' + p.features.map((f) => '<div class="feat">' + icon('zap') + '<span>' + esc(f) + '</span></div>').join('') + '</div></section>';
    const specRows = [['Formato', specs.formats], ['Sistema', specs.os], ['Versión', specs.version], ['Tamaño', specs.size], ['Activación', 'X-Flow Center']].filter((r) => r[1]);
    if (p.type !== 'bundle') h += '<section class="pdp-sec"><h2>Requisitos</h2><div class="specs">' + specRows.map((r) => '<div><span>' + r[0] + '</span>' + esc(r[1]) + '</div>').join('') + '</div></section>';
    if (inBundles.length) h += '<section class="pdp-sec"><h2>Ahorra en un pack</h2><div class="grid">' + inBundles.map(card).join('') + '</div></section>';
    if (related.length) h += '<section class="pdp-sec"><h2>También te puede gustar</h2><div class="grid">' + related.map(card).join('') + '</div></section>';
    h += '</div>';
    if (!soon && plans.length) h += '<div class="mobile-buy"><div><b style="font-family:var(--display);font-size:1.3rem" id="mb-price">' + money(defPlan.final_price) + '</b><div class="muted" style="font-size:.75rem" id="mb-plan">' + esc(defPlan.label) + '</div></div><button class="btn primary" data-action="add-selected" data-id="' + p.id + '">' + icon('cart') + 'Añadir</button></div>';
    S._gallery = media;
    return h;
  }
  function mediaItem(m) {
    if (m.type === 'yt') return '<iframe src="https://www.youtube-nocookie.com/embed/' + esc(m.id) + '?rel=0" title="Video" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>';
    return '<img src="' + esc(XF.asset(m.src)) + '" alt="">';
  }

  function pageCenter() {
    const url = S.site.center_download_url;
    return '<div class="wrap"><div class="page-title"><span class="eyebrow">X-Flow Center</span><h1>Tu compra, <span class="grad">activada</span> al instante</h1><p>X-Flow Center es la app de Windows donde instalas, actualizas y activas tus plugins. La tienda y el Center comparten tu cuenta: lo que compras aquí aparece allá.</p>' +
      (url ? '<div class="hero-ctas" style="margin-top:24px"><a class="btn primary lg" href="' + esc(url) + '" target="_blank" rel="noopener">' + icon('download') + 'Descargar X-Flow Center</a></div>' : '') + '</div>' +
      '<section class="sec"><div class="steps">' +
      '<div class="step">' + icon('cart') + '<h3>Compra</h3><p>Elige tus plugins o un pack, permanente o por suscripción, y paga con tu método favorito.</p></div>' +
      '<div class="step">' + icon('zap') + '<h3>Activación automática</h3><p>Al confirmarse el pago, la licencia se escribe en tu cuenta de X-Flow Center con el correo de la compra.</p></div>' +
      '<div class="step">' + icon('download') + '<h3>Instala</h3><p>Abre el Center, inicia sesión y pulsa instalar. Tus VST3 quedan listos en tu DAW.</p></div>' +
      '</div></section>' + faqBlock() + '</div>';
  }

  function pageSupport() {
    return '<div class="wrap"><div class="page-title"><span class="eyebrow">Soporte</span><h1>¿Te <span class="grad">ayudamos</span>?</h1><p>Revisa las preguntas frecuentes o escríbenos. Respondemos en español.</p></div></div>' + faqBlock() +
      '<section class="sec tight"><div class="wrap"><div class="co-card" style="max-width:720px"><h3>' + icon('mail') + 'Escríbenos</h3><form data-form="ticket" class="row2">' +
      '<label class="field"><span>Nombre</span><input name="name" autocomplete="name" required></label>' +
      '<label class="field"><span>Correo</span><input name="email" type="email" autocomplete="email" required value="' + esc(S.customer ? S.customer.email : '') + '"></label>' +
      '<label class="field" style="grid-column:1/-1"><span>Asunto</span><input name="subject" required placeholder="Licencia, pago, instalación…"></label>' +
      '<label class="field" style="grid-column:1/-1"><span>Mensaje</span><textarea name="message" required minlength="5"></textarea></label>' +
      '<div style="grid-column:1/-1"><button class="btn primary">' + icon('send') + 'Enviar mensaje</button></div></form></div></div></section>';
  }

  function pageTerms() {
    const n = esc(S.site.name || 'X-FLOW');
    return '<div class="wrap"><div class="page-title"><span class="eyebrow">Legal</span><h1>Términos y <span class="grad">licencias</span></h1><p>Resumen de cómo funcionan tus licencias. Edita este texto con tu información legal real antes de publicar.</p></div><div class="legal">' +
      '<h2>Licencias</h2><p>Cada compra otorga una licencia personal e intransferible para usar el plugin en tus producciones, incluidas las comerciales. La licencia queda asociada al correo con el que compras (o al del destinatario si es un regalo) y se gestiona desde X-Flow Center.</p>' +
      '<h2>Permanente y suscripción</h2><p>La licencia permanente no caduca. Las licencias por días (mensual, anual u otras) dan acceso durante el periodo comprado; si renuevas antes de que venza, los días se suman.</p>' +
      '<h2>Packs</h2><p>Los packs activan una licencia por cada plugin incluido. Los packs "todo en uno" incluyen también los plugins que se publiquen mientras el acceso esté activo.</p>' +
      '<h2>Reembolsos</h2><p>Por tratarse de productos digitales activados al instante, los reembolsos se revisan caso por caso. Escríbenos desde Soporte con tu número de pedido.</p>' +
      '<h2>Privacidad</h2><p>' + n + ' usa tu correo para activar tus licencias y enviarte la confirmación de compra. Los pagos los procesan PayPal, Stripe o Binance: ' + n + ' no guarda datos de tarjetas.</p></div></div>';
  }

  function pageNotFound() {
    return '<div class="wrap"><div class="status-hero"><div class="status-icon wait">' + icon('search') + '</div><h1>No encontrado</h1><p>Esta página no existe o el producto ya no está disponible.</p><a class="btn primary" style="margin-top:20px" href="#/plugins">Ver plugins</a></div></div>';
  }

  /* ================================================================ carrito */
  function saveCart() { XF.store.set('xf_cart', S.cart); XF.store.set('xf_coupon', S.coupon); }
  function cleanCart() {
    S.cart = S.cart.filter((it) => { const p = byId(it.product_id); return p && p.status === 'published' && p.plans.some((pl) => pl.id === it.plan_id); });
    saveCart();
  }
  function addToCart(pid, planId, silent) {
    const p = byId(pid);
    if (!p) return;
    const plan = p.plans.find((x) => x.id === planId) || lifetimePlan(p);
    const i = S.cart.findIndex((x) => x.product_id === p.id);
    if (i >= 0) S.cart[i].plan_id = plan.id; else S.cart.push({ product_id: p.id, plan_id: plan.id });
    saveCart();
    renderCart();
    refreshQuote();
    if (!silent) { openCart(true); XF.toast(p.name + ' añadido al carrito', 'success'); }
  }
  function openCart(open) {
    const d = $('#cart');
    d.classList.toggle('open', open);
    d.setAttribute('aria-hidden', open ? 'false' : 'true');
    document.body.classList.toggle('no-scroll', open);
  }
  function lineDisplay(it) {
    const p = byId(it.product_id);
    const plan = p && p.plans.find((x) => x.id === it.plan_id);
    return { p, plan };
  }
  function renderCart() {
    const n = S.cart.length;
    const cc = $('#cart-count');
    cc.textContent = n;
    cc.classList.toggle('hide', n === 0);
    const body = $('#cart-body'), foot = $('#cart-foot');
    if (!n) {
      body.innerHTML = '<div class="empty">' + icon('cart') + '<p>Tu carrito está vacío.</p><a class="btn primary" href="#/plugins" data-action="cart-close">Ver plugins</a></div>';
      foot.innerHTML = '';
      return;
    }
    body.innerHTML = S.cart.map((it, idx) => {
      const { p, plan } = lineDisplay(it);
      if (!p || !plan) return '';
      return '<div class="cline"><div class="cline-img">' + (p.image ? '<img src="' + esc(XF.asset(p.image)) + '" alt="">' : icon(p.type === 'bundle' ? 'layers' : 'plug')) + '</div><div class="cline-info"><b>' + esc(p.name) + '</b>' +
        (p.plans.length > 1 ? '<select data-action="cart-plan" data-idx="' + idx + '" aria-label="Licencia">' + p.plans.map((pl) => '<option value="' + esc(pl.id) + '"' + (pl.id === plan.id ? ' selected' : '') + '>' + esc(pl.label) + ' · ' + money(pl.final_price) + '</option>').join('') + '</select>' : '<span class="muted" style="font-size:.78rem">' + esc(plan.label) + '</span>') +
        '</div><div class="cline-price">' + (plan.final_compare ? '<s>' + money(plan.final_compare) + '</s>' : '') + money(plan.final_price) + '</div><button class="cline-x" data-action="cart-rm" data-idx="' + idx + '" aria-label="Quitar">' + icon('trash') + '</button></div>';
    }).join('');
    const q = S.quote;
    const sub = q ? q.subtotal_cents / 100 : S.cart.reduce((s, it) => { const { plan } = lineDisplay(it); return s + (plan ? plan.final_price : 0); }, 0);
    foot.innerHTML = '<form class="coupon-row" data-form="coupon"><input class="input" name="coupon" placeholder="Código de descuento" value="' + esc(S.coupon) + '" aria-label="Cupón"><button class="btn ghost sm">' + (S.coupon ? 'Cambiar' : 'Aplicar') + '</button></form>' +
      (q && q.coupon_error ? '<div class="notice warn" style="padding:10px 12px">' + icon('alert') + '<span>' + esc(q.coupon_error) + '</span></div>' : '') +
      '<div class="totals"><div><span class="muted">Subtotal</span><span>' + money(sub) + '</span></div>' +
      (q && q.discount_cents ? '<div class="disc"><span>Cupón ' + esc(q.coupon.code) + '</span><span>-' + money(q.discount_cents / 100) + '</span></div>' : '') +
      '<div class="big"><span>Total</span><span>' + money(q ? q.total_cents / 100 : sub) + '</span></div></div>' +
      '<a class="btn primary lg block" href="#/checkout" data-action="cart-close">' + icon('lock') + 'Ir a pagar</a>' +
      '<p class="muted" style="font-size:.75rem;text-align:center;margin:0">Se activa en X-Flow Center al confirmar el pago.</p>';
  }
  const refreshQuote = XF.debounce(async function () {
    if (!S.cart.length) { S.quote = null; renderCart(); if (route().name === 'checkout') renderCheckoutSummary(); return; }
    try {
      const r = await XF.api('quote', { items: S.cart, coupon: S.coupon });
      S.quote = r.quote;
    } catch (e) {
      S.quote = null;
      if (e.code === 'product_unavailable' || e.code === 'plan_unavailable') { await reloadCatalog(); cleanCart(); }
      XF.toast(e.message, 'error');
    }
    renderCart();
    if (route().name === 'checkout') renderCheckoutSummary();
  }, 250);

  /* ================================================================ checkout */
  function pageCheckout() {
    if (!S.cart.length) return '<div class="wrap"><div class="status-hero"><div class="status-icon wait">' + icon('cart') + '</div><h1>Carrito vacío</h1><p>Añade algún plugin para continuar.</p><a class="btn primary" style="margin-top:20px" href="#/plugins">Ver plugins</a></div></div>';
    const methods = S.settings.payment_methods || [];
    if (!S.method || !methods.some((m) => m.id === S.method)) S.method = methods[0] ? methods[0].id : '';
    const c = S.customer;
    const draft = XF.store.get('xf_checkout', {});
    let h = '<div class="wrap"><div class="page-title" style="padding-bottom:0"><span class="eyebrow">Checkout</span><h1 style="font-size:clamp(2.2rem,5vw,3.4rem)">Finalizar <span class="grad">compra</span></h1></div><div class="co"><div>';
    h += '<form id="co-form" autocomplete="on" onsubmit="return false"><div class="co-card"><h3><span class="n">1</span>Tus datos</h3>' +
      (c ? '<div class="notice ok" style="margin-bottom:14px">' + icon('user') + '<span>Comprando como <b>' + esc(c.email) + '</b>. Tus licencias se activan en esta cuenta de X-Flow Center.</span></div>' : '<div class="notice" style="margin-bottom:14px">' + icon('info') + '<span>Usa el <b>mismo correo de tu cuenta de X-Flow Center</b> para que los plugins aparezcan allí. ¿Ya tienes cuenta? <a href="#/cuenta" style="text-decoration:underline">Inicia sesión</a>.</span></div>') +
      '<div class="row2"><label class="field"><span>Correo electrónico</span><input name="email" type="email" required autocomplete="email" value="' + esc(c ? c.email : draft.email || '') + '"' + (c ? ' readonly' : '') + '></label>' +
      '<label class="field"><span>Nombre (opcional)</span><input name="name" autocomplete="name" value="' + esc(draft.name || (c && c.aka) || '') + '"></label></div></div>';
    h += '<div class="co-card"><h3><span class="n">2</span>¿Es un regalo?</h3><label class="switch"><input type="checkbox" name="is_gift" data-action="gift-toggle"> Enviar la licencia a otra persona</label>' +
      '<div id="gift-fields" class="row2 hide" style="margin-top:14px"><label class="field"><span>Correo de quien lo recibe</span><input name="recipient_email" type="email"><small>La licencia se activa en su cuenta de X-Flow Center.</small></label>' +
      '<label class="field"><span>Mensaje (opcional)</span><input name="gift_message" maxlength="300"></label></div></div>';
    h += '<div class="co-card"><h3><span class="n">3</span>Método de pago</h3>';
    if (!methods.length) h += '<div class="notice warn">' + icon('alert') + '<span>No hay métodos de pago activos. El administrador debe activarlos en el panel.</span></div>';
    h += '<div class="methods">' + methods.map((m) => '<label class="method' + (m.id === S.method ? ' on' : '') + '"><input type="radio" name="method" value="' + esc(m.id) + '"' + (m.id === S.method ? ' checked' : '') + ' data-action="method">' + icon(m.kind === 'paypal' ? 'wallet' : m.id === 'stripe' ? 'card' : m.id === 'binance' ? 'coins' : 'bank') + '<div><b>' + esc(m.name) + '</b><span>' + esc(methodHint(m)) + '</span></div></label>').join('') + '</div>' +
      '<label class="check" style="margin-top:18px"><input type="checkbox" name="terms" required> <span>Acepto los <a href="#/terminos" style="text-decoration:underline">términos y licencias</a>. Entiendo que las licencias se activan en X-Flow Center con el correo indicado.</span></label>' +
      '<div id="pay-zone" style="margin-top:18px"></div></div></form></div>';
    h += '<aside class="summary"><div class="co-card" id="co-summary"></div></aside></div></div>';
    return h;
  }
  function methodHint(m) {
    if (m.kind === 'paypal') return 'Paga con tu cuenta PayPal o tarjeta a través de PayPal.';
    if (m.id === 'stripe') return 'Visa, Mastercard, Amex. Pago seguro procesado por Stripe.';
    if (m.id === 'binance') return 'Paga con cripto (' + (m.currency || 'USDT') + ') desde tu app de Binance.';
    return 'Pago manual: se activa cuando verifiquemos la referencia.';
  }
  function renderCheckoutSummary() {
    const el = $('#co-summary');
    if (!el) return;
    const q = S.quote;
    const lines = S.cart.map((it) => { const { p, plan } = lineDisplay(it); return p && plan ? '<div class="sum-line"><div class="cline-img">' + (p.image ? '<img src="' + esc(XF.asset(p.image)) + '" alt="">' : icon('layers')) + '</div><div class="cline-info"><b>' + esc(p.name) + '</b><span class="muted" style="font-size:.78rem">' + esc(plan.label) + XF.planSuffix(plan) + '</span></div><div class="cline-price">' + (plan.final_compare ? '<s>' + money(plan.final_compare) + '</s>' : '') + money(plan.final_price) + '</div></div>' : ''; }).join('');
    const total = q ? q.total_cents / 100 : null;
    el.innerHTML = '<h3>' + icon('receipt') + 'Resumen</h3>' + lines +
      '<form class="coupon-row" data-form="coupon" style="margin:14px 0"><input class="input" name="coupon" placeholder="Código de descuento" value="' + esc(S.coupon) + '" aria-label="Cupón"><button class="btn ghost sm">Aplicar</button></form>' +
      (q && q.coupon_error ? '<div class="notice warn" style="padding:10px 12px;margin-bottom:12px">' + icon('alert') + '<span>' + esc(q.coupon_error) + '</span></div>' : '') +
      '<div class="totals"><div><span class="muted">Subtotal</span><span>' + (q ? money(q.subtotal_cents / 100) : '…') + '</span></div>' +
      (q && q.discount_cents ? '<div class="disc"><span>Cupón ' + esc(q.coupon.code) + '</span><span>-' + money(q.discount_cents / 100) + '</span></div>' : '') +
      '<div class="big"><span>Total</span><span>' + (total !== null ? money(total) : '…') + '</span></div></div>' +
      '<ul class="trust"><li>' + icon('shield') + 'El precio final lo calcula el servidor</li><li>' + icon('zap') + 'Activación automática en X-Flow Center</li></ul>';
    renderPayZone();
  }

  function renderPayZone() {
    const zone = $('#pay-zone');
    if (!zone) return;
    const q = S.quote;
    const m = (S.settings.payment_methods || []).find((x) => x.id === S.method);
    if (q && q.total_cents === 0) {
      zone.innerHTML = '<button class="btn primary lg block" data-action="pay">' + icon('gift') + 'Completar pedido gratis</button>';
      return;
    }
    if (!m) { zone.innerHTML = ''; return; }
    if (m.kind === 'paypal' && !XF.demo) {
      zone.innerHTML = '<div id="pp-box" class="pp-box"><div class="skeleton" style="height:48px"></div></div>';
      mountPayPal(m);
      return;
    }
    const label = m.kind === 'paypal' ? 'Pagar con PayPal' : m.id === 'stripe' ? 'Pagar con tarjeta' : m.id === 'binance' ? 'Pagar con Binance Pay' : 'Continuar con ' + m.name;
    zone.innerHTML = '<button class="btn primary lg block" data-action="pay">' + icon('lock') + esc(label) + (q ? ' · ' + money(q.total_cents / 100) : '') + '</button>' + (XF.demo ? '<p class="muted" style="font-size:.78rem;margin:10px 0 0">Laboratorio: el pago se simula, no se cobra nada.</p>' : '');
  }

  function checkoutData() {
    const f = $('#co-form');
    const fd = new FormData(f);
    const d = {
      email: String(fd.get('email') || '').trim(),
      name: String(fd.get('name') || '').trim(),
      is_gift: !!fd.get('is_gift'),
      recipient_email: String(fd.get('recipient_email') || '').trim(),
      gift_message: String(fd.get('gift_message') || '').trim(),
      method: S.method,
      coupon: S.coupon,
      items: S.cart,
    };
    // Solo se recuerdan correo y nombre: el regalo se decide en cada compra.
    XF.store.set('xf_checkout', { email: d.email, name: d.name });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) throw new Error('Escribe un correo electrónico válido.');
    if (d.is_gift && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.recipient_email)) throw new Error('Escribe el correo de la persona que recibe el regalo.');
    if (!fd.get('terms')) throw new Error('Debes aceptar los términos para continuar.');
    return d;
  }

  function rememberOrder(id, token) {
    const list = XF.store.get('xf_orders', []);
    if (!list.some((o) => o.id === id)) list.unshift({ id, token, at: Date.now() });
    XF.store.set('xf_orders', list.slice(0, 30));
  }
  function finishOrder(id, token) {
    rememberOrder(id, token);
    S.cart = []; S.coupon = ''; S.quote = null; saveCart(); renderCart();
    location.hash = '#/pedido/' + id + '/' + token;
  }

  async function startPayment(btn) {
    let d;
    try { d = checkoutData(); } catch (e) { XF.toast(e.message, 'error'); return; }
    btn && btn.classList.add('is-busy');
    try {
      const r = await XF.api('checkout_start', d);
      rememberOrder(r.order_id, r.token);
      if (r.status === 'fulfilled') return finishOrder(r.order_id, r.token);
      if (r.method === 'manual') return showManual(r);
      if (r.method === 'paypal' && XF.demo) { await XF.api('paypal_capture', { order_id: r.order_id, token: r.token }); return finishOrder(r.order_id, r.token); }
      if (r.redirect_url) { S.cart = []; S.coupon = ''; saveCart(); location.href = r.redirect_url; return; }
      if (r.demo_simulated) return finishOrder(r.order_id, r.token);
      finishOrder(r.order_id, r.token);
    } catch (e) {
      XF.toast(e.message, 'error');
      if (e.code === 'product_unavailable' || e.code === 'plan_unavailable') { await reloadCatalog(); cleanCart(); refreshQuote(); }
    } finally { btn && btn.classList.remove('is-busy'); }
  }

  function showManual(r) {
    const m = r.manual || {};
    const mod = XF.modal('<span class="eyebrow">Pago manual</span><h3 class="m-title">' + esc(m.name || 'Pago manual') + '</h3>' +
      '<p class="m-text">' + esc(m.instructions || '') + '</p>' +
      '<div class="co-card" style="padding:16px;margin-bottom:14px"><div class="label">Envía exactamente</div><div style="font-family:var(--display);font-size:2rem">' + money(r.total) + '</div>' + (m.account ? '<div class="label" style="margin-top:10px">Datos</div><div class="mono" style="white-space:pre-line">' + esc(m.account) + '</div>' : '') + '<div class="label" style="margin-top:10px">Pedido</div><div class="mono">' + esc(r.order_id) + '</div></div>' +
      '<form data-form="manual"><label class="field"><span>Número de referencia / ID de transacción</span><input name="reference" required minlength="4" placeholder="Ej: 8XW234567A890123L"></label><div class="m-actions"><button class="btn primary block">' + icon('send') + 'Enviar referencia</button></div></form>' +
      '<p class="muted" style="font-size:.78rem;margin:12px 0 0">Tu pedido queda guardado. Lo activamos en cuanto verifiquemos el pago.</p>', {
      onClose: () => { if (!mod._sent) finishOrder(r.order_id, r.token); },
    });
    mod.el.querySelector('form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const b = ev.target.querySelector('button');
      b.classList.add('is-busy');
      try {
        await XF.api('manual_submit', { order_id: r.order_id, token: r.token, reference: ev.target.reference.value });
        mod._sent = true;
        mod.close();
        finishOrder(r.order_id, r.token);
        XF.toast('Referencia enviada. Te avisamos al activar.', 'success');
      } catch (e) { XF.toast(e.message, 'error'); } finally { b.classList.remove('is-busy'); }
    });
  }

  let ppLoaded = null;
  function loadPayPalSdk(clientId) {
    if (ppLoaded && ppLoaded.id === clientId) return ppLoaded.p;
    const p = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://www.paypal.com/sdk/js?client-id=' + encodeURIComponent(clientId) + '&currency=' + encodeURIComponent(S.currency) + '&intent=capture&components=buttons';
      s.onload = () => res(window.paypal);
      s.onerror = () => rej(new Error('No se pudo cargar PayPal.'));
      document.head.appendChild(s);
    });
    ppLoaded = { id: clientId, p };
    return p;
  }
  async function mountPayPal(m) {
    try {
      const paypal = await loadPayPalSdk(m.client_id);
      const box = $('#pp-box');
      if (!box || S.method !== 'paypal') return;
      box.innerHTML = '';
      let current = null;
      paypal.Buttons({
        style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'paypal' },
        onClick: (data, actions) => { try { checkoutData(); return actions.resolve(); } catch (e) { XF.toast(e.message, 'error'); return actions.reject(); } },
        createOrder: async () => {
          const r = await XF.api('checkout_start', checkoutData());
          current = r;
          rememberOrder(r.order_id, r.token);
          return r.paypal_order_id;
        },
        onApprove: async () => {
          try {
            await XF.api('paypal_capture', { order_id: current.order_id, token: current.token });
          } catch (e) { XF.toast(e.message, 'error'); }
          finishOrder(current.order_id, current.token);
        },
        onError: (e) => XF.toast((e && e.message) || 'PayPal no pudo completar el pago.', 'error'),
      }).render(box);
    } catch (e) {
      const box = $('#pp-box');
      if (box) box.innerHTML = '<div class="notice warn">' + icon('alert') + '<span>' + esc(e.message) + '</span></div>';
    }
  }

  /* ================================================================ pedido */
  function pageOrder(id, token) {
    return '<div class="wrap" id="order-view" data-id="' + esc(id) + '" data-token="' + esc(token) + '"><div class="status-hero"><div class="status-icon wait">' + icon('clock') + '</div><h1>Cargando pedido…</h1></div></div>';
  }
  async function loadOrder(poll) {
    const v = $('#order-view');
    if (!v) return;
    const id = v.dataset.id, token = v.dataset.token;
    let o;
    try { o = (await XF.api('order_status', null, { query: { order_id: id, token } })).order; } catch (e) {
      v.innerHTML = '<div class="status-hero"><div class="status-icon wait">' + icon('alert') + '</div><h1>Pedido no encontrado</h1><p>' + esc(e.message) + '</p></div>';
      return;
    }
    const st = o.status;
    const url = S.site.center_download_url;
    const ok = st === 'fulfilled' || st === 'paid';
    let head;
    if (ok) head = '<div class="status-icon">' + icon('check') + '</div><h1>¡Listo! Ya está <span class="grad">activado</span></h1><p>' + (o.recipient_email ? 'Enviamos el regalo a <b>' + esc(o.recipient_email) + '</b>. Sus licencias ya están activas en X-Flow Center.' : 'Tus licencias ya están activas en X-Flow Center con <b>' + esc(o.email) + '</b>. Abre el Center e inicia sesión con ese correo para instalar.') + '</p>';
    else if (st === 'awaiting_review') head = '<div class="status-icon wait">' + icon('clock') + '</div><h1>Verificando tu pago</h1><p>Recibimos tu referencia. En cuanto confirmemos el pago, tus plugins se activan solos en X-Flow Center y te avisamos por correo.</p>';
    else if (st === 'pending') head = '<div class="status-icon wait">' + icon('clock') + '</div><h1>Esperando el pago</h1><p>Cuando el pago se confirme esta página se actualiza sola.</p>';
    else head = '<div class="status-icon wait">' + icon('alert') + '</div><h1>Pedido ' + esc(statusLabel(st).toLowerCase()) + '</h1><p>Si crees que es un error, escríbenos desde Soporte con tu número de pedido.</p>';

    let h = '<div class="status-hero">' + head + '<div class="hero-ctas" style="justify-content:center;margin-top:24px">' + (ok && url ? '<a class="btn primary lg" href="' + esc(url) + '" target="_blank" rel="noopener">' + icon('download') + 'Descargar X-Flow Center</a>' : '') + '<a class="btn ghost lg" href="#/plugins">Seguir comprando</a></div></div>';
    if (st === 'pending' && XF.demo && (o.method === 'binance' || o.method === 'stripe' || o.method === 'paypal')) {
      h += '<div class="notice warn" style="max-width:640px;margin:0 auto 20px">' + icon('info') + '<span>Laboratorio: <button class="btn sm accent" data-action="demo-pay">Simular pago confirmado</button></span></div>';
    }
    h += '<div class="co" style="padding-top:0"><div class="co-card"><h3>' + icon('key') + 'Licencias</h3>' +
      (o.licenses && o.licenses.length ? '<div class="lic-grid">' + o.licenses.map(licCard).join('') + '</div>' : '<p class="muted">Aparecerán aquí al confirmarse el pago.</p>') + '</div>' +
      '<div class="co-card"><h3>' + icon('receipt') + 'Pedido ' + esc(o.id) + '</h3>' + o.items.map((l) => '<div class="sum-line"><div class="cline-info"><b>' + esc(l.name) + '</b><span class="muted" style="font-size:.78rem">' + esc(l.plan_label) + '</span></div><div class="cline-price">' + money(l.unit_cents / 100) + '</div></div>').join('') +
      '<div class="totals" style="margin-top:12px">' + (o.discount ? '<div class="disc"><span>Descuento</span><span>-' + money(o.discount) + '</span></div>' : '') + '<div class="big"><span>Total</span><span>' + money(o.total) + '</span></div></div>' +
      '<p class="muted" style="font-size:.8rem;margin:14px 0 0">' + esc(statusLabel(st)) + ' · ' + XF.date(o.created_at, true) + ' · ' + esc(methodName(o)) + '</p></div></div>';
    v.innerHTML = h;
    if (poll && st === 'pending' && ['binance', 'stripe', 'paypal'].includes(o.method)) {
      const t = setTimeout(() => loadOrder(true), 4000);
      S.timers.push(t);
    }
  }
  function statusLabel(s) {
    return { pending: 'Pendiente de pago', awaiting_review: 'En verificación', paid: 'Pagado', fulfilled: 'Completado', failed: 'Fallido', cancelled: 'Cancelado', refunded: 'Reembolsado' }[s] || s;
  }
  function methodName(o) {
    if (o.method === 'manual') return 'Pago manual (' + o.manual_method + ')';
    return { paypal: 'PayPal', stripe: 'Tarjeta', binance: 'Binance Pay', free: 'Gratis' }[o.method] || o.method;
  }
  function licCard(l) {
    const st = l.status === 'active' ? '<span class="pill ok">Activa</span>' : l.status === 'expired' ? '<span class="pill warn">Vencida</span>' : '<span class="pill bad">' + esc(l.status) + '</span>';
    return '<div class="lic"><b>' + esc(l.product_name) + '</b><div class="meta">' + st + (l.lifetime ? '<span class="pill info">Permanente</span>' : '<span>Hasta ' + XF.date(l.expires_at) + '</span>') + (l.source === 'gift' ? '<span class="pill accent">' + icon('gift') + 'Regalo</span>' : '') + (l.source === 'center' ? '<span class="pill">De tu cuenta del Center</span>' : '') + '</div>' +
      '<div class="meta">' + (l.center_synced ? icon('check-circle') + '<span>En X-Flow Center</span>' : icon('clock') + '<span>Activación en proceso</span>') + '</div></div>';
  }

  /* ================================================================ cuenta */
  function pageAccount() {
    if (!S.customer) {
      return '<div class="wrap"><div class="auth-card"><span class="eyebrow">Mi cuenta</span><h1>Inicia sesión</h1><p class="muted" style="margin:0 0 18px">Usa tu cuenta de <b>X-Flow Center</b>. Es la misma para la tienda y la app.</p>' +
        (XF.demo ? '<div class="notice warn" style="margin-bottom:14px">' + icon('info') + '<span>Laboratorio: entra con cualquier correo y una clave de 4+ caracteres.</span></div>' : '') +
        '<form data-form="login" style="display:grid;gap:12px"><label class="field"><span>Correo</span><input name="email" type="email" required autocomplete="email"></label><label class="field"><span>Contraseña</span><input name="password" type="password" required autocomplete="current-password"></label><button class="btn primary lg block">' + icon('user') + 'Entrar</button></form>' +
        '<p style="margin:14px 0 0;text-align:center"><a class="link-more" style="display:inline-flex" href="#/recuperar">' + icon('key') + '¿Olvidaste tu contraseña?</a></p>' +
        '<p class="muted" style="font-size:.82rem;margin:16px 0 0">¿No tienes cuenta? Descarga X-Flow Center y créala desde la app. También puedes comprar sin cuenta usando tu correo.</p>' + recentOrdersHTML() + '</div></div>';
    }
    return '<div class="wrap"><div class="page-title"><span class="eyebrow">Mi cuenta</span><h1>Hola, <span class="grad">' + esc(S.customer.aka || S.customer.email.split('@')[0]) + '</span></h1><p>' + esc(S.customer.email) + ' · <a href="#" data-action="logout" style="text-decoration:underline">Cerrar sesión</a></p></div>' +
      '<section class="sec tight"><h2 class="eyebrow" style="font-size:.85rem">Mis licencias</h2><div id="acc-lic" style="margin-top:14px"><div class="skeleton" style="height:120px"></div></div></section>' +
      '<section class="sec tight"><h2 class="eyebrow" style="font-size:.85rem">Mis pedidos</h2><div id="acc-orders" style="margin-top:14px"><div class="skeleton" style="height:120px"></div></div></section>' +
      (S.settings.password_reset ? '<section class="sec tight"><details class="co-card" style="max-width:560px"><summary style="cursor:pointer;font-weight:700;display:flex;gap:.6em;align-items:center">' + icon('lock') + 'Cambiar contraseña</summary>' +
        '<form data-form="pwchange" style="display:grid;gap:12px;margin-top:16px"><label class="field"><span>Contraseña actual</span><input name="current" type="password" required autocomplete="current-password"></label>' + newPasswordFields() +
        '<button class="btn primary">' + icon('save') + 'Guardar nueva contraseña</button><p class="muted" style="font-size:.78rem;margin:0">Se cambia también en X-Flow Center. Te avisaremos por correo.</p></form></details></section>' : '') + '</div>';
  }

  function newPasswordFields() {
    return '<label class="field"><span>Nueva contraseña</span><input name="password" type="password" required minlength="8" maxlength="128" autocomplete="new-password" data-strength></label>' +
      '<div class="pw-meter" aria-hidden="true"><i></i></div><small class="muted pw-hint" style="font-size:.76rem;margin-top:-6px">Mínimo 8 caracteres, con letras y números.</small>' +
      '<label class="field"><span>Repite la contraseña</span><input name="password2" type="password" required autocomplete="new-password"></label>';
  }
  function pwScore(pw) {
    let sc = 0;
    if (pw.length >= 8) sc++;
    if (pw.length >= 12) sc++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) sc++;
    if (/\d/.test(pw) && /[A-Za-z]/.test(pw)) sc++;
    if (/[^A-Za-z0-9]/.test(pw)) sc++;
    return Math.min(4, sc);
  }
  function pwLocalProblem(pw, pw2) {
    if (pw.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
    if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Usa letras y números.';
    if (pw !== pw2) return 'Las contraseñas no coinciden.';
    return '';
  }

  function pageForgot() {
    const avail = S.settings.password_reset;
    return '<div class="wrap"><div class="auth-card"><span class="eyebrow">Recuperar acceso</span><h1>¿Olvidaste tu contraseña?</h1>' +
      (avail ? '<p class="muted" style="margin:0 0 18px">Escribe el correo de tu cuenta de X-Flow Center. Te enviaremos un enlace para crear una nueva contraseña (caduca en 30 minutos).</p>' +
        '<form data-form="forgot" style="display:grid;gap:12px"><label class="field"><span>Correo</span><input name="email" type="email" required autocomplete="email"></label><button class="btn primary lg block">' + icon('mail') + 'Enviar enlace</button></form>' +
        '<div id="forgot-done" class="notice ok hide" style="margin-top:14px">' + icon('check-circle') + '<span></span></div>'
        : '<div class="notice warn">' + icon('info') + '<span>Para recuperar tu contraseña escríbenos a <a href="mailto:' + esc(S.site.support_email || '') + '" style="text-decoration:underline">' + esc(S.site.support_email || 'soporte') + '</a> o desde <a href="#/soporte" style="text-decoration:underline">Soporte</a>.</span></div>') +
      '<p style="margin:16px 0 0"><a class="link-more" style="display:inline-flex" href="#/cuenta">' + icon('arrow-left') + 'Volver a iniciar sesión</a></p></div></div>';
  }

  function pageReset() {
    if (!S.resetToken) return '<div class="wrap"><div class="auth-card"><h1>Enlace no válido</h1><p class="muted">Pide un enlace nuevo para restablecer tu contraseña.</p><a class="btn primary" style="margin-top:12px" href="#/recuperar">Pedir enlace</a></div></div>';
    return '<div class="wrap"><div class="auth-card"><span class="eyebrow">Nueva contraseña</span><h1>Crea tu nueva contraseña</h1><p class="muted" style="margin:0 0 18px">Se usará en la tienda y en X-Flow Center.</p>' +
      '<form data-form="reset" style="display:grid;gap:12px">' + newPasswordFields() + '<button class="btn primary lg block">' + icon('lock') + 'Guardar contraseña</button></form></div></div>';
  }
  function recentOrdersHTML() {
    const list = XF.store.get('xf_orders', []);
    if (!list.length) return '';
    return '<div style="margin-top:22px;border-top:1px solid var(--line);padding-top:16px"><div class="label" style="margin-bottom:8px">Pedidos en este dispositivo</div>' + list.slice(0, 5).map((o) => '<a class="link-more" style="display:flex;margin:6px 0" href="#/pedido/' + esc(o.id) + '/' + esc(o.token) + '">' + icon('receipt') + esc(o.id) + '</a>').join('') + '</div>';
  }
  async function loadAccount() {
    if (!S.customer) return;
    try {
      const [l, o] = await Promise.all([XF.api('my_licenses'), XF.api('my_orders')]);
      const url = S.site.center_download_url;
      $('#acc-lic').innerHTML = l.licenses.length ? '<div class="lic-grid">' + l.licenses.map(licCard).join('') + '</div>' + (url ? '<a class="btn ghost" style="margin-top:16px" href="' + esc(url) + '" target="_blank" rel="noopener">' + icon('download') + 'Abrir / descargar X-Flow Center</a>' : '') : '<div class="empty">' + icon('key') + 'Aún no tienes licencias compradas en la tienda.<br><a class="btn primary" style="margin-top:14px" href="#/plugins">Ver plugins</a></div>';
      $('#acc-orders').innerHTML = o.orders.length ? '<div class="table-wrap"><table class="tbl"><thead><tr><th>Pedido</th><th>Fecha</th><th>Productos</th><th>Total</th><th>Estado</th></tr></thead><tbody>' + o.orders.map((x) => '<tr><td class="mono">' + (x.token ? '<a href="#/pedido/' + esc(x.id) + '/' + esc(x.token) + '" style="text-decoration:underline">' + esc(x.id) + '</a>' : esc(x.id)) + '</td><td>' + XF.date(x.created_at) + '</td><td>' + esc(x.items.map((i) => i.name).join(', ')) + (x.recipient_email && x.recipient_email !== S.customer.email ? ' <span class="pill accent">Regalo</span>' : '') + '</td><td>' + money(x.total) + '</td><td><span class="pill ' + (x.status === 'fulfilled' ? 'ok' : x.status === 'awaiting_review' || x.status === 'pending' ? 'warn' : 'bad') + '">' + esc(statusLabel(x.status)) + '</span></td></tr>').join('') + '</tbody></table></div>' : '<div class="empty">' + icon('receipt') + 'Sin pedidos todavía.</div>';
    } catch (e) {
      if (e.code === 'unauthorized') { S.customer = null; updateAccountBtn(); render(); return; }
      XF.toast(e.message, 'error');
    }
  }

  /* ================================================================ router */
  function route() {
    const h = (location.hash || '#/').replace(/^#/, '');
    const parts = h.split('?')[0].split('/').filter(Boolean);
    const r = { name: parts[0] || 'home', parts };
    return r;
  }
  function setActiveNav() {
    const r = route();
    $$('#nav a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#/' + r.name));
  }
  /** El token de restablecer se guarda en memoria y se quita de la barra de direcciones (no queda en el historial). */
  function captureResetToken() {
    const mt = (location.hash || '').match(/^#\/restablecer\/([a-f0-9]{64})$/);
    if (mt) { S.resetToken = mt[1]; history.replaceState(null, '', location.pathname + location.search + '#/restablecer'); }
  }
  function render() {
    captureResetToken();
    S.timers.forEach(clearTimeout);
    S.timers = [];
    const r = route();
    const app = $('#app');
    let html;
    switch (r.name) {
      case 'home': html = pageHome(); break;
      case 'plugins': html = pageCatalog('plugins'); break;
      case 'packs': html = pageCatalog('packs'); break;
      case 'ofertas': html = pageDeals(); break;
      case 'sample-packs': html = pageSamplePacks(); break;
      case 'p': html = pageProduct(decodeURIComponent(r.parts[1] || '')); break;
      case 'checkout': html = pageCheckout(); break;
      case 'pedido': html = pageOrder(r.parts[1] || '', r.parts[2] || ''); break;
      case 'cuenta': html = pageAccount(); break;
      case 'recuperar': html = pageForgot(); break;
      case 'restablecer': html = pageReset(); break;
      case 'center': html = pageCenter(); break;
      case 'soporte': html = pageSupport(); break;
      case 'terminos': html = pageTerms(); break;
      default: html = pageNotFound();
    }
    app.innerHTML = html;
    window.scrollTo(0, 0);
    setActiveNav();
    tickCountdowns();
    if (r.name === 'plugins' || r.name === 'packs') {
      const sort = $('#sort'); if (sort) sort.value = S.filter.sort;
      renderCatalogGrid(r.name);
    }
    if (r.name === 'checkout') { renderCheckoutSummary(); refreshQuote(); }
    if (r.name === 'pedido') loadOrder(true);
    if (r.name === 'cuenta') loadAccount();
    if (r.name === 'home') startShowcase();
    reveal();
  }

  let io = null;
  function reveal() {
    const els = $$('.reveal:not(.in)');
    if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
    if (!io) io = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -40px 0px' });
    els.forEach((e) => io.observe(e));
  }

  let showIdx = 0, showTimer = null;
  function showcaseList() {
    const feat = S.products.filter((p) => p.featured && p.status === 'published');
    return (feat.length ? feat : plugins()).filter((p) => p.image || (p.includes && p.includes.length)).slice(0, 5);
  }
  function setShowcase(i) {
    const list = showcaseList();
    if (!list.length) return;
    showIdx = (i + list.length) % list.length;
    const p = list[showIdx];
    const media = $('#show-media');
    if (!media) return;
    media.classList.add('swap');
    setTimeout(() => {
      media.innerHTML = mediaHTML(p);
      media.setAttribute('href', '#/p/' + p.slug);
      $('#show-name').textContent = p.name;
      $('#show-tag').textContent = p.tagline || '';
      $('#show-badge').textContent = p.badge || (p.type === 'bundle' ? 'PACK' : 'DESTACADO');
      $('#show-price').innerHTML = priceHTML(p);
      const add = $('#show-add'); add.dataset.id = p.id; add.dataset.plan = lifetimePlan(p).id;
      requestAnimationFrame(() => media.classList.remove('swap'));
    }, 220);
    $$('#show-dots button').forEach((b, k) => b.classList.toggle('on', k === showIdx));
  }
  function startShowcase() {
    clearInterval(showTimer);
    showIdx = 0;
    if (showcaseList().length > 1) showTimer = setInterval(() => { if (!document.hidden && $('#show-media')) setShowcase(showIdx + 1); }, 5200);
  }

  /* ================================================================ eventos */
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-action]');
    if (!t) return;
    const a = t.dataset.action;
    switch (a) {
      case 'add': e.preventDefault(); addToCart(t.dataset.id, t.dataset.plan); break;
      case 'add-selected':
      case 'buy-now': {
        e.preventDefault();
        const sel = $('input[name="plan"]:checked');
        addToCart(t.dataset.id, sel ? sel.value : '', a === 'buy-now');
        if (a === 'buy-now') location.hash = '#/checkout';
        break;
      }
      case 'cart': openCart(true); break;
      case 'cart-close': openCart(false); break;
      case 'cart-rm': S.cart.splice(Number(t.dataset.idx), 1); saveCart(); renderCart(); refreshQuote(); if (route().name === 'checkout') render(); break;
      case 'menu': $('#mnav').classList.add('open'); break;
      case 'menu-close': $('#mnav').classList.remove('open'); break;
      case 'annc-x': try { sessionStorage.setItem('xf_annc_x', '1'); } catch (x) {} $('#annc').innerHTML = ''; break;
      case 'cat': S.filter.cat = t.dataset.cat; $$('.chip').forEach((c) => c.classList.toggle('on', c === t)); renderCatalogGrid(route().name); break;
      case 'show': clearInterval(showTimer); setShowcase(Number(t.dataset.i)); break;
      case 'gal': {
        const m = (S._gallery || [])[Number(t.dataset.i)];
        if (m) { $('#gmain').innerHTML = mediaItem(m); $$('.thumbs button').forEach((b) => b.classList.toggle('on', b === t)); }
        break;
      }
      case 'search':
        e.preventDefault();
        if (route().name !== 'plugins') location.hash = '#/plugins';
        setTimeout(() => { const q = $('#q'); if (q) q.focus(); }, 60);
        break;
      case 'pay': e.preventDefault(); startPayment(t); break;
      case 'logout':
        e.preventDefault();
        try { await XF.api('logout', {}); } catch (x) {}
        S.customer = null; S.owned = []; updateAccountBtn(); render();
        break;
      case 'demo-pay': {
        const v = $('#order-view');
        t.classList.add('is-busy');
        try { await XF.api('demo_pay', { order_id: v.dataset.id, token: v.dataset.token }); } catch (x) { XF.toast(x.message, 'error'); }
        loadOrder(false);
        break;
      }
      case 'demo-reset':
        if (await XF.confirm('Esto borra los datos del laboratorio guardados en este navegador (pedidos, cambios del panel…).', 'Reiniciar')) { XF.demoBackend.reset(); XF.store.del('xf_cart'); location.reload(); }
        break;
    }
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('input[name="plan"]')) {
      $$('.plan').forEach((l) => l.classList.toggle('on', l.contains(t) && t.checked));
      const p = bySlug(decodeURIComponent(route().parts[1] || ''));
      const pl = p && p.plans.find((x) => x.id === t.value);
      if (pl && $('#mb-price')) { $('#mb-price').textContent = money(pl.final_price); $('#mb-plan').textContent = pl.label; }
    }
    if (t.dataset.action === 'cart-plan') { S.cart[Number(t.dataset.idx)].plan_id = t.value; saveCart(); renderCart(); refreshQuote(); if (route().name === 'checkout') renderCheckoutSummary(); }
    if (t.dataset.action === 'method') { S.method = t.value; $$('.method').forEach((l) => l.classList.toggle('on', l.contains(t))); renderPayZone(); }
    if (t.dataset.action === 'gift-toggle') $('#gift-fields').classList.toggle('hide', !t.checked);
    if (t.id === 'sort') { S.filter.sort = t.value; renderCatalogGrid(route().name); }
  });
  document.addEventListener('input', (e) => {
    if (!e.target.matches('[data-strength]')) return;
    const sc = pwScore(e.target.value);
    const bar = e.target.closest('form').querySelector('.pw-meter i');
    if (bar) { bar.style.width = (e.target.value ? 25 * Math.max(1, sc) : 0) + '%'; bar.style.background = ['var(--bad)', 'var(--bad)', 'var(--warn)', 'var(--ok)', 'var(--ok)'][sc]; }
  });
  document.addEventListener('input', XF.debounce((e) => {
    if (e.target.id === 'q') { S.filter.q = e.target.value; renderCatalogGrid(route().name); }
  }, 150));

  document.addEventListener('submit', async (e) => {
    const f = e.target.closest('[data-form]');
    if (!f) return;
    e.preventDefault();
    const kind = f.dataset.form;
    const btn = f.querySelector('button');
    const fd = new FormData(f);
    if (kind === 'coupon') { S.coupon = String(fd.get('coupon') || '').trim().toUpperCase(); saveCart(); refreshQuote(); return; }
    if (kind === 'manual') return;
    btn && btn.classList.add('is-busy');
    try {
      if (kind === 'subscribe') { await XF.api('subscribe', { email: fd.get('email') }); f.reset(); XF.toast('¡Listo! Te avisaremos de lo nuevo.', 'success'); }
      if (kind === 'ticket') { await XF.api('support_ticket', Object.fromEntries(fd)); f.reset(); XF.toast('Mensaje enviado. Te respondemos pronto.', 'success'); }
      if (kind === 'forgot') {
        const r = await XF.api('password_forgot', { email: String(fd.get('email') || '').trim() });
        const box = $('#forgot-done');
        box.querySelector('span').textContent = r.message;
        box.classList.remove('hide');
        f.reset();
      }
      if (kind === 'reset' || kind === 'pwchange') {
        const pw = String(fd.get('password') || ''), pw2 = String(fd.get('password2') || '');
        const prob = pwLocalProblem(pw, pw2);
        if (prob) throw new Error(prob);
        if (kind === 'reset') {
          const r = await XF.api('password_reset', { token: S.resetToken, password: pw });
          S.resetToken = '';
          S.customer = null; S.owned = [];
          updateAccountBtn();
          XF.toast(r.message, 'success');
          location.hash = '#/cuenta';
        } else {
          const r = await XF.api('password_change', { current: String(fd.get('current') || ''), password: pw });
          f.reset();
          XF.toast(r.message, 'success');
        }
      }
      if (kind === 'login') {
        const r = await XF.api('login', { email: fd.get('email'), password: fd.get('password') });
        S.customer = r.customer; updateAccountBtn(); XF.toast('Sesión iniciada', 'success');
        await reloadCatalog(); render();
      }
    } catch (err) { XF.toast(err.message, 'error'); } finally { btn && btn.classList.remove('is-busy'); }
  });

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { openCart(false); $('#mnav').classList.remove('open'); } });
  $('#mnav').addEventListener('click', (e) => { if (e.target.id === 'mnav') e.target.classList.remove('open'); });
  window.addEventListener('hashchange', () => { $('#mnav').classList.remove('open'); render(); });

  /* ================================================================ arranque */
  async function reloadCatalog() {
    const b = await XF.api('bootstrap');
    S.settings = b.settings;
    S.site = b.settings.site || {};
    S.products = b.products || [];
    S.customer = b.customer || null;
    S.owned = b.owned || [];
    S.currency = b.settings.currency || 'USD';
    XF.currency = S.currency;
  }

  async function init() {
    // Retorno desde Stripe / Binance:  index.html?order=XF...&t=TOKEN
    captureResetToken();
    const qs = new URLSearchParams(location.search);
    if (qs.get('order') && qs.get('t')) {
      const id = qs.get('order'), tk = qs.get('t');
      history.replaceState(null, '', location.pathname + '#/pedido/' + encodeURIComponent(id) + '/' + encodeURIComponent(tk));
    }
    try {
      await reloadCatalog();
    } catch (e) {
      // En producción nunca se cae al modo demo (evita "compras" simuladas si el servidor falla).
      $('#app').innerHTML = '<div class="wrap"><div class="status-hero"><div class="status-icon wait">' + icon('alert') + '</div><h1>Tienda no disponible</h1><p>' + esc(e.message) + '</p></div></div>';
      return;
    }
    cleanCart();
    renderChrome();
    renderCart();
    render();
    if (S.cart.length) refreshQuote();
    setInterval(tickCountdowns, 1000);
    if (XF.demo) {
      const rib = document.createElement('div');
      rib.className = 'demo-ribbon';
      rib.innerHTML = icon('sparkles') + 'Laboratorio · pagos simulados <button data-action="demo-reset">Reiniciar</button> <a href="admin/" style="text-decoration:underline">Panel</a>';
      document.body.appendChild(rib);
    }
  }
  init();
})();
