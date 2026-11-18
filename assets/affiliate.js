/* ==========================================================================
   Affiliate portal (Stage 1): create an account, accept the policies, share
   your code and invite link, see who used your code and who you invited.

   Built for people who are not comfortable with technology: plain words, big
   text, one idea per block, and a "what do I do now?" line on every screen.
   Spanish and English.

   Everything is inserted as text through h(), never as HTML. The server decides
   whose data this is from the signed session; nothing on this page names an
   affiliate or a code.
   ========================================================================== */
(function () {
  'use strict';

  const root = document.getElementById('root');
  const WA = '573164114411';

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

  /* ------------------------------------------------------------------ words */

  const T = {
    es: {
      brand: 'Ascent · Afiliados',
      email: 'Correo', password: 'Contraseña', showpw: 'Mostrar contraseña', hint10: 'Mínimo 10 letras o números.',
      loginTitle: 'Entra a tu cuenta', loginSub: 'Escribe tu correo y tu contraseña.', enter: 'Entrar',
      forgotLink: 'Olvidé mi contraseña', createLink: 'Crear mi cuenta gratis', haveAccount: '¿Ya tienes cuenta? Entrar',
      regTitle: 'Crea tu cuenta gratis', invitedBy: 'Te invitó {name}.', fullName: 'Tu nombre completo', phoneOpt: 'Tu teléfono (opcional)',
      country: 'País', pickCountry: 'Elige tu país', create: 'Crear mi cuenta',
      sponsorLabel: 'Código de quien te afilió (opcional)', sponsorHint: 'Si alguien te invitó, escribe su código. Si te afilió Ascent directamente, déjalo en blanco.',
      sponsorOk: '✓ Te afilia {name}.', sponsorNo: 'No encontramos ese código. Revísalo, o déjalo en blanco si nadie te invitó.',
      CO: 'Colombia', MX: 'México', US: 'Estados Unidos',
      termsAccept: 'He leído y acepto', termsContinue: 'Continuar',
      forgotTitle: 'Recupera tu contraseña', forgotSub: 'Escribe tu correo y te enviamos un enlace para elegir una nueva.', forgotSend: 'Enviar enlace',
      forgotDone: 'Listo. Si ese correo tiene una cuenta, te enviamos un enlace. Revisa tu bandeja de entrada y también el correo no deseado.',
      resetTitle: 'Elige tu nueva contraseña', resetSave: 'Guardar contraseña', resetDone: 'Tu contraseña cambió. Ya puedes entrar.',
      changeTitle: 'Crea tu contraseña', changeSub: 'Cambia la contraseña temporal por una tuya.', cur: 'Contraseña temporal', new1: 'Nueva contraseña', new2: 'Repite la nueva contraseña', changeSave: 'Guardar y entrar',
      mismatch: 'Las dos contraseñas no son iguales. Escríbelas de nuevo.',
      navHome: 'Inicio', navSales: 'Mis ventas', navTeam: 'Afiliados por mí', navHelp: 'Ayuda',
      hello: 'Hola, {name}', whatNow: '¿Qué hago ahora?',
      codeTitle: 'Tu código de descuento', codeHelp: 'Quien lo escriba al pagar recibe {pct} % de descuento, y esa compra es tuya.',
      copy: 'Copiar', copied: 'Copiado ✓', copyFail: 'No se pudo copiar. Mantén presionado el texto para copiarlo.', shareWa: 'Compartir por WhatsApp',
      shareCode: 'Hola, te comparto mi código {code} de Ascent Labs: con él tienes {pct} % de descuento en tu compra. {url}',
      shareInvite: 'Hola, te invito a ser afiliado de Ascent Labs. Entra con este enlace: {url}',
      todoShare: 'Comparte tu código con las personas que quieran comprar.',
      used: 'Personas que usaron tu código', bought: 'Personas que compraron', invited: 'Afiliados por mí',
      pointsSoon: 'Tus Puntos empezarán a sumarse cuando abra el programa de Puntos. Te avisaremos por correo.',
      pointsSoonTitle: 'Puntos',
      monthTitle: 'Este mes', monthSales: 'Llevas vendido: {amount}', monthComm: 'Tu comisión es de {rate} % sobre tus ventas: {amount}',
      owed: 'Lo que te toca recibir', paid: 'Lo que ya te pagamos', approx: 'Monto aproximado. El monto exacto queda fijo cuando se te paga.',
      salesTitle: 'Mis ventas', salesSub: 'Personas que usaron tu código.', salesEmpty: 'Todavía nadie ha usado tu código. Compártelo para empezar.',
      bought2: 'Compró', pending: 'En proceso', salesPrivacy: 'Por privacidad ves solo el nombre abreviado y la ciudad.',
      ordersTitle: 'Pedidos con tu código', ordersEmpty: 'Aún no hay pedidos.', paidAmount: 'Pagó {amount}',
      salesNow: 'Cuando alguien compre con tu código, aparecerá aquí.',
      teamTitle: 'Afiliados por mí', teamSub: 'Personas que se afiliaron con tu enlace.', teamLink: 'Tu enlace de invitación',
      teamEmpty: 'Aún nadie se ha afiliado con tu enlace.', since: 'Desde {date}', hasSales: 'Ya vendió', noSales: 'Aún no ha vendido',
      teamNote: 'Solo ves a las personas que invitaste tú.', teamNow: 'Envía tu enlace por WhatsApp a quien quieras invitar.',
      helpTitle: 'Ayuda', helpWa: 'Escríbenos por WhatsApp', helpWaText: 'Hola, necesito ayuda con mi cuenta de afiliado.',
      faqTitle: 'Preguntas frecuentes',
      faq: [
        ['¿Cuánto cuesta ser afiliado?', 'Nada. Crear tu cuenta es gratis.'],
        ['¿Cómo funciona mi código?', 'Tus clientes lo escriben al pagar y reciben {pct} % de descuento. La compra queda registrada a tu nombre.'],
        ['¿Qué son los Puntos?', 'Son un beneficio que solo se cambia por productos. No son dinero. Empezarán cuando abra el programa.'],
        ['¿Qué veo de mis clientes?', 'Solo su nombre abreviado y su ciudad, nunca sus datos de contacto.'],
      ],
      accountTitle: 'Mi cuenta', language: 'Idioma', policiesDate: 'Versión de las políticas: {v}',
      changePw: 'Cambiar mi contraseña', curPw: 'Mi contraseña de ahora', pwChanged: 'Contraseña cambiada ✓',
      logout: 'Salir', notice: 'Productos de Ascent Labs: solo para uso en investigación (RUO). No son medicamentos ni suplementos.',
      loading: 'Cargando…', retry: 'Algo salió mal. Intenta de nuevo.',
      err: {
        wrong_credentials: 'El correo o la contraseña no son correctos.', too_many_attempts: 'Demasiados intentos. Espera unos minutos y vuelve a probar.',
        wrong_current: 'La contraseña de ahora no es correcta.', weak_password: 'La contraseña debe tener al menos 10 letras o números.',
        same_password: 'La nueva contraseña debe ser distinta de la de ahora.', not_configured: 'Este portal aún no está disponible.',
        bad_name: 'Escribe tu nombre.', bad_email: 'Escribe un correo válido, por ejemplo nombre@correo.com.', bad_country: 'Elige tu país.',
        bad_phone: 'El teléfono solo puede tener números.', terms_required: 'Para seguir, marca la casilla de aceptar.',
        bad_invite: 'No encontramos a quien te afilió con ese código. Revísalo, o déjalo en blanco si nadie te invitó.',
        email_taken: 'Ya hay una cuenta con ese correo. Entra, o usa “Olvidé mi contraseña”.',
        bad_token: 'Este enlace ya no sirve. Pide uno nuevo.', server_error: 'Algo salió mal. Intenta de nuevo en un momento.',
      },
    },
    en: {
      brand: 'Ascent · Affiliates',
      email: 'Email', password: 'Password', showpw: 'Show password', hint10: 'At least 10 letters or numbers.',
      loginTitle: 'Sign in', loginSub: 'Type your email and your password.', enter: 'Sign in',
      forgotLink: 'I forgot my password', createLink: 'Create my free account', haveAccount: 'Already have an account? Sign in',
      regTitle: 'Create your free account', invitedBy: '{name} invited you.', fullName: 'Your full name', phoneOpt: 'Your phone (optional)',
      country: 'Country', pickCountry: 'Choose your country', create: 'Create my account',
      sponsorLabel: 'Code of the person who signed you up (optional)', sponsorHint: 'If someone invited you, type their code. If Ascent signed you up directly, leave it blank.',
      sponsorOk: '✓ {name} is signing you up.', sponsorNo: 'We could not find that code. Check it, or leave it blank if nobody invited you.',
      CO: 'Colombia', MX: 'Mexico', US: 'United States',
      termsAccept: 'I have read and I accept', termsContinue: 'Continue',
      forgotTitle: 'Get your password back', forgotSub: 'Type your email and we will send you a link to choose a new one.', forgotSend: 'Send link',
      forgotDone: 'Done. If that email has an account, we sent a link. Check your inbox and also your spam folder.',
      resetTitle: 'Choose your new password', resetSave: 'Save password', resetDone: 'Your password was changed. You can sign in now.',
      changeTitle: 'Create your password', changeSub: 'Replace the temporary password with one of your own.', cur: 'Temporary password', new1: 'New password', new2: 'Type the new password again', changeSave: 'Save and sign in',
      mismatch: 'The two passwords are not the same. Type them again.',
      navHome: 'Home', navSales: 'My sales', navTeam: 'People I referred', navHelp: 'Help',
      hello: 'Hello, {name}', whatNow: 'What do I do now?',
      codeTitle: 'Your discount code', codeHelp: 'Anyone who types it at checkout gets {pct}% off, and that purchase counts as yours.',
      copy: 'Copy', copied: 'Copied ✓', copyFail: 'Could not copy. Press and hold the text to copy it.', shareWa: 'Share on WhatsApp',
      shareCode: 'Hi, I am sharing my Ascent Labs code {code}: with it you get {pct}% off your purchase. {url}',
      shareInvite: 'Hi, I am inviting you to become an Ascent Labs affiliate. Join with this link: {url}',
      todoShare: 'Share your code with people who want to buy.',
      used: 'People who used your code', bought: 'People who bought', invited: 'People I referred',
      pointsSoon: 'Your Points will start adding up when the Points programme opens. We will let you know by email.',
      pointsSoonTitle: 'Points',
      monthTitle: 'This month', monthSales: 'Sold so far: {amount}', monthComm: 'Your commission is {rate}% of your sales: {amount}',
      owed: 'What is due to you', paid: 'What we already paid you', approx: 'Approximate amount. The exact amount is fixed when you are paid.',
      salesTitle: 'My sales', salesSub: 'People who used your code.', salesEmpty: 'Nobody has used your code yet. Share it to get started.',
      bought2: 'Bought', pending: 'In progress', salesPrivacy: 'For privacy you only see a shortened name and the city.',
      ordersTitle: 'Orders with your code', ordersEmpty: 'There are no orders yet.', paidAmount: 'Paid {amount}',
      salesNow: 'When someone buys with your code, it will show up here.',
      teamTitle: 'People I referred', teamSub: 'People who joined with your link.', teamLink: 'Your invitation link',
      teamEmpty: 'Nobody has joined with your link yet.', since: 'Since {date}', hasSales: 'Has sold', noSales: 'Has not sold yet',
      teamNote: 'You only see the people you invited yourself.', teamNow: 'Send your link on WhatsApp to anyone you want to invite.',
      helpTitle: 'Help', helpWa: 'Write to us on WhatsApp', helpWaText: 'Hi, I need help with my affiliate account.',
      faqTitle: 'Common questions',
      faq: [
        ['How much does it cost to be an affiliate?', 'Nothing. Creating your account is free.'],
        ['How does my code work?', 'Your customers type it at checkout and get {pct}% off. The purchase is registered in your name.'],
        ['What are Points?', 'A benefit that can only be exchanged for products. They are not money. They start when the programme opens.'],
        ['What do I see of my customers?', 'Only a shortened name and their city, never their contact details.'],
      ],
      accountTitle: 'My account', language: 'Language', policiesDate: 'Policies version: {v}',
      changePw: 'Change my password', curPw: 'My current password', pwChanged: 'Password changed ✓',
      logout: 'Sign out', notice: 'Ascent Labs products: for research use only (RUO). They are not medicines or supplements.',
      loading: 'Loading…', retry: 'Something went wrong. Please try again.',
      err: {
        wrong_credentials: 'The email or the password is not correct.', too_many_attempts: 'Too many tries. Wait a few minutes and try again.',
        wrong_current: 'Your current password is not correct.', weak_password: 'The password needs at least 10 letters or numbers.',
        same_password: 'The new password must be different from the current one.', not_configured: 'This portal is not available yet.',
        bad_name: 'Type your name.', bad_email: 'Type a valid email, for example name@mail.com.', bad_country: 'Choose your country.',
        bad_phone: 'The phone can only have numbers.', terms_required: 'To continue, tick the box to accept.',
        bad_invite: 'We could not find the person who signed you up with that code. Check it, or leave it blank if nobody invited you.',
        email_taken: 'There is already an account with that email. Sign in, or use “I forgot my password”.',
        bad_token: 'This link no longer works. Ask for a new one.', server_error: 'Something went wrong. Please try again in a moment.',
      },
    },
  };

  let LANG = 'es';
  try { const s = localStorage.getItem('ascent_lang'); LANG = s === 'en' || s === 'es' ? s : (/^en/i.test(navigator.language) ? 'en' : 'es'); } catch (e) { /* private mode */ }
  const t = (k, v) => {
    let s = (T[LANG][k] != null ? T[LANG][k] : T.es[k]);
    if (typeof s !== 'string') return s;
    for (const [a, b] of Object.entries(v || {})) s = s.split(`{${a}}`).join(String(b));
    return s;
  };
  const errText = code => (T[LANG].err[code] || T[LANG].retry);

  /* ------------------------------------------------------------ small tools */

  async function api(a, { method = 'GET', body, query } = {}) {
    const qs = new URLSearchParams({ a, ...(query || {}) });
    const res = await fetch(`/api/affiliate?${qs}`, {
      method, credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch (e) { /* empty */ }
    return { ok: res.ok, status: res.status, data };
  }

  const money = {};
  const fm = (n, cur) => {
    const key = `${LANG}-${cur}`;
    const f = money[key] || (money[key] = new Intl.NumberFormat(LANG === 'en' ? 'en-US' : 'es-CO', { style: 'currency', currency: cur, minimumFractionDigits: cur === 'COP' ? 0 : 2, maximumFractionDigits: cur === 'COP' ? 0 : 2, currencyDisplay: 'code' }));
    return f.format(Number(n) || 0);
  };
  const day = s => new Date(s).toLocaleDateString(LANG === 'en' ? 'en-US' : 'es-CO', { dateStyle: 'medium' });
  const waLink = text => `https://wa.me/?text=${encodeURIComponent(text)}`;
  const waHelp = () => `https://wa.me/${WA}?text=${encodeURIComponent(t('helpWaText'))}`;

  let toastTimer;
  function toast(text) {
    document.querySelectorAll('.toast').forEach(n => n.remove());
    const el = h('div', { class: 'toast', role: 'status' }, text);
    document.body.append(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.remove(), 2600);
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast(t('copied')); }
    catch (e) { toast(t('copyFail')); }
  }

  /* ----------------------------------------------------------------- state */

  let ME = null;       // who is signed in (from "me"), or null
  let TAB = 'home';
  let SUM = null, TEAM = null, TERMS = null;
  let PW_TEMP = '';
  const params = new URLSearchParams(location.search);
  let REF = (params.get('ref') || '').trim().toUpperCase();
  let RESET = (params.get('reset') || '').trim();
  let screen = null;   // which signed-out screen: login | register | forgot

  function paintChrome() {
    document.documentElement.lang = LANG;
    document.getElementById('brand').textContent = t('brand');
    document.querySelectorAll('#lang button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === LANG)));
  }

  function setLang(l, persist) {
    LANG = l;
    try { localStorage.setItem('ascent_lang', l); } catch (e) { /* ignore */ }
    paintChrome();
    if (persist && ME && ME.authed) api('set_language', { method: 'POST', body: { language: l } });
    TERMS = null;
    (ME && ME.authed ? loadTerms() : Promise.resolve()).then(route);
  }
  document.querySelectorAll('#lang button').forEach(b => b.addEventListener('click', () => setLang(b.dataset.lang, true)));

  /* A password field with a "show password" box: people mistype on a phone and cannot see why. */
  function pwField(id, label, { autocomplete = 'current-password', hint } = {}) {
    const input = h('input', { id, type: 'password', autocomplete, required: true });
    const box = h('input', { type: 'checkbox', id: id + '-show', onchange: e => { input.type = e.target.checked ? 'text' : 'password'; } });
    return { input, node: h('div', {}, h('label', { for: id }, label), input, hint ? h('p', { class: 'hint' }, hint) : null,
      h('label', { class: 'showpw', for: id + '-show' }, box, t('showpw'))) };
  }

  const message = () => h('p', { class: 'msg err', role: 'alert', hidden: true });
  const fail = (el, code) => { el.className = 'msg err'; el.textContent = errText(code); el.hidden = false; el.scrollIntoView({ block: 'nearest' }); };

  async function loadTerms() {
    if (!TERMS || TERMS.language !== LANG) { const r = await api('terms', { query: { lang: LANG } }); TERMS = r.data; }
  }

  /* --------------------------------------------------------- signed-out screens */

  const shell = (...kids) => root.replaceChildren(h('main', { class: 'auth' }, h('div', { class: 'card stack' }, ...kids)));

  function loginScreen(note) {
    const email = h('input', { id: 'email', type: 'email', autocomplete: 'username', required: true, autocapitalize: 'none' });
    const pw = pwField('pw', t('password'));
    const msg = message();
    shell(
      h('h1', {}, t('loginTitle')), h('p', { class: 'muted' }, t('loginSub')),
      note ? h('p', { class: 'msg ok', role: 'status' }, note) : null,
      h('form', { class: 'stack', onsubmit: async e => {
        e.preventDefault(); msg.hidden = true;
        const r = await api('login', { method: 'POST', body: { email: email.value, password: pw.input.value } });
        if (!r.ok) return fail(msg, r.data.error);
        PW_TEMP = pw.input.value;
        boot();
      } },
      h('div', {}, h('label', { for: 'email' }, t('email')), email), pw.node, msg,
      h('button', { class: 'btn primary block', type: 'submit' }, t('enter'))),
      h('button', { class: 'btn link block', type: 'button', onclick: () => { screen = 'forgot'; route(); } }, t('forgotLink')),
      h('button', { class: 'btn block', type: 'button', onclick: () => { screen = 'register'; route(); } }, t('createLink')));
    email.focus();
  }

  async function registerScreen() {
    await loadTerms();
    let sponsor = '';
    if (REF) { const r = await api('invite', { query: { code: REF } }); if (r.data.ok) sponsor = r.data.sponsor; else REF = ''; }
    const f = {
      name: h('input', { id: 'name', type: 'text', autocomplete: 'name', required: true, maxlength: 80 }),
      email: h('input', { id: 'remail', type: 'email', autocomplete: 'email', required: true, autocapitalize: 'none' }),
      phone: h('input', { id: 'phone', type: 'tel', autocomplete: 'tel', maxlength: 25 }),
      country: h('select', { id: 'country', required: true },
        h('option', { value: '' }, t('pickCountry')), ...['CO', 'MX', 'US'].map(c => h('option', { value: c }, t(c)))),
      sponsor: h('input', { id: 'sponsor', type: 'text', autocomplete: 'off', autocapitalize: 'characters', maxlength: 40, value: REF }),
      accept: h('input', { type: 'checkbox', id: 'accept' }),
    };
    const sponsorMsg = h('p', { class: 'hint' });
    const showSponsor = text => { sponsorMsg.textContent = text; };
    if (sponsor) showSponsor(t('sponsorOk', { name: sponsor }));
    f.sponsor.addEventListener('change', async () => {          // checked when the person leaves the box, so a typo shows at once
      const v = f.sponsor.value.trim();
      if (!v) return showSponsor('');
      const r = await api('invite', { query: { code: v } });
      showSponsor(r.ok && r.data.ok ? t('sponsorOk', { name: r.data.sponsor }) : (r.status === 429 ? errText('too_many_attempts') : t('sponsorNo')));
    });
    const pw = pwField('rpw', t('password'), { autocomplete: 'new-password', hint: t('hint10') });
    const msg = message();
    shell(
      h('h1', {}, t('regTitle')),
      h('form', { class: 'stack', onsubmit: async e => {
        e.preventDefault(); msg.hidden = true;
        if (!f.accept.checked) return fail(msg, 'terms_required');
        const r = await api('register', { method: 'POST', body: {
          name: f.name.value, email: f.email.value, phone: f.phone.value, country: f.country.value, password: pw.input.value,
          language: LANG, accept: true, terms_version: TERMS.version, sponsor_code: f.sponsor.value.trim() } });
        if (!r.ok) return fail(msg, r.data.error);
        REF = ''; history.replaceState(null, '', '/afiliados');
        boot();
      } },
      h('div', {}, h('label', { for: 'name' }, t('fullName')), f.name),
      h('div', {}, h('label', { for: 'remail' }, t('email')), f.email),
      h('div', {}, h('label', { for: 'phone' }, t('phoneOpt')), f.phone),
      h('div', {}, h('label', { for: 'country' }, t('country')), f.country),
      pw.node,
      h('div', {}, h('label', { for: 'sponsor' }, t('sponsorLabel')), f.sponsor, h('p', { class: 'hint' }, t('sponsorHint')), sponsorMsg),
      h('h2', { style: 'margin-top:24px' }, TERMS.title),
      h('ol', { class: 'terms-list' }, TERMS.points.map(p => h('li', {}, p))),
      h('label', { class: 'check', for: 'accept' }, f.accept, t('termsAccept')),
      msg,
      h('button', { class: 'btn primary block', type: 'submit' }, t('create'))),
      h('button', { class: 'btn link block', type: 'button', onclick: () => { screen = 'login'; route(); } }, t('haveAccount')));
    f.name.focus();
  }

  function forgotScreen() {
    const email = h('input', { id: 'femail', type: 'email', autocomplete: 'email', required: true, autocapitalize: 'none' });
    const msg = message();
    shell(
      h('h1', {}, t('forgotTitle')), h('p', { class: 'muted' }, t('forgotSub')),
      h('form', { class: 'stack', onsubmit: async e => {
        e.preventDefault(); msg.hidden = true;
        const r = await api('forgot', { method: 'POST', body: { email: email.value } });
        if (!r.ok) return fail(msg, r.data.error);
        msg.className = 'msg ok'; msg.textContent = t('forgotDone'); msg.hidden = false;
      } },
      h('div', {}, h('label', { for: 'femail' }, t('email')), email), msg,
      h('button', { class: 'btn primary block', type: 'submit' }, t('forgotSend'))),
      h('button', { class: 'btn link block', type: 'button', onclick: () => { screen = 'login'; route(); } }, t('haveAccount')));
    email.focus();
  }

  function resetScreen() {
    const a = pwField('np1', t('new1'), { autocomplete: 'new-password', hint: t('hint10') });
    const b = pwField('np2', t('new2'), { autocomplete: 'new-password' });
    const msg = message();
    shell(
      h('h1', {}, t('resetTitle')),
      h('form', { class: 'stack', onsubmit: async e => {
        e.preventDefault(); msg.hidden = true;
        if (a.input.value !== b.input.value) { msg.textContent = t('mismatch'); msg.hidden = false; return; }
        const r = await api('reset', { method: 'POST', body: { token: RESET, password: a.input.value } });
        if (!r.ok) return fail(msg, r.data.error);
        RESET = ''; history.replaceState(null, '', '/afiliados'); screen = 'login'; loginScreen(t('resetDone'));
      } },
      a.node, b.node, msg, h('button', { class: 'btn primary block', type: 'submit' }, t('resetSave'))));
    a.input.focus();
  }

  function changeScreen() {
    const cur = pwField('cur', t('cur'));
    const a = pwField('n1', t('new1'), { autocomplete: 'new-password', hint: t('hint10') });
    const b = pwField('n2', t('new2'), { autocomplete: 'new-password' });
    cur.input.value = PW_TEMP;
    const msg = message();
    shell(
      h('h1', {}, t('changeTitle')), h('p', { class: 'muted' }, t('changeSub')),
      h('form', { class: 'stack', onsubmit: async e => {
        e.preventDefault(); msg.hidden = true;
        if (a.input.value !== b.input.value) { msg.textContent = t('mismatch'); msg.hidden = false; return; }
        const r = await api('change_password', { method: 'POST', body: { current: cur.input.value, next: a.input.value } });
        if (!r.ok) return fail(msg, r.data.error);
        PW_TEMP = ''; boot();
      } },
      cur.node, a.node, b.node, msg, h('button', { class: 'btn primary block', type: 'submit' }, t('changeSave'))));
    a.input.focus();
  }

  /* Someone who already has an account but has not accepted the current policies yet. */
  async function termsScreen() {
    await loadTerms();
    const box = h('input', { type: 'checkbox', id: 'tacc' });
    const msg = message();
    shell(
      h('h1', {}, TERMS.title),
      h('ol', { class: 'terms-list' }, TERMS.points.map(p => h('li', {}, p))),
      h('label', { class: 'check', for: 'tacc' }, box, t('termsAccept')), msg,
      h('button', { class: 'btn primary block', type: 'button', onclick: async () => {
        if (!box.checked) return fail(msg, 'terms_required');
        const r = await api('accept_terms', { method: 'POST', body: { version: TERMS.version } });
        if (!r.ok) return fail(msg, r.data.error);
        boot();
      } }, t('termsContinue')));
  }

  /* ------------------------------------------------------------- the app */

  const now = text => h('div', { class: 'now' }, h('b', {}, t('whatNow')), text);
  const stat = (k, v) => h('div', { class: 'stat' }, h('div', { class: 'v' }, v), h('div', { class: 'k' }, k));
  const share = text => h('a', { class: 'btn wa block', href: waLink(text), target: '_blank', rel: 'noopener' }, t('shareWa'));
  const siteUrl = () => `${location.origin}/`;

  function homeView() {
    const s = SUM, cur = s.currency;
    const pct = s.profile.discount_pct;
    const nodes = [
      h('h2', {}, t('hello', { name: (ME.name || '').split(' ')[0] })),
      h('div', { class: 'card stack', style: 'margin-top:14px' },
        h('h3', {}, t('codeTitle')),
        h('div', { class: 'codebox' }, s.profile.code),
        h('p', { class: 'muted small' }, t('codeHelp', { pct })),
        h('div', { class: 'actions two' },
          h('button', { class: 'btn block', type: 'button', onclick: () => copy(s.profile.code) }, t('copy')),
          share(t('shareCode', { code: s.profile.code, pct, url: siteUrl() })))),
      h('div', { class: 'stats' },
        stat(t('used'), s.people_used), stat(t('bought'), s.people_bought), stat(t('invited'), TEAM.people.length)),
    ];

    if (s.mode === 'fixed' && s.month) {
      nodes.push(h('div', { class: 'card stack' },
        h('h3', {}, t('monthTitle')),
        h('p', {}, t('monthSales', { amount: fm(s.month.sales_local, cur) })),
        h('p', {}, t('monthComm', { rate: s.month.rate_pct, amount: fm(s.month.commission_local, cur) })),
        h('div', { class: 'stats' }, stat(t('owed'), fm(s.owed_local, cur)), stat(t('paid'), fm(s.paid_local, cur))),
        cur !== 'COP' ? h('p', { class: 'hint' }, t('approx')) : null));
    } else if (s.mode === 'tiers' && s.month) {
      const m = s.month, nxt = m.level.next;
      const frac = nxt ? Math.min(1, m.sales_cop / nxt.min_cop) : 1;
      nodes.push(h('div', { class: 'card stack' },
        h('h3', {}, t('monthTitle')),
        h('p', {}, t('monthSales', { amount: fm(m.sales_local, cur) })),
        h('p', {}, t('monthComm', { rate: m.rate_pct, amount: fm(m.commission_local, cur) })),
        h('div', { class: 'bar', role: 'img', 'aria-label': `${Math.round(frac * 100)} %` }, h('span', { style: `width:${(frac * 100).toFixed(1)}%` }))));
    } else {
      nodes.push(h('div', { class: 'card stack' }, h('h3', {}, t('pointsSoonTitle')), h('p', {}, t('pointsSoon'))));
    }
    nodes.push(now(t('todoShare')));
    return nodes;
  }

  function salesView() {
    const s = SUM, cur = s.currency;
    const people = s.people.map(p => h('li', { class: 'item' },
      h('div', { class: 'top-row' }, h('strong', {}, p.name), h('span', { class: `badge ${p.status === 'bought' ? 'ok' : 'warn'}` }, p.status === 'bought' ? t('bought2') : t('pending'))),
      h('div', { class: 'muted' }, [p.city, day(p.first_use)].filter(Boolean).join(' · ')),
      p.total_cop ? h('div', {}, t('paidAmount', { amount: fm(p.total_local, cur) })) : null));
    const orders = s.orders.map(o => h('li', { class: 'item' },
      h('div', { class: 'top-row' }, h('strong', {}, o.who), h('span', { class: `badge ${o.status === 'APPROVED' ? 'ok' : 'warn'}` }, o.status === 'APPROVED' ? t('bought2') : t('pending'))),
      h('div', { class: 'muted' }, `${day(o.created_at)} · ${o.items.map(i => `${i.qty} × ${i.name} ${i.size}`).join(', ')}`),
      h('div', {}, t('paidAmount', { amount: fm(o.charge_local, cur) }))));
    return [
      h('h2', {}, t('salesTitle')), h('p', { class: 'muted' }, t('salesSub')),
      people.length ? h('ul', { class: 'list' }, people) : h('div', { class: 'card' }, t('salesEmpty')),
      h('p', { class: 'hint' }, t('salesPrivacy')),
      h('h2', { style: 'margin-top:26px' }, t('ordersTitle')),
      orders.length ? h('ul', { class: 'list' }, orders) : h('div', { class: 'card' }, t('ordersEmpty')),
      now(t('salesNow')),
    ];
  }

  function teamView() {
    const people = TEAM.people.map(p => h('li', { class: 'item' },
      h('div', { class: 'top-row' }, h('strong', {}, p.name), h('span', { class: `badge ${p.has_sales ? 'ok' : 'off'}` }, p.has_sales ? t('hasSales') : t('noSales'))),
      h('div', { class: 'muted' }, [T[LANG][p.country] || '', t('since', { date: day(p.since) })].filter(Boolean).join(' · '))));
    return [
      h('h2', {}, t('teamTitle')), h('p', { class: 'muted' }, t('teamSub')),
      h('div', { class: 'card stack' },
        h('h3', {}, t('teamLink')),
        h('div', { class: 'linkbox' }, ME.invite_url),
        h('div', { class: 'actions two' },
          h('button', { class: 'btn block', type: 'button', onclick: () => copy(ME.invite_url) }, t('copy')),
          share(t('shareInvite', { url: ME.invite_url })))),
      h('div', { style: 'height:8px' }),
      people.length ? h('ul', { class: 'list' }, people) : h('div', { class: 'card' }, t('teamEmpty')),
      h('p', { class: 'hint' }, t('teamNote')),
      now(t('teamNow')),
    ];
  }

  function helpView() {
    const pct = SUM.profile.discount_pct;
    const cur = pwField('hcur', t('curPw'));
    const nw = pwField('hnew', t('new1'), { autocomplete: 'new-password', hint: t('hint10') });
    const msg = message();
    return [
      h('h2', {}, t('helpTitle')),
      h('div', { class: 'card stack', style: 'margin-top:14px' },
        h('a', { class: 'btn wa block', href: waHelp(), target: '_blank', rel: 'noopener' }, t('helpWa'))),
      h('div', { class: 'card faq' }, h('h3', {}, t('faqTitle')),
        T[LANG].faq.map(([q, a]) => h('details', {}, h('summary', {}, q), h('p', {}, a.split('{pct}').join(pct))))),
      h('div', { class: 'card stack' }, h('h3', {}, t('accountTitle')),
        h('p', { class: 'muted' }, ME.name || ''),
        h('div', {}, h('div', { class: 'small muted' }, t('language')),
          h('div', { class: 'lang dark', role: 'group' }, ['es', 'en'].map(l => h('button', { type: 'button', 'aria-pressed': String(LANG === l), onclick: () => setLang(l, true) }, l.toUpperCase())))),
        h('details', {}, h('summary', { class: 'btn block', style: 'cursor:pointer' }, t('changePw')),
          h('form', { class: 'stack', onsubmit: async e => {
            e.preventDefault(); msg.hidden = true;
            const r = await api('change_password', { method: 'POST', body: { current: cur.input.value, next: nw.input.value } });
            if (!r.ok) return fail(msg, r.data.error);
            msg.className = 'msg ok'; msg.textContent = t('pwChanged'); msg.hidden = false;
            cur.input.value = nw.input.value = '';
          } }, cur.node, nw.node, msg, h('button', { class: 'btn primary block', type: 'submit' }, t('changePw')))),
        h('button', { class: 'btn block', type: 'button', onclick: async () => { await api('logout', { method: 'POST', body: {} }); ME = null; SUM = TEAM = null; screen = 'login'; route(); } }, t('logout'))),
      h('p', { class: 'hint' }, t('policiesDate', { v: TERMS ? TERMS.version : '' })),
    ];
  }

  function appScreen() {
    const views = { home: homeView, sales: salesView, team: teamView, help: helpView };
    const nav = h('nav', { class: 'nav', 'aria-label': 'Menu' },
      [['home', 'navHome'], ['sales', 'navSales'], ['team', 'navTeam'], ['help', 'navHelp']].map(([id, key]) =>
        h('button', { type: 'button', 'aria-current': TAB === id ? 'page' : null, onclick: () => { TAB = id; window.scrollTo(0, 0); appScreen(); } }, t(key))));
    root.replaceChildren(
      h('main', { class: 'wrap', tabindex: '-1' }, ...views[TAB](), h('p', { class: 'notice' }, t('notice'))),
      nav);
  }

  /* ----------------------------------------------------------------- routing */

  function route() {
    if (ME && ME.authed) return SUM && TEAM ? appScreen() : boot();
    if (RESET) return resetScreen();
    if (screen === 'forgot') return forgotScreen();
    if (screen === 'register' || (!screen && REF)) { screen = 'register'; return registerScreen(); }
    return loginScreen();
  }

  let langAdopted = false;
  async function boot() {
    root.replaceChildren(h('main', { class: 'auth' }, h('p', { class: 'muted' }, t('loading'))));
    const me = await api('me');
    if (me.status === 503) { screen = 'login'; loginScreen(); const m = message(); fail(m, 'not_configured'); root.querySelector('.card').append(m); return; }
    if (!me.data.authed) { ME = null; SUM = TEAM = null; return route(); }
    ME = me.data;
    if (!langAdopted) { langAdopted = true; if (ME.language && ME.language !== LANG) { LANG = ME.language; try { localStorage.setItem('ascent_lang', LANG); } catch (e) { /* ignore */ } paintChrome(); } }
    if (ME.must_change) return changeScreen();
    if (ME.terms_needed) return termsScreen();
    const [s, tm] = await Promise.all([api('summary'), api('team')]);
    if (!s.ok || !tm.ok) { ME = null; return route(); }
    SUM = s.data; TEAM = tm.data;
    await loadTerms();
    appScreen();
  }

  paintChrome();
  boot();
})();
