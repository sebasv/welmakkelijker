#!/usr/bin/env node
// check-drift.mjs
//
// Fetches the Belastingdienst's own client-side betalingskenmerk widget and
// checks whether the two pieces our calculator depends on still match what we
// reverse-engineered and verified on 2026-07-20:
//   - the elfproef weight array used by the check-digit function, and
//   - the full tabelA (letter -> middelcode + slotcijfer-length rules).
//
// Writes status.json. The page reads status.json (same origin, no CORS issue)
// and shows it as a small badge. This script must run somewhere without
// browser CORS restrictions — a scheduled CI job (see the workflow), not the
// browser: belastingdienst.nl's static assets are not CORS-enabled for
// cross-origin browser fetches.
//
// A drift here does not by itself mean the output is wrong — the per-letter
// assembly logic is not diffed (it is code, not data). It is a tripwire: if
// the data these tables hold changes, re-verify against the official zoekhulp
// before trusting the tool.
//
// Usage: node check-drift.mjs > status.json

const SOURCE_URL = 'https://www.belastingdienst.nl/common/js/iah/betalingskenmerk.js';

const REFERENCE = {
  weights: [2, 4, 8, 5, 10, 9, 7, 3, 6, 1, 2, 4, 8, 5, 10],
  // tabelA object literal, whitespace-stripped, exactly as it appears in source.
  tabelA:
    'tabelA:{A:{middelForBetken:"0",slotcijfers:{minlength:6,maxlength:6}},B:{middelForBetken:"1",slotcijfers:{minlength:6,maxlength:6}},D:{middelForBetken:"3",slotcijfers:{minlength:6,maxlength:6}},E:{middelForBetken:"4",slotcijfers:{minlength:6,maxlength:6}},F:{middelForBetken:"5",slotcijfers:{minlength:6,maxlength:6}},L:{middelForBetken:"6",slotcijfers:{minlength:6,maxlength:6}},H:{middelForBetken:"70",slotcijfers:{minlength:4,maxlength:4}},N:{middelForBetken:"73",slotcijfers:{minlength:4,maxlength:4}},Y:{middelForBetken:{"0-9999":"76","90001-99999":"88"},slotcijfers:{minlength:1,maxlength:6}},T:{middelForBetken:{1:"23",2:"24",3:"25",4:"26"},slotcijfers:{minlength:6,maxlength:7}},V:{middelForBetken:{"00":"74",80:"80",81:"81",82:"82",83:"83",84:"84",85:"92",86:"93",87:"94",88:"95",89:"96"},slotcijfers:{minlength:6,maxlength:6}},W:{middelForBetken:"75",slotcijfers:{minlength:5,maxlength:5}},Z:{middelForBetken:{1:"97",2:"97",7:"85",8:"86"},slotcijfers:{minlength:6,maxlength:6}},M:{middelForBetken:{"0-9999":"78","90001-99999":"87"},slotcijfers:{minlength:1,maxlength:6}}}',
  verifiedOn: '2026-07-20',
};

function extractWeights(src) {
  const anchor = src.indexOf('n<=14');
  if (anchor === -1) return null;
  const win = src.slice(Math.max(0, anchor - 400), anchor + 50);
  const m = win.match(/\[(\d{1,2}(?:,\d{1,2}){14})\]/);
  if (!m) return null;
  return m[1].split(',').map(Number);
}

function extractTabelA(src) {
  const key = 'tabelA:{';
  const start = src.indexOf(key);
  if (start === -1) return null;
  let depth = 0;
  for (let j = start + key.length - 1; j < src.length; j++) {
    const c = src[j];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return src.slice(start, j + 1).replace(/\s+/g, '');
    }
  }
  return null;
}

function arraysEqual(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);
}

async function main() {
  const status = {
    checked_at: new Date().toISOString(),
    source_url: SOURCE_URL,
    verified_on: REFERENCE.verifiedOn,
  };

  try {
    const res = await fetch(SOURCE_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const src = await res.text();

    const weights = extractWeights(src);
    const tabelA = extractTabelA(src);

    if (!weights || !tabelA) {
      status.state = 'unknown';
      status.note =
        'Kon de relevante code niet meer terugvinden in de bron — de structuur is ' +
        'genoeg gewijzigd dat de patroon-match faalt. Handmatige controle nodig; ' +
        'dit betekent niet per se dat de uitkomst fout is.';
    } else {
      const weightsOk = arraysEqual(weights, REFERENCE.weights);
      const tabelAOk = tabelA === REFERENCE.tabelA;

      if (weightsOk && tabelAOk) {
        status.state = 'ok';
        status.note = 'Komt overeen met de officiële bron.';
      } else {
        status.state = 'drift';
        status.note = 'Afwijking gevonden ten opzichte van de officiële bron. Controleer voor gebruik.';
        status.details = { weightsOk, tabelAOk, found: { weights, tabelA } };
      }
    }
  } catch (err) {
    status.state = 'unknown';
    status.note = 'Kon de officiële bron niet bereiken: ' + err.message;
  }

  process.stdout.write(JSON.stringify(status, null, 2) + '\n');
}

main();
