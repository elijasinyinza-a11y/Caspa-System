# CASPA™ Frontend — Build Brief v1.1

Read this whole file before writing any code. Put it in the repository root and treat it as the instructions for this build. Section 12 says which source wins when sources disagree; section 13 records the decisions behind v1.1.

## 1. What you are building

CASPA™ is a strategy execution platform: it traces every budget line, KPI and employee objective back to the strategic goal it serves, and checks that the chain holds. One product, four workspaces — **Strategy, Cascade, Plan, Performance** — on one shared data model.

This build is **frontend first**. There is no backend yet. All data comes from an in-memory sample store behind a data-access layer that the real backend will replace later without changes to the screens.

The build is done in Claude chat sessions within the CASPA™ Project. Each slice is delivered twice from the same code: as a zip of the repository, and as a single self-contained HTML build published for review. The zip is added to the Project files so the next session can continue.

## 2. Rules you must never break

1. **One source of truth.** Every total, percentage, count, progress figure, status and finding is computed from stored records by a selector or the rules engine. Never hard-code a figure in a component. Never store a computed value.
2. **The contract is fixed.** `src/contract/caspa-data-contract.ts` is the data contract (v1.3). Copy it in unchanged. If a screen seems to need a new field, stop and ask; do not add it.
3. **Rules engine separate from screens.** Integrity rules, gates, KPI progress and ratings are pure TypeScript functions in `src/rules`. No React, no I/O, no dates from the system clock (pass "now" in). They must run unchanged on a server later.
4. **The AI is stubbed.** Anything AI does (explain a finding, draft text, extract from documents) goes through `src/ai`, which in this build returns fixed sample text labelled "AI draft". The AI never decides, scores, confirms or clears anything.
5. **Permissions are enforced in the data-access layer**, not only hidden in the UI. A screen asking for data it may not see gets the restricted version (e.g. "funded" instead of an amount).
6. **No invented framework content.** The 6P decision levels are Principle, Process, People, Policy, Procedures, Practices, with the scopes in `SIX_P_SCOPE`. The 7Cs are Conception, Consultation, Confirmation, Composition, Communication, Coordination, Controlling. Where framework wording is needed and not supplied, use a visible placeholder: `[from the book]`. Friction signals are not part of this build. Leadership assessments are described generically ("expert input, such as a leadership assessment report"); no assessment product is named in screens, data or copy.
7. **Names.** The product is CASPA™. Never use: Karis Strategy, Karis Cascade, Cascade Engine, Karis Plan, Karis Performance, KarisLearning, Karis D'Cesion, SLI. Never name any real organisation in data, copy or comments. The sample organisation is **Sample Water Utility**.
8. **Tokens only.** No colour, font or font size outside the token set in section 5.

## 3. Stack

- Vite with React, TypeScript in `strict` mode
- `vite-plugin-singlefile`, so the review build is one self-contained HTML file (scripts, styles and data inlined; DM Sans from Google Fonts with a system fallback stack)
- Hash-based routing, so the single file works anywhere without a server
- Tailwind CSS with the theme **replaced** (not extended) by the tokens below, so off-palette classes do not exist
- No component library; small in-house components
- Vitest for `src/rules` and `src/selectors`
- ESLint and Prettier
- GitHub when ready. A later move to Next.js for the backend phase rewrites routing only; contract, data access, rules, selectors, AI stub and components carry over unchanged

## 4. Repository layout

```
src/
  contract/      caspa-data-contract.ts (copied verbatim)
  data/
    sample/      seed records for Sample Water Utility
    access/      Repository interface + in-memory implementation + permission filter
  rules/         integrity rules, gates, KPI progress, rating scheme (pure functions)
  selectors/     computed figures for screens (pure functions over the store)
  ai/            stub interface; fixed labelled drafts
  components/    UI building blocks
  strings/       all interface text (one file, ready for translation)
  routes/        screens and hash routes
scripts/
  check-names.mjs   fails the build on forbidden names (rule 7)
  check-colours.mjs fails the build on hex colours outside tokens
```

## 5. Design tokens (approved)

Light mode only. DM Sans only, weights 400–700. Tabular figures in tables and budgets.

| Token | Value | Use |
| --- | --- | --- |
| navy | #0D1B2A | Sidebar, headings, primary buttons |
| text | #1A2B3C | Body text |
| muted | #5E6B7A | Secondary text |
| cream | #F5F4F0 | Page background |
| white | #FFFFFF | Cards, panels |
| border | #D5D2CA | Dividers (decorative only) |
| control | #8A867D | Input and control borders |
| focus | #007F84 | Focus ring, 3px, 2px offset |
| brand-cyan | #00B2B8 | KarisMind™ logo only — never text, buttons or outlines |

