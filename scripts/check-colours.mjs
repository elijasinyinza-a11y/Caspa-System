// Fails the build on any hex colour outside the approved token set (Build Brief rule 8).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const tokens = JSON.parse(readFileSync('src/design/tokens.json', 'utf8'));
const allowed = new Set();
const collect = (o) => Object.values(o).forEach((v) => (typeof v === 'string' ? allowed.add(v.toUpperCase()) : collect(v)));
collect(tokens.colors);
const hits = [];
const walk = (p) => {
  if (statSync(p).isDirectory()) return readdirSync(p).forEach((f) => walk(join(p, f)));
  if (!/\.(ts|tsx|html|css)$/.test(p)) return;
  readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)) {
      if (!allowed.has(m[0].toUpperCase())) hits.push(`${p}:${i + 1}  ${m[0]}`);
    }
  });
};
['src', 'index.html'].forEach(walk);
if (hits.length) { console.error('Colours outside tokens:\n' + hits.join('\n')); process.exit(1); }
console.log('check-colours: clean');
