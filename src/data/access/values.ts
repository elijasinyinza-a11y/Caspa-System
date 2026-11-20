/**
 * Saving a plan's corporate values (v0.29.0; Corporate Values Specification v0.1; contract v1.21). One helper for the
 * three places values are written: the forming vision step, the import door's vision step and the Strategy landing.
 * Who may write is each caller's check (the Executive, `VisionStatement: draft`); this only reconciles the list.
 */
import type { Id, Stamp, VisionStatement } from '../../contract/caspa-data-contract';
import { valuesOf, type ValueInput } from '../../rules/values';
import type { Store } from './store';

type Audit = (action: string, entity: { type: string; id: string }, before: unknown, after: unknown) => void;

/** Make the plan's values match `list`, in order: update in place, add new ones, remove the rest. Each change is audited. */
export function saveValues(s: Store, planId: string, list: readonly ValueInput[], stamp: () => Stamp, audit: Audit, confirm = false): void {
  const existing = valuesOf(s.visionStatements, planId);
  const used = new Set(s.visionStatements.map((x) => x.id as string));
  let n = 0;
  const nextId = () => { let id: string; do id = `vs-${planId}-value-${++n}`; while (used.has(id)); used.add(id); return id as Id<'VisionStatement'>; };
  list.forEach((v, i) => {
    const name = v.name.trim();
    const text = v.text.trim();
    const cur = existing[i];
    // v0.32.0: where the value came from in group work travels with it (contract v1.23).
    const from = (v.fromCandidateIds ?? []) as Id<'ValueCandidate'>[];
    const sameFrom = (cur?.fromCandidateIds ?? []).join() === from.join();
    if (cur) {
      if (cur.name === name && cur.text === text && cur.order === i + 1 && sameFrom && !confirm) return;
      const before = structuredClone(cur);
      Object.assign(cur, { name, text, order: i + 1, updated: stamp(), ...(confirm ? { confirmation: stamp() } : {}) });
      if (from.length) cur.fromCandidateIds = [...from]; else delete cur.fromCandidateIds;
      audit('update', { type: 'VisionStatement', id: cur.id }, before, structuredClone(cur));
    } else {
      const rec: VisionStatement = {
        orgId: s.organisation.id, created: stamp(), updated: stamp(),
        id: nextId(), planId: planId as Id<'StrategicPlan'>, kind: 'value', name, text, order: i + 1, confirmation: confirm ? stamp() : null,
        ...(from.length ? { fromCandidateIds: [...from] } : {}),
      };
      s.visionStatements.push(rec);
      audit('create', { type: 'VisionStatement', id: rec.id }, null, structuredClone(rec));
    }
  });
  for (const gone of existing.slice(list.length)) {
    s.visionStatements.splice(s.visionStatements.indexOf(gone), 1);
    audit('delete', { type: 'VisionStatement', id: gone.id }, structuredClone(gone), null);
  }
}