Component colours are for identity only (labels, card top edges, nav markers). Never for status or buttons.

| Component | Mark | Text | Tint |
| --- | --- | --- | --- |
| Strategy | #378ADD | #1A5A9E | #EBF3FC |
| Cascade | #7C5CBF | #4A2D8F | #F2EEF9 |
| Plan | #B85C38 | #8A3E22 | #FBEEE8 |
| Performance | #C2417A | #9B2C63 | #FBEAF2 |

Status — always with a written label, never colour alone:

| Status | Text | Background | Border |
| --- | --- | --- | --- |
| Hard block | #B42318 | #FEF3F2 | #B42318 |
| Advisory flag | #7A2E0E | #FFFAEB | #F5C26B |
| Complete | #067647 | #ECFDF3 | #ABEFC6 |
| Info | #0D1B2A | #EDECEA | #D5D2CA |

Type scale (px): 34, 28, 22, 18, 16, 14, 13, 12. Charts default to navy, #5E6B7A and #BAB7AF; component colours only when comparing components.

## 6. Data rules

- Money is integer minor units (`Money.amountMinor`). Format only at display.
- Dates and deadlines use the organisation's time zone (`Africa/Lusaka` for the sample).
- Number format en-GB style: 1,234,567. Date format: 14 October 2026.
- IDs are stable strings; links are by ID, never by array position.
- Display labels for goal, objective, KPI, activity etc. come from `Organisation.termLabels`. 6P and 7C names are never relabelled.

## 7. Sample data

Seed one organisation, **Sample Water Utility** (ZMW, financial year January–December, FY2026, board approval required for plan and budget), consistent with the approved prototypes. It uses both doors:

- An **imported plan, 2022–2026**, status active. It holds all the FY2026 cascade, budget and contract data below.
- A **formed plan, 2027–2031**, status draft, used by the Strategy formation slice. Not needed for the screens in section 9.

FY2026 records:

- Goals G1–G4: Improve financial sustainability (Financial); Provide reliable water supply (Customer); Expand access to sanitation (Customer, no funded activity); Strengthen institutional capacity (Innovation and learning).
- O1.2 Reduce non-revenue water → K1.2.1 Non-revenue water (%), lower is better, latest reading, baseline 52, target 40, actual 47.
- O1.1 Increase collection efficiency → K1.1.1 Collection efficiency, with no owner → A1.1.1.1 Complete monthly meter-reading routes (Procedures, 2,400 readings).
- Activities under K1.2.1: A1.2.1.1 Establish district metered areas (Process); A1.2.1.2 Revise meter management policy (Policy); A1.2.1.3 Replace faulty customer meters (Process, 1,800 meters, 620 done, budget lines ZMW 1,200,000 meters and ZMW 300,000 installation); A1.2.1.4 Introduce daily route briefing and check-in procedure (Procedures).
- One orphan budget line: Vehicle hire, Zone C, ZMW 180,000, no activity.
- Decision map for O1.2 with the four rows shown in the prototype plus one unaddressed People-level deficiency.
- Positions: Managing Director (Executive), Head of Finance (Finance), Head of Operations, Head of Commercial, Commercial Manager, Commercial Officer (supervisor of Meter Readers Zones A–C and Billing Clerk), with the Zone C contract not yet issued.
- Contract for Meter Reader, Zone B, signed: one objective from A1.2.1.3 (personal target 400 meters, 140 done) and one from A1.1.1.1 (personal target 2,400 readings, 2,210 done).

Every figure on every screen must be derivable from these records.

## 8. Rules engine for this build

**Structural integrity rules** (book-based candidates are not implemented until confirmed):

| Rule | Blocks at | Otherwise |
| --- | --- | --- |
| Budget line has no parent activity | budget.submit_unit, budget.submit_consolidated | Advisory |
| Activity has no 6P decision level | cascade.publish | Advisory |
| KPI target equals baseline, or is on the wrong side for its direction | cascade.publish | Advisory |
| Goal has no funded activity | — | Advisory |
| Objective has no KPI | — | Advisory |
| KPI has no owner | — | Advisory |
| Deficiency has no corrective activity | — | Advisory |
| Contract objective's source changed after signature | — | Advisory |

**Book-based rules** (confirmed 18 October 2026):

| Rule | Blocks at | Otherwise |
| --- | --- | --- |
| KPI uses a baseline that is not validated | cascade.publish | Advisory, including at plan.confirm |
| Goal has no recorded "why" (no linked 4Q entry) | — | Advisory |
| Objectives' indicative costs exceed the resource envelope | — | Advisory, raised at plan.confirm |

