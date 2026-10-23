/**
 * Acknowledgement state of a finding (contract v1.3). Pure: no React, no I/O, no system clock.
 * Hard blocks are never acknowledged. An advisory acknowledgement holds until the finding's subject
 * record is updated after it; then it lapses and the flag is open again.
 */
import type {
  Acknowledgement,
  Finding,
  ISODateTime,
} from "../contract/caspa-data-contract";
import type { Store } from "../data/access/store";
import { isBlocking } from "./integrity";

export type AckState =
  | { state: "open" }
  | { state: "acknowledged"; ack: Acknowledgement }
  | { state: "lapsed"; ack: Acknowledgement };

const AUDITED: Record<string, keyof Store> = {
  Goal: "goals",
  Objective: "objectives",
  Kpi: "kpis",
  Activity: "activities",
  BudgetLine: "budgetLines",
  Deficiency: "deficiencies",
  ContractObjective: "contractObjectives",
};

/** When the finding's subject record was last updated, or null if it is not an audited record. */
export const subjectUpdatedAt = (s: Store, f: Finding): ISODateTime | null => {
  const key = AUDITED[f.subject.type];
  if (!key) return null;
  const rec = (s[key] as { id: string; updated?: { at: ISODateTime } }[]).find(
    (r) => r.id === f.subject.id,
  );
  return rec?.updated?.at ?? null;
};

/** ISO date-times compared as instants, so offsets and precision cannot mislead the comparison. */
const after = (a: ISODateTime, b: ISODateTime): boolean =>
  Date.parse(a) > Date.parse(b);

export function acknowledgementState(s: Store, f: Finding): AckState {
  if (isBlocking(f)) return { state: "open" };
  const acks = s.acknowledgements.filter((a) => a.findingKey === f.key);
  if (acks.length === 0) return { state: "open" };
  const latest = acks.reduce((x, y) =>
    after(y.acknowledged.at, x.acknowledged.at) ? y : x,
  );
  const changed = subjectUpdatedAt(s, f);
  return changed && after(changed, latest.acknowledged.at)
    ? { state: "lapsed", ack: latest }
    : { state: "acknowledged", ack: latest };
}
