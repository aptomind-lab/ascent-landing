/* ==========================================================================
   Batch verification data
   --------------------------------------------------------------------------
   THIS FILE IS A RECORD. Every number here must come from a real COA / HPLC
   result. Do not invent, round up, estimate, or "fill in" a plausible value:
   the whole point of the chart it feeds is that the figures are real, and a
   fabricated one would do more damage than having no chart at all.

   To populate, add one entry per tested batch:

     { id: 'GHK-0412', compound: 'GHK-Cu', purity: 99.4, date: '2026-03' }

     id        your batch reference, or any stable anonymised label
     compound  display name, matching data.js where possible
     purity    HPLC area %, as reported on the COA
     date      'YYYY-MM' — optional, only used for ordering

   Batches that failed and were NOT shipped belong here too, with their real
   purity. They are the most credible thing on the page: a rejected batch is
   the only quality claim that visibly costs money. Mark them `shipped: false`.

   The section stays hidden until this array has entries, so an empty file is
   a safe state — the page simply omits the chart.
   ========================================================================== */

const QUALITY = {
  // the published floor, drawn as the threshold line
  threshold: 99,

  // vial sizes are quoted in mg; used for the "what the floor means" figure
  exampleVialMg: 10,

  batches: [
    // paste real batch results here
  ],
};