Every finding names what it blocks in plain words (for example "Blocks budget submission"), who it is routed to, and links directly to the record that fixes it.

**Behaviours:** checks compute after every change; hard blocks bite only at gates; no override of hard blocks; advisory flags can be acknowledged with a reason (stored); findings are never stored; whoever submits a gate cannot approve it.

**KPI progress (P1–P10):** progress = movement from baseline ÷ distance from baseline to target; aggregation latest/sum/average; true value shown, bars clamp 0–100%, roll-ups clamp each KPI to 0–100%; missing baseline treated as 0 for higher-is-better, status only for lower-is-better; milestones by weight; "No data" never 0%; objective = mean of KPIs, goal = mean of objectives; activity completion never counts as KPI progress; round only for display, half up; status against expected-to-date: on track ≥ 90%, at risk ≥ 70%, behind below.

**Ratings (R1–R10):** achievement per contract objective from verified progress only; bands by preset A (default) or B in `RATING_PRESETS`, lower bound inclusive, unrounded values; overall = weighted mean of objective scores, label from rounding half up; one-band supervisor adjustment with reason; advisory flags for any objective scored 1 and achievement above 150%; floor rule off by default.

**Required tests** include the boundaries: 104.6% under preset A is 3; 3.50 overall is "Exceeds", 3.49 is "Meets"; 200% and 50% on equal weights gives 3.0; K1.2.1 progress is 42% and at mid-year shows "At risk".

## 9. Screens, in order

Build each as its own pull request. Elijah will share screenshots of the approved canvas; match them. Where a screenshot differs from this brief — for example older scorecard perspective labels such as "Service Delivery" — this brief wins.

Every workspace header carries its place in the 7Cs: Strategy (Conception to Communication), Cascade and Plan (Coordination), Performance and the role dashboards (Controlling). The phone layout (screen 8) is built responsively from the first screen, not added at the end.

