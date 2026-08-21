# Ascent Labs website

Static pages plus one small serverless function. Everything the visitor
interacts with is plain HTML, CSS and JavaScript; there is no database and no
build step to run.

## Hosting: this needs a host that runs functions

`api/geo.js` reads the country the request came from and is what puts a
visitor into the right market. **On a static-only host it returns 404, every
visitor silently falls back to the US market, and nothing reports an error** —
Colombian buyers would simply be quoted dollars. That is the one real
constraint.

Vercel is what it was built and tested on: drop this folder on a project and
`api/` and `vercel.json` are picked up automatically. Netlify works if the
function is moved to `netlify/functions/` and the header it reads is changed
to Netlify's equivalent. Plain Apache, nginx or cPanel hosting will serve the
pages but cannot run the function.

Then point ascentcompounds.com at it.

## This build is domain-specific

It was generated for **https://ascentcompounds.com**. That origin is baked into the canonical
tags, the hreflang pairs, the sitemap and robots.txt. Serving it from a
different domain will work, but search engines will be told the canonical
version lives at the address above.

If the domain changes, ask for a rebuild rather than editing the files. It is
one command.

## Clean URLs

Several paths are served by files with different names. On Vercel this is all
in `vercel.json`, included here, and nothing needs doing.

    /explore  /investigacion  ->  /explore.html
    /catalog  /catalogo       ->  /shop.html
    /checkout                 ->  /checkout.html
    /order                    ->  /order.html

On Netlify the same rules go in a `_redirects` file with a 200 status. On
Apache, the equivalent RewriteRules.

## Three markets, decided by IP

The same pages serve the United States, Colombia and Mexico. What changes is
currency, prices, which compounds appear, and what is in stock — never the
product descriptions or research content, which are identical everywhere.

There is no market picker on the site, deliberately: the three are supplied
independently, so their prices differ, and a visible toggle would invite a
comparison between them. `?market=CO`, `?market=MX` and `?market=US`
force a market for demos, testing and support, and `?market=auto` hands the
visitor back to geolocation. An override sticks until `auto` clears it.

## Payment is not connected yet

The cart, quantities, the research-use acknowledgement, address capture,
validation and totals all work. The final step does not: submitting the
checkout form validates everything, then shows a "not connected" message.

**Sequence the launch around this.** Put the build up, wire Wompi, then point
the public at it. A buyer reaching the live site before the last step is
connected will fill in the whole form and hit a dead end.

See PAYMENT-HANDOFF.md.

## What is in here

- Home, in English and Spanish, switched by the toggle in the nav
- A research explorer at /explore and /investigacion
- 14 research-area pages under /research/ and /investigacion-area/
- 53 compounds across 87 sizes, priced separately for each of the three markets
- Age and research-use gate, shown once per visitor per 30 days
- sitemap.xml, ready to submit to Google Search Console

## After it is live

Submit https://ascentcompounds.com/sitemap.xml in Google Search Console. The preview was blocked
from search on purpose; this build is not, so indexing will start on its own,
but the sitemap speeds it up.
