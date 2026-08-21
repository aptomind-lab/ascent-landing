# Wiring up Wompi

Everything up to payment already works: cart, quantities, the research-use
acknowledgement, address capture, validation, and per-market totals.

## Where it plugs in

`assets/checkout.js`, in the form submit handler, marked in the source as
THE ONLY PLATFORM-SPECIFIC LINE. At that point `payload` holds:

    payload.<form fields>   name, email, phone, address, city, region, postal, country
    payload.items           [{ name, size, price, qty }]
    payload.total           number
    payload.currency        "USD" or "COP"   <- read this before using total
    payload.market          "US", "CO" or "MX"

Today it logs that object and shows a "not connected" message. Replace that one
call with a POST to your own endpoint.

## Read payload.currency. Do not assume dollars.

**`payload.total` is in dollars for the US and Mexico and in Colombian
pesos for Colombia.** The three markets are priced from independent suppliers,
so Colombia has its own peso price list rather than a conversion of the dollar
one. A server that assumes USD and multiplies a Colombian order by the TRM
would charge it roughly three thousand times over.

`payload.items[].price` is a different number again — it is the raw USD
catalogue figure, kept as the canonical value so a cart survives a market
change. It is not what the buyer was quoted. Use `total`, with
`currency`.

## Amounts

Wompi charges in Colombian pesos, in **cents**.

    currency === "COP"   amount_in_cents = total * 100
    currency === "USD"   convert first, then * 100

For the USD markets the site already shows the buyer a peso figure beside the
dollar one, and the charge should match what they were shown. It is computed as:

    pesos = round(usd * TRM * 1.02 / 100) * 100

where TRM is the official rate from
`https://www.datos.gov.co/resource/32sa-8pi3.json` (most recent
`vigenciadesde`), and 1.02 is a 2% buffer against intraday movement. Same
source and same formula server-side keeps the charge and the quote in
agreement. `assets/site.js` has this as `toCop()`.

The server should still decide the final peso amount rather than trusting a
number posted from the browser.

## The part that must not be got wrong

**The Wompi integrity signature has to be computed on a server, never in the
browser.** It is a SHA256 over reference + amount + currency + your integrity
secret. Putting that secret in client-side JavaScript publishes it, and anyone
can then forge an amount and pay one peso for any order. There is no way to
detect that after the fact from the front end.

So: POST `payload` to your own endpoint, build the reference and compute
the signature there, and return the signed payload for the redirect.

## The confirmation page is already built

Set Wompi's redirect URL to:

    https://ascentcompounds.com/order?id=<transaction_id>

`assets/order.js` already looks the transaction up against
`https://production.wompi.co/v1/transactions/{id}` and maps APPROVED,
PENDING, DECLINED and VOIDED onto the four states the page renders, clearing
the cart only on approval. Nothing to write there.

`?status=approved|pending|declined|error` renders each state without a
real transaction, for checking the page.

## Where to put the endpoint

`api/` already exists and already runs — `api/geo.js` is live in it.
An `api/checkout.js` beside it needs no new configuration.

## Currency and pricing live in one place

`assets/site.js` exports `window.AscentPricing.unitPrice(item)` and
`window.AscentMarket`, and checkout.js reads through them rather than
reimplementing anything. Keep that. A line priced one way in the cart and
charged another at payment is the kind of mismatch that becomes a chargeback.
