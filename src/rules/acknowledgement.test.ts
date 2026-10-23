import type { ISODate, ISODateTime } from "../contract/caspa-data-contract";
import {
  countFindings,
  createMemoryRepository,
} from "../data/access/repository";
import { createSeed, DEV_ROLE_MEMBERSHIPS, FY, ORG } from "../data/sample/seed";
import { acknowledgementState } from "./acknowledgement";
import { computeFindings } from "./integrity";

const NOW = "2026-10-18" as ISODate;
const KPI_NO_OWNER = "STRUCT-KPI-NO-OWNER:Kpi:k1.1.1";
const ORPHAN = "STRUCT-BUDGETLINE-NO-ACTIVITY:BudgetLine:bl-5";
const at = (t: string) => t as ISODateTime;
const repo = (role: keyof typeof DEV_ROLE_MEMBERSHIPS, s = createSeed()) =>
  createMemoryRepository([s], ORG, DEV_ROLE_MEMBERSHIPS[role], NOW, {
    clock: () => at("2026-10-18T09:00:00Z"),
  });
const view = (r: ReturnType<typeof repo>, key: string) =>
  r.findings().find((v) => v.finding.key === key)!;

describe("acknowledging an advisory flag", () => {
  it("stores the reason with who and when, and keeps the flag listed but counted apart", () => {
    const s = createSeed();
    const r = repo("executive", s);
    expect(countFindings(r.findings())).toMatchObject({
      blocking: 1,
      advisory: 4,
      acknowledged: 0,
    });
    expect(
      r.acknowledge(
        KPI_NO_OWNER,
        "  Owner to be named when the new Commercial structure is confirmed.  ",
      ),
    ).toEqual({ ok: true });
    expect(s.acknowledgements).toHaveLength(1);
    expect(s.acknowledgements[0]).toMatchObject({
      findingKey: KPI_NO_OWNER,
      reason:
        "Owner to be named when the new Commercial structure is confirmed.",
      acknowledged: {
        at: "2026-10-18T09:00:00Z",
        byMembershipId: DEV_ROLE_MEMBERSHIPS.executive,
      },
    });
    const v = view(repo("executive", s), KPI_NO_OWNER);
    expect(v.ack).toMatchObject({ state: "acknowledged", on: "2026-10-18" });
    expect(countFindings(repo("executive", s).findings())).toMatchObject({
      blocking: 1,
      advisory: 3,
      acknowledged: 1,
      total: 5,
    });
    // Findings themselves are still computed, never stored.
    expect(
      computeFindings(s, { financialYear: FY }).map((f) => f.key),
    ).toContain(KPI_NO_OWNER);
  });

  it("never acknowledges a hard block", () => {
    const s = createSeed();
    const r = repo("executive", s);
    expect(view(r, ORPHAN).canAcknowledge).toBe(false);
    expect(r.acknowledge(ORPHAN, "We will sort it out later.")).toEqual({
      ok: false,
      error: "blocking",
    });
    expect(s.acknowledgements).toHaveLength(0);
  });

  it("needs a reason", () => {
    const s = createSeed();
    expect(repo("executive", s).acknowledge(KPI_NO_OWNER, "   ")).toEqual({
      ok: false,
      error: "reason_required",
    });
    expect(s.acknowledgements).toHaveLength(0);
  });

  it("refuses a second acknowledgement while the first still holds", () => {
    const s = createSeed();
    repo("executive", s).acknowledge(KPI_NO_OWNER, "First reason.");
    expect(
      repo("executive", s).acknowledge(KPI_NO_OWNER, "Second reason."),
    ).toEqual({ ok: false, error: "already_acknowledged" });
  });
});

describe("who may acknowledge (contract v1.3)", () => {
  it("lets the Executive acknowledge any advisory flag it can see", () => {
    for (const v of repo("executive").findings())
      expect(v.canAcknowledge, v.finding.key).toBe(
        v.finding.blocksAt.length === 0,
      );
  });

  it("does not let Finance acknowledge a flag that is not sent to it", () => {
    const s = createSeed();
    const r = repo("finance", s);
    const g3 = "STRUCT-GOAL-NO-FUNDED-ACTIVITY:Goal:g3";
    expect(view(r, g3).canAcknowledge).toBe(false);
    expect(r.acknowledge(g3, "Not funded this year.")).toEqual({
      ok: false,
      error: "not_allowed",
    });
  });

  it("lets a recipient acknowledge a flag sent to their position", () => {
    const s = createSeed();
    s.objectives.find((o) => o.code === "O1.1")!.ownerPositionId =
      "pos-co" as never; // K1.1.1 then goes to the Commercial Officer
    const r = repo("supervisor", s);
    expect(view(r, KPI_NO_OWNER).canAcknowledge).toBe(true);
    expect(r.acknowledge(KPI_NO_OWNER, "Owner named next week.")).toEqual({
      ok: true,
    });
  });

  it("treats a finding the viewer cannot see as not found", () => {
    expect(repo("employee").acknowledge(KPI_NO_OWNER, "x")).toEqual({
      ok: false,
      error: "not_found",
    });
  });
});

describe("lapse", () => {
  it("lapses when the record is updated after the acknowledgement, and holds otherwise", () => {
    const s = createSeed();
    repo("executive", s).acknowledge(KPI_NO_OWNER, "Owner to follow.");
    const f = () =>
      computeFindings(s, { financialYear: FY }).find(
        (x) => x.key === KPI_NO_OWNER,
      )!;
    expect(acknowledgementState(s, f()).state).toBe("acknowledged");
    const k = s.kpis.find((x) => x.id === "k1.1.1")!;
    k.updated = {
      at: at("2026-10-18T08:59:59Z"),
      byMembershipId: k.updated.byMembershipId,
    }; // before: still holds
    expect(acknowledgementState(s, f()).state).toBe("acknowledged");
    k.updated = {
      at: at("2026-10-20T10:00:00Z"),
      byMembershipId: k.updated.byMembershipId,
    }; // after: lapses
    expect(acknowledgementState(s, f()).state).toBe("lapsed");
    const v = view(repo("executive", s), KPI_NO_OWNER);
    expect(v.ack.state).toBe("lapsed");
    expect(v.canAcknowledge).toBe(true);
    expect(countFindings(repo("executive", s).findings())).toMatchObject({
      advisory: 4,
      acknowledged: 0,
    });
    // Acknowledging again stores a new record; the old one is kept.
    expect(
      createMemoryRepository([s], ORG, DEV_ROLE_MEMBERSHIPS.executive, NOW, {
        clock: () => at("2026-10-21T09:00:00Z"),
      }).acknowledge(KPI_NO_OWNER, "Still pending."),
    ).toEqual({ ok: true });
    expect(s.acknowledgements).toHaveLength(2);
    expect(acknowledgementState(s, f()).state).toBe("acknowledged");
  });

  it("ignores an acknowledgement whose finding has cleared, and does not carry it to a new finding", () => {
    const s = createSeed();
    repo("executive", s).acknowledge(KPI_NO_OWNER, "Owner to follow.");
    s.kpis.find((x) => x.id === "k1.1.1")!.ownerPositionId = "pos-hoc" as never;
    expect(
      computeFindings(s, { financialYear: FY }).some(
        (x) => x.key === KPI_NO_OWNER,
      ),
    ).toBe(false);
  });
});
