import { describe, expect, it } from 'vitest';
import type { FourQCell } from '../contract/caspa-data-contract';
import { en } from './en';

// BUILD-BRIEF section 21: each 4Q band uses the book's own cell names (Table 2).
const TABLE_2: [FourQCell, string][] = [
  [{ band: 'retraction', column: 'successes' }, 'Past successes'],
  [{ band: 'retraction', column: 'success_factors' }, 'Critical success factors'],
  [{ band: 'retraction', column: 'failures' }, 'Past failures'],
  [{ band: 'retraction', column: 'failure_factors' }, 'Critical failure factors'],
  [{ band: 'repositioning', column: 'successes' }, 'Present successes'],
  [{ band: 'repositioning', column: 'success_factors' }, 'Critical success factors'],
  [{ band: 'repositioning', column: 'failures' }, 'Present failures'],
  [{ band: 'repositioning', column: 'failure_factors' }, 'Critical failure factors'],
  [{ band: 'projection', column: 'opportunities' }, 'Predicted future opportunities'],
  [{ band: 'projection', column: 'key_strategic_actions' }, 'Key strategic actions'],
  [{ band: 'projection', column: 'risks' }, 'Predicted future risks'],
  [{ band: 'projection', column: 'risk_strategies' }, 'Risk management strategies'],
];

describe('4Q cell names (Table 2)', () => {
  it.each(TABLE_2)('%o is "%s"', (cell, name) => {
    expect(en.fourQ.cellName(cell)).toBe(name);
  });
  it('prefixes the band in the full cell label', () => {
    expect(en.fourQ.cell({ band: 'retraction', column: 'failures' })).toBe('Retraction: Past failures');
    expect(en.fourQ.cell({ band: 'repositioning', column: 'failure_factors' })).toBe('Repositioning: Critical failure factors');
  });
});
