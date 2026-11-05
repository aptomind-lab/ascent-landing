# Superseded

This file described how to wire Wompi in. That is done: the checkout, the signed
Wompi redirect, the webhook, the order page and an admin panel are all built and
tested.

Read **BACKEND.md** instead. It covers setup (database, environment variables,
the Wompi webhook), how prices, discounts and commissions are calculated, and how
to use `/admin`.

One point from the old note still stands and is enforced in code: the Wompi
integrity signature is computed only on the server (`api/_lib/wompi.js`), never
in the browser, and the amount charged is always the server's own calculation.
