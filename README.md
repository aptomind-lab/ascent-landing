# Ascent Compounds website

Static site. No build step, no server, no database. Upload the contents of this
folder to any static host and it runs.

## Deploying

Netlify or Vercel: drag this folder onto their dashboard, or point the project
at it. Any normal web host: upload the contents to the public web root
(public_html, www, or similar).

Then point ascentcompounds.com at it.

## Clean URLs

Two paths need a rewrite rule, because they are served by a file with a
different name:

    /explore        ->  /explore.html
    /investigacion  ->  /explore.html

On Vercel this is already configured in vercel.json, included here.
On Netlify, add a _redirects file containing:

    /explore        /explore.html   200
    /investigacion  /explore.html   200

On Apache, add to .htaccess:

    RewriteRule ^explore$ explore.html [L]
    RewriteRule ^investigacion$ explore.html [L]

Without these two rules everything still works except those URLs. The research
section is also reachable from the nav.

## What is in here

- Home, in English and Spanish, switched by the toggle in the nav
- A research explorer at /explore and /investigacion
- 14 research-area pages under /research/ and /investigacion-area/
- 63 products, prices shown in USD with the Colombian peso equivalent
- Age and research-use gate, shown once per visitor per 30 days
- sitemap.xml, ready to submit to Google Search Console

## Not in here, on purpose

The checkout page. Card payment is not connected yet, so on a live site a buyer
could fill in the whole form and reach a dead end. Orders still go through
WhatsApp exactly as they do now. Checkout ships with the next version.

## After it is live

Submit https://ascentcompounds.com/sitemap.xml in Google Search Console. The
preview was blocked from search on purpose; this build is not, so indexing will
start on its own, but the sitemap speeds it up.
