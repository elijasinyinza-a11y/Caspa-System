// Fails the build on sector, place or currency words outside sample data, tests and the contract
// (Build Brief, section 14). Product code must work for any organisation, so it may not assume one.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

const FORBIDDEN = [
  // Sectors
  /\bwater\b/i, /\bsanitation\b/i, /\bsewer(age)?\b/i, /\bmeters?\b/i, /\bmetering\b/i, /\bpump(s|ing)?\b/i, /\butility\b/i,
  /\bhealth\b/i, /\bclinics?\b/i, /\bhospitals?\b/i, /\bpackaging\b/i, /\bfactory\b/i, /\bNGO\b/,
  // Places
  /\bZambia(n)?\b/i, /\bLusaka\b/i, /\bNdola\b/i, /\bCopperbelt\b/i, /\bUganda\b/i, /\bKampala\b/i, /\bKenya\b/i, /\bNairobi\b/i, /\bRwanda\b/i, /\bKigali\b/i,
  // Currencies named in words, and the sample's own currency codes
  /\bkwacha\b/i, /\bngwee\b/i, /\bshillings?\b/i, /\bfrancs?\b/i, /\bZMW\b/, /\bKES\b/,
];
// Sample data, tests and the verbatim contract may name these things; product code may not.
const EXEMPT_DIRS = [join('src', 'data', 'sample') + sep, join('src', 'contract') + sep];
const exempt = (p) => EXEMPT_DIRS.some((d) => p.startsWith(d)) || /\.test\.tsx?$/.test(p);
// The ISO 4217 minor-unit table lists currency codes as data, not as assumptions.
const ALLOWED_LINES = [/^\s*(BIF|BHD):/];

const hits = [];
const walk = (p) => {
  if (statSync(p).isDirectory()) return readdirSync(p).forEach((f) => walk(join(p, f)));
  if (!/\.(ts|tsx|html|css|json)$/.test(p) || exempt(p)) return;
  readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
    if (ALLOWED_LINES.some((re) => re.test(line))) return;
    for (const re of FORBIDDEN) if (re.test(line)) hits.push(`${p}:${i + 1}  ${re}  ${line.trim()}`);
  });
};
['src', 'index.html'].forEach(walk);
if (hits.length) { console.error('Sector, place or currency words outside sample data:\n' + hits.join('\n')); process.exit(1); }
console.log('check-sector: clean');
