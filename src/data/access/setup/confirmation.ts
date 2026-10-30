/**
 * The structure's confirmation (D7-9): an AuditEntry with action "confirm" on the Organisation. It records who
 * confirmed, when, what was saved and every "worth checking" kind with its reason, or null when not marked as checked.
 */
import type { AuditEntry, Id, ISODateTime } from '../../../contract/caspa-data-contract';
import type { WorthKind } from '../../../rules/setup';
import type { Store } from '../store';

export interface StructureConfirmationRecord {
  units: number;
  positions: number;
  people: number;
  /** Each worth-checking kind found at confirmation, with how many items and the reason given, or null. */
  checked: { kind: WorthKind; count: number; reason: string | null }[];
}

export const CONFIRM_ACTION = 'confirm';

/** A past confirmation for an organisation seeded as already set up (the four existing sample organisations). */
export const seededConfirmation = (
  orgId: Id<'Organisation'>, byMembershipId: Id<'Membership'>, at: ISODateTime, counts: { units: number; positions: number; people: number },
): AuditEntry => ({
  id: `au-confirm-${orgId}` as Id<'AuditEntry'>, orgId, at, actorMembershipId: byMembershipId, action: CONFIRM_ACTION,
  entity: { type: 'Organisation', id: orgId }, before: null, after: { ...counts, checked: [] } satisfies StructureConfirmationRecord,
});

/** The first confirmation of the organisation's structure, or null if it has not been confirmed. */
export const structureConfirmation = (s: Store): AuditEntry | null =>
  s.auditEntries.find((a) => a.action === CONFIRM_ACTION && a.entity.type === 'Organisation' && a.entity.id === s.organisation.id) ?? null;
