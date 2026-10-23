import type { ISODate, SixPLevel } from "../contract/caspa-data-contract";
import { aiStub, SAMPLE_EXPLANATIONS } from "../ai";
import { createMemoryRepository } from "../data/access/repository";
import { createSeed, DEV_ROLE_MEMBERSHIPS, FY, ORG } from "../data/sample/seed";
import { computeFindings, RULES } from "../rules/integrity";
import { fixTarget } from "./integrity";

const NOW = "2026-10-18" as ISODate;
const repo = (role: keyof typeof DEV_ROLE_MEMBERSHIPS, s = createSeed()) =>
  createMemoryRepository([s], ORG, DEV_ROLE_MEMBERSHIPS[role], NOW);

describe("fix links", () => {
  it("sends each seeded finding to the record that fixes it", () => {
    const s = createSeed();
    const fixes = Object.fromEntries(
      computeFindings(s, { financialYear: FY }).map((f) => [
        f.key,
        fixTarget(s, f),
      ]),
    );
    expect(fixes["STRUCT-BUDGETLINE-NO-ACTIVITY:BudgetLine:bl-5"]).toEqual({
      kind: "workspace",
      w: "plan",
    });
    expect(fixes["STRUCT-KPI-NO-OWNER:Kpi:k1.1.1"]).toMatchObject({
      kind: "node",
      node: "kpi",
      id: "k1.1.1",
      code: "K1.1.1",
    });
    expect(fixes["STRUCT-GOAL-NO-FUNDED-ACTIVITY:Goal:g3"]).toMatchObject({
      kind: "node",
      node: "goal",
      code: "G3",
    });
    expect(fixes["BOOK-GOAL-NO-WHY:Goal:g3"]).toMatchObject({
      kind: "node",
      node: "goal",
      code: "G3",
    });
    expect(
      fixes["STRUCT-DEFICIENCY-UNADDRESSED:Deficiency:def-5"],
    ).toMatchObject({ kind: "node", node: "objective", code: "O1.2" });
  });

  it("sends a changed contract objective to the activity that changed, and a 6P gap to the activity", () => {
    const s = createSeed();
    const a = s.activities.find((x) => x.code === "A1.2.1.3")!;
    a.quantityTarget = { value: 2000, unit: "meters" };
    a.decisionLevel = null as SixPLevel | null;
    const f = computeFindings(s, { financialYear: FY });
    expect(
      fixTarget(
        s,
        f.find((x) => x.ruleId === RULES.contractUpstreamChanged.id)!,
      ),
    ).toMatchObject({ node: "activity", id: a.id });
    expect(
      fixTarget(s, f.find((x) => x.ruleId === RULES.activityNo6P.id)!),
    ).toMatchObject({ node: "activity", id: a.id });
  });

  it("offers a workspace fix only to those who can open that workspace", () => {
    const orphan = (role: keyof typeof DEV_ROLE_MEMBERSHIPS) =>
      repo(role)
        .findings()
        .find((v) => v.finding.subject.id === "bl-5");
    expect(orphan("finance")?.fix).toEqual({ kind: "workspace", w: "plan" });
    expect(orphan("executive")?.fix).toEqual({ kind: "workspace", w: "plan" });
    // A viewer without Plan who is handed this finding gets no link, rather than a link that bounces.
    const s = createSeed();
    const employee = repo("employee", s);
    const f = computeFindings(s, { financialYear: FY }).find(
      (x) => x.subject.id === "bl-5",
    )!;
    expect(employee.describeFinding(f).fix).toBeNull();
  });
});

describe("routing to the viewer", () => {
  it("marks a finding as sent to the viewer only when it is routed to one of their positions", () => {
    // In the seed, every finding goes to a head of department, so no development role is a recipient.
    for (const role of ["executive", "finance"] as const)
      expect(
        repo(role)
          .findings()
          .every((v) => !v.routedToMe),
      ).toBe(true);
    // Make the Commercial Officer own O1.1: the ownerless K1.1.1 is then routed to them.
    const s = createSeed();
    s.objectives.find((o) => o.code === "O1.1")!.ownerPositionId =
      "pos-co" as never;
    const sup = repo("supervisor", s).findings();
    expect(
      sup.map((v) => [v.finding.subject.id, v.routedToMe, v.routedTo]),
    ).toEqual([["k1.1.1", true, ["Commercial Officer"]]]);
  });
});

describe("AI explanations", () => {
  it("has a labelled sample explanation for every rule, and never changes the findings", async () => {
    const s = createSeed();
    const before = computeFindings(s, { financialYear: FY }).map((f) => f.key);
    for (const rule of Object.values(RULES)) {
      expect(SAMPLE_EXPLANATIONS[rule.id], rule.id).toBeTruthy();
      const d = await aiStub.explainFinding({
        key: "x",
        ruleId: rule.id,
        subject: { type: "Goal", id: "g1" },
        message: "",
        blocksAt: [],
        routeToPositionIds: [],
      });
      expect(d.label).toBe("AI draft");
    }
    expect(computeFindings(s, { financialYear: FY }).map((f) => f.key)).toEqual(
      before,
    );
  });
});
