/* ===========================================================================
   Affiliate policies and the record that someone accepted them.

   DRAFT TEXT. The wording below is a placeholder that shows how the screen
   works. The final text of the policies, terms and privacy notice must come
   from the owner's lawyer; when it does, change VERSION and the points, and
   every affiliate will be asked to accept the new version the next time they
   sign in.
   =========================================================================== */

const { query } = require('./db');

const VERSION = '2026-11-borrador-1';

const POINTS = {
  es: [
    'Los productos de Ascent Labs son RUO: solo para uso en investigación.',
    'Toda compra, recomendación y uso son bajo tu responsabilidad.',
    'Los Puntos solo se cambian por productos. No son dinero.',
    'Eres mayor de edad.',
  ],
  en: [
    'Ascent Labs products are RUO: for research use only.',
    'Every purchase, recommendation and use is your own responsibility.',
    'Points can only be exchanged for products. They are not money.',
    'You are of legal age.',
  ],
};

const TITLE = { es: 'Antes de empezar, lee esto', en: 'Before you start, please read this' };

function current(lang) {
  const l = lang === 'en' ? 'en' : 'es';
  return { version: VERSION, language: l, title: TITLE[l], points: POINTS[l] };
}

async function record(userId, { language, method, ip }) {
  await query(
    'INSERT INTO terms_acceptances (user_id, version, language, method, ip) VALUES ($1, $2, $3, $4, $5)',
    [userId, VERSION, language === 'en' ? 'en' : 'es', method, ip || null]);
}

/* True when the person has not accepted the version in force. */
async function needed(userId) {
  const rows = await query(
    'SELECT 1 FROM terms_acceptances WHERE user_id = $1 AND version = $2 LIMIT 1', [userId, VERSION]);
  return rows.length === 0;
}

module.exports = { VERSION, current, record, needed };
