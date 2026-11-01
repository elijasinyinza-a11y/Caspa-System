/**
 * A KPI's baseline (BUILD-BRIEF section 34, D11d-6). Pure: records in, a number out.
 * A KPI linked to a baseline measure reads its baseline from the measure, so the figure is held once. The number on
 * the KPI is used only where no measure is linked (imported KPIs).
 */
import type { Kpi } from '../contract/caspa-data-contract';
import type { Store } from '../data/access/store';

export function kpiBaseline(s: Pick<Store, 'baselineMeasures'>, k: Pick<Kpi, 'baseline' | 'baselineMeasureId'>): number | null {
  if (k.baselineMeasureId) {
    const m = s.baselineMeasures.find((b) => b.id === k.baselineMeasureId);
    if (m) return m.value;
  }
  return k.baseline;
}
