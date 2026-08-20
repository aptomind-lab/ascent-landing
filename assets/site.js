/* ==========================================================================
   Ascent Compounds — site behavior
   - scroll-scrubbed hero sequence (frames pre-rendered, no WebGL)
   - catalog filter + order drawer (localStorage)
   - reveal-on-scroll, all motion gated on prefers-reduced-motion
   ========================================================================== */
(function () {
  'use strict';

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const money = n => '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const esc = s => String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const catName = id => (CATS_L.find(c => c[0] === id) || [, id])[1];

  /* ---------------- language ----------------
     Datasets: CATS/PRODUCTS/... are English, *_ES are Spanish. UI chrome comes
     from I18N. Choice persists; first visit follows the browser. */
  const LANGS = ['en', 'es'];
  let LANG = (() => {
    try { const v = localStorage.getItem('ascent.lang'); if (LANGS.includes(v)) return v; } catch (e) {}
    return (navigator.language || 'en').toLowerCase().startsWith('es') ? 'es' : 'en';
  })();
  const t = (k, vars) => {
    const s = (I18N[LANG] && I18N[LANG][k]) || I18N.en[k] || k;
    return vars ? s.replace(/\{\{(\w+)\}\}/g, (m, v) => (v in vars ? vars[v] : m)) : s;
  };

  // active dataset for the current language
  let CATS_L, PRODUCTS_L, FEATURED_L, REVIEWS_L, FAQS_L;
  function bindData() {
    const es = LANG === 'es';
    CATS_L     = es ? CATS_ES     : CATS;
    PRODUCTS_L = es ? PRODUCTS_ES : PRODUCTS;
    FEATURED_L = es ? FEATURED_ES : FEATURED;
    REVIEWS_L  = es ? REVIEWS_ES  : REVIEWS;
    FAQS_L     = es ? FAQS_ES     : FAQS;
  }
  bindData();

  /* Two WhatsApp lines, picked by language: the US number for English, the
     Colombia/Mexico number for Spanish. Every wa.me href on the page is
     rewritten from here, so the number lives in exactly one place. */
  const WA = { en: '12138292807', es: '573164114411' };
  const waNum = () => WA[LANG] || WA.en;

  /* One canonical research-use line, reused at every commercial surface.
     Compliance guidance is explicit that this has to be conspicuous at the
     point of purchase rather than only in the footer, and that the wording
     must not vary between surfaces. */
  const RUO = () => t('ruo');

  /* ---------------- USD -> COP ----------------
     Wompi settles only in Colombian pesos and has no conversion of its own, so
     COP is what actually gets charged. USD stays the price of record because
     that is how the catalogue is priced and how buyers in all three markets
     compare. Both are always shown; which one leads follows the language.

     Rate is the official TRM, certified daily by the Superintendencia
     Financiera, fetched from Colombia's open-data portal (public, no key,
     CORS-open). It moved 2.3% in one day during development, which is why
     there is a buffer and why the quote must be fixed server-side at order
     creation once a backend exists — a browser-read rate is fine for display,
     not for billing. */
  const FX = {
    buffer: 0.02,            // headroom against intraday movement
    fallbackRate: 3132.42,   // TRM 2026-07-31, used only if the API is unreachable
    key: 'ascent.trm',
    url: 'https://www.datos.gov.co/resource/32sa-8pi3.json?$order=vigenciadesde%20DESC&$limit=1',
  };
  let trm = FX.fallbackRate;

  /* currencyDisplay:'code' rather than the symbol. Colombia writes pesos with a
     '$' too, and "$ 620.100" sitting next to "$194.08 USD" reads as ambiguous
     at best and as $620.10 to a US buyer at worst. "COP 620.100" cannot be
     misread, which matters more here than elegance. */
  const copFmt = new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0,
    currencyDisplay: 'code',
  });
  // COP amounts are large; nobody quotes them to the peso
  const toCop = usd => Math.round(usd * trm * (1 + FX.buffer) / 100) * 100;
  const cop = usd => copFmt.format(toCop(usd));

  /* Both currencies, always. `lead` decides emphasis: Spanish leads with the
     charged currency, English leads with the listed one. */
  function priceHTML(usd, cls) {
    const usdPart = `<span class="fx-usd">${money(usd)}<small> USD</small></span>`;
    const copPart = `<span class="fx-cop">${cop(usd)}</span>`;
    return `<span class="fx ${cls || ''}">${LANG === 'es' ? copPart + usdPart : usdPart + copPart}</span>`;
  }
  const priceText = usd => LANG === 'es'
    ? `${cop(usd)} (${money(usd)} USD)`
    : `${money(usd)} USD (${cop(usd)})`;

  async function loadTRM() {
    const today = new Date().toISOString().slice(0, 10);
    try {
      const c = JSON.parse(localStorage.getItem(FX.key) || 'null');
      if (c && c.day === today && c.rate > 0) { trm = c.rate; return; }
    } catch (e) {}
    try {
      const r = await fetch(FX.url, { cache: 'no-store' });
      const rate = parseFloat((await r.json())[0].valor);
      if (rate > 0) {
        trm = rate;
        try { localStorage.setItem(FX.key, JSON.stringify({ day: today, rate })); } catch (e) {}
      }
    } catch (e) {
      // keep the baked-in rate; prices still render, just slightly stale
      console.warn('TRM unavailable, using fallback rate', FX.fallbackRate);
    }
  }

  /* The catalog opens on a short curated set instead of all 63 rows. An
     unrequested wall of product was the single biggest reason the page ran
     long. Edit TOP_PICKS to change what the default view shows — names must
     match `n` in data.js exactly. */
  /* 'Wolverine stack' (BPC-157 + TB-500) is not sold as its own product here.
     KLOWUP is the nearest thing in the catalog — a four-way blend that contains
     both of those plus GHK-Cu and KPV — and stands in for it by decision. */
  const TOP_PICKS = ['GHK-Cu', 'Retatrutide', 'MOTS-c', 'KLOWUP', 'Tesamorelin'];
  const PREVIEW_N = 5;
  let showAll = false;

  /* Swap every static string in the markup. Dynamic sections (catalog, cart,
     reviews, FAQ, sheet) re-render from the *_L datasets instead. */
  function applyI18n() {
    document.documentElement.lang = LANG;
    // each page names its own meta keys via <body data-page>, so translating
    // the chrome does not overwrite a sub-page's title with the home one
    /* Only overwrite when the key actually resolves. Pages that carry their own
       static title — the generated research-area pages, one per language, each
       with its own URL — would otherwise have it replaced by the raw key the
       moment this ran. t() returns the key itself when it is missing, so that
       is the signal to leave the markup alone. */
    const page = document.body.dataset.page;
    const put = (key, fallbackKey, apply) => {
      const k = page ? key : fallbackKey;
      const v = t(k);
      if (v !== k) apply(v);
    };
    put(`meta.${page}Title`, 'meta.title', v => { document.title = v; });
    const md = $('meta[name="description"]');
    if (md) put(`meta.${page}Desc`, 'meta.desc', v => md.setAttribute('content', v));

    $$('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    $$('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
    $$('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });

    /* Every WhatsApp link, not just the ones carrying a prefilled message:
       the number itself changes with the language, so bare links (nav Support,
       footer) have to be rewritten too. */
    $$('a[href*="wa.me/"]').forEach(a => {
      const key = a.dataset.wa;
      if (key) {
        a.href = 'https://wa.me/' + waNum() + '?text=' + encodeURIComponent(t(key));
      } else {
        // links that build their own message (the compound sheet's "Ask about
        // X") keep it — only the number is swapped
        const q = a.href.split('?')[1];
        a.href = 'https://wa.me/' + waNum() + (q ? '?' + q : '');
      }
    });
    const waFloat = $('.wa');
    if (waFloat) waFloat.setAttribute('aria-label', t('wa.aria'));

    // the burger's label tracks its own state, so read that rather than a fixed key
    const bg = $('#burger');
    if (bg) bg.setAttribute('aria-label',
      bg.getAttribute('aria-expanded') === 'true' ? t('nav.menuClose') : t('nav.menuOpen'));

    $$('.lang [data-lang]').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.lang === LANG));
    });
  }

  function setLang(next) {
    if (!LANGS.includes(next) || next === LANG) return;
    LANG = next;
    try { localStorage.setItem('ascent.lang', LANG); } catch (e) {}
    bindData();
    applyI18n();
    renderFilters();
    renderProducts();
    renderReviews();
    renderFaq();
    renderCart();
    renderSheetData();
    // an open compound sheet would otherwise keep showing the previous
    // language until the reader closed and reopened it
    if (openSheetName) fillSheet(openSheetName);
    renderQuality();
    renderFloorFigure();
    // the explorer holds live state (selected areas, answers, current step), so
    // it re-renders in place rather than resetting the reader back to step 1
    exRenderAreas();
    exShow(exStep);
    // the re-rendered sections are brand-new nodes, so they carry .rise with no
    // observer attached — without this they sit at opacity 0 forever
    observe();
  }

  $$('.lang [data-lang]').forEach(b => {
    b.addEventListener('click', () => setLang(b.dataset.lang));
  });

  /* ---------------- hero sequence ----------------
     100 frames: rotation ~1-60, the fall ~62-88, settle by 100. The static tail
     the footage originally had was trimmed; scrolling through a motionless vial
     just reads as the page being stuck. */
  const FRAMES = 100;
  const seq = $('#hero-seq');
  const hero = $('#hero');
  const cue = $('#cue');
  const beats = $$('.hero-beat');

  function heroInit() {
    if (!seq || !hero) return;

    if (reduced) {
      beats[0] && (beats[0].style.opacity = 1);
      return;
    }

    // decode every frame up front; 142 x ~21KB is cheap and prevents scrub stutter
    const imgs = [];
    for (let i = 1; i <= FRAMES; i++) {
      const im = new Image();
      im.src = 'assets/frames/f' + String(i).padStart(3, '0') + '.webp';
      imgs.push(im);
    }

    let cur = -1, raf = null;
    const pin = document.getElementById('hero-pin');

    /* The sequence finishes at SEQ_END of the scroll, not at the very end. The
       remaining scroll is the handoff: the hero lifts and fades while the next
       section arrives, so the page is visibly moving *during* the fall rather
       than waiting politely for the animation to finish. */
    /* The sequence runs across the whole pinned range, and the page lifts
       continuously from the very first pixel of scroll — so it reads as the
       page moving throughout the animation rather than unlocking at the end. */
    const SEQ_END = 0.92;
    const LIFT_VH = 24;
    /* The sharp 4K still covers the soft 720p sequence while the page is at
       rest. It cross-fades out over the first slice of scroll, by which point
       the vial is already moving and the swap is invisible. */
    const still = document.getElementById('hero-still');
    const STILL_OUT = 0.05;

    /* The crop follows the vial. Measured from the frames themselves, its
       horizontal centre sits at 50% standing and drifts to 52.5% once it has
       fallen. The portrait window is only ~3% wider than the fallen vial, so a
       single fixed crop cannot serve both: centring the standing shot clipped
       the cap, and centring the fallen one pushed the standing shot off centre.
       So ease the window between the two rest states across the fall. Written
       as a pixel offset because an object-position percentage distributes the
       overflow, not the source point, and would need different values per
       viewport to land the same place. */
    const SRC_W = 1920, SRC_H = 1080;
    /* Two stages, because the vial itself overshoots: it swings out to 75% of
       the frame as it lands, then rocks back to settle at 52.5%. A single ramp
       to the settled position lagged the landing and clipped the cap on f75-f80,
       so the window follows the overshoot and settles with it. */
    const C_STAND = 0.50, C_PEAK = 0.530, C_FALLEN = 0.525;
    const PAN_FROM = 0.63, PAN_PEAK = 0.75, PAN_SETTLE = 0.92;
    let frameW = 0, frameH = 0, renderedW = 0;
    function measureFrame() {
      const b = seq.getBoundingClientRect();
      frameW = b.width; frameH = b.height;
      renderedW = SRC_W * Math.max(frameW / SRC_W, frameH / SRC_H);
    }
    measureFrame();
    addEventListener('resize', measureFrame);

    function draw() {
      raf = null;
      const scrollable = hero.offsetHeight - innerHeight;
      if (scrollable <= 0) return;
      const p = Math.min(1, Math.max(0, -hero.getBoundingClientRect().top / scrollable));

      // sequence progress, remapped so the animation completes by SEQ_END
      const sp = Math.min(1, p / SEQ_END);

      const idx = Math.min(FRAMES - 1, Math.max(0, Math.round(sp * (FRAMES - 1))));
      if (idx !== cur) {
        cur = idx;
        const im = imgs[idx];
        if (im && im.complete) seq.src = im.src;
      }

      /* Continuous lift from the first pixel of scroll. The hero stays fully
         opaque: the next section is pulled up by the same LIFT_VH in CSS to sit
         flush beneath it, so any transparency would let it ghost through. */
      if (pin) {
        pin.style.transform = `translate3d(0,${(-LIFT_VH * p).toFixed(2)}vh,0)`;
      }

      if (renderedW) {
        const ss = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
        const c = sp < PAN_PEAK
          ? C_STAND + (C_PEAK - C_STAND) * ss((sp - PAN_FROM) / (PAN_PEAK - PAN_FROM))
          : C_PEAK + (C_FALLEN - C_PEAK) * ss((sp - PAN_PEAK) / (PAN_SETTLE - PAN_PEAK));
        seq.style.objectPosition = (frameW / 2 - c * renderedW).toFixed(1) + 'px 50%';
      }

      if (still) {
        const o = 1 - Math.min(1, p / STILL_OUT);
        still.style.opacity = o.toFixed(3);
        // drop it out of the paint path once fully faded
        still.style.visibility = o <= 0.01 ? 'hidden' : 'visible';
      }

      beats.forEach(b => {
        const a = +b.dataset.in, z = +b.dataset.out;
        const fade = Math.min(0.09, (z - a) * 0.32);
        let o = 0;
        if (sp >= a && sp <= z) {
          // a beat anchored at 0 is the resting state: visible before any scroll
          o = Math.min(a === 0 ? 1 : (sp - a) / fade, 1, (z - sp) / fade);
        }
        b.style.opacity = Math.max(0, o).toFixed(3);
      });

      if (cue) cue.style.opacity = p > 0.04 ? 0 : 1;
    }

    const onScroll = () => { if (!raf) raf = requestAnimationFrame(draw); };
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    draw();
  }

  /* ---------------- nav ---------------- */
  const nav = $('#nav');
  addEventListener('scroll', () => {
    nav && nav.classList.toggle('is-stuck', scrollY > 24);
  }, { passive: true });

  /* ---------------- mobile menu ---------------- */
  const burger = $('#burger');
  const menu = $('#mobile-menu');

  function setMenu(open) {
    if (!burger || !menu) return;
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? t('nav.menuClose') : t('nav.menuOpen'));
    menu.classList.toggle('open', open);
    menu.setAttribute('aria-hidden', String(!open));
    document.body.classList.toggle('menu-open', open);
  }

  if (burger && menu) {
    burger.addEventListener('click', () =>
      setMenu(burger.getAttribute('aria-expanded') !== 'true'));

    // close on link tap so the anchor scroll is visible
    menu.addEventListener('click', e => {
      if (e.target.closest('a')) setMenu(false);
    });

    addEventListener('keydown', e => {
      if (e.key === 'Escape' && burger.getAttribute('aria-expanded') === 'true') {
        setMenu(false);
        burger.focus();
      }
    });

    // a resize into desktop layout should never leave the overlay stuck open
    addEventListener('resize', () => {
      if (innerWidth > 720) setMenu(false);
    });
  }

  /* ---------------- featured strip ----------------
     Editorial hierarchy at the top of the catalog. Replaces the old parallel
     "Compounds" section, which duplicated all six of these in the catalog. */
  /* FEATURED is no longer rendered as a strip — it is the technical-sheet
     dataset. Every compound's sequence, mass, formula and CAS comes from here,
     via sheetFor(), so it must stay even though nothing displays it directly. */
  const FEAT = () => (FEATURED_L || []);
  const sheetFor = name => FEAT().find(f => f.n === name);



  /* ---------------- compound detail sheet ---------------- */
  let lastFocus = null;

  /** Full sheet markup for one compound. Used both for the crawlable
   *  #sheet-data block at load and for the panel on open. */
  function sheetHTML(name) {
    const f = sheetFor(name);
    const sizes = PRODUCTS_L.filter(p => p.n === name);
    const any = sizes[0];
    if (!f && !any) return '';
    return `
      <p class="lead" style="font-size:16.5px">${esc(f ? f.desc : (any.d || ''))}</p>

      ${f ? `
        <div class="spec-grid">
          ${f.chem.map(([k, v]) => `
            <div class="spec"><div class="k">${esc(k)}</div><div class="v tabular">${esc(v)}</div></div>`).join('')}
        </div>
        <div>
          <div class="eyebrow" style="color:var(--muted);margin-bottom:10px">${t('sheet.areas')}</div>
          <div class="rv-tags">${f.areas.map(a => `<span class="rv-tag">${esc(a)}</span>`).join('')}</div>
        </div>` : `
        <div class="no-data">
          ${t('sheet.nodata')}
        </div>`}

      <div>
        <div class="eyebrow" style="color:var(--muted);margin-bottom:10px">${t('sheet.sizes')}</div>
        <div class="sizes">
          ${sizes.map(p => `
            <button class="btn-add" data-add="${esc(p.n)}" data-size="${esc(p.s)}" data-price="${p.p}">
              ${esc(p.s)} · ${priceHTML(p.p, 'fx--inline')}
            </button>`).join('') || `<p class="small">${t('sheet.contact')}</p>`}
        </div>
      </div>

      <a class="btn btn--ghost" style="width:100%" target="_blank" rel="noopener"
         href="https://wa.me/${waNum()}?text=${encodeURIComponent(t('wa.about') + ' ' + name)}">
        ${t('sheet.ask')} ${esc(name)}
      </a>
      <p class="small p-ruo">${RUO()}</p>`;
  }

  /** Render every sheet into the crawlable block once, at load. */
  function renderSheetData() {
    const host = $('#sheet-data');
    if (!host) return;
    const names = [...new Set(PRODUCTS_L.map(p => p.n))];
    host.innerHTML = names.map(n => {
      const f = sheetFor(n);
      return `<section><h3>${esc(n)}${f ? ' — ' + esc(f.cat) : ''}</h3>${sheetHTML(n)}</section>`;
    }).join('');
  }

  let openSheetName = null;

  /* Fills the panel from the current language's data. Split out of openSheet so
     a language switch can refresh an already-open sheet without re-running the
     open animation or stealing focus. */
  function fillSheet(name) {
    const f = sheetFor(name);
    const any = PRODUCTS_L.find(p => p.n === name);
    if (!f && !any) return false;
    $('#sheet-cat').textContent = f ? f.cat : catName(any.c);
    $('#sheet-name').textContent = name;
    $('#sheet-body').innerHTML = sheetHTML(name);
    return true;
  }

  function openSheet(name) {
    if (!fillSheet(name)) return;
    openSheetName = name;

    lastFocus = document.activeElement;
    $('#sheet').classList.add('open');
    $('#sheet').setAttribute('aria-hidden', 'false');
    $('#sheet-scrim').classList.add('open');
    $('#sheet-close').focus();
  }

  function closeSheet() {
    openSheetName = null;
    $('#sheet').classList.remove('open');
    $('#sheet').setAttribute('aria-hidden', 'true');
    $('#sheet-scrim').classList.remove('open');
    lastFocus && lastFocus.focus();
  }

  /* ---------------- catalog ---------------- */
  let active = 'todo';

  function renderFilters() {
    const host = $('#filters');
    if (!host) return;
    host.innerHTML = CATS_L.map(([id, label]) =>
      `<button class="chip" role="tab" data-cat="${id}" aria-selected="${id === active}">${esc(label)}</button>`
    ).join('');
    $$('.chip', host).forEach(c => c.addEventListener('click', () => {
      active = c.dataset.cat;
      showAll = false;   // a new filter is a fresh, short view
      $$('.chip', host).forEach(x => x.setAttribute('aria-selected', String(x === c)));
      renderProducts();
    }));
  }

  function renderProducts() {
    const host = $('#products');
    if (!host) return;
    const full = PRODUCTS_L.filter(p =>
      active === 'todo' || p.c === active || (p.t && p.t.includes(active)));

    let list = full;
    if (!showAll && full.length > PREVIEW_N) {
      if (active === 'todo') {
        // curated order; a pick that no longer exists in the data is skipped
        // rather than leaving a hole, and the row is topped back up
        list = TOP_PICKS.map(n => full.find(p => p.n === n)).filter(Boolean);
        for (const p of full) {
          if (list.length >= PREVIEW_N) break;
          if (!list.includes(p)) list.push(p);
        }
        list = list.slice(0, PREVIEW_N);
      } else {
        list = full.slice(0, PREVIEW_N);
      }
    }

    const collapsed = list.length < full.length;
    $('#count').textContent = collapsed
      ? t(active === 'todo' ? 'cat.popularCount' : 'cat.showingCount',
          { n: list.length, total: full.length })
      : `${full.length} ${full.length === 1 ? t('ui.compound') : t('ui.compounds')}` +
        (active === 'todo' ? '' : ` ${t('ui.in')} ${catName(active)}`);

    const more = $('#show-all');
    if (more) {
      more.hidden = full.length <= PREVIEW_N;
      more.textContent = collapsed
        ? t('cat.showAll', { n: full.length })
        : t('cat.showLess');
      more.setAttribute('aria-expanded', String(!collapsed));
    }

    host.innerHTML = list.map(p => `
      <article class="p">
        <div class="p-top">
          <div>
            <div class="p-name">${esc(p.n)}</div>
            <div class="p-size">${esc(p.s)}</div>
          </div>
          <span class="p-cat">${esc(catName(p.c))}</span>
        </div>
        <p class="p-desc">${esc(p.d || '')}</p>
        <button class="p-more" data-sheet="${esc(p.n)}">
          ${sheetFor(p.n) ? t('sheet.tech') : t('sheet.details')}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <p class="p-ruo">${RUO()}</p>
        <div class="p-foot">
          <div class="p-price tabular">${priceHTML(p.p)}</div>
          <button class="btn-add" data-add="${esc(p.n)}" data-size="${esc(p.s)}" data-price="${p.p}">
            ${t('ui.add')}
          </button>
        </div>
      </article>`).join('');
    observe();
  }

  /* ---------------- reviews ---------------- */
  function renderReviews() {
    const host = $('#rv-grid');
    if (!host || !REVIEWS_L) return;
    host.innerHTML = REVIEWS_L.map(r => `
      <article class="rv rise">
        <div class="rv-top">
          <div class="rv-av" aria-hidden="true">${esc(r.who.trim()[0])}</div>
          <div>
            <div style="font-weight:600;font-size:15px">${esc(r.who)}</div>
            <div class="small" style="font-size:13px">${esc(r.loc)} · ${esc(r.date)}</div>
          </div>
        </div>
        <p class="rv-txt">${esc(r.txt)}</p>
        <div class="rv-tags">${(r.tags || []).map(t => `<span class="rv-tag">${esc(t)}</span>`).join('')}</div>
      </article>`).join('');
  }

  /* ---------------- faq ---------------- */
  function renderFaq() {
    const host = $('#faq-list');
    if (!host || !FAQS_L) return;
    host.innerHTML = FAQS_L.map(([q, a]) => `
      <details class="faq-i">
        <summary class="faq-q" style="list-style:none;cursor:pointer">
          <span>${esc(q)}</span>
          <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path d="M12 5v14M5 12h14" stroke-linecap="round"/>
          </svg>
        </summary>
        <p class="faq-a">${esc(a)}</p>
      </details>`).join('');
  }

  /* ---------------- order drawer ---------------- */
  const KEY = 'ascent.order.v1';
  let order = [];
  try { order = JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { order = []; }

  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(order)); } catch (e) {} };
  const total = () => order.reduce((s, i) => s + i.price * i.qty, 0);
  const units = () => order.reduce((s, i) => s + i.qty, 0);

  function renderCart() {
    if (!$('#cart-count')) return;   // pages without the order drawer
    $('#cart-count').textContent = units();
    $('#cart-total').innerHTML = priceHTML(total(), 'fx--total');

    const body = $('#cart-body');
    if (!order.length) {
      body.innerHTML = `
        <div class="empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <img class="cart-empty-img" src="assets/img/cart-sm.webp" width="560" height="695"
             alt="" aria-hidden="true" loading="lazy">
        <p>${t('cart.empty')}</p>
        </div>`;
    } else {
      body.innerHTML = order.map((i, k) => `
        <div class="ci">
          <div class="ci-thumb" aria-hidden="true">
            <img src="assets/img/cart-vial.webp" alt="" loading="lazy">
          </div>
          <div class="ci-main">
            <div class="ci-name">${esc(i.name)}</div>
            <div class="ci-meta tabular">${esc(i.size)} · ${priceHTML(i.price, 'fx--inline')}</div>
            <div class="qty" style="margin-top:8px">
              <button data-dec="${k}" aria-label="${t('cart.dec')} ${esc(i.name)}">&minus;</button>
              <span class="tabular">${i.qty}</span>
              <button data-inc="${k}" aria-label="${t('cart.inc')} ${esc(i.name)}">+</button>
            </div>
          </div>
          <div style="text-align:right">
            <div class="tabular" style="font-weight:700">${priceHTML(i.price * i.qty, 'fx--inline')}</div>
            <button class="small" data-rm="${k}" style="color:var(--danger);margin-top:6px;min-height:44px;text-align:left">${t('cart.remove')}</button>
          </div>
        </div>`).join('');
    }

    const lines = order.map(i => `${i.qty}x ${i.name} ${i.size}`).join(', ');
    $('#checkout').href = 'https://wa.me/' + waNum() + '?text=' +
      encodeURIComponent(
        `${t('wa.order')} ${lines}. ${t('wa.total')} ${priceText(total())}. ` + t('wa.ruo'));
    syncCheckout();
    save();
  }

  /* The WhatsApp handoff stays inert until the research-use box is ticked, and
     an empty order can't be sent either. */
  function syncCheckout() {
    const btn = $('#checkout'), box = $('#ruo-ack');
    if (!btn || !box) return;
    const ok = box.checked && order.length > 0;
    btn.setAttribute('aria-disabled', String(!ok));
    btn.classList.toggle('is-disabled', !ok);
  }

  $('#ruo-ack') && $('#ruo-ack').addEventListener('change', syncCheckout);
  $('#checkout') && $('#checkout').addEventListener('click', e => {
    if ($('#checkout').getAttribute('aria-disabled') === 'true') {
      e.preventDefault();
      const box = $('#ruo-ack');
      if (order.length && box && !box.checked) {
        box.focus();
        const l = box.closest('.ruo-check');
        l.classList.remove('nudge'); void l.offsetWidth; l.classList.add('nudge');
      }
    }
  });

  function add(name, size, price) {
    const hit = order.find(i => i.name === name && i.size === size);
    if (hit) hit.qty++;
    else order.push({ name, size, price: +price, qty: 1 });
    renderCart();
  }

  const openCart = () => {
    $('#cart').classList.add('open');
    $('#cart').setAttribute('aria-hidden', 'false');
    $('#scrim').classList.add('open');
    $('#cart-close').focus();
  };
  const closeCart = () => {
    $('#cart').classList.remove('open');
    $('#cart').setAttribute('aria-hidden', 'true');
    $('#scrim').classList.remove('open');
    $('#cart-open').focus();
  };

  $('#cart-open').addEventListener('click', openCart);
  $('#cart-close').addEventListener('click', closeCart);
  $('#scrim').addEventListener('click', closeCart);
  $('#sheet-close').addEventListener('click', closeSheet);
  $('#sheet-scrim').addEventListener('click', closeSheet);
  addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    // close whichever panel is actually open
    if ($('#sheet').classList.contains('open')) closeSheet();
    else closeCart();
  });

  // one delegated listener for every add / qty / remove / open-sheet control
  document.addEventListener('click', e => {
    const s = e.target.closest('[data-sheet]');
    if (s) { openSheet(s.dataset.sheet); return; }

    const a = e.target.closest('[data-add]');
    if (a) {
      add(a.dataset.add, a.dataset.size, a.dataset.price);
      const label = a.textContent;
      a.classList.add('is-added');
      a.textContent = t('ui.added');
      setTimeout(() => { a.classList.remove('is-added'); a.textContent = label; }, 900);
      return;
    }
    const inc = e.target.closest('[data-inc]');
    if (inc) { order[+inc.dataset.inc].qty++; renderCart(); return; }
    const dec = e.target.closest('[data-dec]');
    if (dec) {
      const k = +dec.dataset.dec;
      order[k].qty--; if (order[k].qty < 1) order.splice(k, 1);
      renderCart(); return;
    }
    const rm = e.target.closest('[data-rm]');
    if (rm) { order.splice(+rm.dataset.rm, 1); renderCart(); }
  });

  /* ---------------- reveal on scroll ---------------- */
  let io = null;
  function observe() {
    if (reduced) { $$('.rise').forEach(el => el.classList.add('in')); return; }
    if (!io) {
      io = new IntersectionObserver(es => es.forEach(en => {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      }), { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    }
    $$('.rise:not(.in)').forEach(el => io.observe(el));
  }

  /* ---------------- age / research-use gate ----------------
     Shown once per 30 days. Blocks scroll and traps focus while open; Escape
     deliberately does NOT dismiss it, because it is a gate rather than a
     convenience dialog. */
  (function gate() {
    const el = $('#gate');
    if (!el) return;
    const KEY = 'ascent.gate.v1';
    const DAYS = 30;

    let accepted = false;
    try {
      const t = +localStorage.getItem(KEY);
      accepted = t && (Date.now() - t) < DAYS * 864e5;
    } catch (e) {}
    if (accepted) return;

    const card = $('.gate-card', el);
    const declined = $('#gate-declined');
    el.hidden = false;
    document.body.classList.add('gate-locked');
    // next frame so the transition has a start value to animate from
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-open')));

    const focusables = () => $$('button', el).filter(b => b.offsetParent !== null);
    setTimeout(() => $('#gate-accept').focus(), 380);

    // focus trap
    el.addEventListener('keydown', e => {
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    $('#gate-accept').addEventListener('click', () => {
      try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {}
      el.classList.add('is-closing');
      el.classList.remove('is-open');
      setTimeout(() => {
        el.hidden = true;
        document.body.classList.remove('gate-locked');
        // nudge the hero to recompute now that scrolling is unlocked
        // (heroInit's own listener is private, so go through the event)
        dispatchEvent(new Event('scroll'));
        // anything that needed a scrollable page can now run
        dispatchEvent(new Event('ascent:gate-closed'));
      }, 260);
    });

    $('#gate-decline').addEventListener('click', () => {
      card.hidden = true;
      declined.hidden = false;
      $('#gate-back').focus();
    });

    $('#gate-back').addEventListener('click', () => {
      declined.hidden = true;
      card.hidden = false;
      $('#gate-accept').focus();
    });
  })();

  /* ---------------- batch verification ----------------
     One series (batch purity) against a published threshold, so no legend:
     the caption names it. Gold measures 2.37:1 on the cream surface, which
     fails the 3:1 floor for data marks, so the figure sits on the ink card
     where it passes — that is why this one section is dark.
     Stays hidden unless assets/quality.js holds real batch results. */
  function renderQuality() {
    const fig = $('#q-purity');
    if (!fig || typeof QUALITY === 'undefined') return;
    const rows = (QUALITY.batches || []).filter(b => typeof b.purity === 'number');
    fig.hidden = rows.length === 0;
    if (!rows.length) return;

    const thr = QUALITY.threshold;
    const vals = rows.map(b => b.purity);
    const lo = Math.min(thr - 0.4, Math.min(...vals) - 0.1);
    const hi = Math.max(100.05, Math.max(...vals) + 0.05);
    /* Draw at the container's real pixel width rather than a fixed viewBox that
       CSS then scales. A 720-wide box on a 390px phone shrank by 2.4x, which
       rendered the 11px axis labels at 4.6px and the dots at 2.3px radius.
       At 1:1 the type and marks keep their intended size at every width. */
    const host = fig.querySelector('.q-plot');
    const W = Math.max(260, Math.round(host.clientWidth || 720));
    const padL = 16, padR = 16, padB = 28, padT = 30, R = 5.5, STEP = R * 2 + 2;
    const x = v => padL + (v - lo) / (hi - lo) * (W - padL - padR);

    // stack overlapping dots upward so density is visible instead of hidden
    const cols = {};
    const stacked = rows.slice().sort((a, b) => a.purity - b.purity).map(b => {
      const px = x(b.purity), key = Math.round(px / (R * 2));
      const n = cols[key] = (cols[key] || 0) + 1;
      return { b, px, depth: n };
    });
    // height follows the tallest column instead of a fixed box, so a small
    // batch list does not sit in a field of empty ink
    const tallest = Math.max(...Object.values(cols));
    const H = padT + (tallest - 1) * STEP + R * 2 + padB;
    const pts = stacked.map(p => ({ ...p, py: H - padB - R - (p.depth - 1) * STEP }));

    // tick density follows available width; labels need ~46px of clear run
    const span = hi - lo, usable = W - padL - padR;
    const step = [0.1, 0.2, 0.5, 1].find(d => (d / span) * usable >= 46) || 1;
    const ticks = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(+v.toFixed(2));

    const failed = rows.filter(b => b.shipped === false).length;
    const minV = Math.min(...vals), meanV = vals.reduce((a, c) => a + c, 0) / vals.length;

    fig.querySelector('.q-plot').innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" role="img" preserveAspectRatio="xMidYMid meet"
           aria-label="${esc(t('q.chartAlt', { n: rows.length, thr, min: minV.toFixed(1), mean: meanV.toFixed(2) }))}">
        <line class="q-axis" x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}"/>
        ${ticks.map(v => `
          <g class="q-tick">
            <line x1="${x(v).toFixed(1)}" y1="${H - padB}" x2="${x(v).toFixed(1)}" y2="${H - padB + 5}"/>
            <text x="${x(v).toFixed(1)}" y="${H - padB + 20}">${v.toFixed(1)}</text>
          </g>`).join('')}
        <g class="q-thr">
          <line x1="${x(thr).toFixed(1)}" y1="${padT - 8}" x2="${x(thr).toFixed(1)}" y2="${H - padB}"/>
          <text x="${x(thr).toFixed(1)}" y="${padT - 14}">${esc(t('q.floor', { thr }))}</text>
        </g>
        ${pts.map(p => `
          <circle class="q-dot${p.b.shipped === false ? ' q-dot--held' : ''}"
                  cx="${p.px.toFixed(1)}" cy="${p.py.toFixed(1)}" r="${R}">
            <title>${esc((p.b.compound || p.b.id || '') + ' · ' + p.b.purity + '%')}</title>
          </circle>`).join('')}
      </svg>`;

    fig.querySelector('.q-summary').textContent =
      t('q.summary', { n: rows.length, min: minV.toFixed(1), mean: meanV.toFixed(2) });

    /* Fill-vs-hollow is a shape difference, not a colour one, but it still needs
       naming — so it gets a swatch and a label rather than leaving the reader to
       infer what an outlined dot means. */
    const legend = fig.querySelector('.q-legend');
    legend.hidden = !failed;
    if (failed) legend.innerHTML =
      `<svg viewBox="0 0 14 14" aria-hidden="true"><circle class="q-dot--held" cx="7" cy="7" r="5.5"/></svg>` +
      `<span>${esc(t('q.held', { n: failed }))}</span>`;

    fig.querySelector('.q-table tbody').innerHTML = rows.map(b => `
      <tr><td>${esc(b.compound || '—')}</td><td>${esc(b.id || '—')}</td>
          <td class="tabular">${b.purity.toFixed(1)}%</td>
          <td>${b.shipped === false ? esc(t('q.notShipped')) : esc(t('q.shipped'))}</td></tr>`).join('');
  }

  /* No data needed: what the published floor means for one vial, by arithmetic.
     Deliberately self-referential — no comparison against other suppliers. */
  function renderFloorFigure() {
    const el = $('#q-floor');
    if (!el || typeof QUALITY === 'undefined') return;
    const mg = QUALITY.exampleVialMg, thr = QUALITY.threshold;
    el.querySelector('.q-floor-bar').style.setProperty('--verified', thr + '%');
    el.querySelector('.q-floor-note').textContent =
      t('q.floorNote', { mg, thr, verified: (mg * thr / 100).toFixed(2),
                         rest: (mg * (100 - thr) / 100).toFixed(2) });
  }

  /* ---------------- explore by research area ----------------
     Match logic mirrors the app's services/assessment.ts exactly: filter by
     area, then by tier, then by focus answer, where an entry with no `focus`
     tags matches every answer. Kept literally the same so the two surfaces
     can never disagree about what a given selection returns. */
  let exAreas = [];           // selected area ids, in selection order
  let exFocus = {};           // area id -> array of chosen focus values
  let exTiers = ['clinical']; // any of 'clinical' | 'community', at least one
  let exStep  = 1;

  const exDict = () => (LANG === 'es' ? 'es' : 'en');

  /* A research entry links to the catalogue only when that compound is
     actually sold. 10 of 32 are not; those simply show no link. The link is
     navigational on purpose — it points at the product, it does not add to a
     cart, because turning a research summary into a one-tap purchase is the
     line this section was built to stay behind. */
  function exCatalogName(name) {
    if (typeof EXPLORE_CATALOG_ALIAS === 'undefined') return null;
    const target = EXPLORE_CATALOG_ALIAS[name] || name;
    return PRODUCTS_L.some(p => p.n === target) ? target : null;
  }
  const exAreaName = id =>
    (EXPLORE_AREAS[exDict()].find(a => a[0] === id) || [, id])[1];

  /* Every question is multi-select, so an answer is a set and matching is an
     intersection. Selecting nothing within a question means "no narrowing"
     rather than "no results" — the same permissive default the app uses for
     an unanswered question. Note this makes the web version a superset of the
     app's clinical-only / open pair: community-on-its-own is reachable here. */
  function exMatch() {
    const all = EXPLORE_COMPOUNDS[exDict()];
    return exAreas.map(area => ({
      area,
      entries: all.filter(e => {
        if (e.area !== area) return false;
        if (!exTiers.includes(e.tier)) return false;
        const picked = exFocus[area];
        if (!picked || !picked.length || !e.focus) return true;
        return e.focus.some(f => picked.includes(f));
      }),
    }));
  }

  // step 2 only exists if something the reader picked actually has a question
  const exHasFocus = () => exAreas.some(a => EXPLORE_FOCUS[exDict()][a]);

  function exRenderAreas() {
    const host = $('#ex-areas');
    if (!host) return;
    host.innerHTML = EXPLORE_AREAS[exDict()].map(([id, label]) => `
      <button class="chip${exAreas.includes(id) ? ' is-on' : ''}" data-ex-area="${id}"
              aria-pressed="${exAreas.includes(id)}">${esc(label)}</button>`).join('');
  }

  function exRenderFocus() {
    const host = $('#ex-focus');
    if (!host) return;
    const qs = EXPLORE_FOCUS[exDict()];
    host.innerHTML = exAreas.filter(a => qs[a]).map(area => {
      const [question, options] = qs[area];
      return `
        <div class="ex-group">
          <p class="ex-group-t">${esc(exAreaName(area))}</p>
          <p class="ex-group-q">${esc(question)}</p>
          <div class="chips">
            ${options.map(([value, label]) => {
              const on = (exFocus[area] || []).includes(value);
              return `
              <button class="chip${on ? ' is-on' : ''}"
                      data-ex-focus="${area}" data-ex-val="${value}"
                      aria-pressed="${on}">${esc(label)}</button>`;
            }).join('')}
          </div>
        </div>`;
    }).join('');
  }

  function exRenderEvidence() {
    const host = $('#ex-evidence');
    if (!host) return;
    const opts = [
      ['clinical', t('exp.clinicalLabel'), t('exp.clinicalDesc')],
      ['community', t('exp.communityLabel'), t('exp.communityDesc')],
    ];
    host.innerHTML = opts.map(([value, label, desc]) => {
      const on = exTiers.includes(value);
      return `
      <button class="ex-opt${on ? ' is-on' : ''}" data-ex-tier="${value}" aria-pressed="${on}">
        <span class="ex-opt-check" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6">
            <path d="M20 6 9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
        <span class="ex-opt-body">
          <span class="ex-opt-t">${esc(label)}</span>
          <span class="ex-opt-d">${esc(desc)}</span>
        </span>
      </button>`;
    }).join('') + `<p class="ex-hint">${t('exp.bothHint')}</p>`;
  }

  function exRenderResults() {
    const host = $('#ex-results');
    if (!host) return;
    const sections = exMatch();
    host.innerHTML = `
      <h3 class="ex-res-t">${t('exp.resultsTitle')}</h3>
      <p class="ex-res-l">${t('exp.resultsLead')}</p>
      ${sections.map(({ area, entries }) => `
        <div class="ex-res-sec">
          <p class="eyebrow">${esc(exAreaName(area))}</p>
          ${entries.length === 0 ? `
            <div class="ex-empty">
              <p class="ex-empty-t">${t('exp.noneTitle')}</p>
              <p class="small">${t('exp.noneBody')}</p>
            </div>` : entries.map((e, i) => `
            <article class="ex-item">
              <div class="ex-item-h">
                <h4>${esc(e.name)}</h4>
                <span class="ex-tier ex-tier--${e.tier}">${
                  e.tier === 'clinical' ? t('exp.tierClinical') : t('exp.tierCommunity')}</span>
              </div>
              <p class="ex-sum">${esc(e.sum)}</p>
              ${(() => { const c = exCatalogName(e.name); return c ? `
                <a class="ex-shop" href="/?compound=${encodeURIComponent(c)}#catalog">
                  <span>${esc(t('exp.viewCatalog'))}</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
                    <path d="M5 12h14M13 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </a>` : ''; })()}
              <button class="ex-more" data-ex-open="${area}-${i}" aria-expanded="false">
                <span>${t('exp.readEvidence')}</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
                  <path d="m6 9 6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
              <div class="ex-det" id="ex-det-${area}-${i}" hidden>
                <p>${esc(e.det)}</p>
                <p class="ex-src-t">${t('exp.sources')}</p>
                ${e.src.length ? `<ul class="ex-src">${e.src.map(s => `
                  <li><a href="${esc(s.u)}" target="_blank" rel="noopener noreferrer">${esc(s.t)}</a></li>`).join('')}</ul>`
                  : `<p class="small">${t('exp.noSources')}</p>`}
              </div>
            </article>`).join('')}
        </div>`).join('')}`;
  }

  /* Count only the steps this reader will actually see. With nothing picked
     yet the path is unknown, so assume the longest one and let it correct
     itself as areas are toggled — better than promising 2 and delivering 3. */
  function exProgress() {
    const p = $('#ex-progress');
    if (!p) return;
    if (exStep >= 4) { p.textContent = ''; return; }
    const full = exAreas.length === 0 || exHasFocus();
    p.textContent = t('exp.step', {
      n: full ? exStep : Math.min(exStep, 2),
      t: full ? 3 : 2,
    });
  }

  function exShow(step) {
    exStep = step;
    $$('.ex-step').forEach(el => { el.hidden = +el.dataset.step !== step; });
    exProgress();
    if (step === 2) exRenderFocus();
    if (step === 3) exRenderEvidence();
    if (step === 4) exRenderResults();
    // keep the card in view when the step height changes, without yanking
    // the reader out of the section
    const card = $('.ex-card');
    if (card && card.getBoundingClientRect().top < 0) {
      card.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    }
  }

  /* /explore and /investigacion both serve explore.html (see vercel.json).
     No scrolling needed any more — the explorer is the page. /investigacion
     lands in Spanish unless the reader already chose a language, in which
     case their choice wins. */
  const EX_PATHS = { '/explore': null, '/investigacion': 'es' };

  function exDeepLink() {
    const path = location.pathname.replace(/\/+$/, '') || '/';
    if (!(path in EX_PATHS)) return;
    const lang = EX_PATHS[path];
    let stored = null;
    try { stored = localStorage.getItem('ascent.lang'); } catch (e) {}
    if (lang && !stored) setLang(lang);
  }

  function exInit() {
    const root = $('#explore');
    if (!root) return;
    exRenderAreas();
    exShow(1);
    exDeepLink();

    root.addEventListener('click', e => {
      const area = e.target.closest('[data-ex-area]');
      if (area) {
        const id = area.dataset.exArea;
        exAreas = exAreas.includes(id) ? exAreas.filter(a => a !== id) : [...exAreas, id];
        // dropping an area drops its answer too, so a re-add starts clean
        if (!exAreas.includes(id)) delete exFocus[id];
        exRenderAreas();
        exProgress();  // the path length can change with every toggle
        const warn = $('#ex-warn');
        if (warn && exAreas.length) warn.remove();
        return;
      }

      const focus = e.target.closest('[data-ex-focus]');
      if (focus) {
        const a = focus.dataset.exFocus, v = focus.dataset.exVal;
        const cur = exFocus[a] || [];
        exFocus[a] = cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v];
        exRenderFocus();
        return;
      }

      const tier = e.target.closest('[data-ex-tier]');
      if (tier) {
        const v = tier.dataset.exTier;
        // one tier must stay on: clearing both would ask for nothing at all
        const next = exTiers.includes(v) ? exTiers.filter(x => x !== v) : [...exTiers, v];
        if (next.length) exTiers = next;
        exRenderEvidence();
        return;
      }

      const more = e.target.closest('[data-ex-open]');
      if (more) {
        const det = $('#ex-det-' + more.dataset.exOpen);
        const open = det.hidden;
        det.hidden = !open;
        more.setAttribute('aria-expanded', String(open));
        more.classList.toggle('is-open', open);
        more.querySelector('span').textContent = open ? t('exp.hideEvidence') : t('exp.readEvidence');
        return;
      }

      if (e.target.closest('[data-ex-back]')) {
        exShow(exStep === 3 && !exHasFocus() ? 1 : exStep - 1);
        return;
      }
      if (e.target.closest('#ex-go1')) {
        if (!exAreas.length) {
          if (!$('#ex-warn')) {
            const w = document.createElement('p');
            w.id = 'ex-warn'; w.className = 'ex-warn'; w.textContent = t('exp.pickOne');
            $('#ex-areas').after(w);
          }
          return;
        }
        exShow(exHasFocus() ? 2 : 3);
        return;
      }
      if (e.target.closest('#ex-go2')) { exShow(3); return; }
      if (e.target.closest('#ex-go3')) { exShow(4); return; }
      if (e.target.closest('#ex-restart')) {
        exAreas = []; exFocus = {}; exTiers = ['clinical'];
        exRenderAreas();
        exShow(1);
      }
    });
  }

  /* ---------------- boot ---------------- */
  applyI18n();
  heroInit();
  renderFilters();
  renderProducts();
  renderReviews();
  renderFaq();
  renderCart();
  renderSheetData();
  /* Arriving from the research explorer: open the catalogue on that one
     compound rather than dropping the reader into 63 rows to hunt for it. */
  function focusCompoundFromURL() {
    const want = new URLSearchParams(location.search).get('compound');
    if (!want || !$('#products')) return;
    const match = PRODUCTS_L.find(p => p.n === want);
    if (!match) return;
    showAll = true;                 // it may sit outside the top five
    renderProducts();
    const card = $$('#products .p').find(el =>
      el.querySelector('.p-name')?.textContent.trim() === want);
    if (!card) return;
    card.classList.add('is-focused');

    /* The age gate locks body scroll, so a scroll issued during boot is
       silently swallowed and the reader lands at the top of a 63-row catalogue
       with no idea why. Wait for the gate if it is up. */
    const reveal = () => {
      requestAnimationFrame(() => card.scrollIntoView({
        behavior: reduced ? 'auto' : 'smooth', block: 'center',
      }));
      // the highlight is an orientation cue, not a permanent state
      setTimeout(() => card.classList.remove('is-focused'), 2600);
    };
    if (document.body.classList.contains('gate-locked')) {
      addEventListener('ascent:gate-closed', reveal, { once: true });
    } else {
      reveal();
    }
  }

  const showAllBtn = $('#show-all');
  if (showAllBtn) showAllBtn.addEventListener('click', () => {
    const collapsing = showAll;
    showAll = !showAll;
    renderProducts();
    // collapsing from far down the list would strand the reader below the
    // grid, so bring the catalog heading back into view
    if (collapsing) $('#catalog').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  });

  /* Render immediately with the fallback rate so nothing blocks on the network,
     then re-render once the real TRM lands. */
  loadTRM().then(() => {
    renderProducts(); renderCart(); renderSheetData();
    /* Must run after this re-render, not before it: renderProducts() replaces
       the grid's innerHTML, which would detach the card we just highlighted and
       were mid-scroll toward. */
    focusCompoundFromURL();
  });

  renderQuality();
  renderFloorFigure();
  let qResize;
  addEventListener('resize', () => { clearTimeout(qResize); qResize = setTimeout(renderQuality, 150); });
  /* Minimal surface for other page scripts. Currency formatting has to live in
     one place: checkout showing a different total from the cart is the kind of
     mismatch that produces disputes. */
  window.AscentFX = {
    priceHTML, priceText, cop, toCop,
    rate: () => trm,
  };
  loadTRM().then(() => dispatchEvent(new Event('ascent:fx-ready')));

  exInit();
  observe();
})();
