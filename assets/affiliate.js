/* ==========================================================================
   Affiliate portal.

   Shows ONE affiliate their own results: who used their code (first name and
   last initial, plus city), what was sold, which commission level they have
   reached this month and how far the next one is.

   Everything is inserted as text through h(), never as HTML. The server decides
   whose data this is from the signed session; nothing on this page names an
   affiliate or a code.
   ========================================================================== */
(function () {
  'use strict';

  const $ = s => document.querySelector(s);

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
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
  /* The affiliate's own currency. Sales are earned in pesos colombianos; everything
     here is shown in COP, MXN or USD depending on where they are, with COP kept as
     the reference for levels (the levels are defined in COP). */
  let CUR = 'COP';
  const fmts = {};
  const fm = n => {
    const f = fmts[CUR] || (fmts[CUR] = new Intl.NumberFormat('es-CO', { style: 'currency', currency: CUR, minimumFractionDigits: CUR === 'COP' ? 0 : 2, maximumFractionDigits: CUR === 'COP' ? 0 : 2, currencyDisplay: 'code' }));
    return f.format(Number(n) || 0);
  };
  const approx = () => (CUR === 'COP' ? '' : '≈ ');
  const num = (n, d = 0) => Number(n).toLocaleString('es-CO', { maximumFractionDigits: d });
  const day = s => new Date(s).toLocaleDateString('es-CO', { dateStyle: 'medium' });
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const monthLabel = m => { const [y, mo] = m.split('-'); return `${MONTHS[Number(mo) - 1]} ${y}`; };

  const ERR = {
    wrong_credentials: 'Correo o contraseña incorrectos.',
    too_many_attempts: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
    wrong_current: 'La contraseña temporal no es correcta.',
    weak_password: 'La nueva contraseña debe tener al menos 10 caracteres.',
    same_password: 'La nueva contraseña debe ser distinta de la temporal.',
    not_configured: 'El portal aún no está disponible.',
  };

  async function api(a, { method = 'GET', body } = {}) {
    const res = await fetch(`/api/affiliate?${new URLSearchParams({ a })}`, {
      method, credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch (e) { /* empty */ }
    return { ok: res.ok, status: res.status, data };
  }

  const show = which => {
    for (const id of ['login', 'change', 'app']) $(`#${id}`).hidden = id !== which;
    if (which === 'login') $('#email').focus();
    if (which === 'change') $('#cur').focus();
  };

  /* ---------------------------------------------------------------- forms */

  $('#login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('#login-msg');
    msg.hidden = true;
    const r = await api('login', { method: 'POST', body: { email: $('#email').value, password: $('#pw').value } });
    if (!r.ok) { msg.textContent = ERR[r.data.error] || 'No se pudo iniciar sesión.'; msg.hidden = false; return; }
    $('#cur').value = $('#pw').value;      // handy for the forced change; never leaves the page
    $('#pw').value = '';
    boot();
  });

  $('#change-form').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('#change-msg');
    msg.hidden = true;
    if ($('#new1').value !== $('#new2').value) { msg.textContent = 'Las dos contraseñas nuevas no coinciden.'; msg.hidden = false; return; }
    const r = await api('change_password', { method: 'POST', body: { current: $('#cur').value, next: $('#new1').value } });
    if (!r.ok) { msg.textContent = ERR[r.data.error] || 'No se pudo cambiar la contraseña.'; msg.hidden = false; return; }
    for (const id of ['cur', 'new1', 'new2']) $(`#${id}`).value = '';
    boot();
  });

  $('#logout').addEventListener('click', async () => { await api('logout', { method: 'POST', body: {} }); show('login'); });

  /* ------------------------------------------------------------ dashboard */

  const tile = (k, v, s) => h('div', { class: 'tile' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v), h('div', { class: 's' }, s));

  /* How far along the current month is: the level reached, the next one, and the gap. */
  function progressCard(d) {
    const m = d.month;
    if (!m) return null;
    const title = `Tu avance en ${monthLabel(m.month)}`;

    if (d.mode === 'fixed') {
      return h('div', { class: 'card', style: 'margin-bottom:16px' },
        h('h3', {}, title),
        h('p', { style: 'margin:8px 0 0' }, 'Vendes con tu código: ', h('strong', {}, fm(m.sales_local)), ' · ',
          'Tu comisión es de ', h('strong', {}, `${num(m.rate_pct, 2)} %`), ' sobre tus ventas: ', h('strong', {}, fm(m.commission_local)),
          CUR !== 'COP' ? h('span', { class: 'muted' }, ` (${cop(m.commission_cop)})`) : null));
    }

    const lvl = m.level;
    const tiers = d.tiers;
    const lower = lvl.level === 0 ? 0 : tiers[lvl.level - 1].min_cop;
    const upper = lvl.next ? lvl.next.min_cop : null;
    const frac = upper == null ? 1 : Math.max(0, Math.min(1, (m.sales_cop - lower) / (upper - lower)));

    const headline = lvl.level === 0
      ? 'Aún no alcanzas el primer nivel'
      : `Nivel ${lvl.level} de ${lvl.levels} · ${num(m.rate_pct, 2)} % de comisión`;
    const gap = upper == null
      ? h('p', { style: 'margin:8px 0 0' }, h('strong', {}, '¡Alcanzaste el nivel más alto!'), ' Todas tus ventas de este mes se comisionan al ', h('strong', {}, `${num(m.rate_pct, 2)} %`), '.')
      : h('p', { style: 'margin:8px 0 0' }, 'Te faltan ', h('strong', {}, approx() + fm(lvl.next.missing_local)), CUR !== 'COP' ? ` (${cop(lvl.next.missing_cop)})` : '', ' en ventas este mes para llegar al ',
        h('strong', {}, `nivel ${lvl.level + 1} (${num(lvl.next.pct, 2)} %)`), '. Al llegar, ese porcentaje se aplica a ', h('strong', {}, 'todas'), ' tus ventas del mes.');

    return h('div', { class: 'card', style: 'margin-bottom:16px' },
      h('h3', {}, title),
      h('p', { style: 'margin:8px 0 12px;font-size:18px;font-weight:700' }, headline),
      h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(frac * 100),
        'aria-label': 'Avance hacia el siguiente nivel' }, h('span', { style: `width:${(frac * 100).toFixed(1)}%` })),
      h('div', { class: 'bar-ends muted' }, h('span', {}, cop(lower)), h('span', {}, upper == null ? 'Nivel máximo' : cop(upper))),
      CUR !== 'COP' ? h('p', { class: 'muted', style: 'font-size:12px;margin:4px 0 0' }, 'Los niveles se miden en pesos colombianos (COP), que es la moneda en que compran tus clientes.') : null,
      h('p', { style: 'margin:12px 0 0' }, 'Ventas del mes con tu código: ', h('strong', {}, fm(m.sales_local)), ' · Comisión provisional: ', h('strong', {}, approx() + fm(m.commission_local))),
      gap,
      h('ul', { class: 'levels' }, tiers.map((t, i) => h('li', { class: i + 1 === lvl.level ? 'is-current' : (i + 1 < lvl.level ? 'is-done' : '') },
        h('span', {}, i + 1 <= lvl.level ? '✓ ' : '', `Nivel ${i + 1}`),
        h('span', { class: 'muted' }, `desde ${cop(t.min_cop)} en el mes`, CUR !== 'COP' ? ` (≈ ${fm(t.min_local)})` : ''),
        h('strong', {}, `${num(t.pct, 2)} %`)))),
      h('p', { class: 'muted', style: 'font-size:13px;margin:10px 0 0' }, 'La comisión es provisional mientras el mes está abierto: se fija al cerrar el mes, según el nivel alcanzado.'));
  }

  function table(headers, rows, empty) {
    if (!rows.length) return h('div', { class: 'card empty' }, empty);
    return h('div', { class: 'table-wrap' }, h('table', { style: 'min-width:620px' },
      h('thead', {}, h('tr', {}, headers.map(([label, num]) => h('th', { class: num ? 'num' : '' }, label)))),
      h('tbody', {}, rows)));
  }

  const statusBadge = s => (s === 'APPROVED' || s === 'bought' ? h('span', { class: 'badge ok' }, 'Compró') : h('span', { class: 'badge warn' }, 'En proceso'));

  function render(d) {
    CUR = d.currency || 'COP';
    $('#who').textContent = `${d.profile.name} · código ${d.profile.code}`;
    const p = d.profile;

    const peopleRows = d.people.map(x => h('tr', {},
      h('td', {}, h('strong', {}, x.name)), h('td', {}, x.city || '—'), h('td', {}, day(x.first_use)),
      h('td', {}, statusBadge(x.status)),
      h('td', { class: 'num' }, num(x.orders_paid)), h('td', { class: 'num' }, x.total_cop ? fm(x.total_local) : '—')));

    const orderRows = d.orders.map(o => h('tr', {},
      h('td', {}, day(o.created_at)), h('td', {}, o.who, h('span', { class: 'sub' }, o.city || '')),
      h('td', {}, o.items.map(i => `${i.qty} × ${i.name} ${i.size}`).join(', ')),
      h('td', {}, statusBadge(o.status)),
      h('td', { class: 'num' }, fm(o.charge_local)), h('td', { class: 'num' }, o.status === 'APPROVED' ? fm(o.commission_local) : '—')));

    const monthRows = d.months.map(m => h('tr', {},
      h('td', {}, monthLabel(m.month)), h('td', { class: 'num' }, fm(m.sales_local)),
      h('td', { class: 'num' }, num(m.customers)), h('td', { class: 'num' }, `${num(m.rate_pct, 2)} %`),
      h('td', { class: 'num' }, h('strong', {}, (m.status === 'paid' ? '' : approx()) + fm(m.commission_local))),
      h('td', {}, m.status === 'paid' ? h('span', { class: 'badge ok' }, `Pagado ${day(m.paid_at)}`)
        : m.status === 'open' ? h('span', { class: 'badge warn' }, 'En curso') : h('span', { class: 'badge info' }, 'Por cobrar'))));

    $('#view').replaceChildren(...[
      !p.active ? h('div', { class: 'card', style: 'margin-bottom:16px;background:var(--warn-bg);border-color:transparent' },
        'Tu código está desactivado y ya no aplica descuento a nuevas compras. Tu historial sigue disponible aquí.') : null,
      h('div', { class: 'card', style: 'margin-bottom:16px' },
        h('div', { class: 'row' },
          h('div', { class: 'grow' }, h('div', { class: 'muted', style: 'font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.06em' }, 'Tu código de afiliado'),
            h('div', { style: 'font-size:28px;font-weight:800;letter-spacing:.04em' }, p.code)),
          h('div', { class: 'muted', style: 'max-width:46ch' }, `Quien lo escriba en el pago recibe ${num(p.discount_pct, 2)} % de descuento, y esa compra cuenta para tu comisión.`))),
      progressCard(d),
      h('div', { class: 'tiles' },
        tile('Personas que usaron tu código', num(d.people_used), 'Iniciaron una compra'),
        tile('Personas que compraron', num(d.people_bought), 'Pago confirmado'),
        tile('Por cobrar', approx() + fm(d.owed_local), CUR === 'COP' ? 'Meses cerrados, aún sin pagar' : 'Meses cerrados, sin pagar · aprox. a la tasa de hoy'),
        tile('Ya pagado', fm(d.paid_local), 'Total que te hemos pagado')),
      CUR !== 'COP' ? h('p', { class: 'muted', style: 'font-size:13px;margin:-8px 0 0' },
        `Tus montos se muestran en ${CUR}. Tasa de hoy: 1 ${CUR} = ${cop(d.fx.cop_per_unit)}${d.fx.source && d.fx.source !== 'live' && d.fx.source !== 'pinned' ? ' (estimada)' : ''}. Lo que está por cobrar es aproximado: el monto exacto queda fijo cuando se te paga, y lo ya pagado no cambia.`) : null,

      h('div', { class: 'section-title', style: 'margin-top:24px' }, h('h2', {}, 'Personas que usaron tu código')),
      table([['Persona'], ['Ciudad'], ['Primer uso'], ['Estado'], ['Compras', true], [`Total comprado (${CUR})`, true]], peopleRows,
        'Todavía nadie ha usado tu código.'),
      h('p', { class: 'muted', style: 'font-size:13px' }, 'Por privacidad ves solo el nombre abreviado y la ciudad; los datos de contacto de los clientes no se comparten.'),

      h('div', { class: 'section-title', style: 'margin-top:24px' }, h('h2', {}, 'Pedidos')),
      table([['Fecha'], ['Cliente'], ['Productos'], ['Estado'], [`Valor pagado (${CUR})`, true], [`Tu comisión (${CUR})`, true]], orderRows, 'Aún no hay pedidos con tu código.'),

      h('div', { class: 'section-title', style: 'margin-top:24px' }, h('h2', {}, 'Mes a mes')),
      table([['Mes'], [`Ventas (${CUR})`, true], ['Clientes', true], ['Porcentaje', true], [`Comisión (${CUR})`, true], ['Estado']], monthRows, 'Aún no hay meses para mostrar.')].filter(Boolean));
  }

  /* ----------------------------------------------------------------- boot */

  async function boot() {
    const me = await api('me');
    if (me.status === 503) { $('#login-msg').textContent = ERR.not_configured; $('#login-msg').hidden = false; show('login'); return; }
    if (!me.data.authed) { show('login'); return; }
    if (me.data.must_change) { show('change'); return; }
    const r = await api('summary');
    if (r.status === 401) { show('login'); return; }
    if (r.status === 403) { show('change'); return; }
    if (!r.ok) { show('login'); return; }
    show('app');
    render(r.data);
  }
  boot();
})();