1. **Shell:** sidebar with Home and the four workspaces, filtered by role; top bar with breadcrumb and integrity pill (blocking and advisory counts); organisation switcher only for multi-membership users; development-only role switcher (Executive, Finance, Supervisor, Employee).
2. **Universal cascade-node page,** one template for goal, objective, KPI and activity, built first for the activity: lineage strip (goal › objective › KPI › activity, each clickable); four panels — Strategy (why), Cascade (how, with 6P level and scope), Plan (budget lines and computed total, or "funded" for those without access), Performance (contract objectives, never ratings).
3. **Integrity drawer:** available on every screen; hard blocks and advisory flags visibly different; "Explain this" via the AI stub.
4. **Role homes:** "Needs you" queue first (merged across roles, soonest first; it includes deadlines, decision-log actions, findings routed to the person's positions and gate approvals), then the role's status view. Executive (goal health), Supervisor (team, plus an empty reserved panel labelled "Reserved"), Employee (contract with line of sight). Finance, HR and Strategy office get a simple version of the same pattern.
5. **Budget gate:** consolidated budget by goal; submit is blocked by the orphan line; link the line to an activity; finding clears and amounts move; acknowledge an advisory with a reason; submit passes and writes a gate record.
6. **Six-point decision map** for O1.2.
7. **Organisation setup:** as specified in the *CASPA™ Organisation Setup Specification v0.2*: spreadsheet import, AI draft from an organogram and a manual editor, one review screen, confirmation by the organisation administrator.
8. **Onboarding:** the two doors.
9. **Phone layout:** at 390px the sidebar becomes a bottom bar limited to the role's items.

Strategy formation screens are the **next** slice. They are specified in the approved *CASPA™ Strategy Formation Specification v1.0* as amended by section 13 and shown in the approved Strategy workspace prototype, `reference/caspa-strategy-prototype.html` (open it in a browser; it is the behaviour to match, not code to copy). That slice covers plan setup and both doors, the preparer-built formation calendar, the 4Q board and workshop mode, the department checklist and AI interview, vision and mission, consultation, the baseline and compliance registers, the plan composer with its checks and confirmation gate, the plan document, communication records and sessions with decision logs. Offline progress capture follows after it.

## 10. Quality bar

- WCAG 2.2 AA: contrast, 44px targets, labelled controls, keyboard focus visible.
- Works at 390px wide and on slow connections; no autoplay; images compressed.
- All interface text in one strings file, ready for translation later.
- `tsc --noEmit` clean, tests pass, `check-names` and `check-colours` pass, before any slice is delivered.

## 11. When unsure

Stop and ask rather than guess — especially about framework wording, new fields, permissions, or any figure you cannot derive from the store.

## 12. Which source wins

When sources disagree: (1) Elijah's confirmed decisions, the latest winning; (2) the data contract; (3) the Strategy Formation Specification; (4) this brief; (5) the approved prototypes and screenshots, as behaviour to match; (6) the earlier handoff, background only.

## 13. Decisions behind v1.1 (18 October 2026)

- **Build route:** Vite single-file build in chat sessions, replacing Next.js and Vercel previews for the frontend phase.
- **Friction signals:** removed for now; they return only with a confirmed source and a specification.
- **Book-based integrity rules:** severities as in section 8.
- **Sample data:** O1.1, K1.1.1 and A1.1.1.1 added; A1.1.1.1 sits at Procedures.
- **Leadership assessment:** described generically in the product. Where GOLD is named outside the product it is written GOLD™ until registered.
- **Contract v1.1:** nullable 6P level on draft activities (blocks cascade.publish); DraftMeta on activities and deficiencies; compliance role; plan document record with live figures; personal targets on contract objectives; activities visible to all members; Finance may draft budget lines; consultation attribution (default unit only, author kept in audit, small units shown as their parent); stage owners and board-approval settings.


## 14. Decisions after v1.1 (18 October 2026)

- **Contract v1.2, budget holders:** budget visibility follows accountability, not unit membership. A line's budget holders are the holder unit's accountable position, the funded activity's owner, and every position above either in the reporting line. The accountable position is derived from positions and the reporting line (`accountablePositionOfUnit` in `src/rules/structure.ts`), so it fits any unit depth or naming. Orphan-line findings route to the same accountable position.
- **KPI progress (P1–P10) moved into slice 2**, because the cascade-node pages for KPIs, objectives and goals need it. Ratings stay in slice 4. Status compares progress with the share of the financial year elapsed at "now" (P10).
- **Cascade-node page:** roles that cannot read 4Q entries see how many reasons are recorded, not their text; roles that cannot see contracts see contract coverage (count and assigned quantity) without names, positions or progress.
- **Sample organisations:** Sample Water Utility stays the demo. Three fictional test organisations (`src/data/sample/ngo.ts`, `manufacturing.ts`, `scale.ts`) break water-utility assumptions, and `src/data/access/all-orgs.test.ts` runs every node page for every role in each.
- **Sector-neutral code:** `scripts/check-sector.mjs` fails the build on sector, place or currency words outside sample data, tests and the contract.
- **Money and years:** money is formatted with each currency's ISO 4217 minor units (none for UGX, RWF, XOF). A financial year is numbered by the calendar year it starts in: "FY2026" for January years, "FY2026/27" otherwise.
- **Sample wording:** 4Q entries for G1, G2 and G4 and evidence for every activity, approved 18 October 2026.


## 15. Decisions on organisation setup (23 October 2026)

Recorded in full in the *CASPA™ Organisation Setup Specification v0.2*.

- **Slice order:** organisation setup is slice 7; onboarding moves to 8 and the phone layout review to 9.
- **Confirming the structure:** a recorded action by the organisation administrator, not a gate; the Executive is notified. No new gate code.
- **Restructuring during the year:** "move first, then remove". A unit or position cannot be removed while it holds positions, budget lines or owned records. No contract change.
- **Consultants:** a consultant may build and stage the structure on an administrator membership with an end date; confirmation comes from an administrator on the client's own staff, keeping the rule that facilitators never confirm, approve or sign.
- **Template columns:** unit path, unit type, position title, reports to, holder's full name, holder's email, acting, assigned roles; plus an optional position reference for repeated titles in one unit. A blank holder means a vacant position.
- **Invitation emails:** sent at pilot go-live, when sign-in exists, not at confirmation.


## 16. Decisions on acknowledgements (23 October 2026)

- **Contract v1.3, who may acknowledge:** an advisory flag may be acknowledged by those it is sent to, the Executive and the Strategy office. A new principal, `finding_recipient`, covers "those it is sent to"; the matrix gains one row, `Acknowledgement`. No field changes. Hard blocks are never acknowledged, and a person may act only on findings they are shown.
- **Lapse:** an acknowledgement lapses when the finding's subject record is updated after it, compared by the existing `updated` stamps (`src/rules/acknowledgement.ts`). A lapsed flag is open again and can be acknowledged afresh; earlier acknowledgements are kept.
- **Display:** acknowledged flags stay in the list, marked "Acknowledged" with who, when and the reason, and are counted apart from open flags in the pill, on Home and in the drawer filters.
