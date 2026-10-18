/** Stable fingerprint of the parts of an activity a signed contract objective depends on. Pure. */
import type { Activity } from '../contract/caspa-data-contract';

const fnv1a = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
};

export const activityFingerprint = (a: Activity): string =>
  fnv1a(JSON.stringify([a.kpiId, a.title, a.decisionLevel, a.quantityTarget?.value ?? null, a.quantityTarget?.unit ?? null]));
