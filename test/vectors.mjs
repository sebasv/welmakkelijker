#!/usr/bin/env node
// Runs the 25 test vectors embedded in the Belastingdienst's own source against
// the algorithm actually shipped in index.html. No duplicated algorithm: the
// code block is extracted from the page and evaluated, so this fails the moment
// the shipped logic drifts from the reference. Run: node test/vectors.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'index.html'), 'utf8');

// The DOM-free algorithm block: from TABEL_A up to the PDF-extraction marker.
const start = html.indexOf('const TABEL_A');
const end = html.indexOf('// ---------- PDF text extraction');
const code = html.slice(start, end);
const scope = {};
new Function('exports', code + '\nexports.computeResult = computeResult; exports.computeBtwLh = computeBtwLh;')(scope);
const { computeResult, computeBtwLh } = scope;

const norm = (s) => s.replace(/[ .]/g, '');

// [lettercode, fiscaalnummer, slotcijfers, expected betalingskenmerk]
const direct = [
  ['H', '10002169', '1010', '5010.0021.6701.0010'],
  ['H', '10002169', '4221', '3010.0021.6704.2021'],
  ['L', '1041149', '109100', '0001.0411.4691.0100'],
  ['L', '1041149', '128501', '9001.0411.4681.2501'],
  ['Y', '17166779', '0', '2017.1667.7760.0001'],
  ['Y', '17166779', '534231', '0017.1667.7885.4231'],
  ['T', '49244486', '800052', '8049.2444.8248.0005'],
  ['T', '49244486', '8000552', '2049.2444.8240.0055'],
  ['V', '849613073', '991002', '3961.3079.9841.0020'],
  ['W', '10002169', '10014', '7010.0021.6751.0014'],
  ['Z', '10002169', '230101', '0010.0021.6972.3011'],
  ['Z', '10002169', '230107', '5010.0021.6852.3010'],
  ['M', '49230761', '24589', '1049.2307.6782.4589'],
  ['M', '49230761', '294589', '3049.2307.6872.4589'],
  ['Y', '808980191', '209000', '1808.9801.9762.9000'],
  ['M', '808980191', '209003', '8808.9801.9782.9003'],
];

// [ob/lh-nummer, jaar, tijdvakcode, expected betalingskenmerk]
const btw = [
  ['001041149B01', 2012, '08', '2001.0411.4120.1080'],
  ['001041149B01', 2023, '24', '4001.0411.4130.1240'],
  ['001041149B01', 2024, '31', '1001.0411.4140.1310'],
  ['001041149B01', 2022, '23', '6001.0411.4120.1230'],
  ['001041149B01', 2022, '40', '2001.0411.4120.1400'],
  ['849613073L03', 2020, '03', '6849.6130.7600.3030'],
  ['849613073L03', 2018, '74', '6849.6130.7680.3740'],
  ['849613073L03', 2019, '32', '4849.6130.7690.3320'],
  ['849613073L03', 2031, '40', '1849.6130.7610.3400'],
];

let pass = 0;
const fails = [];
for (const [L, bsn, slot, exp] of direct) {
  const raw = bsn.padStart(9, '0') + '.' + L + '.' + slot;
  const r = computeResult(raw);
  const got = r.ok ? norm(r.betalingskenmerk) : 'ERR:' + r.message;
  if (got === norm(exp)) pass++;
  else fails.push(`direct ${L} ${bsn} ${slot} -> ${got} (exp ${norm(exp)})`);
}
for (const [raw, y, tv, exp] of btw) {
  const r = computeBtwLh(raw, String(y), tv);
  const got = r.ok ? norm(r.betalingskenmerk) : 'ERR:' + r.message;
  if (got === norm(exp)) pass++;
  else fails.push(`btwlh ${raw} ${y} ${tv} -> ${got} (exp ${norm(exp)})`);
}

console.log(`${pass}/${direct.length + btw.length} vectors pass`);
if (fails.length) {
  fails.forEach((f) => console.error('FAIL', f));
  process.exit(1);
}
