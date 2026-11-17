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
  const CUR_LABEL = { COP: 'Colombia · COP', MXN: 'México · MXN', USD: 'Estados Unidos · USD' };
  const curFmt = {};
  // an amount in the affiliate's own currency, e.g. "USD 23.00" / "MXN 459.90" / "COP 91.980"
  const money = (n, c) => {
    c = c || 'COP';
    curFmt[c] = curFmt[c] || new Intl.NumberFormat('es-CO', { style: 'currency', currency: c, minimumFractionDigits: c === 'COP' ? 0 : 2, maximumFractionDigits: c === 'COP' ? 0 : 2, currencyDisplay: 'code' });
    return curFmt[c].format(Number(n) || 0);
  };
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
    bad_rate: 'La tasa no es válida (TRM entre 1.000 y 20.000; pesos mexicanos por dólar entre 5 y 60).',
    bad_mode: 'Elige cómo se calcula la comisión.',
    bad_currency: 'Elige una moneda válida.',
    bad_email: 'Escribe un correo válido.',
    email_taken: 'Ese correo ya pertenece a otro afiliado.',
    month_open: 'Ese mes aún no cierra. Se puede pagar cuando termine.',
    already_paid: 'Ese mes ya figura como pagado.',
    nothing_to_pay: 'Ese mes no genera comisión.',
    no_such_month: 'Ese mes no tiene ventas registradas.',
    bad_tiers: 'Los niveles no son válidos.',
    too_many_tiers: 'Máximo 10 niveles.',
    bad_threshold: 'Cada nivel necesita un monto en pesos entero y mayor o igual a 0.',
    bad_percent: 'El porcentaje debe estar entre 0 y 100.',
    duplicate_threshold: 'Dos niveles tienen el mismo monto.',
    tiers_not_increasing: 'Un nivel más alto no puede pagar menos que uno más bajo.',
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
        hasCode && o.commission_state ? h('span', { class: 'sub' },
          `${num(o.commission_pct)} % · ${{ paid: 'pagada', due: 'por pagar', open: 'mes en curso' }[o.commission_state]}`) : null));
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
    if (o.code_text && o.status === 'APPROVED') {
      money.push([`Comisión ${o.affiliate_name || ''} (${num(o.commission_pct)} % del mes)`, cop(o.commission_cop), true]);
    }
    const note = o.code_text && o.status === 'APPROVED'
      ? h('span', { class: 'sub' }, o.commission_state === 'paid' ? 'Mes ya liquidado.'
        : o.commission_state === 'open' ? 'Provisional: el porcentaje se fija al cerrar el mes. Se paga desde Afiliados → Liquidaciones.'
          : 'Mes cerrado, pendiente de pago en Afiliados → Liquidaciones.') : null;

    return h('div', { class: 'detail-grid' },
      h('div', {}, h('h4', {}, 'Productos'), h('ul', { style: 'margin:0;padding-left:18px' }, items)),
      h('div', {}, h('h4', {}, 'Desglose'), kv(money), note ? h('div', { class: 'sp' }) : null, note),
      h('div', {}, h('h4', {}, 'Cliente y envío'),
        kv([['Nombre', o.customer_name], ['Correo', o.customer_email], ['Teléfono', o.customer_phone],
          ['Dirección', ship.address], ['Ciudad', ship.city], ['Región', ship.region], ['Postal', ship.postal], ['País', ship.country],
          ['Notas', ship.notes]].filter(([, v]) => v)),
        h('div', { class: 'sp' }),
        h('span', { class: 'sub' }, `Transacción Wompi: ${o.wompi_tx_id || '—'}${o.paid_at ? ` · pagado ${dt(o.paid_at)}` : ''}`)));
  }

  /* ------------------------------------------------------------ affiliates */

  const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const monthLabel = m => { const [y, mo] = m.split('-'); return `${MONTHS_ES[Number(mo) - 1]} ${y}`; };
  // "Nivel 2 de 3 · 10 %" with tiers, "Fija · 8 %" without
  const levelText = (lvl, rate) => (lvl.mode === 'tiers'
    ? (lvl.level === 0 ? 'Aún sin nivel · 0 %' : `Nivel ${lvl.level} de ${lvl.levels} · ${num(rate)} %`)
    : `Fija · ${num(rate)} %`);

  // a consistent wrapper for every modal in the panel
  function openDialog(title, wide, ...kids) {
    const dlg = h('dialog', { style: wide ? 'width:min(900px, calc(100vw - 32px))' : null }, h('h3', {}, title), ...kids);
    // closing removes the dialog immediately, instead of waiting for the browser's
    // 'close' event, so a dialog can never linger behind the one that replaces it
    const nativeClose = dlg.close.bind(dlg);
    dlg.close = () => { nativeClose(); dlg.remove(); };
    dlg.addEventListener('close', () => dlg.remove());      // Esc and backdrop still clean up
    document.body.append(dlg);
    dlg.showModal();
    return dlg;
  }

  async function renderAffiliates(view) {
    const { affiliates, tiers, now } = (await api('affiliates')).data;
    const owed = affiliates.reduce((s, a) => s + a.owed_cop, 0);
    const monthSales = affiliates.reduce((s, a) => s + (a.current ? a.current.sales_cop : 0), 0);
    const monthCommission = affiliates.reduce((s, a) => s + (a.current ? a.current.commission_cop : 0), 0);

    const rows = affiliates.map(a => {
      const cur = a.current;
      return h('tr', {},
        h('td', {}, h('strong', {}, a.code), h('span', { class: 'sub' }, a.affiliate_name), a.affiliate_contact ? h('span', { class: 'sub' }, a.affiliate_contact) : null),
        h('td', {}, a.active ? h('span', { class: 'badge ok' }, 'Activo') : h('span', { class: 'badge off' }, 'Inactivo')),
        h('td', { class: 'num' }, `${num(a.discount_pct)}%`),
        h('td', {}, a.commission_mode === 'fixed' ? `Fija ${num(a.commission_pct)} %` : 'Escalonada', h('span', { class: 'sub' }, a.payout_currency)),
        h('td', {},
          a.has_access ? h('span', { class: 'badge info' }, 'Con acceso') : h('span', { class: 'badge off' }, 'Sin acceso'),
          a.has_access ? h('span', { class: 'sub' }, a.access_email) : null,
          a.has_access ? h('span', { class: 'sub' }, a.last_login_at ? `Último ingreso ${dt(a.last_login_at)}` : 'Aún no ha ingresado') : null),
        h('td', { class: 'num' }, num(a.customers_started, 0), h('span', { class: 'sub' }, 'usaron')),
        h('td', { class: 'num' }, h('strong', {}, num(a.customers_paid, 0)), h('span', { class: 'sub' }, 'compraron')),
        h('td', { class: 'num' }, cop(cur ? cur.sales_cop : 0), cur ? h('span', { class: 'sub' }, levelText(cur.level, cur.rate_pct)) : null),
        h('td', { class: 'num' }, cop(cur ? cur.commission_cop : 0),
          a.payout_currency !== 'COP' ? h('span', { class: 'sub' }, '≈ ' + money(a.local.month_commission, a.payout_currency)) : null,
          h('span', { class: 'sub' }, 'provisional')),
        h('td', { class: 'num' }, a.owed_cop > 0 ? h('strong', {}, cop(a.owed_cop)) : cop(0),
          a.payout_currency !== 'COP' && a.owed_cop > 0 ? h('span', { class: 'sub' }, '≈ ' + money(a.local.owed, a.payout_currency)) : null),
        h('td', {},
          h('div', { class: 'row' },
            h('button', { class: 'btn small', onclick: () => editCode(a) }, 'Editar'),
            h('button', { class: 'btn small', onclick: () => statementDialog(a) }, 'Liquidaciones'),
            h('button', { class: 'btn small', onclick: () => accessDialog(a) }, 'Acceso'),
            h('button', { class: 'btn small', onclick: () => { filters.code_id = String(a.id); filters.no_code = ''; location.hash = 'orders'; } }, 'Pedidos'))));
    });

    view.replaceChildren(
      h('div', { class: 'section-title' }, h('h2', {}, 'Afiliados y códigos de descuento'),
        h('button', { class: 'btn primary', onclick: () => editCode(null) }, 'Nuevo código')),
      h('div', { class: 'tiles' },
        tile('Códigos activos', num(affiliates.filter(a => a.active).length, 0), `${affiliates.length} en total`),
        tile(`Ventas de ${monthLabel(now)}`, cop(monthSales), 'Pedidos pagados con código'),
        tile('Comisión del mes', cop(monthCommission), 'Provisional: se fija al cerrar el mes'),
        tile('Por pagar', cop(owed), 'Meses ya cerrados, sin liquidar')),
      affiliates.length
        ? h('div', { class: 'table-wrap' }, h('table', {},
          h('thead', {}, h('tr', {}, h('th', {}, 'Código / afiliado'), h('th', {}, 'Estado'),
            h('th', { class: 'num' }, 'Desc.'), h('th', {}, 'Comisión / moneda'), h('th', {}, 'Portal'),
            h('th', { class: 'num' }, 'Clientes'), h('th', { class: 'num' }, ''),
            h('th', { class: 'num' }, 'Ventas del mes'), h('th', { class: 'num' }, 'Comisión del mes'),
            h('th', { class: 'num' }, 'Por pagar'), h('th', {}, ''))),
          h('tbody', {}, rows)))
        : h('div', { class: 'card empty' }, 'Aún no hay códigos. Crea el primero con “Nuevo código”.'),
      h('p', { class: 'muted' }, 'La comisión se calcula por mes calendario (hora de Colombia) sobre lo que los clientes pagaron con el código, ya con el descuento. Cada afiliado va por la escala (empieza en 15 % y sube 5 puntos por cada millón vendido en el mes, hasta 40 %) o por un porcentaje fijo, según lo elijas en “Editar”. Las cifras en MXN o USD son aproximadas hasta que el mes se paga. “Usaron” cuenta a quienes iniciaron un pedido; “compraron”, a quienes lo pagaron.'));
  }

  /* One affiliate's months: what was sold, the level reached, and payment. */
  async function statementDialog(a) {
    const r = await api('statement', { query: { code_id: String(a.id) } });
    if (!r.ok) { toast(errText(r.data.error), true); return; }
    const { months, tiers, currency: cur, mode, cop_per_unit } = r.data;
    const body = h('div');
    const dlg = openDialog(`Liquidaciones · ${a.affiliate_name} (${a.code})`, true, body,
      h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn', onclick: () => dlg.close() }, 'Cerrar')));

    const reload = async () => { dlg.close(); await go('affiliates'); statementDialog(a); };
    const pay = async m => {
      const loc = cur !== 'COP' ? ` (≈ ${money(m.commission_local, cur)} a la tasa de hoy)` : '';
      if (!confirm(`Marcar ${monthLabel(m.month)} como pagado a ${a.affiliate_name} por ${cop(m.commission_cop)}${loc}?\n\nHazlo solo después de haberle transferido el dinero. El monto, el porcentaje y la tasa quedan fijos.`)) return;
      const x = await api('pay_month', { method: 'POST', body: { code_id: a.id, month: m.month } });
      if (x.ok) { toast(`${monthLabel(m.month)} pagado · ${cop(x.data.amount_cop)}${x.data.currency !== 'COP' ? ' · ' + money(x.data.amount_local, x.data.currency) : ''}`); reload(); } else toast(errText(x.data.error), true);
    };
    const undo = async m => {
      if (!confirm(`¿Deshacer el pago de ${monthLabel(m.month)}? Volverá a figurar como pendiente.`)) return;
      const x = await api('unpay_month', { method: 'POST', body: { code_id: a.id, month: m.month } });
      if (x.ok) { toast('Pago deshecho'); reload(); } else toast(errText(x.data.error), true);
    };

    body.append(
      h('p', { class: 'muted', style: 'margin:0 0 6px' }, mode === 'fixed'
        ? `Comisión fija de ${num(a.commission_pct)} % sobre las ventas del mes.`
        : 'Escala vigente: ' + tiers.map(t => `${cop(t.min_cop)} → ${num(t.pct)} %`).join(' · ')),
      cur !== 'COP' ? h('p', { class: 'muted', style: 'margin:0 0 10px' },
        `Ve sus cifras en ${cur}. Tasa de hoy: 1 ${cur} = ${cop(cop_per_unit)}. Los meses ya pagados conservan la tasa con la que se pagaron.`) : null,
      h('div', { class: 'table-wrap' }, h('table', { style: 'min-width:700px' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Mes'), h('th', { class: 'num' }, 'Ventas'), h('th', { class: 'num' }, 'Pedidos'),
          h('th', { class: 'num' }, 'Clientes'), h('th', {}, 'Nivel'), h('th', { class: 'num' }, 'Comisión'), cur !== 'COP' ? h('th', { class: 'num' }, 'En ' + cur) : null, h('th', {}, 'Estado'), h('th', {}, ''))),
        h('tbody', {}, months.map(m => h('tr', {},
          h('td', {}, monthLabel(m.month)),
          h('td', { class: 'num' }, cop(m.sales_cop)), h('td', { class: 'num' }, num(m.orders, 0)), h('td', { class: 'num' }, num(m.customers, 0)),
          h('td', {}, m.paid ? `${num(m.rate_pct)} % (fijado)` : levelText(m.level, m.rate_pct)),
          h('td', { class: 'num' }, h('strong', {}, cop(m.commission_cop))),
          cur !== 'COP' ? h('td', { class: 'num' }, (m.paid ? '' : '≈ ') + money(m.commission_local, cur)) : null,
          h('td', {}, m.paid ? h('span', { class: 'badge ok' }, `Pagado ${dt(m.paid.at)}`)
            : m.open ? h('span', { class: 'badge warn' }, 'En curso (provisional)')
              : m.commission_cop > 0 ? h('span', { class: 'badge info' }, 'Por pagar') : h('span', { class: 'badge off' }, 'Sin comisión')),
          h('td', {}, m.paid ? h('button', { class: 'btn small', onclick: () => undo(m) }, 'Deshacer')
            : (!m.open && m.commission_cop > 0) ? h('button', { class: 'btn small primary', onclick: () => pay(m) }, 'Marcar pagado') : null)))))));
  }

  /* The affiliate's portal login: create it, or issue a new temporary password. */
  function accessDialog(a) {
    const msg = h('p', { class: 'msg err', role: 'alert', hidden: true });
    const fail = code => { msg.textContent = errText(code); msg.hidden = false; };
    const guess = /@/.test(a.affiliate_contact || '') ? a.affiliate_contact.trim() : '';
    const email = h('input', { type: 'email', required: true, maxlength: 254, value: a.has_access ? a.access_email : guess, placeholder: 'correo@ejemplo.com' });

    const issue = async () => {
      msg.hidden = true;
      if (a.has_access && !confirm(`Se creará una nueva contraseña temporal y se cerrará la sesión de ${a.affiliate_name}. ¿Continuar?`)) return;
      const r = await api('affiliate_user_save', { method: 'POST', body: { code_id: a.id, email: email.value } });
      if (!r.ok) { fail(r.data.error); return; }
      dlg.close();
      credentialsDialog(a, r.data);
      go('affiliates');
    };
    const remove = async () => {
      if (!confirm(`¿Quitar el acceso de ${a.affiliate_name}? Ya no podrá ver su portal. Su código y sus ventas no cambian.`)) return;
      const r = await api('affiliate_user_delete', { method: 'POST', body: { code_id: a.id } });
      if (r.ok) { dlg.close(); toast('Acceso quitado'); go('affiliates'); } else fail(r.data.error);
    };

    const dlg = openDialog(`Acceso al portal · ${a.affiliate_name}`, false,
      h('p', { class: 'muted', style: 'margin:0' }, a.has_access
        ? 'Esta persona ya tiene acceso. Puedes cambiar el correo o generar una contraseña temporal nueva.'
        : 'Crea un usuario para que esta persona entre a ver quiénes usaron su código y cómo va su comisión.'),
      h('label', {}, 'Correo del afiliado'), email, msg,
      h('p', { class: 'muted', style: 'font-size:13px;margin:10px 0 0' },
        'Verá solo a sus propios clientes, con el nombre abreviado y la ciudad. Nunca verá correo, teléfono ni dirección.'),
      h('div', { class: 'actions' },
        a.has_access ? h('button', { type: 'button', class: 'btn danger', onclick: remove }, 'Quitar acceso') : null,
        h('button', { type: 'button', class: 'btn ghost', onclick: () => dlg.close() }, 'Cancelar'),
        h('button', { type: 'button', class: 'btn primary', onclick: issue }, a.has_access ? 'Nueva contraseña' : 'Crear acceso')));
    email.focus();
  }

  /* Shown ONCE: the password exists nowhere else, so this is the only chance to copy it. */
  function credentialsDialog(a, c) {
    const url = `${location.origin}/afiliados`;
    const message = `Hola ${a.affiliate_name.split(' ')[0]}, este es tu acceso para ver tus resultados como afiliado de Ascent:\n\nEnlace: ${url}\nCorreo: ${c.email}\nContraseña temporal: ${c.password}\n\nAl entrar por primera vez te pedirá cambiar la contraseña.`;
    const copy = h('button', { type: 'button', class: 'btn primary', onclick: async () => {
      try { await navigator.clipboard.writeText(message); copy.textContent = 'Copiado ✓'; } catch (e) { toast('No se pudo copiar; selecciona el texto', true); }
    } }, 'Copiar mensaje');
    const dlg = openDialog('Acceso creado', false,
      h('p', { class: 'msg err', style: 'margin:0 0 10px' }, 'Esta contraseña se muestra una sola vez. Cópiala ahora y envíasela por un canal privado.'),
      h('pre', { style: 'white-space:pre-wrap;background:#faf8f3;border:1px solid var(--line);border-radius:8px;padding:12px;margin:0;font:inherit;font-size:14px;user-select:all' }, message),
      h('div', { class: 'actions' }, copy, h('button', { type: 'button', class: 'btn', onclick: () => dlg.close() }, 'Listo')));
  }

  function editCode(a) {
    const f = {
      code: h('input', { name: 'code', required: true, maxlength: 32, value: a ? a.code : '', placeholder: 'MARIA10', style: 'text-transform:uppercase' }),
      name: h('input', { name: 'affiliate_name', required: true, maxlength: 120, value: a ? a.affiliate_name : '', placeholder: 'María Gómez' }),
      contact: h('input', { name: 'affiliate_contact', maxlength: 200, value: a ? a.affiliate_contact || '' : '', placeholder: 'WhatsApp, correo o Instagram (opcional)' }),
      discount: h('input', { name: 'discount_pct', type: 'number', min: 0, max: 100, step: '0.01', required: true, value: a ? a.discount_pct : 10 }),
      mode: h('select', { name: 'commission_mode' },
        h('option', { value: 'tiers' }, 'Escalonada: 15 % y sube 5 puntos por cada millón del mes (máx. 40 %)'),
        h('option', { value: 'fixed' }, 'Porcentaje fijo')),
      currency: h('select', { name: 'payout_currency' },
        ...['COP', 'MXN', 'USD'].map(c => h('option', { value: c }, CUR_LABEL[c]))),
      commission: h('input', { name: 'commission_pct', type: 'number', min: 0, max: 100, step: '0.01', value: a ? a.commission_pct : 10 }),
      active: h('input', { type: 'checkbox', checked: a ? a.active : true }),
    };
    f.mode.value = a ? a.commission_mode : 'tiers';
    f.currency.value = a ? a.payout_currency : 'COP';
    const fixedBox = h('div', {}, h('label', {}, 'Porcentaje fijo de comisión (%)'), f.commission);
    const syncMode = () => { fixedBox.hidden = f.mode.value !== 'fixed'; f.commission.required = f.mode.value === 'fixed'; };
    f.mode.addEventListener('change', syncMode);
    syncMode();
    const msg = h('p', { class: 'msg err', role: 'alert', hidden: true });
    const dlg = h('dialog', {},
      h('h3', {}, a ? 'Editar código' : 'Nuevo código'),
      h('form', { method: 'dialog', onsubmit: async ev => {
        ev.preventDefault();
        msg.hidden = true;
        const r = await api('code_save', { method: 'POST', body: {
          id: a ? a.id : undefined, code: f.code.value, affiliate_name: f.name.value, affiliate_contact: f.contact.value,
          discount_pct: f.discount.value, commission_mode: f.mode.value, payout_currency: f.currency.value,
          commission_pct: f.commission.value === '' ? undefined : f.commission.value, active: f.active.checked } });
        if (r.ok) { dlg.close(); toast('Código guardado'); go('affiliates'); } else { msg.textContent = errText(r.data.error); msg.hidden = false; }
      } },
        h('label', {}, 'Código que escribirá el cliente'), f.code,
        h('label', {}, 'Nombre del afiliado'), f.name,
        h('label', {}, 'Contacto'), f.contact,
        h('label', {}, 'Descuento al cliente (%)'), f.discount,
        h('label', {}, 'Cómo se calcula su comisión'), f.mode,
        fixedBox,
        h('label', {}, 'País del afiliado (moneda en la que ve y se le paga)'), f.currency,
        h('p', { class: 'muted', style: 'font-size:13px;margin:6px 0 0' },
          'Todo se gana en pesos colombianos; al afiliado se le muestra en su moneda a la tasa del día. Al marcar un mes como pagado, el monto y la tasa quedan fijos. La escala está en Ajustes.'),
        h('p', { class: 'muted', style: 'font-size:13px;margin:8px 0 0' },
          'La comisión se calcula sobre lo que el cliente paga, ya con el descuento. Cambiar el método o el porcentaje afecta a los meses que aún no se han pagado; los meses ya pagados no cambian.'),
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
    const nativeClose = dlg.close.bind(dlg);
    dlg.close = () => { nativeClose(); dlg.remove(); };
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
    const { trm, trm_override, mxn, mxn_override, tiers, tiers_custom } = (await api('settings')).data;
    const SRC = { live: 'oficial, en vivo', pinned: 'fijada por ti', stale: 'último valor conocido', fallback: 'valor de respaldo (la fuente oficial no respondió)' };
    const input = h('input', { type: 'number', min: 1000, max: 20000, step: '0.01', value: trm_override || '', placeholder: 'Ej. 4100' });
    const msg = h('p', { class: 'msg', hidden: true });

    const save = async value => {
      const r = await api('settings_set', { method: 'POST', body: { trm_override: value } });
      if (r.ok) { toast('Ajuste guardado'); go('settings'); } else { msg.className = 'msg err'; msg.textContent = errText(r.data.error); msg.hidden = false; }
    };

    const mxnInput = h('input', { type: 'number', min: 5, max: 60, step: '0.0001', value: mxn_override || '', placeholder: 'Ej. 18.5' });
    const mxnMsg = h('p', { class: 'msg', hidden: true });
    const saveMxn = async value => {
      const r = await api('mxn_set', { method: 'POST', body: { mxn_override: value } });
      if (r.ok) { toast('Ajuste guardado'); go('settings'); } else { mxnMsg.className = 'msg err'; mxnMsg.textContent = errText(r.data.error); mxnMsg.hidden = false; }
    };
    const resetTiers = async () => {
      if (!confirm('¿Volver a la escala estándar (15 % y +5 puntos por cada millón, máximo 40 %)? Los meses ya pagados no cambian.')) return;
      const r = await api('tiers_set', { method: 'POST', body: { tiers: [] } });
      if (r.ok) { toast('Escala estándar restaurada'); go('settings'); } else toast(errText(r.data.error), true);
    };

    // ---- commission levels: rows of (monthly sales from, commission %)
    const tierRows = h('div');
    const tierMsg = h('p', { class: 'msg', hidden: true });
    const addRow = (t = { min_cop: '', pct: '' }) => {
      const min = h('input', { type: 'number', min: 0, step: '1', placeholder: 'Ej. 3000000', value: t.min_cop, 'aria-label': 'Ventas del mes desde (COP)' });
      const pc = h('input', { type: 'number', min: 0, max: 100, step: '0.01', placeholder: 'Ej. 10', value: t.pct, 'aria-label': 'Comisión (%)', style: 'width:110px' });
      const row = h('div', { class: 'row', 'data-tier': true, style: 'margin-bottom:8px;align-items:center' },
        h('div', { class: 'grow' }, min), h('div', {}, pc), h('span', { class: 'muted' }, '%'),
        h('button', { type: 'button', class: 'btn small danger', onclick: () => row.remove() }, 'Quitar'));
      row._min = min; row._pct = pc;
      tierRows.append(row);
    };
    (tiers.length ? tiers : []).forEach(addRow);
    const saveTiers = async () => {
      tierMsg.hidden = true;
      const list = [...tierRows.children].map(r => ({ min_cop: Number(r._min.value), pct: Number(r._pct.value) }));
      if ([...tierRows.children].some(r => r._min.value === '' || r._pct.value === '')) { tierMsg.className = 'msg err'; tierMsg.textContent = 'Completa el monto y el porcentaje de cada nivel.'; tierMsg.hidden = false; return; }
      const r = await api('tiers_set', { method: 'POST', body: { tiers: list } });
      if (r.ok) { toast(list.length ? 'Niveles guardados' : 'Escala estándar restaurada'); go('settings'); }
      else { tierMsg.className = 'msg err'; tierMsg.textContent = errText(r.data.error); tierMsg.hidden = false; }
    };

    view.replaceChildren(
      h('div', { class: 'section-title' }, h('h2', {}, 'Ajustes')),
      h('div', { class: 'card', style: 'max-width:640px;margin-bottom:16px' },
        h('h3', {}, 'Escala de comisión de afiliados'),
        h('p', { class: 'muted' }, tiers_custom ? 'Estás usando una escala personalizada.' : 'Estás usando la escala estándar: empieza en 15 % y suma 5 puntos por cada COP 1.000.000 vendido en el mes, hasta 40 %.'),
        h('p', { class: 'muted' }, 'Cada afiliado gana según lo que facturen sus clientes en el mes (mes calendario, hora de Colombia, sobre lo realmente pagado y ya con descuento). El nivel que alcance aplica a todas las ventas de ese mes, no solo al excedente.'),
        h('p', { class: 'muted', style: 'font-size:13px' }, 'Ejemplo: con “desde 0 → 5 %” y “desde 3.000.000 → 10 %”, quien venda 3.500.000 en el mes gana 10 % de los 3.500.000. Un nivel más alto nunca puede pagar menos que uno más bajo. Los afiliados con porcentaje fijo no usan esta escala. Cada afiliado en escala ve en su portal cuánto le falta para el siguiente nivel.'),
        h('div', { class: 'row muted', style: 'font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em' },
          h('div', { class: 'grow' }, 'Ventas del mes desde (COP)'), h('div', { style: 'width:110px' }, 'Comisión')),
        tierRows,
        tierMsg,
        h('div', { class: 'row', style: 'margin-top:10px' },
          h('button', { type: 'button', class: 'btn', onclick: () => addRow() }, 'Agregar nivel'),
          h('button', { type: 'button', class: 'btn primary', onclick: saveTiers }, 'Guardar niveles'),
          tiers_custom ? h('button', { type: 'button', class: 'btn', onclick: resetTiers }, 'Restablecer estándar') : null),
        h('p', { class: 'muted', style: 'font-size:13px;margin-top:10px' }, 'Un cambio de niveles se aplica a los meses que aún no se han pagado. Los meses ya pagados conservan el porcentaje con el que se pagaron.')),
      h('div', { class: 'card', style: 'max-width:560px;margin-bottom:16px' },
        h('h3', {}, 'Pesos mexicanos por dólar'),
        h('p', { class: 'muted' }, 'Solo sirve para mostrar a los afiliados de México su comisión en pesos mexicanos (se calcula con la TRM y esta tasa). No afecta lo que pagan los clientes.'),
        h('p', {}, 'Tasa actual: ', h('strong', {}, num(mxn.rate, 4)), ` · ${SRC[mxn.source] || mxn.source}`),
        h('label', {}, 'Fijar una tasa manualmente'), mxnInput, mxnMsg,
        h('div', { class: 'row', style: 'margin-top:14px' },
          h('button', { class: 'btn primary', onclick: () => saveMxn(mxnInput.value ? Number(mxnInput.value) : null) }, 'Guardar'),
          mxn_override ? h('button', { class: 'btn', onclick: () => saveMxn(null) }, 'Quitar tasa fija') : null)),
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
