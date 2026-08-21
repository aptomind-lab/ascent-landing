/* ===========================================================================
   Which country the request came from.

     GET /api/geo  ->  { "country": "CO" }

   Vercel resolves the IP at the edge and hands it over as a header, so there
   is no IP database here, no third-party lookup and no IP address in the
   response. The client gets a two-letter country code and nothing else.

   THE CACHE HEADER IS THE WHOLE THING. This route sits behind the same CDN as
   the static files, and a cached response here would pin every later visitor
   to the first one's country — Colombian prices for a US buyer, or the other
   way round, with no error anywhere to show for it. no-store, and a Vary on
   the header the answer is derived from, so it cannot be shared between two
   requests that disagree.
   =========================================================================== */

module.exports = (req, res) => {
  /* x-vercel-ip-country is set by the platform on the way in. A client cannot
     forge it: whatever a browser sends under that name is overwritten before
     the function sees it. It is absent in local dev and for requests the edge
     could not place, which is why the empty string falls through to the
     client's own default rather than guessing a country. */
  const country = (req.headers['x-vercel-ip-country'] || '').toUpperCase();

  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Vary', 'x-vercel-ip-country');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).send(JSON.stringify({ country: /^[A-Z]{2}$/.test(country) ? country : null }));
};
