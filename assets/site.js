/* ==========================================================================
   Ascent Labs — site behavior
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
  /* ---------------- market ----------------
     Which country's commercial terms apply: currency, price, what is carried
     and what is on the shelf. Deliberately separate from LANG, because they
     are not the same question. Colombia and Mexico both read Spanish and pay
     in different currencies, and a US buyer may well want to read Spanish.

     Chosen manually here. Geolocation comes later and will set this same value
     before first paint, with the manual choice always winning, so nothing
     downstream needs to know how it was decided. */
  const MARKET_CODES = Object.keys(MARKETS);

  /* Two keys, not one, and the difference is the whole design.

       ascent.market   a market set deliberately, by ?market= rather than by
                       a picker, and never overwritten by geolocation. Once
                       someone has been placed somewhere on purpose, moving
                       them back on the next load undoes the intent.

       ascent.geo      what /api/geo last answered, cached for the day. Not a
                       preference — a fact with a shelf life. Keeping it apart
                       from the choice means a returning visitor costs no
                       request, while a visitor who has actually moved is
                       re-placed the next day.

     So an explicit pick wins over geolocation, geolocation wins over the
     default, and nothing downstream needs to know which of the three decided. */
  const MARKET_KEY = 'ascent.market';
  const GEO_KEY = 'ascent.geo';
  const readLS = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };

  /* ?market=CO forces a market and sticks, and it is the only way to change one
     by hand. There is no picker on the page: a visible toggle beside the
     products is a price-comparison tool, and the three markets are priced from
     independent suppliers, so inviting a visitor to read one market's prices
     against another's serves nobody. IP decides; this exists so the site can
     still be demonstrated, supported and tested in all three, and so someone
     the geolocation places wrong can be sent a link that fixes it. */
  /* ?market=auto hands the visitor back to geolocation. An override sticks, so
     without this a link shared once would pin whoever opened it to that market
     for good, with no picker left to undo it. Support needs a way back, and so
     does anyone demonstrating the three versions in one browser. */
  const marketParam = (() => {
    try {
      const v = (new URLSearchParams(location.search).get('market') || '').toUpperCase();
      if (v === 'AUTO') return 'AUTO';
      return MARKET_CODES.includes(v) ? v : null;
    } catch (e) { return null; }
  })();
  try {
    if (marketParam === 'AUTO') { localStorage.removeItem(MARKET_KEY); localStorage.removeItem(GEO_KEY); }
    else if (marketParam) localStorage.setItem(MARKET_KEY, marketParam);
  } catch (e) {}

  let MARKET = (() => {
    const chosen = readLS(MARKET_KEY);
    if (MARKET_CODES.includes(chosen)) return chosen;
    try {
      const c = JSON.parse(readLS(GEO_KEY) || 'null');
      if (c && c.day === new Date().toISOString().slice(0, 10)) return marketForCountry(c.country);
    } catch (e) {}
    return MARKET_DEFAULT;
  })();
  const market = () => MARKETS[MARKET];

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

  /* Both currencies, always, USD first in both languages.

     USD is the price the buyer is thinking in — the catalogue is priced in it,
     the market quotes peptides in it, and a large share of buyers are outside
     Colombia. COP led in Spanish for a while on the reasoning that it is the
     currency actually charged, but that buries the number people compare on
     behind a six-figure one they have to mentally convert.

     COP stays on every price, never in a footnote: it is what the card is
     actually debited, and Colombian consumer-protection rules expect that
     amount to be visible before purchase, not discovered on the statement.
     Second position and smaller, not absent — the CSS styles by position, so
     order here is what sets the emphasis. */
  function priceHTML(usd, cls) {
    const usdPart = `<span class="fx-usd">${money(usd)}<small> USD</small></span>`;
    const copPart = `<span class="fx-cop">${cop(usd)}</span>`;
    return `<span class="fx ${cls || ''}">${usdPart + copPart}</span>`;
  }
  /* Browsing surfaces show USD only. The peso figure is what gets charged, so
     it belongs where money changes hands, the cart and the checkout total,
     not on 47 catalogue cards at once, where it doubled the
     height of every price for a number nobody acts on while browsing. */
  const priceUSD = usd => `${money(usd)}<small> USD</small>`;
  const priceText = usd => `${money(usd)} USD (${cop(usd)})`;

  /* ---------------- prices in the active market ----------------
     A pinned local figure wins. Without one, a USD market shows the catalogue
     price unchanged and a peso market converts at the live rate, which is what
     the whole site did before markets existed. So a market with no table of
     its own behaves exactly as it used to rather than showing nothing. */
  const priceFmt = {};
  /* Dollars keep the site's existing shape, "$181.82 USD". Pesos use the code
     in front, "COP 709.000", because Colombia writes pesos with a $ too and
     "$709.000" beside "$181.82 USD" reads as ambiguous at best. That is the
     same reasoning copFmt was built on; this just applies it per market. */
  function fmtMoney(amount, cur, locale) {
    if (cur === 'USD') return `${money(amount)}<small> USD</small>`;
    const key = cur + '|' + locale;
    if (!priceFmt[key]) {
      priceFmt[key] = new Intl.NumberFormat(locale, {
        style: 'currency', currency: cur, currencyDisplay: 'code',
        maximumFractionDigits: cur === 'COP' ? 0 : 2,
      });
    }
    return priceFmt[key].format(amount);
  }

  /* The amount, in the active market's currency. */
  function localAmount(name, size, usd) {
    const table = (typeof MARKET_PRICES !== 'undefined' && MARKET_PRICES[MARKET]) || {};
    const pinned = table[`${name}|${size}`];
    if (pinned != null) return pinned;
    return market().currency === 'COP' ? toCop(usd) : usd;
  }

  const localPrice = (name, size, usd) =>
    fmtMoney(localAmount(name, size, usd), market().currency, market().locale);

  /* ---------------- what actually gets charged ----------------
     Wompi settles only in Colombian pesos and has no conversion of its own, so
     COP is the debited amount in every market, not just Colombia. That makes
     the total a different problem in each:

       CO   the price is already in pesos and it is a Colombian card. One
            figure, no conversion, and no note — there is nothing to warn
            about, and a conversion notice on a purely domestic charge is
            noise that makes a normal payment look irregular.

       US   the price of record is dollars and the debit is pesos. Both
       MX   figures have to be visible before the card is entered, with the
            dollar amount leading because that is the number they compared,
            and the peso amount present because that is the one their bank
            will act on and it should not be discovered on the statement.

     Line items stay in one currency. Repeating the peso figure on every row
     doubled the height of each line for a number that only matters once. */
  const chargedInCop = () => market().currency !== 'COP';
  const chargeHTML = (amount, cls) => (chargedInCop()
    ? priceHTML(amount, cls)
    : fmtMoney(amount, market().currency, market().locale));

  /* The statement-may-differ note belongs to markets where a conversion
     actually happens. Every page carries the element in its cart drawer, and
     checkout carries two more, so this toggles all of them at once rather
     than each surface remembering to. */
  function syncFxNotes() {
    const show = chargedInCop();
    $$('.fx-note').forEach(el => { el.hidden = !show; });
  }


  /* ---------------- newsletter signup discount ----------------
     A one-time code for a first order, in exchange for an email address.

     This used to be the site's second discount and had to avoid stacking with
     the standing-order one. Standing orders are gone, so it is now the only
     discount and applies to every line.

     WARNING: applying a discount in the browser is a display convenience, not
     an entitlement. Anyone can write a promo record into their own
     localStorage. When the Wompi backend lands, the code has to be re-checked
     server-side before the charge, and this figure treated as a hint. */
  const NEWSLETTER = {
    discount: 0.10,
    /* Where the address is sent. NOTHING IS CAPTURED UNTIL THIS IS SET — see
       the note by newsletterEligible(). Provider not chosen yet. */
    endpoint: null,
    storeKey: 'ascent.news.v1',    // has this browser seen or taken the offer
    promoKey: 'ascent.promo.v1',   // does this browser hold an unused code
    /* A first-visit dismissal usually means "not now" rather than "never", so
       it is a snooze and not a tombstone. Signing up is the tombstone. */
    dismissDays: 30,
    dwellMs: 8000,                 // catalog page: ask only after real reading
  };
  /* Rounded to the currency's own precision: two decimals of a peso is not a
     price anyone quotes, and 597600.0000000001 is not one either. */
  const promoPrice = p => market().currency === 'COP'
    ? Math.round(p * (1 - NEWSLETTER.discount))
    : Math.round(p * (1 - NEWSLETTER.discount) * 100) / 100;

  let promo = null;   // { code, email } once claimed, else null
  try { promo = JSON.parse(localStorage.getItem(NEWSLETTER.promoKey)) || null; } catch (e) { promo = null; }

  /* Standing orders are gone, so a line's price depends only on whether a
     newsletter code is held. A cart saved while subscriptions existed can still
     carry sub:true and every:30; both are simply ignored rather than migrated,
     which prices those lines the same as any other. */
  /* The cart stores the USD figure as the canonical value and converts at
     render time, so a market switch reprices a cart that is already full
     rather than stranding it in the currency it was built in. */
  const unitBase = i => localAmount(i.name, i.size, i.price);
  const unitPrice = i => (promo ? promoPrice(unitBase(i)) : unitBase(i));

  /* ---------------- placing the visitor ----------------
     Fired at boot, alongside the TRM fetch it is modelled on. Nothing waits on
     it: setMarket re-renders the catalogue, cart, picker and open sheet when
     the answer lands, so a late reply corrects the page rather than delaying
     it.

     There is no flash to design around in practice. The only visitor without a
     cached answer is one with no localStorage for this site — and that is
     exactly the visitor the age gate is covering, so the request resolves
     behind it. A visitor who somehow beats it sees prices settle once, which
     is the same behaviour the TRM fetch has always had.

     Every failure path ends at the default market. A blocked request, an
     offline visitor, local dev where the header does not exist, a country not
     shipped to: all of them mean "US, in dollars", which is where the site
     already starts. Geolocation can only improve on that, never break it. */
  async function loadGeo() {
    // a stated preference is not up for revision
    if (MARKET_CODES.includes(readLS(MARKET_KEY))) return;

    const today = new Date().toISOString().slice(0, 10);
    try {
      const c = JSON.parse(readLS(GEO_KEY) || 'null');
      if (c && c.day === today) return;   // already applied at init
    } catch (e) {}

    try {
      const r = await fetch('/api/geo', { cache: 'no-store' });
      if (!r.ok) return;
      const { country } = await r.json();
      try { localStorage.setItem(GEO_KEY, JSON.stringify({ country, day: today })); } catch (e) {}
      if (country) setMarket(marketForCountry(country), { explicit: false });
    } catch (e) {
      // stay in the default market; the picker is still there
      console.warn('geo unavailable, staying in', MARKET);
    }
  }

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
  /* Retatrutide was here and came out. The home preview is the most prominent
     placement on the site, and retatrutide is one of the three molecules named
     in the March and April 2026 warning letters as well as the subject of
     active civil suits. It stays in the catalogue; it does not need to be the
     first thing a visitor sees. KPV carries none of that. */
  const TOP_PICKS = ['GHK-Cu', 'KPV', 'MOTS-c', 'KLOWUP', 'Tesamorelin'];

  /* Never on the home preview, whatever the stock situation says.

     TOP_PICKS alone could not express this. Once the preview started topping
     itself up with whatever is in stock, a compound left out of TOP_PICKS on
     purpose could walk straight back onto the most prominent placement on the
     site through the top-up. Retatrutide is the case that matters: it is one
     of the three molecules named in the March and April 2026 warning letters,
     and in Mexico it is also one of only three lines currently on the shelf,
     so the top-up would have reached for it first. Stating the exclusion
     separately makes that decision hold instead of depending on a list it was
     never really a part of. */
  const HOME_EXCLUDE = ['Retatrutide'];
  /* 3, not 5. At the desktop grid's auto-fill (minmax 258px) a 1440 viewport
     fits 4 across, so 5 left a single orphan card on a second row with three
     empty columns beside it. 3 fills one clean row at every width that fits 3+,
     and stacks tidily below that. */
  const PREVIEW_N = 3;
  let showAll = false;
  /* The catalog page shows everything and adds a search field. The home page
     shows PREVIEW_N and links here. Same renderer serves both — the only
     differences are these two flags. */
  const IS_SHOP = document.body.dataset.page === 'shop';
  if (IS_SHOP) showAll = true;
  let query = '';

  /* Accent- and case-insensitive: a Spanish reader typing "peptido" should
     still find "péptido". Module scope because both the catalog filter and the
     size-preselect below match against it. */
  const norm = v => (v || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  /* ---------------- one card per compound, not per vial size ----------------
     data.js is a flat list of purchasable rows, so BPC-157 is three of them.
     Rendered one-to-one that shipped as three consecutive cards with byte-
     identical descriptions, which reads as a rendering fault rather than a
     choice, and inflated the headline count: 63 rows are 52 compounds. Sizes
     become a selector on a single card instead.

     Only 7 of the 52 have more than one size, so this changes very few cards —
     but they are the recognisable ones (BPC-157, Retatrutide, Tirzepatide,
     HGH), which is exactly where the repetition was most obvious. */
  function groupByName(rows) {
    const out = [], byName = new Map();
    for (const p of rows) {
      let g = byName.get(p.n);
      if (!g) {
        g = { n: p.n, c: p.c, d: p.d, t: [], variants: [] };
        byName.set(p.n, g);
        out.push(g);
      }
      g.variants.push(p);
      /* Union rather than first-wins. BPC-157's 10mg row carries
         t:["rendimiento"] and its 20mg and 40mg rows do not, so first-wins
         would make the compound's presence in the Performance filter depend on
         which size happened to lead the group. Verified this is the only name
         whose rows disagree on tags; they all agree on category and text. */
      for (const tag of p.t || []) if (!g.t.includes(tag)) g.t.push(tag);
    }
    return out;
  }

  /* Which vial a card is currently showing, by compound name. Module scope so
     it survives the wholesale re-render that every filter and search keystroke
     triggers — otherwise picking 40mg and then typing would silently snap the
     card back to 10mg. */
  const picked = new Map();

  /* Not "cheapest first": BPC-157's 20mg is a dollar under its 10mg, and HGH's
     50IU is well under its 36IU, so price order and size order genuinely
     disagree in this data. Falls back to the first row, which data.js keeps in
     ascending size order. */
  function variantFor(g, qn) {
    const want = picked.get(g.n);
    if (want) {
      const chosen = g.variants.find(v => v.s === want);
      if (chosen) return chosen;
      // a language switch can retire a size string; drop the stale pick
      picked.delete(g.n);
    }
    // searching "30mg" should land the card on that vial, not on the smallest
    if (qn) {
      const m = g.variants.find(v => norm(v.s).includes(qn));
      if (m) return m;
    }
    /* The smallest size, unless it is out and another is not. A card opening
       on a sold-out vial while a live one sits behind a chip reads as "we do
       not have this" for a compound we do have. An explicit pick above still
       wins either way: clicking a struck-through chip is a deliberate act and
       the card should follow it. */
    return g.variants.find(v => inStock(MARKET, g.n, v.s)) || g.variants[0];
  }

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
    // placeholders need their own hook; the search field is the first input on
    // the site whose placeholder is real copy rather than a format hint
    $$('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });

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

  /* Switching market changes money and availability, not words, so language
     is left alone: someone reading Spanish in the US stays in Spanish. */
  /* explicit defaults true: every existing caller is a click on the picker.
     Geolocation passes false, so placing someone does not also record a
     preference they never expressed. */
  function setMarket(next, { explicit = true } = {}) {
    if (!MARKET_CODES.includes(next) || next === MARKET) return;
    MARKET = next;
    if (explicit) { try { localStorage.setItem(MARKET_KEY, next); } catch (e) {} }
    renderMarketPicker();
    renderFilters();
    renderProducts();
    renderCart();
    if (openSheetName) fillSheet(openSheetName);
    dispatchEvent(new CustomEvent('ascent:market', { detail: MARKET }));
  }

  function renderMarketPicker() {
    $$('[data-market]').forEach(b => {
      const on = b.dataset.market === MARKET;
      b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('is-on', on);
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
    renderAppDate();
    // the explorer holds live state (selected areas, answers, current step), so
    // it re-renders in place rather than resetting the reader back to step 1
    exRenderAreas();
    exShow(exStep);
    // the re-rendered sections are brand-new nodes, so they carry .rise with no
    // observer attached — without this they sit at opacity 0 forever
    observe();
    /* Page scripts render their own content and cannot be reached from here.
       Without this, checkout's summary keeps the language it booted in while
       the chrome around it switches. */
    dispatchEvent(new CustomEvent('ascent:lang', { detail: LANG }));
  }

  $$('.lang [data-lang]').forEach(b => {
    b.addEventListener('click', () => setLang(b.dataset.lang));
  });

  /* ---------------- hero ----------------
     A still. This was a 100-frame scroll-scrubbed fall on a 230vh pinned
     section; #hero is one screen now.

     Removing it was not a performance decision — by the end the sequence was
     65 frames, 1.34MB, with decode off the scrub path. It was that a pinned
     hero redefines what scrolling does, on the one screen where a visitor is
     deciding whether to stay, and charged 1.3 screens of scroll for something
     they had already read in the first second. The frames and
     scripts/build-hero-frames.py are kept: that animation belongs in a feed,
     where two seconds of motion is the whole format.

     A parallax drift was tried here and removed — see the note on #hero-still
     in site.css. All that is left is hiding the scroll cue once the reader
     takes the hint. */
  const heroSec = $('#hero');
  const cue = $('#cue');

  function heroInit() {
    if (!heroSec) return;
    const beat = $('.hero-beat');
    if (beat) beat.style.opacity = 1;       // one beat, always visible
    if (!cue) return;

    let raf = null;
    function draw() {
      raf = null;
      const h = heroSec.offsetHeight;
      if (!h) return;
      const p = Math.min(1, Math.max(0, -heroSec.getBoundingClientRect().top / h));
      cue.style.opacity = p > 0.04 ? 0 : 1;
    }
    addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(draw); },
                     { passive: true });
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
    /* Same range filter as the catalogue. Without it the sheet would offer to
       add a size the market does not sell, from a card that never showed it. */
    const sizes = PRODUCTS_L.filter(p => p.n === name && carries(MARKET, p.n, p.s));
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
            ${inStock(MARKET, p.n, p.s) ? `
            <button class="btn-add" data-add="${esc(p.n)}" data-size="${esc(p.s)}" data-price="${p.p}">
              ${esc(p.s)} · ${localPrice(name, p.s, p.p)}
            </button>` : `
            <button class="btn-add is-out" disabled aria-disabled="true">
              ${esc(p.s)} · ${esc(t('ui.outOfStock'))}
            </button>`}`).join('') || `<p class="small">${t('sheet.contact')}</p>`}
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

  /* Not in CATS. That list is the research taxonomy and lives in data.js in
     both languages; "in stock" is a commercial state that changes by market
     and by week, and mixing it in would put inventory into a compound's
     description of itself. Injected here instead, beside the market logic it
     depends on, with its label from i18n like every other piece of chrome. */
  const STOCK_CAT = 'in-stock';
  const hasStock = g => g.variants.some(v => inStock(MARKET, g.n, v.s));

  /* Only worth offering when it actually narrows the list. Colombia has
     something on the shelf for all 47 of its compounds, so the chip there
     would return the same grid as All and cost a tap to learn that. It
     reappears on its own the moment that market's shelf thins out. */
  function stockChipWorthShowing() {
    const groups = groupByName(PRODUCTS_L.filter(p => carries(MARKET, p.n, p.s)));
    const live = groups.filter(hasStock).length;
    return live > 0 && live < groups.length;
  }

  function renderFilters() {
    const host = $('#filters');
    if (!host) return;
    const showStock = stockChipWorthShowing();
    // a market switch can retire the chip while it is the active filter
    if (active === STOCK_CAT && !showStock) active = 'todo';
    const chips = CATS_L.map(([id, label]) => [id, label]);
    // straight after All: when three of fifty-three can be bought, it is the
    // first cut most people want, not the last
    if (showStock) chips.splice(1, 0, [STOCK_CAT, t('cat.inStock')]);
    host.innerHTML = chips.map(([id, label]) =>
      `<button class="chip" role="tab" data-cat="${id}" aria-selected="${id === active}">${esc(label)}</button>`
    ).join('');
    $$('.chip', host).forEach(c => c.addEventListener('click', () => {
      active = c.dataset.cat;
      /* Home collapses back to the preview on every filter change — a new
         filter is a fresh, short view there. The catalog page must NOT: it
         exists to show everything, and resetting this truncated it to three on
         the first category click, before the reader had even changed their
         mind. */
      if (!IS_SHOP) showAll = false;
      $$('.chip', host).forEach(x => x.setAttribute('aria-selected', String(x === c)));
      renderProducts();
    }));
  }

  function renderProducts() {
    const host = $('#products');
    if (!host) return;
    /* Search matches name, category, description and any of the compound's
       sizes, so "repair", "GLP", "BPC" or "30mg" all land somewhere useful. */
    const qn = norm(query).trim();
    /* Group before filtering, not after. Filtering the flat rows first would
       let a tag carried by a single row decide the whole group: Performance
       matches BPC-157's 10mg row alone, and the card would then offer 10mg as
       its only size while the 20mg and 40mg vials quietly disappeared. */
    /* Filter to the market's range BEFORE grouping, so a compound whose only
       carried size is 10mg shows one chip rather than seven with six of them
       unbuyable. A compound with nothing carried disappears entirely. */
    const inRange = PRODUCTS_L.filter(p => carries(MARKET, p.n, p.s));
    const groups = groupByName(inRange).filter(g => g.variants.length);
    const full = groups.filter(g => {
      const inCat = active === 'todo' ? true
        : active === STOCK_CAT ? hasStock(g)
        : (g.c === active || g.t.includes(active));
      if (!inCat) return false;
      if (!qn) return true;
      return norm(g.n).includes(qn) || norm(g.d).includes(qn)
          || norm(catName(g.c)).includes(qn)
          || g.variants.some(v => norm(v.s).includes(qn));
    });

    let list = full;
    if (!showAll && full.length > PREVIEW_N) {
      if (active === 'todo') {
        /* Curated order, but stock comes first. The preview is three cards on
           the most prominent placement on the site, and filling it with things
           nobody can buy is worse than showing a different compound: in Mexico
           the curated three were all out, so home opened on three dimmed cards
           and no way to order anything at all.

           So: curated picks that are live, then anything else live, then the
           curated picks that are out, then the rest. The last two tiers only
           ever get reached when a market genuinely cannot fill the row, and
           then a dimmed card is the honest answer rather than a short row.
           A pick that no longer exists in the data drops out silently. */
        const live = g => g.variants.some(v => inStock(MARKET, g.n, v.s));
        const allowed = full.filter(p => !HOME_EXCLUDE.includes(p.n));
        const curated = TOP_PICKS.map(n => allowed.find(p => p.n === n)).filter(Boolean);
        const rest = allowed.filter(p => !curated.includes(p));
        list = [];
        for (const tier of [curated.filter(live), rest.filter(live),
                            curated.filter(p => !live(p)), rest.filter(p => !live(p))]) {
          for (const p of tier) {
            if (list.length >= PREVIEW_N) break;
            if (!list.includes(p)) list.push(p);
          }
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
        /* "in stock" is a state, not a place, so it does not take the "in
           {category}" frame the research categories do — that produced
           "3 compounds in in-stock". Its own suffix keeps the singular and
           plural handling above working in both languages. */
        (active === 'todo' ? ''
          : active === STOCK_CAT ? ` ${t('cat.inStockSuffix')}`
          : ` ${t('ui.in')} ${catName(active)}`);

    const more = $('#show-all');
    if (more) {
      // on home this is an <a> to the catalog page, so it only ever needs its
      // label; the collapse/expand toggle belonged to the old in-place reveal
      more.hidden = full.length <= PREVIEW_N;
      more.textContent = t('cat.showAll', { n: groups.length });
    }

    // the catalog page reports its own result count, including "no matches"
    const empty = $('#shop-empty');
    if (empty) empty.hidden = full.length > 0;

    host.innerHTML = list.map(g => {
      const v = variantFor(g, qn);
      const multi = g.variants.length > 1;
      const live = inStock(MARKET, g.n, v.s);
      const anyLive = g.variants.some(x => inStock(MARKET, g.n, x.s));
      return `
      <article class="p${anyLive ? '' : ' p--out'}">
        <div class="p-top">
          <div>
            <div class="p-name">${esc(g.n)}</div>
            <!-- Multi-size cards would otherwise skip this line and start
                 their description one line higher than every single-size
                 neighbour, which reads as a ragged grid row. A muted count
                 fills the slot and says up front that there is a choice. -->
            ${multi
              ? `<div class="p-size p-size--multi">${esc(t('ui.sizeCount', { n: g.variants.length }))}</div>`
              : `<div class="p-size">${esc(v.s)}</div>`}
          </div>
          <span class="p-cat">${esc(catName(g.c))}</span>
        </div>
        <p class="p-desc">${esc(g.d || '')}</p>
        <button class="p-more" data-sheet="${esc(g.n)}">
          ${sheetFor(g.n) ? t('sheet.tech') : t('sheet.details')}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <p class="p-ruo">${RUO()}</p>
        ${multi ? `
        <!-- Sits below the research-use line, not above it, so that line's
             top border separates the whole commercial block — size, price and
             Add — from the reference copy above it. -->
        <div class="p-sizes" role="radiogroup" aria-label="${esc(t('ui.size'))}">
          ${g.variants.map(x => `
            <button class="p-size-chip${inStock(MARKET, g.n, x.s) ? '' : ' is-out'}" role="radio"
                    aria-checked="${x === v}" tabindex="${x === v ? 0 : -1}"
                    ${inStock(MARKET, g.n, x.s) ? '' : `aria-label="${esc(x.s)}, ${esc(t('ui.outOfStock'))}"`}
                    data-pick="${esc(g.n)}" data-pick-size="${esc(x.s)}">${esc(x.s)}</button>`).join('')}
        </div>` : ''}
        <div class="p-foot">
          <div class="p-price tabular">
            ${localPrice(g.n, v.s, v.p)}
          </div>
          <!-- genuinely disabled, not just dimmed: a faded button that still
               works puts an unavailable line into the cart and then through
               checkout, and someone pays for something there is none of -->
          ${live ? `
          <button class="btn-add" data-add="${esc(g.n)}" data-size="${esc(v.s)}" data-price="${v.p}">
            ${t('ui.add')}
          </button>` : `
          <button class="btn-add is-out" disabled aria-disabled="true">
            ${t('ui.outOfStock')}
          </button>`}
        </div>
      </article>`;
    }).join('');
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
  /* A line the market does not carry has no price in it, and localAmount's
     fallback would invent one by converting the dollar figure — which is how a
     cart built in the US came to show a Colombian buyer a peso price for a
     size Colombia does not sell. So it is excluded from the total, labelled in
     the drawer, and blocks checkout until it is removed. Excluding it quietly
     would be worse: the total would stop matching the lines above it. */
  const sellable = i => carries(MARKET, i.name, i.size);
  const stranded = () => order.filter(i => !sellable(i));
  const total = () => order.reduce((s, i) => s + (sellable(i) ? unitPrice(i) * i.qty : 0), 0);
  const units = () => order.reduce((s, i) => s + i.qty, 0);

  /* Everything the buyer is not paying, from either discount. One figure
     rather than two lines, because they never apply to the same item — see
     unitPrice — so a cart holding both is still one saving. */
  /* unitBase, not i.price. i.price is the stored USD figure, and subtracting a
     discounted peso from it would report a saving of about six hundred thousand
     on a Colombian cart. Both sides have to be in the market's currency. */
  const saved = () => order.reduce((s, i) => s + (sellable(i) ? (unitBase(i) - unitPrice(i)) * i.qty : 0), 0);

  function renderCart() {
    if (!$('#cart-count')) return;   // pages without the order drawer
    $('#cart-count').textContent = units();
    /* One currency, the market's. priceHTML printed USD and COP together
       back when every visitor saw the same dollar price and the peso was a
       conversion of it. Now the market decides which is real, and showing both
       would be showing a converted figure next to an actual one. */
    $('#cart-total').innerHTML = chargeHTML(total(), 'fx--total');
    syncFxNotes();
    const sv = $('#cart-saved');
    if (sv) {
      const s = saved();
      /* The code is named beside the saving rather than left implicit. A
         discount that appears with no stated reason reads as a pricing error. */
      const showCode = promo && order.length > 0;
      sv.innerHTML = s > 0
        ? (showCode ? `<span class="promo-chip">${esc(promo.code)}</span> ` : '') +
          t('sub.saving', { amount: fmtMoney(s, market().currency, market().locale) })
        : '';
      sv.hidden = s <= 0;
    }
    $('#cart-total-label') && ($('#cart-total-label').textContent = t('cart.total'));
    /* Shipping terms and an exchange-rate caveat under an empty cart are notes
       about nothing. */
    const notes = $('#cart-notes');
    if (notes) notes.hidden = !order.length;

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
        <div class="ci${sellable(i) ? '' : ' ci--na'}">
          <div class="ci-thumb" aria-hidden="true">
            <img src="assets/img/cart-vial.webp" alt="" loading="lazy">
          </div>
          <div class="ci-main">
            <div class="ci-top">
              <div>
                <div class="ci-name">${esc(i.name)}</div>
                <!-- Size only. The unit price used to sit here too, which meant
                     the same figure rendered twice in one item, here and as
                     the line total. -->
                <div class="ci-meta">${esc(i.size)}</div>
              </div>
              <!-- USD only. COP belongs on the figure that is actually
                   charged, the total. Repeating it on every line put several
                   peso figures in one drawer and doubled the height of every
                   price. -->
              <div class="ci-price tabular">${sellable(i)
                ? fmtMoney(unitPrice(i) * i.qty, market().currency, market().locale)
                : `<span class="ci-na">${t('cart.notHere')}</span>`}</div>
            </div>
            <!-- Quantity and remove share a row. The pill had a row to itself
                 while the column opposite it sat empty. -->
            <div class="ci-actions">
              <div class="qty">
                <button data-dec="${k}" aria-label="${t('cart.dec')} ${esc(i.name)}">&minus;</button>
                <span class="tabular">${i.qty}</span>
                <button data-inc="${k}" aria-label="${t('cart.inc')} ${esc(i.name)}">+</button>
              </div>
              <!-- Muted until hover. Removing a line is recoverable and rare;
                   permanent red next to the price competed with it. -->
              <button class="ci-rm" data-rm="${k}">${t('cart.remove')}</button>
            </div>
          </div>
        </div>`).join('');
    }

    const lines = order.map(i => `${i.qty}x ${i.name} ${i.size}`).join(', ');
    /* Orders go to the checkout page now, not to WhatsApp. The WhatsApp links
       in the nav, footer and float button stay: those are support, not
       ordering. */
    $('#checkout').href = '/checkout';
    syncCheckout();
    save();
  }

  /* The WhatsApp handoff stays inert until the research-use box is ticked, and
     an empty order can't be sent either. */
  function syncCheckout() {
    const btn = $('#checkout');
    if (!btn) return;
    /* An empty cart, or one holding something this market does not sell.
       Letting the second through would hand the payment step a line with no
       price in the charging currency. */
    const blocked = stranded();
    const ok = order.length > 0 && !blocked.length;
    btn.setAttribute('aria-disabled', String(!ok));
    btn.classList.toggle('is-disabled', !ok);
    const why = $('#cart-blocked');
    if (why) {
      // a disabled button with no stated reason reads as a broken button
      why.textContent = blocked.length ? t('cart.blocked') : '';
      why.hidden = !blocked.length;
    }
  }


  $('#checkout') && $('#checkout').addEventListener('click', e => {
    if ($('#checkout').getAttribute('aria-disabled') === 'true') e.preventDefault();
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

  /* Repoint one card at a different vial. Deliberately not a renderProducts()
     call: a full re-render replaces the very button that was just clicked,
     which drops focus to <body> mid-interaction and leaves a keyboard or
     screen-reader user with nothing selected and no announcement. */
  function paintCard(card, name, size) {
    if (!card) return;
    const v = PRODUCTS_L.find(p => p.n === name && p.s === size);
    if (!v) return;
    $$('[data-pick]', card).forEach(b => {
      const on = b.dataset.pickSize === size;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;   // roving, per the radiogroup pattern
    });
    const live = inStock(MARKET, name, size);
    const add = $('.btn-add', card);
    if (add) {
      add.disabled = !live;
      add.classList.toggle('is-out', !live);
      if (live) {
        add.textContent = t('ui.add');
        add.dataset.add = name; add.dataset.size = v.s; add.dataset.price = v.p;
        add.removeAttribute('aria-disabled');
      } else {
        add.textContent = t('ui.outOfStock');
        add.setAttribute('aria-disabled', 'true');
        delete add.dataset.add;
      }
    }
    const price = $('.p-price', card);
    if (price) {
      price.innerHTML = localPrice(name, v.s, v.p);
    }
  }

  // one delegated listener for every add / qty / remove / open-sheet control
  document.addEventListener('click', e => {
    const pick = e.target.closest('[data-pick]');
    if (pick) {
      picked.set(pick.dataset.pick, pick.dataset.pickSize);
      paintCard(pick.closest('.p'), pick.dataset.pick, pick.dataset.pickSize);
      pick.focus();
      return;
    }

    const mk = e.target.closest('[data-market]');
    if (mk) { setMarket(mk.dataset.market); return; }

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
    if (rm) { order.splice(+rm.dataset.rm, 1); renderCart(); return; }

  });

  /* Arrow keys move between a card's size options. Only the checked chip is
     tabbable — that is the radiogroup pattern, and it keeps Tab from having to
     walk three vials before reaching Add — so without this a keyboard user
     could land on the group but never change the selection inside it. */
  document.addEventListener('keydown', e => {
    const b = e.target.closest && e.target.closest('[data-pick]');
    if (!b) return;
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1
              : e.key === 'ArrowLeft'  || e.key === 'ArrowUp'   ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const all = $$('[data-pick]', b.parentElement);
    // wraps at both ends, so the group is never a dead end in either direction
    all[(all.indexOf(b) + dir + all.length) % all.length].click();
  });

  /* ---------------- live date on the app screenshot ----------------
     The capture bakes in whatever day it was taken; a marketing shot showing a
     date months in the past reads as an abandoned site. This reprints today's
     over it, using the SAME options and locale mapping the app's own home
     screen uses (i18n/useTranslation.ts -> es-ES | en-US, and
     toLocaleDateString with weekday/month/day) so the mockup cannot claim a
     format the app does not produce. */
  function renderAppDate() {
    const el = $('#app-date-text');
    if (!el) return;                       // only the home page has the section
    const tag = LANG === 'es' ? 'es-ES' : 'en-US';
    try {
      el.textContent = new Date().toLocaleDateString(tag, {
        weekday: 'long', month: 'long', day: 'numeric',
      });
    } catch (e) { return; }                // leave the baked text rather than blank it

    /* Fit, rather than trust that it will. Spanish spells the date out in full
       and can run half again as long as English, and the box is a fixed slice
       of a photograph — overflow would be clipped mid-word. */
    el.style.transform = '';
    /* clientWidth INCLUDES padding, and the box is padded on the left to hide
       the baked glyph's antialiasing. Measuring against it overstated the room
       by that padding and let the longest Spanish date run past the edge. */
    const box = el.parentElement;
    const cs = getComputedStyle(box);
    const avail = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const w = el.scrollWidth;
    if (avail > 0 && w > avail) el.style.transform = `scale(${(avail / w).toFixed(4)})`;
  }

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

  /* ---------------- newsletter signup ----------------
     Trades a 10% first-order code for an email address. Built in JS rather
     than authored into the markup, unlike the age gate: the gate has to exist
     before first paint on every page, while this appears on two pages, after
     a deliberate trigger, and often never. Injecting it keeps it out of the 18
     pages that lift their chrome from explore.html.

     Frequency, which is the whole question with a popup like this:
       subscribed  -> never shown again
       dismissed   -> quiet for NEWSLETTER.dismissDays, then one more ask
       unseen      -> eligible
     The record lives in localStorage, so a refresh does not re-open it. It is
     per browser, so a private window or cleared storage starts over. That is
     the same limitation the age gate already accepts. */
  (function newsletter() {
    const nlState = () => {
      try { return JSON.parse(localStorage.getItem(NEWSLETTER.storeKey)) || null; }
      catch (e) { return null; }
    };
    const setNlState = (state) => {
      try {
        localStorage.setItem(NEWSLETTER.storeKey, JSON.stringify({ state, t: Date.now() }));
      } catch (e) {}
    };

    /* PREVIEW GATE. With no endpoint configured there is nowhere to put an
       address, and a form that thanks someone and drops their email is worse
       than no form. Until NEWSLETTER.endpoint is set the popup only appears
       with ?newsletter=1, so the UI can be reviewed on the live site without a
       real visitor ever handing over an address that goes nowhere. Setting the
       endpoint turns it on for everyone; there is no second flag to remember. */
    const preview = new URLSearchParams(location.search).has('newsletter');
    function eligible() {
      if (!NEWSLETTER.endpoint && !preview) return false;
      /* Preview ignores the stored state on purpose. Reviewing a design means
         opening it, closing it and opening it again, and a 30 day snooze after
         the first look would make the second one impossible without clearing
         site data by hand. */
      if (preview) return true;
      const rec = nlState();
      if (!rec) return true;
      if (rec.state === 'subscribed') return false;
      return (Date.now() - (rec.t || 0)) > NEWSLETTER.dismissDays * 864e5;
    }

    /* Never on top of something else the reader opened themselves. Two modals
       in a row on a first visit reads as an obstacle course, and interrupting
       a half-finished order to ask for an email costs more than it earns. */
    const busy = () =>
      document.body.classList.contains('gate-locked') ||
      ($('#cart') && $('#cart').classList.contains('open')) ||
      ($('#sheet') && $('#sheet').classList.contains('open'));

    /* Placeholder codes, generated here so the success state has something
       real to show. THE PROVIDER MUST ISSUE THE REAL ONE. A code minted in the
       browser cannot be validated, and neither can the discount it unlocks:
       see the warning on NEWSLETTER above. I/O/0/1 are left out because these
       get retyped from a screenshot. */
    function makeCode() {
      const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const buf = new Uint8Array(4);
      if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(buf);
      else for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);
      let out = '';
      for (const b of buf) out += A[b % A.length];
      return 'ASCENT10-' + out;
    }

    async function sendSignup(email) {
      if (!NEWSLETTER.endpoint) throw new Error('newsletter endpoint not configured');
      const res = await fetch(NEWSLETTER.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email, lang: LANG, source: document.body.dataset.page || 'home',
        }),
      });
      if (!res.ok) throw new Error('signup failed: ' + res.status);
    }

    const pctLabel = () => Math.round(NEWSLETTER.discount * 100) + '%';

    /* The big line is a translated phrase, so its width is not knowable when
       the CSS is written: "10% off" is seven characters, "10% de descuento" is
       sixteen, and a third language could be longer still. A single authored
       font-size can only ever suit one of them. So the CSS sets the ceiling
       and this shrinks to fit the card, which keeps the figure as large as it
       can be in every language instead of sizing them all for the longest.

       Measures with a Range: the span is a stretched flex item, so its own
       bounding box is the full column width and says nothing about the
       glyphs. If it will not fit even at the floor, wrapping is allowed back
       on so it breaks across two lines rather than running off the card. */
    const MIN_PCT_PX = 34;
    function fitBigLine(pct) {
      if (!pct) return;
      const avail = pct.parentElement.clientWidth;
      if (!avail) return;

      /* Per line box, not one rect for the whole element. A Range over a
         wrapped element reports the union of its lines, which is wider than
         any actual line and would keep shrinking text that already fits. */
      const range = document.createRange();
      const widestLine = () => {
        range.selectNodeContents(pct);
        const rects = [...range.getClientRects()];
        return rects.length ? Math.max(...rects.map(r => r.width)) : 0;
      };
      // ratio-driven, so it converges in a pass or two rather than stepping
      const shrinkToFit = () => {
        let size = parseFloat(getComputedStyle(pct).fontSize);
        let w = widestLine();
        for (let i = 0; i < 6 && w > avail && size > MIN_PCT_PX; i++) {
          size = Math.max(MIN_PCT_PX, size * (avail / w) * 0.99);
          pct.style.fontSize = size + 'px';
          w = widestLine();
        }
        return w <= avail;
      };

      pct.style.fontSize = '';
      pct.style.whiteSpace = 'nowrap';
      if (shrinkToFit()) return;

      /* One line is not possible at a readable size. Let it break and start
         over from the ceiling: each line now carries only part of the phrase,
         so it settles far larger than the floor it had bottomed out at. */
      pct.style.whiteSpace = 'normal';
      pct.style.fontSize = '';
      shrinkToFit();
    }

    let el = null, lastFocused = null;

    function markup() {
      return `
        <div class="nl-scrim" data-nl-close></div>
        <div class="nl-card" role="dialog" aria-modal="true" aria-labelledby="nl-h">
          <button class="nl-x" type="button" data-nl-close
                  aria-label="${esc(t('nl.close'))}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke-linecap="round"/>
            </svg>
          </button>
          <div class="nl-body">
            <p class="eyebrow">${esc(t('nl.eyebrow'))}</p>
            <!-- The figure is split out so it can carry real size, but it stays
                 inside the single <h2> the dialog is labelled by, so a screen
                 reader still announces one whole sentence. The percentage is
                 derived from NEWSLETTER.discount rather than written into the
                 copy, so the number and the maths cannot drift apart. -->
            <h2 id="nl-h" class="nl-offer">
              <span class="nl-pct">${esc(t('nl.hBig', { pct: pctLabel() }))}</span>
              <span class="nl-rest">${esc(t('nl.hRest'))}</span>
            </h2>
            <p class="small">${esc(t('nl.body'))}</p>
            <form class="nl-form" novalidate>
              <input type="email" id="nl-email" required autocomplete="email"
                     placeholder="${esc(t('nl.ph'))}" aria-label="${esc(t('nl.ph'))}">
              <button class="btn btn--primary nl-go" type="submit">${esc(t('nl.cta'))}</button>
            </form>
            <p class="nl-err" id="nl-err" role="alert" hidden></p>
            <p class="nl-fine">${esc(t('nl.fine'))}</p>
          </div>
        </div>`;
    }

    function successMarkup(code) {
      return `
        <p class="eyebrow">${esc(t('nl.eyebrow'))}</p>
        <h2 id="nl-h" class="nl-offer nl-offer--done">${esc(t('nl.okH'))}</h2>
        <p class="small">${esc(t('nl.okBody'))}</p>
        <p class="nl-code tabular">${esc(code)}</p>
        <p class="nl-fine">${esc(t('nl.okNote'))}</p>
        <button class="btn btn--primary nl-go" type="button" data-nl-close>${esc(t('nl.okCta'))}</button>`;
    }

    function close() {
      if (!el) return;
      // only a dismissal snoozes; submitting has already written 'subscribed'
      if (nlState() === null || (nlState() || {}).state !== 'subscribed') setNlState('dismissed');
      el.classList.remove('is-open');
      const done = () => { if (el) { el.remove(); el = null; } };
      reduced ? done() : setTimeout(done, 220);
      lastFocused && lastFocused.focus && lastFocused.focus();
    }

    function open() {
      if (el) return;
      lastFocused = document.activeElement;
      el = document.createElement('div');
      el.className = 'nl';
      el.id = 'nl';
      el.innerHTML = markup();
      document.body.appendChild(el);
      /* Force a style flush rather than waiting on requestAnimationFrame. rAF
         is throttled to a stop in background tabs, and if it does not run the
         dialog sits in the DOM at opacity 0: present, focus-trapping, and
         invisible. Reading offsetWidth commits the starting styles, so the
         transition still has a value to animate from, but synchronously.
         Caught by measuring computed opacity rather than mere existence. */
      void el.offsetWidth;
      el.classList.add('is-open');
      fitBigLine($('.nl-pct', el));

      /* Deliberately does NOT lock body scroll, unlike the age gate. This is an
         offer, not a gate, and freezing the page someone is reading to make
         them deal with it is the behaviour that makes these hated. */
      $('#nl-email', el).focus({ preventScroll: true });

      el.addEventListener('click', e => {
        if (e.target.closest('[data-nl-close]')) { e.preventDefault(); close(); }
      });

      el.addEventListener('keydown', e => {
        if (e.key === 'Escape') { e.preventDefault(); close(); return; }
        if (e.key !== 'Tab') return;
        const f = $$('button, input', el).filter(n => n.offsetParent !== null);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      });

      $('.nl-form', el).addEventListener('submit', async e => {
        e.preventDefault();
        const input = $('#nl-email', el);
        const err = $('#nl-err', el);
        const email = input.value.trim();
        /* Deliberately loose. Address syntax is far stranger than any short
           pattern admits, and the only real check is whether mail arrives, so
           this rejects the obvious typo and lets the provider judge the rest. */
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
          err.textContent = t('nl.errEmail');
          err.hidden = false;
          input.focus();
          return;
        }
        const go = $('.nl-go', el);
        err.hidden = true;
        go.disabled = true;
        go.textContent = t('nl.pending');
        try {
          await sendSignup(email);
        } catch (e2) {
          console.warn('newsletter signup failed', e2);
          err.textContent = t('nl.err');
          err.hidden = false;
          go.disabled = false;
          go.textContent = t('nl.cta');
          return;
        }
        const code = makeCode();
        promo = { code, email };
        try { localStorage.setItem(NEWSLETTER.promoKey, JSON.stringify(promo)); } catch (e3) {}
        setNlState('subscribed');
        $('.nl-body', el).innerHTML = successMarkup(code);
        $('.nl-go', el).focus();
        /* The cart, not the catalogue. Card prices stay at list: they already
           carry a second 10% figure for the standing order, and a third price
           on 52 cards would make it unclear which discount is which. The code
           applies to an order, so the order is where it shows. */
        renderCart();
      });
    }

    /* Retries rather than giving up: the trigger fires once, and if the reader
       happens to have the cart open at that moment the offer would otherwise
       never appear at all. Capped so it cannot poll forever. */
    let tries = 0;
    function tryOpen() {
      if (!eligible()) return;
      if (busy()) {
        if (++tries > 5) return;
        setTimeout(tryOpen, 4000);
        return;
      }
      open();
    }

    /* Wait out the age gate. Without this the catalog dwell timer can expire
       while the gate is still up, putting a second dialog behind the first. */
    function whenUnlocked(fn) {
      if (!document.body.classList.contains('gate-locked')) { fn(); return; }
      addEventListener('ascent:gate-closed', () => setTimeout(fn, 1200), { once: true });
    }

    function arm() {
      if (!eligible()) return;
      /* Preview exists to show the dialog, so it shows it. Sitting through an
         eight second dwell, or hunting for the right scroll position on home,
         to look at a design is the wrong trade; the real triggers below are
         what a visitor gets once an endpoint is configured. */
      if (preview) { whenUnlocked(() => setTimeout(tryOpen, 400)); return; }
      if (IS_SHOP) {
        // already on the catalog: intent is established, so time is the signal
        whenUnlocked(() => setTimeout(tryOpen, NEWSLETTER.dwellMs));
        return;
      }
      /* On home the signal is reaching the catalog section, which is the point
         where a reader has gone looking for compounds rather than landing. */
      const anchor = $('#catalog');
      if (!anchor || !('IntersectionObserver' in window)) return;
      /* rootMargin, not a ratio. A threshold is a fraction of the observed
         element, and #catalog is several viewports tall, so "0.2" meant "800px
         of it on screen" and would never resolve at all on a short viewport.
         This fires the moment the section's top edge rises into the lower
         third, which is what "reached the catalog" actually means. Same shape
         as observe()'s own rootMargin above. */
      const ob = new IntersectionObserver(entries => {
        if (!entries.some(en => en.isIntersecting)) return;
        ob.disconnect();
        whenUnlocked(tryOpen);
      }, { threshold: 0, rootMargin: '0px 0px -35% 0px' });
      ob.observe(anchor);
    }

    /* The site is genuinely bilingual and the switch sits in the nav, which
       stays reachable while this is open. Rebuilding preserves whatever has
       been typed so far, since re-rendering the form would otherwise clear the
       field out from under someone mid-address. */
    addEventListener('ascent:lang', () => {
      if (!el) return;
      const done = $('.nl-code', el);
      if (done) { $('.nl-body', el).innerHTML = successMarkup(done.textContent.trim()); return; }
      const typed = $('#nl-email', el) ? $('#nl-email', el).value : '';
      const focused = document.activeElement === $('#nl-email', el);
      el.innerHTML = markup();
      fitBigLine($('.nl-pct', el));
      $('#nl-email', el).value = typed;
      if (focused) $('#nl-email', el).focus({ preventScroll: true });
    });

    arm();
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

    /* THE WHOLE SECTION is hidden until there are real batch results, not just
       the chart. It used to hide only the plot and leave the floor grid and the
       heading standing — a section headed "Every batch is measured before it
       ships" that then showed no measurements. Better to say nothing than to
       promise evidence and show none.

       Nothing links to #verification, so hiding it leaves no dead anchor. Paste
       real COAs into assets/quality.js and the section returns on its own, chart
       and all — there is nothing to un-comment. */
    const section = $('#verification');
    if (section) section.hidden = rows.length === 0;

    fig.hidden = rows.length === 0;

    /* The section's lead ends "and show the results". Kept for when batches
       land: with data present it makes the full claim, and if the section is
       ever shown without a chart it falls back to one it can keep. */
    const lead = $('#verification .lead');
    if (lead) lead.textContent = t(rows.length ? 'q.lead' : 'q.leadPending');

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
  /* One hundred cells, of which `threshold` are verified compound. A unit grid
     rather than a proportional bar: at 99:1 a bar cannot show the 1: it lands
     a few pixels wide and the corner radius takes most of that. As cells the
     remainder is a discrete square you can point at and count, and the ratio
     stays exactly true — nothing is exaggerated to make it visible. */
  function renderFloorFigure() {
    const el = $('#q-floor');
    if (!el || typeof QUALITY === 'undefined') return;
    const mg = QUALITY.exampleVialMg, thr = QUALITY.threshold;
    const grid = el.querySelector('#q-units');

    const verified = Math.max(0, Math.min(100, thr));
    const whole = Math.floor(verified);
    const frac = verified - whole;              // e.g. a 99.5 floor
    let cells = '';
    for (let i = 0; i < 100; i++) {
      if (i < whole) cells += '<i class="is-v"></i>';
      // the straddling cell is split at the fraction rather than rounded, so a
      // fractional floor is not quietly turned into a whole cell either way
      else if (i === whole && frac > 0) cells += `<i class="is-p" style="--p:${(frac * 100).toFixed(1)}%"></i>`;
      else cells += '<i></i>';
    }
    grid.innerHTML = cells;
    grid.setAttribute('aria-label', t('q.unitsAlt', { thr }));

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

  /* The research entries used to end with a "find it in the catalogue" link.
     It was navigational rather than an add-to-cart, which was the line this
     section was originally built to stay behind, but that line turns out to be
     in the wrong place: what makes a trial summary into labelling is that it
     sits beside a route to buy the thing, not whether the route is one tap or
     two. The link is gone, so the resolver that mapped an entry to a
     purchasable name has gone with it, and EXPLORE_CATALOG_ALIAS is now unused
     data. focusCompoundFromURL is kept, since nothing generates ?compound=
     links any more but any already shared should still land somewhere sane. */
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

  /* No show-all toggle any more. On home it is a link to /catalog; on the
     catalog page everything is already shown. */
  const searchEl = $('#cat-search');
  if (searchEl) {
    searchEl.addEventListener('input', () => { query = searchEl.value; renderProducts(); });
    const clear = $('#cat-search-clear');
    if (clear) clear.addEventListener('click', () => {
      searchEl.value = ''; query = ''; renderProducts(); searchEl.focus();
    });
  }

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
  renderAppDate();
  let qResize;
  addEventListener('resize', () => {
    clearTimeout(qResize);
    qResize = setTimeout(() => { renderQuality(); renderAppDate(); }, 150);
  });
  /* Minimal surface for other page scripts. Currency formatting has to live in
     one place: checkout showing a different total from the cart is the kind of
     mismatch that produces disputes. */
  window.AscentFX = {
    priceHTML, priceText, cop, toCop,
    rate: () => trm,
  };
  /* Checkout re-reads the cart from localStorage rather than sharing state, so
     it needs the same pricing rules — otherwise a subscription line could be
     discounted in the drawer and full price at payment. */
  /* checkout.js reads pricing from here rather than reimplementing it, so a
     line discounted in the drawer cannot be charged differently at payment. */
  renderMarketPicker();
  window.AscentMarket = {
    code: () => MARKET,
    set: setMarket,
    config: () => market(),
    carries: (n, sz) => carries(MARKET, n, sz),
    inStock: (n, sz) => inStock(MARKET, n, sz),
    amount: localAmount,
    format: (a) => fmtMoney(a, market().currency, market().locale),
  };
  window.AscentPricing = { unitPrice, unitBase };
  window.AscentCharge = { html: chargeHTML, inCop: chargedInCop, syncNotes: syncFxNotes };
  /* The order page clears the cart on an approved payment and needs the badge
     and drawer to catch up. */
  window.AscentCart = {
    refresh() {
      try { order = JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { order = []; }
      renderCart();
    },
  };
  loadTRM().then(() => dispatchEvent(new Event('ascent:fx-ready')));
  loadGeo();

  exInit();
  observe();
})();
