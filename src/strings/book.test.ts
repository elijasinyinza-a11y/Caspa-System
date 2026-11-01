/** Framework explanations (Build Brief, sections 20 and 33): every confirmed line keeps its page reference, and no source string exists. */
import { describe, expect, it } from 'vitest';
import { en } from './en';

type Line = { text: string; page: string };
const lines = (): Line[] => {
  const b = en.book;
  return [
    b.sixP, b.decisionMap, b.sevenC, b.fourQ,
    ...Object.values(b.sixPLevel), ...Object.values(b.sevenCStage), ...Object.values(b.fourQBand),
  ];
};

describe('framework explanations', () => {
  it('keeps a page reference on every confirmed line', () => {
    const all = lines();
    expect(all.length).toBe(20);
    for (const l of all) {
      expect(l.text.length).toBeGreaterThan(0);
      expect(l.page).toMatch(/^\d/);
    }
  });

  // Any use of the deleted string fails the typecheck; this keeps it from being added back.
  it('has no source string', () => {
    expect('source' in en.explain).toBe(false);
  });
});
