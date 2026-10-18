import { readFileSync } from 'node:fs';
const tokens = JSON.parse(readFileSync(new URL('./src/design/tokens.json', import.meta.url), 'utf8'));

/** Theme keys are REPLACED, not extended: off-palette classes do not exist (Build Brief, section 3). */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    colors: tokens.colors,
    fontSize: Object.fromEntries(Object.entries(tokens.fontSize).map(([k, v]) => [k, [v, { lineHeight: '1.4' }]])),
    fontWeight: tokens.fontWeight,
    fontFamily: { sans: ['"DM Sans"', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'] },
    extend: {},
  },
  plugins: [],
};
