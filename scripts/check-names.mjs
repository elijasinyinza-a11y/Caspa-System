// Fails the build on retired product names, removed concepts or real organisation names (Build Brief rule 7).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FORBIDDEN = [
  /Karis Strategy/i, /Karis Cascade/i, /Cascade Engine/i, /Karis Plan/i, /Karis Performance/i,
  /KarisLearning/i, /Karis D.Cesion/i, /\bSLI\b/, /Strategy Leadership Index/i,
  /\bLpWSC\b/i, /Luapula/i,
];
const roots = ['src', 'index.html'];
// The contract is copied verbatim and records SLI's removal in its header, so it is exempt.
const EXEMPT = new Set([join('src', 'contract', 'caspa-data-contract.ts')]);
const hits = [];
const walk = (p) => {
  if (statSync(p).isDirectory()) return readdirSync(p).forEach((f) => walk(join(p, f)));
  if (!/\.(ts|tsx|json|html|css)$/.test(p) || EXEMPT.has(p)) return;
  readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
    for (const re of FORBIDDEN) if (re.test(line)) hits.push(`${p}:${i + 1}  ${re}  ${line.trim()}`);
  });
};
roots.forEach(walk);
if (hits.length) { console.error('Forbidden names found:\n' + hits.join('\n')); process.exit(1); }
console.log('check-names: clean');
