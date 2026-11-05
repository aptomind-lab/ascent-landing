/* ==========================================================================
   Admin panel.

   Every value that came from a customer (name, email, address, notes) or from
   the database is inserted as TEXT, never as HTML, through h() below. A buyer
   who types a script tag into their name field gets a harmless string in this
   panel, not code running with your session.
   ========================================================================== */
(function () {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);

  /* ---------------------------------------------------------------- helpers */

  // h('div', { class: 'x', onclick: fn }, 'text', childNode, ...) -> element
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'value') el.value = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  const copFmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0, currencyDisplay: 'code' });
  const cop = n => copFmt.format(Number(n) || 0);
  const num = (n, d = 2) => Number(n).toLocaleString('es-CO', { maximumFractionDigits: d });
  const dt = s => new Date(s).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
  const local = (n, cur) => (cur === 'COP' ? cop(n) : `US$ ${num(n)}`);

  const STATUS = {
    PENDING: ['Pendiente', 'warn'], APPROVED: ['Pagado', 'ok'], DECLINED: ['Rechazado', 'bad'],
    VOIDED: ['Anulado', 'bad'], ERROR: ['Error', 'bad'], REVIEW: ['Revisar', 'info'],
  };
  const badge = s => h('span', { class: `badge ${(STATUS[s] || ['', 'off'])[1]}` }, (STATUS[s] || [s])[0]);

  let toastTimer;
  function toast(msg, isErr) {
    const el = $('#toast');
    el.textContent = msg; el.className = `toast${isErr ? ' err' : ''}`; el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
  }

  const ERRORS = {
    code_taken: 'Ese código ya existe.',
    bad_code: 'Código inválido: 3 a 32 caracteres, solo letras, números, guion o guion bajo.',
    bad_name: 'Falta el nombre del afiliado.',
    bad_discount: 'El descuento debe estar entre 0 y 100.',
    bad_commission: 'La comisión debe estar entre 0 y 100.',
    has_orders: 'Este código ya tiene pedidos. Desactívalo en lugar de borrarlo.',
    bad_rate: 'La TRM debe estar entre 1.000 y 20.000.',
    wrong_password: 'Contraseña incorrecta.',
    too_many_attempts: 'Demasiados intentos. Espera unos minutos.',
    admin_not_configured: 'Falta configurar ADMIN_PASSWORD en Vercel.',
  };
  const errText = e => ERRORS[e] || 'No se pudo completar la acción.';

  async function api(a, { method = 'GET', body, query } = {}) {
    const qs = new URLSearchParams({ a, ...(query || {}) });
    const res = await fetch(`/api/admin?${qs}`, {
      method, credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 && a !== 'login') { showLogin(); throw new Error('unauthorized'); }
    let data = {};
    try { data = await res.json(); } catch (e) { /* CSV or empty */ }
    return { ok: res.ok, status: res.status, data };
  }

  /* ------------------------------------------------------------------ auth */

  function showLogin() { $('#app').hidden = true; $('#login').hidden = false; $('#pw').focus(); }
  function showApp() { $('#login').hidden = true; $('#app').hidden = false; }

  $('#login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('#login-msg');
    msg.hidden = true;
    const r = await api('login', { method: 'POST', body: { password: $('#pw').value } });
    if (r.ok) { $('#pw').value = ''; showApp(); go(currentTab()); return; }
    msg.textContent = errText(r.data.error); msg.hidden = false;
  });
  $('#logout').addEventListener('click', async () => { await api('logout', { method: 'POST', body: {} }); showLogin(); });

  /* ------------------------------------------------------------------ tabs */

  const TABS = { orders: renderOrders, affiliates: renderAffiliates, stock: renderStock, settings: renderSettings };
  const currentTab = () => (location.hash.slice(1) in TABS ? location.hash.slice(1) : 'orders');

  async function go(tab) {
    $('#tabs').querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    const view = $('#view');
    view.replaceChildren(h('p', { class: 'muted' }, 'Cargando…'));
    try { await TABS[tab](view); } catch (e) { if (e.message !== 'unauthorized') view.replaceChildren(h('p', { class: 'msg err' }, 'No se pudo cargar esta sección.')); }
  }
  $('#tabs').addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (b) location.hash = b.dataset.tab; });
  addEventListener('hashchange', () => go(currentTab()));

  /* ---------------------------------------------------------------- orders */

  const filters = { status: '', code_id: '', q: '', from: '', to: '' };
  let orderOffset = 0;

  function orderQuery(extra) {
    const q = {};
    for (const [k, v] of Object.entries(filters)) if (v) q[k] = v;
    return { ...q, ...(extra || {}) };
  }

  async function renderOrders(view) {
    const aff = (await api('affiliates')).data.affiliates || [];
    orderOffset = 0;

    const sel = (name, opts, val) => h('select', { name, onchange: ev => { filters[name] = ev.target.value; reload(); } },
      opts.map(([v, l]) => h('option', { value: v, selected: v === val }, l)));
    const status = sel('status', [['', 'Todos los estados'], ...Object.entries(STATUS).map(([k, [l]]) => [k, l])], filters.status);
    // "sin código" is its own filter on the server (no_code=1), not a code id
    const codeOpts = [['', 'Todos los códigos'], ['no_code', 'Sin código'], ...aff.map(a => [String(a.id), `${a.code} · ${a.affiliate_name}`])];
    const codeSel = filters.no_code === '1' ? 'no_code' : filters.code_id;
    const code = h('select', { name: 'code_id', onchange: ev => {
      const v = ev.target.value;
      filters.code_id = v === 'no_code' ? '' : v;
      filters.no_code = v === 'no_code' ? '1' : '';
      reload();
    } }, codeOpts.map(([v, l]) => h('option', { value: v, selected: v === codeSel }, l)));

    const search = h('input', { type: 'search', placeholder: 'Referencia, correo o nombre', value: filters.q, class: 'grow',
      onchange: ev => { filters.q = ev.target.value.trim(); reload(); } });
    const from = h('input', { type: 'date', value: filters.from, onchange: ev => { filters.from = ev.target.value; reload(); } });
    const to = h('input', { type: 'date', value: filters.to, onchange: ev => { filters.to = ev.target.value; reload(); } });
    const csv = h('a', { class: 'btn', href: `/api/admin?${new URLSearchParams({ a: 'orders_csv', ...orderQuery() })}` }, 'Exportar CSV');

    const tiles = h('div', { class: 'tiles' });
    const body = h('div');
    view.replaceChildren(
      h('div', { class: 'section-title' }, h('h2', {}, 'Pedidos'), h('span', { class: 'muted' }, 'Los totales cuentan solo pedidos pagados.')),
      h('div', { class: 'card' }, h('div', { class: 'row' },
        h('div', {}, h('label', {}, 'Estado'), status), h('div', {}, h('label', {}, 'Código'), code),
        h('div', { class: 'grow' }, h('label', {}, 'Buscar'), search),
        h('div', {}, h('label', {}, 'Desde'), from), h('div', {}, h('label', {}, 'Hasta'), to), csv)),
      tiles, body);

    async function reload() {
      orderOffset = 0;
      csv.href = `/api/admin?${new URLSearchParams({ a: 'orders_csv', ...orderQuery() })}`;
      const r = await api('orders', { query: orderQuery({ limit: 100 }) });
      const { rows, total, paid } = r.data;
      tiles.replaceChildren(
        tile('Pedidos pagados', num(paid.orders, 0), `${num(total, 0)} en total con estos filtros`),
        tile('Ventas cobradas', cop(paid.charge_cop), `Subtotal ${cop(paid.subtotal_cop)}`),
        tile('Descuentos otorgados', cop(paid.discount_cop), 'Restados del subtotal'),
        tile('Comisiones generadas', cop(paid.commission_cop), 'Sobre el total cobrado'));
      body.replaceChildren(ordersTable(rows, total));
    }
    await reload();

    function ordersTable(rows, total) {
      if (!rows.length) return h('div', { class: 'card empty' }, 'No hay pedidos con estos filtros.');
      const tbody = h('tbody');
      const append = list => list.forEach(o => tbody.append(...orderRows(o)));
      append(rows);
      const more = h('button', { class: 'btn', onclick: async () => {
        orderOffset += 100;
        const r = await api('orders', { query: orderQuery({ limit: 100, offset: orderOffset }) });
        append(r.data.rows);
        if (orderOffset + 100 >= total) more.remove();
      } }, 'Cargar más');
      return h('div', {},
        h('div', { class: 'table-wrap' }, h('table', {},
          h('thead', {}, h('tr', {},
            h('th', {}, 'Fecha'), h('th', {}, 'Pedido'), h('th', {}, 'Cliente'), h('th', {}, 'Estado'),
            h('th', {}, 'Código / afiliado'),
            h('th', { class: 'num' }, 'Subtotal'), h('th', { class: 'num' }, 'Descuento'),
            h('th', { class: 'num' }, 'Total cobrado'), h('th', { class: 'num' }, 'Comisión afiliado'))),
          tbody)),
        rows.length < total ? h('div', { class: 'sp' }) : null, rows.length < total ? more : null);
    }
  }

  const tile = (k, v, s) => h('div', { class: 'tile' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v), h('div', { class: 's' }, s));

  function orderRows(o) {
    const detail = h('tr', { class: 'detail', hidden: true }, h('td', { colspan: 9 }, orderDetail(o)));
    const hasCode = !!o.code_text;
    const main = h('tr', { class: 'clickable', onclick: () => { detail.hidden = !detail.hidden; } },
      h('td', {}, dt(o.created_at)),
      h('td', { class: 'mono' }, o.reference, h('span', { class: 'sub' }, `${o.market} · ${o.currency}`)),
      h('td', {}, o.customer_name || '—', h('span', { class: 'sub' }, o.customer_email || '')),
      h('td', {}, badge(o.status)),
      h('td', {}, hasCode ? o.code_text : h('span', { class: 'muted' }, 'Sin código'),
        hasCode ? h('span', { class: 'sub' }, o.affiliate_name || '') : null),
      h('td', { class: 'num' }, cop(o.subtotal_cop)),
      h('td', { class: 'num' }, Number(o.discount_cop) ? `−${cop(o.discount_cop)}` : '—',
        Number(o.discount_pct) ? h('span', { class: 'sub' }, `${num(o.discount_pct)}%`) : null),
      h('td', { class: 'num' }, h('strong', {}, cop(o.charge_cop))),
      h('td', { class: 'num' }, hasCode && Number(o.commission_cop) ? cop(o.commission_cop) : '—',
        hasCode && Number(o.commission_pct) ? h('span', { class: 'sub' }, `${num(o.commission_pct)}%${o.commission_paid_at ? ' · pagada' : ''}`) : null));
    return [main, detail];
  }

  function orderDetail(o) {
    const items = (o.items || []).map(l => h('li', {}, `${l.qty} × ${l.name} ${l.size} — ${local(l.line, o.currency)}`));
    const ship = o.shipping || {};
    const kv = pairs => h('dl', { class: 'kv' }, pairs.flatMap(([k, v, strong]) => [h('dt', {}, k), h('dd', { class: strong ? 'strong' : '' }, v)]));

    const money = [['Subtotal', cop(o.subtotal_cop)]];
    if (Number(o.discount_cop)) money.push([`Descuento (${num(o.discount_pct)}%)`, `−${cop(o.discount_cop)}`]);
    money.push(['Total cobrado (COP)', cop(o.charge_cop), true]);
    if (o.currency !== 'COP') {
      money.push(['Total en moneda local', local(o.total_local, o.currency)]);
      money.push(['TRM aplicada', num(o.trm)]);
    }
    if (o.code_text) {
      money.push([`Comisión ${o.affiliate_name || ''} (${num(o.commission_pct)}%)`, cop(o.commission_cop), true]);
    }

    const actions = [];
    if (o.status === 'APPROVED' && o.code_text && Number(o.commission_cop) > 0) {
      const paid = !!o.commission_paid_at;
      actions.push(h('button', { class: 'btn small', onclick: async ev => {
        ev.stopPropagation();
        const r = await api('order_commission', { method: 'POST', body: { id: o.id, paid: !paid } });
        if (r.ok) { toast(paid ? 'Comisión marcada como pendiente' : 'Comisión marcada como pagada'); go('orders'); } else toast(errText(r.data.error), true);
      } }, paid ? `Comisión pagada el ${dt(o.commission_paid_at)} · deshacer` : 'Marcar comisión como pagada'));
    }

    return h('div', { class: 'detail-grid' },
      h('div', {}, h('h4', {}, 'Productos'), h('ul', { style: 'margin:0;padding-left:18px' }, items)),
      h('div', {}, h('h4', {}, 'Desglose'), kv(money), h('div', { class: 'sp' }), ...actions),
      h('div', {}, h('h4', {}, 'Cliente y envío'),
        kv([['Nombre', o.customer_name], ['Correo', o.customer_email], ['Teléfono', o.customer_phone],
          ['Dirección', ship.address], ['Ciudad', ship.city], ['Región', ship.region], ['Postal', ship.postal], ['País', ship.country],
          ['Notas', ship.notes]].filter(([, v]) => v)),
        h('div', { class: 'sp' }),
        h('span', { class: 'sub' }, `Transacción Wompi: ${o.wompi_tx_id || '—'}${o.paid_at ? ` · pagado ${dt(o.paid_at)}` : ''}`)));
  }

  /* ------------------------------------------------------------ affiliates */

  async function renderAffiliates(view) {
    const { affiliates } = (await api('affiliates')).data;
    const owed = affiliates.reduce((s, a) => s + (Number(a.commission_cop) - Number(a.commission_paid_cop)), 0);

    const rows = affiliates.map(a => {
      const pending = Number(a.commission_cop) - Number(a.commission_paid_cop);
      return h('tr', {},
        h('td', {}, h('strong', {}, a.code), h('span', { class: 'sub' }, a.affiliate_name), a.affiliate_contact ? h('span', { class: 'sub' }, a.affiliate_contact) : null),
        h('td', {}, a.active ? h('span', { class: 'badge ok' }, 'Activo') : h('span', { class: 'badge off' }, 'Inactivo')),
        h('td', { class: 'num' }, `${num(a.discount_pct)}%`), h('td', { class: 'num' }, `${num(a.commission_pct)}%`),
        h('td', { class: 'num' }, num(a.customers_started, 0), h('span', { class: 'sub' }, `${num(a.orders_started, 0)} pedidos`)),
        h('td', { class: 'num' }, h('strong', {}, num(a.customers_paid, 0)), h('span', { class: 'sub' }, `${num(a.orders_paid, 0)} pagados`)),
        h('td', { class: 'num' }, cop(a.sales_cop)),
        h('td', { class: 'num' }, cop(a.commission_cop)),
        h('td', { class: 'num' }, pending > 0 ? h('strong', {}, cop(pending)) : cop(0)),
        h('td', {},
          h('div', { class: 'row' },
            h('button', { class: 'btn small', onclick: () => editCode(a) }, 'Editar'),
            h('button', { class: 'btn small', onclick: () => { filters.code_id = String(a.id); filters.no_code = ''; location.hash = 'orders'; } }, 'Ver pedidos'),
            pending > 0 ? h('button', { class: 'btn small primary', onclick: () => payOut(a, pending) }, 'Marcar pagadas') : null)));
    });

    view.replaceChildren(
      h('div', { class: 'section-title' }, h('h2', {}, 'Afiliados y códigos de descuento'),
        h('button', { class: 'btn primary', onclick: () => editCode(null) }, 'Nuevo código')),
      h('div', { class: 'tiles' },
        tile('Códigos activos', num(affiliates.filter(a => a.active).length, 0), `${affiliates.length} en total`),
        tile('Comisiones por pagar', cop(owed), 'De pedidos pagados, aún sin liquidar'),
        tile('Ventas por afiliados', cop(affiliates.reduce((s, a) => s + Number(a.sales_cop), 0)), 'Pedidos pagados con código')),
      affiliates.length
        ? h('div', { class: 'table-wrap' }, h('table', {},
          h('thead', {}, h('tr', {}, h('th', {}, 'Código / afiliado'), h('th', {}, 'Estado'),
            h('th', { class: 'num' }, 'Desc.'), h('th', { class: 'num' }, 'Comisión'),
            h('th', { class: 'num' }, 'Clientes que usaron'), h('th', { class: 'num' }, 'Clientes que compraron'),
            h('th', { class: 'num' }, 'Ventas'), h('th', { class: 'num' }, 'Comisión generada'),
            h('th', { class: 'num' }, 'Por pagar'), h('th', {}, ''))),
          h('tbody', {}, rows)))
        : h('div', { class: 'card empty' }, 'Aún no hay códigos. Crea el primero con “Nuevo código”.'),
      h('p', { class: 'muted' }, '“Clientes que usaron” cuenta a quienes iniciaron un pedido con el código; “clientes que compraron”, solo a quienes lo pagaron. La comisión se calcula sobre el total cobrado, después del descuento.'));
  }

  async function payOut(a, pending) {
    if (!confirm(`Marcar como pagadas las comisiones de ${a.affiliate_name} (${a.code}) por ${cop(pending)}?\n\nHazlo solo después de haberle transferido el dinero.`)) return;
    const r = await api('pay_commissions', { method: 'POST', body: { code_id: a.id } });
    if (r.ok) { toast(`${r.data.orders} pedidos liquidados · ${cop(r.data.amount_cop)}`); go('affiliates'); } else toast(errText(r.data.error), true);
  }

  function editCode(a) {
    const f = {
      code: h('input', { name: 'code', required: true, maxlength: 32, value: a ? a.code : '', placeholder: 'MARIA10', style: 'text-transform:uppercase' }),
      name: h('input', { name: 'affiliate_name', required: true, maxlength: 120, value: a ? a.affiliate_name : '', placeholder: 'María Gómez' }),
      contact: h('input', { name: 'affiliate_contact', maxlength: 200, value: a ? a.affiliate_contact || '' : '', placeholder: 'WhatsApp, correo o Instagram (opcional)' }),
      discount: h('input', { name: 'discount_pct', type: 'number', min: 0, max: 100, step: '0.01', required: true, value: a ? a.discount_pct : 10 }),
      commission: h('input', { name: 'commission_pct', type: 'number', min: 0, max: 100, step: '0.01', required: true, value: a ? a.commission_pct : 10 }),
      active: h('input', { type: 'checkbox', checked: a ? a.active : true }),
    };
    const msg = h('p', { class: 'msg err', role: 'alert', hidden: true });
    const dlg = h('dialog', {},
      h('h3', {}, a ? 'Editar código' : 'Nuevo código'),
      h('form', { method: 'dialog', onsubmit: async ev => {
        ev.preventDefault();
        msg.hidden = true;
        const r = await api('code_save', { method: 'POST', body: {
          id: a ? a.id : undefined, code: f.code.value, affiliate_name: f.name.value, affiliate_contact: f.contact.value,
          discount_pct: f.discount.value, commission_pct: f.commission.value, active: f.active.checked } });
        if (r.ok) { dlg.close(); toast('Código guardado'); go('affiliates'); } else { msg.textContent = errText(r.data.error); msg.hidden = false; }
      } },
        h('label', {}, 'Código que escribirá el cliente'), f.code,
        h('label', {}, 'Nombre del afiliado'), f.name,
        h('label', {}, 'Contacto'), f.contact,
        h('div', { class: 'cols-2' },
          h('div', {}, h('label', {}, 'Descuento al cliente (%)'), f.discount),
          h('div', {}, h('label', {}, 'Comisión del afiliado (%)'), f.commission)),
        h('p', { class: 'muted', style: 'font-size:13px;margin:8px 0 0' },
          a ? 'Los cambios de porcentaje aplican solo a pedidos nuevos; los pedidos ya hechos conservan el porcentaje con el que se vendieron.' : 'La comisión se calcula sobre lo que el cliente paga, ya con el descuento aplicado.'),
        h('label', { class: 'check' }, f.active, 'Código activo'),
        msg,
        h('div', { class: 'actions' },
          a ? h('button', { type: 'button', class: 'btn danger', onclick: async () => {
            if (!confirm(`¿Borrar el código ${a.code}? Solo es posible si nunca se usó.`)) return;
            const r = await api('code_delete', { method: 'POST', body: { id: a.id } });
            if (r.ok) { dlg.close(); toast('Código borrado'); go('affiliates'); } else { msg.textContent = errText(r.data.error); msg.hidden = false; }
          } }, 'Borrar') : null,
          h('button', { type: 'button', class: 'btn ghost', onclick: () => dlg.close() }, 'Cancelar'),
          h('button', { type: 'submit', class: 'btn primary' }, 'Guardar'))));
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
    f.code.focus();
  }

  /* ----------------------------------------------------------------- stock */

  const stockUi = { q: '', onlyOff: false };

  async function renderStock(view) {
    const { products, markets } = (await api('products')).data;
    const byName = new Map();
    for (const p of products) { if (!byName.has(p.name)) byName.set(p.name, []); byName.get(p.name).push(p); }

    const list = h('div');
    const summary = h('span', { class: 'muted' });

    function sellsIn(p) { return markets.filter(m => p.markets[m].carries && p.markets[m].shelf); }

    function draw() {
      const q = stockUi.q.toLowerCase();
      const groups = [...byName.entries()].filter(([name, sizes]) =>
        (!q || name.toLowerCase().includes(q)) && (!stockUi.onlyOff || sizes.some(s => !s.available)));
      const off = products.filter(p => !p.available).length;
      summary.textContent = `${products.length - off} disponibles · ${off} agotados`;
      list.replaceChildren(...groups.map(([name, sizes]) => {
        const allOn = sizes.every(s => s.available);
        return h('div', { class: 'stock-group' },
          h('div', { class: 'stock-head' }, h('strong', {}, name),
            h('button', { class: 'btn small', onclick: () => setMany(sizes, !allOn) }, allOn ? 'Agotar todas las presentaciones' : 'Activar todas las presentaciones')),
          h('div', { class: 'stock-sizes' }, sizes.map(p => {
            const where = sellsIn(p);
            return h('button', { class: 'size', 'aria-pressed': String(p.available),
              title: where.length ? `Se vende en: ${where.join(', ')}` : 'Sin existencias fijas en ningún mercado (ver markets.js)',
              onclick: () => setMany([p], !p.available) },
              h('span', { class: 'dot' }), p.size, h('small', {}, where.length ? where.join(' · ') : 'sin mercado'),
              h('small', {}, p.available ? 'Disponible' : 'Agotado'));
          })));
      }));
      if (!groups.length) list.append(h('div', { class: 'card empty' }, 'Ningún producto coincide.'));
    }

    async function setMany(items, available) {
      const r = await api('stock_set', { method: 'POST', body: { keys: items.map(p => p.key), available } });
      if (!r.ok) { toast(errText(r.data.error), true); return; }
      items.forEach(p => { p.available = available; });
      draw();
      toast(available ? 'Disponible en la página' : 'Marcado como agotado (se refleja en segundos)');
    }

    view.replaceChildren(
      h('div', { class: 'section-title' }, h('h2', {}, 'Stock'), summary),
      h('p', { class: 'muted' }, 'Un producto agotado muestra “Agotado” en la página y no se puede comprar. El cambio llega a los visitantes en unos 10 segundos.'),
      h('div', { class: 'card' }, h('div', { class: 'row' },
        h('div', { class: 'grow' }, h('label', {}, 'Buscar producto'), h('input', { type: 'search', placeholder: 'BPC-157, Retatrutide…', oninput: ev => { stockUi.q = ev.target.value; draw(); } })),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: stockUi.onlyOff, onchange: ev => { stockUi.onlyOff = ev.target.checked; draw(); } }), 'Solo agotados'))),
      h('div', { class: 'sp' }), list);
    draw();
  }

  /* -------------------------------------------------------------- settings */

  async function renderSettings(view) {
    const { trm, trm_override } = (await api('settings')).data;
    const SRC = { live: 'oficial, en vivo', pinned: 'fijada por ti', stale: 'último valor conocido', fallback: 'valor de respaldo (la fuente oficial no respondió)' };
    const input = h('input', { type: 'number', min: 1000, max: 20000, step: '0.01', value: trm_override || '', placeholder: 'Ej. 4100' });
    const msg = h('p', { class: 'msg', hidden: true });

    const save = async value => {
      const r = await api('settings_set', { method: 'POST', body: { trm_override: value } });
      if (r.ok) { toast('Ajuste guardado'); go('settings'); } else { msg.className = 'msg err'; msg.textContent = errText(r.data.error); msg.hidden = false; }
    };

    view.replaceChildren(
      h('div', { class: 'section-title' }, h('h2', {}, 'Ajustes')),
      h('div', { class: 'card', style: 'max-width:560px' },
        h('h3', {}, 'Tasa de cambio (TRM)'),
        h('p', { class: 'muted' }, 'Wompi cobra siempre en pesos. Los pedidos en dólares se convierten con la TRM más un 2 % de margen, y la tasa usada queda guardada en cada pedido.'),
        h('p', {}, 'Tasa actual: ', h('strong', {}, num(trm.rate)), ` · ${SRC[trm.source] || trm.source}`),
        h('label', {}, 'Fijar una tasa manualmente'), input,
        h('p', { class: 'muted', style: 'font-size:13px' }, 'Úsala si la fuente oficial falla o si el dólar se mueve mucho en el día. Déjala vacía para volver a la tasa oficial.'),
        msg,
        h('div', { class: 'row', style: 'margin-top:14px' },
          h('button', { class: 'btn primary', onclick: () => save(input.value ? Number(input.value) : null) }, 'Guardar'),
          trm_override ? h('button', { class: 'btn', onclick: () => save(null) }, 'Quitar tasa fija') : null)));
  }

  /* ------------------------------------------------------------------ boot */

  (async function boot() {
    const me = await api('me');
    if (me.data.authed) { showApp(); go(currentTab()); } else showLogin();
  })();
})();
