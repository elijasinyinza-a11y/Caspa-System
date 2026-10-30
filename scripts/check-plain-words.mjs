// Fails the build when user-facing text uses system terms instead of plain labels (Clarity Specification v0.1,
// sections 4 and 12). It reads the string literals in the strings file; code, the contract, gate codes and audit
// records keep the system terms. With CASPA_PILOT=1 it also fails if any "[from the book]" placeholder remains.
import { readFileSync } from 'node:fs';

const FILE = 'src/strings/en.ts';
const FORBIDDEN = [
  /\bnodes?\b/i, /\blineage\b/i, /\bhard blocks?\b/i, /\badvisory flags?\b/i, /\bgates?\b/i, /\borphan/i,
  /\bintegrity\b/i, /\bfindings?\b/i, /\backnowledge(d|ment)?\b/i, /\brules engine\b/i,
];
const PLACEHOLDER = /\[from the book\]/i;
const pilot = process.env.CASPA_PILOT === '1';

const src = readFileSync(FILE, 'utf8');

/** The text parts of every string and template literal, skipping comments and `${…}` expressions (which may nest). */
function literals(code) {
  const out = [];
  let i = 0;
  const lineAt = (k) => code.slice(0, k).split('\n').length;
  const readTemplate = () => {
    // i is just past the opening backtick; collects the text parts, recursing into expressions.
    let text = '';
    const at = i;
    while (i < code.length && code[i] !== '`') {
      if (code[i] === '\\') { text += code[i + 1]; i += 2; continue; }
      if (code[i] === '$' && code[i + 1] === '{') { i += 2; scan(true); text += ' '; continue; }
      text += code[i++];
    }
    i++;
    out.push({ text, line: lineAt(at) });
  };
  const scan = (inExpr) => {
    let depth = 0;
    while (i < code.length) {
      const c = code[i];
      if (c === '/' && code[i + 1] === '/') { while (i < code.length && code[i] !== '\n') i++; continue; }
      if (c === '/' && code[i + 1] === '*') { i = code.indexOf('*/', i + 2) + 2; continue; }
      if (c === "'" || c === '"') {
        const at = i++;
        let text = '';
        while (i < code.length && code[i] !== c && code[i] !== '\n') { if (code[i] === '\\') i++; text += code[i++]; }
        i++;
        out.push({ text, line: lineAt(at) });
        continue;
      }
      if (c === '`') { i++; readTemplate(); continue; }
      if (inExpr && c === '{') depth++;
      if (inExpr && c === '}') { if (depth === 0) { i++; return; } depth--; }
      i++;
    }
  };
  scan(false);
  return out;
}

// Import paths and keys that are not shown to people.
const ignore = (t) => /^\.\.?\//.test(t) || /^[a-z_]+(\.[a-z_]+)+$/.test(t) || /^[A-Z]+(-[A-Z0-9]+)+$/.test(t);

const hits = [];
for (const { text, line } of literals(src)) {
  if (ignore(text)) continue;
  for (const re of FORBIDDEN) if (re.test(text)) hits.push(`${FILE}:~${line}  ${re}  “${text.trim()}”`);
  if (pilot && PLACEHOLDER.test(text)) hits.push(`${FILE}:~${line}  unconfirmed placeholder  “${text.trim()}”`);
}
if (hits.length) {
  console.error('System terms in user-facing text (use the plain labels in Clarity Specification section 4):\n' + hits.join('\n'));
  process.exit(1);
}
console.log(`check-plain-words: clean${pilot ? ' (pilot build: no placeholders)' : ''}`);
