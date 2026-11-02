# CASPA™ Frontend — Build Brief v1.1

Read this whole file before writing any code. Put it in the repository root and treat it as the instructions for this build. Section 12 says which source wins when sources disagree; section 13 records the decisions behind v1.1. Sections 14 to 35 record decisions made since; the latest is dated 1 November 2026.

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
6. **No invented framework content.** The 6P decision levels are Principle, Process, People, Policy, Procedure, Practices ("Procedure" as in the book, decided 28 October 2026; the contract key stays `procedures`), with the scopes in `SIX_P_SCOPE`. The 7Cs are Conception, Consultation, Confirmation, Composition, Communication, Coordination, Controlling. Framework explanations on screen use only the confirmed lines in `en.book` (section 20); where wording is needed and not confirmed, use a visible placeholder: `[from the book]`, which a pilot build rejects. Friction signals are not part of this build. Leadership assessments are described generically ("expert input, such as a leadership assessment report"); no assessment product is named in screens, data or copy.
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
- O1.1 Increase collection efficiency → K1.1.1 Collection efficiency, with no owner → A1.1.1.1 Complete monthly meter-reading routes (Procedure, 2,400 readings).
- Activities under K1.2.1: A1.2.1.1 Establish district metered areas (Process); A1.2.1.2 Revise meter management policy (Policy); A1.2.1.3 Replace faulty customer meters (Process, 1,800 meters, 620 done, budget lines ZMW 1,200,000 meters and ZMW 300,000 installation); A1.2.1.4 Introduce daily route briefing and check-in procedure (Procedure).
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
2. **Universal cascade-node page,** one template for goal, objective, KPI and activity, built first for the activity: the "Part of" breadcrumb (goal › objective › KPI › activity, each clickable; section 20); four sections — Strategy (why), Cascade (how, with 6P level and scope), Plan (budget lines and computed total, or "funded" for those without access), Performance (contract objectives, never ratings).
3. **Integrity drawer:** available on every screen; hard blocks and advisory flags visibly different; "Explain this" via the AI stub.
4. **Role homes:** "Needs you" queue first (merged across roles, soonest first; it includes deadlines, decision-log actions, findings routed to the person's positions and gate approvals), then the role's status view. Executive (goal health), Supervisor (team, plus an empty reserved panel labelled "Reserved"), Employee (contract with line of sight). Finance, HR and Strategy office get a simple version of the same pattern.
5. **Budget gate:** consolidated budget by goal; submit is blocked by the orphan line; link the line to an activity; finding clears and amounts move; acknowledge an advisory with a reason; submit passes and writes a gate record.
6. **Six-point decision map** for O1.2.
7. **Organisation setup:** as specified in the *CASPA™ Organisation Setup Specification v0.3* (section 23): spreadsheet import, AI draft from an organogram and a manual editor, one review screen, confirmation by the organisation administrator.
8. **Onboarding:** the two doors.
9. **Vacancies and handover:** as section 26.
10. **Phone layout:** at 390px the sidebar becomes a bottom bar limited to the role's items.

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
- **Sample data:** O1.1, K1.1.1 and A1.1.1.1 added; A1.1.1.1 sits at Procedure.
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


## 17. Decisions on role homes and ratings (23 October 2026)

- **Seed additions:** two positions, Human Resources Manager and Strategy and Planning Manager. The development role switcher has six roles: Executive, Strategy office, Finance, HR, Supervisor and Employee. In the test organisations, existing people take on the HR and Strategy office roles; in the NGO one person holds both Finance and HR, so its queue is merged across roles.
- **Deadlines:** gate due dates are seeded for Sample Water Utility: consolidated budget submission 6 November 2026, budget approval 27 November 2026, contract issue 31 January 2026 (so the unissued Zone C contract is overdue), review completion 15 January 2027.
- **"Needs you" sources:** decision-log actions stay an empty, labelled category until the Strategy formation slice; no workshop content is invented. Gate approvals appear from slice 5, when the budget is first submitted.
- **Rating basis:** a mid-year review is measured against the full-year personal target, from verified progress only, and shown as provisional until the appraisal round closes. The sample holds the preset A rating scheme with default settings and one open mid-year review for the Zone B contract.
- **Where ratings appear:** on the Employee home, the Supervisor's team view and the HR home, following the Review row of the permissions matrix (employee, supervisor, next-level reviewer, HR). The Executive, Finance and Strategy office do not see ratings through those roles.
- **Open, awaiting Elijah:** the achievement rule for lower-is-better contract objectives (scored "not confirmed" until decided); how a decision-log action leaves "Needs you", since there is no completion field; finding messages still use system terms rather than the organisation's renamed labels.


## 18. Decisions on node-page display (28 October 2026)

Display only. The contract, rules and permissions are unchanged, and every figure is still computed.

- **Titles once:** a node's title appears once, in a two-line heading with "Show full title". The "Part of" breadcrumb shows codes or short titles, keeping full titles in the link text for screen readers (it replaced the lineage strip; section 20). A finding shown on its own record's page uses a short form; the drawer keeps the full message.
- **Summary first:** each panel opens with its computed summary, with the detail one click away ("Show all 4 objectives").
- **Budget lines:** on goal and objective pages the Plan panel always groups budget lines by the next level down, each group showing its subtotal and expanding in place. There is no line-count threshold. KPI and activity pages list every line with the total. Group subtotals come from the node selector and always sum to the total.
- **Compact child rows:** each objective or KPI takes one row with code, one-line title, bar, percentage and status. Lists longer than six fold behind "Show all".
- **Panel heights:** the four panels sit in two independent columns at their natural height; an empty panel shrinks to one line. On a phone they stack in reading order: Strategy, Cascade, Plan, Performance.
- **Findings on the page:** advisory flags fold into one strip that can be opened. Hard blocks are never folded.


## 19. Decisions on the budget gate (28 October 2026)

No contract change. The store gains an `auditEntries` collection of the contract's existing `AuditEntry` record.

- **Scope:** slice 5 covers the consolidated submission (`budget.submit_consolidated`), approval (`budget.approve`) and return. Unit submissions (`budget.submit_unit`) wait for organisation setup; `budget.lock` moves to the file-exchange slice, since exports come only from approved or locked versions.
- **Consolidated view:** the Plan workspace shows the year's current version grouped by goal (subtotal, share of the total, funded activities), opening to objectives and lines, with a final "Not linked" group for lines with no activity. Every figure comes from `src/selectors/budget.ts`. A subtotal or total is shown only when the viewer can see every line it covers, so the parts always sum to the total.
- **Linking an orphan:** "Link to activity" lists the year's activities with those owned within the line's holder unit (or a unit below it) first. It is deterministic, with no AI suggestion. Budget holders and Finance may link (the BudgetLine draft row); only while the version is a draft; an audit entry is written.
- **Attempting a gate:** Submit stays available to Finance while the version is a draft. Every attempt writes a `GateEvent`, including blocked ones with their blocking finding keys. Hard blocks are never overridden.
- **Advisories at a gate:** each gate shows a fixed list of advisory rules (`GATE_ADVISORIES` in `src/rules/gate.ts`); the budget gates show "Goal has no funded activity". Acknowledging stays optional. Submitting with unacknowledged flags asks for one confirmation, and `advisoryAtGate` records each flag with its acknowledgement, or null; a lapsed acknowledgement counts as none.
- **After submission:** the version is read-only. Approval reaches the Executive and Finance, never the submitter (B7). The approver may approve or return; a return needs a reason, sends the version back to draft and is recorded as an audit entry, not a gate event.
- **Board reference:** when `boardApprovalRequired.budget` is on, approval needs a resolution reference and date, stored as `BoardApproval`. Approved versions are frozen; changes are new versions.
- **Test organisations:** one orphan line each in the packaging manufacturer and the scale organisation, so the gate runs in all four.
- **Storage:** gate events, links and returns reset on reload in the review build (in-memory only), as acknowledgements do.
- **Confirmed by Elijah on 28 October 2026 (section 21):** anyone whose position holds a line in the current budget version gets the Plan workspace (`Viewer.isBudgetHolder`), so the orphan-line finding sent to them always has a fix they can open. Found by the cross-organisation tests; the contract already lets budget holders draft their lines.

## 20. Clarity decisions (28 October 2026)

Source: Clarity Specification v0.1, decisions D1 to D6 made by Elijah on 28 October 2026, and the 20 framework explanations he confirmed the same day. No contract change. This section amends section 18 where it says so, and applies to every slice from 5 onward.

- **Goal:** a new user must be able to tell what is what on every screen without training: what they are looking at, how it connects, and what they need to do.
- **Plain words:** system terms stay in code, the contract, gate codes and audit records. On screen: "Must fix" (and "Must be fixed before [approval step]"), "Worth checking", "Mark as checked", "Checked", "Checks" for the drawer and pill ("2 must fix · 5 to check"), "Approval record", "Part of". `scripts/check-plain-words.mjs` fails `npm run verify` if user-facing strings use the system terms; with `CASPA_PILOT=1` it also fails on any `[from the book]` placeholder.
- **Finding messages (D3):** written in the organisation's own term labels. The rules engine still produces the contract's `message` field, composed from the strings file with `termLabels`; audit and gate records keep system terms.
- **Framework explanations (D2):** the 20 lines in `en.book`, taken from *Business Beyond the Strategic Plan* with page references and confirmed line by line. They open on tap or keyboard focus, never hover alone: each 6P level (the line, then "Covers:" with its `SIX_P_SCOPE` scope), the 7Cs stage in every workspace header, the 4Q Model and its three bands. The 4Q column labels follow Table 2 of the book.
- **Procedure:** the fifth 6P level is shown as "Procedure", as in the book. The contract key `procedures` is unchanged.
- **Purpose and help:** every workspace header states its 7Cs stage and one plain purpose sentence, with "What is this page?" (what it shows, how it connects, what people usually do) and a dismissible first-visit note. In the sidebar, pointing at a workspace (or reaching it with the keyboard) shows its purpose sentence after a short pause; it stays open while pointed at, closes with Escape, and is read to screen readers as the link's description (Elijah, 28 October 2026, replacing the subtitles; no visible "?" marks).
- **Record anatomy:** every goal, objective, KPI and activity shows its type label, title, one status signal, owner and what it is part of. Titles lead; codes follow in muted text. "Show codes" is on by default for the Executive, Strategy office and Finance and off for others.
- **Preferences (D4):** "Show codes", "Needs attention only" and first-visit dismissal are remembered per browser (try/catch-guarded storage) until sign-in exists. Remembering them per person needs a small preference record and a contract revision at the backend phase.
- **Cascade workspace:** "Your part" and "Whole organisation" for people without an oversight role (a display filter; permissions are unchanged). Your part is the records your positions own and the activities behind your own or your team's contract commitments, with the chain above them. The tree opens one level at a time; on Your part, the chain above the person's work is open, and a supervisor starts at the KPIs. "Needs attention only" (on by default for the Strategy office and supervisors) keeps branches with something to fix or check, or progress that is behind or at risk; the rest fold to one line. Items that must be fixed stay on their own row; "worth checking" items roll up to the nearest open record. "Find" matches titles, and codes when shown; an owner filter sits beside it. Finance sees funded counts, never amounts, on tree rows. Budget lines not linked to any activity are listed below the tree for those who may see them. One verb-first next step comes from the checks sent to the person.
- **Record page (D1, option A; amends section 18):** the heading shows type, title, status and owner. All four section summaries are always visible, headed by their question (Why this matters, How it's done, What it costs, Who delivers it) with the workspace as a small label; one section is open at a time. Which opens first depends on where the person came from (Plan opens What it costs; Performance, Who delivers it; Strategy, Why this matters; otherwise How it's done), carried as `~<workspace>` at the end of the record link. Hard blocks are never folded.
- **"Part of" breadcrumb (D6; amends section 18):** replaces the lineage strip. Each step is a link with its full title for screen readers. On a phone it shortens to "…" (a link one level up) and the current record; the full chain is listed in "Why this matters".
- **Plan:** every budget line says what it funds ("Funds: A1.2.1.3 Replace faulty customer meters"), and records opened from Plan open at What it costs.
- **Usability test (D5):** five people who have never seen CASPA™, at least two of them people who would use it in a pilot. Pass: each task completed unaided by at least 4 of 5. Time is recorded but is not a pass criterion in the first round. Runs before onboarding (slice 8) and again before the pilot.

## 21. Further decisions (28 October 2026)

No contract change.

- **Budget holders and Plan:** confirmed. Anyone whose position holds a line in the current budget version gets the Plan workspace, limited to their own lines and to linking them to activities, so the check sent to them always has a fix they can open. Submitting and approving stay with Finance and the Executive.
- **Budget phasing:** the organisation's financial system owns monthly or quarterly phasing. CASPA™ owns each line's annual amount and what it funds. The file-exchange slice exports approved (or locked) lines with their activity codes, and later imports actual spending by line. Simple phasing inside CASPA™ may be added later for organisations without a financial system.
- **4Q labels:** each band uses the book's own cell names (Table 2). Retraction: Past successes, Critical success factors, Past failures, Critical failure factors. Repositioning: Present successes, Critical success factors, Present failures, Critical failure factors. Projection: Predicted future opportunities, Key strategic actions, Predicted future risks, Risk management strategies. Applied at the start of slice 6, in `en.fourQ`, by band and column: done in v0.5.2 (29 October 2026), with `en.fourQ.cellName` and tests for every cell.
- **Budget utilisation (file-exchange slice):** CASPA™ tracks how much of the budget has been used without owning phasing. Each budget line gets its spending to date, with an "as of" date and its source: imported from the organisation's financial system (preferred, so the financial system stays the book of record), or entered by Finance where there is no such system. Spent, remaining and share used are computed once per line and roll up through the cascade (activity, KPI, objective, goal), shown under "What it costs" to those who may see budget amounts; others still see only funded or not. Spending is never judged "ahead" or "behind" against the share of the year elapsed, because spending is uneven (capital purchases land in one month); the year elapsed may be shown as context only. Needs a contract revision: one new record for spending to date per budget line.
- **Spending against results (proposal, needs Elijah's confirmation of the rule and its thresholds):** a "worth checking" rule, never one that must be fixed, comparing the share of an activity's or KPI's budget spent with its KPI progress, so money spent well ahead of results is raised early. It is specified with the file-exchange slice and built only once Elijah confirms the rule and thresholds.
- **Usability test:** the first round runs before onboarding (slice 8), so it does not hold up slices 6 and 7. Elijah is recruiting participants now. The test kit (script, consent, tasks, observation sheet, scoring) is in the Clarity Specification document.

## 22. Decisions on the decision map and headers (29 October 2026)

Source: the CASPA™ Slice 6 Specification v0.2, decisions D6-1 to D6-5 confirmed as recommended by Elijah. No contract change.

- **D6-1, the fix:** "No corrective activity yet" is fixed from the row by linking an existing activity of the same objective (those at the deficiency's level first, deterministic, no AI suggestion) or adding a new activity under one of the objective's KPIs. A new activity's 6P level starts at the deficiency's level and can be changed, because the solution may sit at another level. Links can be removed. Each change stamps the deficiency and writes an audit entry. Only those with `Deficiency` draft act; adding also needs `Activity` draft.
- **D6-2, the page:** the map has its own page in Cascade, `#/map/<objectiveId>` (and `/<deficiencyId>` for a row), linked from the objective page, the activity page ("Corrects:"), the cascade tree and the check's fix link. The record page keeps its four sections.
- **D6-3, headings:** column headings use the organisation's term labels ("Deficiency", "Corrective activity"; the NGO reads "Corrective intervention"). 6P names are never relabelled.
- **D6-4, sample rows:** the NGO gets two rows on R1.1 and the scale organisation 14 on O2.1; the packaging manufacturer stays empty. Wording and the prototype approved 29 October 2026; slice 6 built as v0.6.0.
- **D6-5, without access:** people who may not see deficiencies see how many are recorded, never their text.
- **Layout:** as Clarity Specification section 10: all six levels and scopes kept; levels with a deficiency in full; empty levels in one line ("Nothing recorded at: Principle, Procedure"), each name tappable; an unaddressed row is never folded. Over six rows at a level, "Show all".
- **D6-6, changing an activity's 6P level:** "Change level" under "How it's done" on the activity page, for those with `Activity` draft (objective owner, activity owner, Strategy office, facilitator). A reason is required and kept in the audit entry's `after` value with the old and new level; the new level must differ, and a published activity is never set back to no level. The panel states what follows, computed: signed commitments that will be asked to review the change, and any "Solved at" note on the decision map. Level changes are listed on the activity page. Moving an activity to another KPI or objective is not part of slice 6.
- **Workspace headers:** the 7Cs stage shows its name alone ("Coordination", "Conception to Communication"), without the "7Cs:" prefix. It still opens its explanation on tap. Applied in v0.5.3.

## 23. Decisions on organisation setup, slice 7 (29 October 2026)

Source: the *CASPA™ Organisation Setup Specification v0.3*, decisions D7-1 to D7-14, accepted as recommended by Elijah. Contract v1.4 covers D7-5 and D7-6 only.

- **D7-1, plain words:** on screen, "Must fix before confirming the structure", "Worth checking", "Mark as checked", "Draft structure (not yet saved)", "Answers for this unit", "People and access", "Holder", "Acting". `check-plain-words` also rejects "staging", "membership", "accountable position" and "substantive".
- **D7-2, setup checks:** a pure rule set in `src/rules`, separate from the integrity rules, run on the draft structure. Worth-checking items are marked as checked on the review screen; each reason is kept in the confirmation's audit entry, as `advisoryAtGate` does at a gate. No Acknowledgement records.
- **D7-3, units holding budget lines:** in a draft budget version the holder unit can be moved; in a submitted or approved version it cannot, so the unit cannot be removed until a budget revision exists, and the screen says why. Renaming and moving its positions stay allowed.
- **D7-4, positions owning records:** removal lists what the position owns, with who can reassign each record (computed from the matrix) and a link; it stays blocked until the list is empty. No removal while it has a signed contract in the current year. A leaving holder's assignment ends and the position stays vacant.
- **D7-5, contract v1.4 permissions:** three new matrix rows, no fields: `Organisation` (view all members, draft org_admin), `Person` and `PositionAssignment` (view all members, draft org_admin). Emails are visible to administrators only.
- **D7-6, contract v1.4 email:** `Person.email` becomes optional. A holder with no email is "Worth checking: can't be invited yet"; the duplicate-email check ignores blanks. Sign-in without email is decided at pilot go-live.
- **D7-7, own staff:** an administrator who currently holds a position in the organisation. The check "No administrator holds a position here" replaces "Nobody holds the organisation administrator role" and must be fixed before confirming.
- **D7-8, the draft structure:** a frontend-only type in `src/data/access/setup`, reusing `DraftMeta` and `Provenance`. An AI draft records a `SourceDocument` (kind "other") and an `AiTask` (kind "extract"). Draft IDs become record IDs on confirmation. In-memory in the review build; server storage needs a contract revision at the backend phase.
- **D7-9, confirmation:** an `AuditEntry` with action "confirm" on the Organisation. The Executive's Home shows "Structure confirmed by … on …", computed from it, as information, not a "Needs you" item. The four existing sample organisations are seeded with a past confirmation.
- **D7-10, after confirmation:** later changes use the editor directly on the records, with an audit entry each; must-fix problems refuse the change, worth-checking ones show on the structure page. Re-import with a review of differences comes later. Base currency and financial-year start month lock at first confirmation.
- **D7-11, settings:** every contract setting except the rating scheme (HR's, default preset A), each starting at its default.
- **D7-12, spreadsheet:** .xlsx and .csv through a small reader, no large spreadsheet library; template offered as .xlsx. Unit paths accept "›", ">" or "/". "Reports to" is resolved in the same unit, then parent units, then anywhere if unique; ambiguous rows ask for a position reference. Roles are per person, merged across rows; roles on a vacant row are a row problem. Assignment and access dates default to the confirmation date. People with no position are added under "People and access".
- **D7-13, placement and demo:** an "Organisation" sidebar item below the four workspaces: read-only structure for all members, editing and setup for the administrator. No 7Cs stage in its header (setup is not a stage of leading strategy); purpose sentence and "What is this page?" as section 20. The AI route is hidden when AI is off. Review build: a seventh development role, Organisation administrator, and a fifth, unconfirmed organisation, Sample New Organisation, with a sample template and a sample organogram; the AI stub returns the same labelled draft for any file and says so.
- **D7-14, large organisations:** setup stays usable with thousands of positions. The structure tree follows the Cascade tree pattern (one level at a time, counts per unit, "Show all" after six, "Find" on unit, title and holder names, a filter for units with something to fix or check). Checks are grouped by kind with a count, opening to a filterable, downloadable list; one reason marks a group as checked; must-fix items fold after six per kind and are never hidden. "Reports to" and holder use type-to-find pickers, same unit and parent first. People and access lists people with an assigned role, plus a search. Spreadsheet problems are counted by kind and downloadable with reasons, to fix and import again. The template recommends post numbers as position references. Large organisations are pointed to the spreadsheet route. Rules look records up by ID; the scale test organisation gains a generated 5,000-position structure with a time limit on checks. Tens of thousands of records need the backend's server-side paging (no contract change).
- **Prototype approved** by Elijah on 29 October 2026: `reference/caspa-setup-prototype.html` (open it in a browser; it is the behaviour to match, not code to copy). It also settles three details: unaccepted AI draft items must be fixed before confirming; a unit that appears only inside a spreadsheet path gets "Type not given" and is worth checking; in Sample Water Utility the Human Resources Manager holds the organisation administrator role, with a seeded confirmation on 15 January 2026. Build as v0.7.0.

## 24. Slice 7 as built (v0.7.0, 30 October 2026)

Built to section 23 and the approved setup prototype. Contract v1.4 adds only the D7-5 permission rows and makes `Person.email` optional, written as `string | null` like the contract's other optional values. Choices made in the build, for Elijah to confirm or change:

- **Ending an assignment:** a holder who leaves keeps the position until the day before the change, so it is vacant from that day; an appointment made and ended on the same day never takes effect.
- **Store additions:** `sourceDocuments` and `aiTasks` collections of the contract's existing records, written when an AI draft is made (D7-8). The four existing organisations are seeded with a confirmation by their administrator: in each test organisation, the person who holds the HR role.
- **The 5,000-position structure** is a generator (`largeStructureRows()` in `scale.ts`) used by the tests and the "large sample file", not records in the scale organisation, so existing tests keep their speed.
- **Development preview:** an organisation picker for all five sample organisations, and roles found from the records where the sample names none, so Sample New Organisation gains an Executive, supervisor and employee once confirmed. A "Consultant" role appears where one exists (administrator access with an end date and no position).
- **Phone bar:** as the prototype, up to four workspaces plus Organisation; this hides Performance from the Executive on a phone. To settle in the phone layout review (slice 9).
- **Who answers for a unit:** the setup screens use the same derivation as budget holders (`accountablePositionOfUnit`). Where a unit has several top positions and one manages another only through someone outside the unit, that rule looks for a common manager above both; the prototype took the top position itself. Unchanged pending Elijah's view.

## 25. Who sees the organisation structure (30 October 2026)

Decided by Elijah on 30 October 2026; contract v1.5. It replaces the "view all members" part of D7-5 for the structure as a whole. Built as v0.7.2, after v0.7.1 stopped sending assigned roles, access end dates and removal lists to anyone but administrators.

- **A setting each organisation sets for itself:** "Who sees the organisation structure", under Details and settings, changed by the administrator and recorded. Part one ticks the roles that see the whole structure; the administrator always does. Part two sets what everyone else sees: the whole structure; the units they answer for and everything below, plus their own line; or their own line only.
- **Default:** every role ticked and "the whole structure", so organisations see what they saw before.
- **The floor:** every member always sees their own line: the units of the positions they hold, everyone in those units, and every position above theirs, up to the top, with its unit. Units on the way to the top are kept so the tree can be followed.
- **Contract v1.5:** one setting, `Organisation.settings.structureView`; one principal, `structure_viewer`; one matrix row, `OrganisationStructure` (the tree, its counts and Find). The Organisation, OrgUnit, Position, Person and PositionAssignment rows are unchanged, because the organisation's name and labels, and who owns a record, stay visible wherever the record is. This narrows what was proposed in chat (changing the three record rows), since those rows also carry owner names on record pages.
- **What a limited view shows:** Find searches only that part; who answers for each unit shown is worked out on the whole structure, so it is always correct; the tree opens fully, since the part is short. Emails, roles and access dates stay with administrators.
- **Code:** `src/rules/structure-view.ts` (pure), enforced in `repo.structure.page()` and in the permission check. Tests cover every level on Sample Water Utility, the default in all four organisations, record pages, the recorded change, and 200 people in the 5,000-position structure within a time limit.

## 26. Decisions on vacancies and handover (30 October 2026)

Source: the *CASPA™ Vacancy and Handover Specification v0.1* (a doc in the Project's chats); decisions H1 to H9 accepted as recommended by Elijah. No contract change.

- **H1, order:** the vacancy view lists vacant posts first, then acting ones, in a fixed order of what stops soonest: positions supervising contracts that need a supervisor's action, then those holding budget lines, then those owning records with must-fix checks, then other owned records; ties by count, then title. No risk score. Every column can be sorted by the person.
- **H2, sample data:** Head of Commercial at Sample Water Utility is vacant from 1 September 2026; the NGO gains one acting post. Existing tests that assume the Head of Commercial is held are updated with it.
- **H3:** positions whose holder leaves soon are not listed in this slice.
- **H4, who sees the vacancy view:** the Executive, HR, the Strategy office and the administrator, plus managers for the units they answer for; always within the person's part of the structure (section 25).
- **H5, who opens a handover list:** the administrator, the outgoing holder, their supervisor and HR.
- **H6:** a leaving holder's signed contract is listed only; HR handles it in the appraisal slice.
- **H7:** the AI handover note is shown, copied or printed, never stored.
- **H8:** a vacancy that stops contracts is an information line on the Executive and HR homes, not a "Needs you" item.
- **H9:** this is slice 9, after onboarding; the phone layout review becomes slice 10.
- **Shared list:** both features read one computed list per position, "What this position holds" (owned records, direct budget lines, units it answers for, direct reports, supervised contracts, corrective work, open checks, dated items), plus, for a handover, the roles leaving with the person and work waiting on the outgoing supervisor. Budget lines list direct holders only.
- **Prototype approved** by Elijah on 30 October 2026: `reference/caspa-vacancy-prototype.html` (open it in a browser; it is the behaviour to match, not code to copy). Its holdings were computed by the v0.7.2 rules from the sample store with H2 applied. Build as v0.9.0, after onboarding (slice 8).

## 27. Usability test timing (31 October 2026)

Decided by Elijah on 31 October 2026. It amends section 21 ("the first round runs before onboarding").

- **Deferred:** a first round is not possible now, so onboarding (slice 8) proceeds without it, on the best case that the clarity work (section 20) holds.
- **Still required before the pilot:** the D5 test (five people, at least two likely pilot users; each task completed unaided by at least 4 of 5) runs before pilot go-live, as section 20 already requires. Its findings may change screens built before it.
- **Nothing is recorded as passed.** No result is entered until a real round runs.

## 28. Decisions on onboarding, slice 8 (31 October 2026)

Source: the *CASPA™ Onboarding Specification v0.1* (a doc in the Project's chats); decisions O1 to O9 accepted as recommended by Elijah. No contract change.

- **Scope:** from a confirmed structure to a published cascade, through two doors that make the same `StrategicPlan` (`entryDoor` `imported` or `formed`). Built in full: the first question, plan setup, the import door and a "Getting started" panel. The formation stages stay with the Strategy formation slice.
- **O1:** the Strategy office or a facilitator answers the first question and sets up the plan (the matrix's `StrategicPlan` draft); the Executive confirms. With nobody in the Strategy office, "Getting started" asks the administrator to assign the role.
- **O2:** an imported plan brings goals and objectives for the whole period, and KPI targets and activities for the current financial year only.
- **O3, template:** type (goal, objective, KPI, activity), code, title, part of (the parent's code), owner (position title, and unit where titles repeat), perspective, KPI unit, direction, aggregation, baseline, baseline as of, this year's target, 6P level, quantity and unit. Codes kept as written, numbered when blank.
- **Import routes:** the plan document (a `SourceDocument` of kind `strategic_plan`, an `AiTask` of kind `extract`, every item an AI draft with its page), the spreadsheet, or typing; every AI draft item is accepted or corrected by a person; owners are matched to positions by title, then title and unit, and an unmatched owner is a row to fix.
- **O4:** once confirmed, an imported plan is active at once when its period includes the current year and no other plan is active (C1).
- **Checks:** must fix before `plan.confirm`: the period, at least one goal, and every AI draft item accepted or corrected. Worth checking: the existing rules (objective with no KPI, KPI with no owner, unvalidated baseline, goal with no recorded "why" (O8), goal with no funded activity) and no vision or mission. `cascade.publish` keeps its existing hard blocks.
- **O5:** the Strategy office publishes the cascade, after the Executive confirms the plan.
- **O6:** "Form a new strategy" is shown as "Coming later" and cannot be chosen until the Strategy formation slice is built.
- **O7:** the sample plan for Sample New Organisation is drafted with the prototype and approved with it.
- **O8:** "Goal has no recorded why" stays worth checking for imported goals; "Getting started" points to the 4Q record sheet as a later step.
- **O9:** an imported vision and mission are typed by a person and confirmed with the plan, not at `vision.confirm`. Under the matrix only the Executive drafts a `VisionStatement`, so the Executive types them; the AI never drafts them (F1).
- **"Getting started":** on the Executive, Strategy office and administrator homes, each first-run step with its state computed from the records, until the cascade is published. Information only; confirming the plan reaches the Executive's "Needs you" as a gate approval.
- **Prototype approved** by Elijah on 31 October 2026, with its sample plan wording (O7): `reference/caspa-onboarding-prototype.html` (open it in a browser; it is the behaviour to match, not code to copy). "Send to the Executive" is recorded as an audit entry on the plan and reaches the Executive's "Needs you" as a gate approval; confirming and publishing write gate events. The four existing sample organisations are seeded with a passed `cascade.publish`, so they never see "Getting started". Build as v0.8.0.

## 29. Phone layout review, slice 10 (31 October 2026)

Decided by Elijah on 31 October 2026: option A. Built as v0.10.0. No contract change.

- **Bottom bar:** every workspace the role has (at most five), so none is hidden on a phone. Organisation moves to the top bar on phones, as a 44px button labelled "Organisation" for screen readers; the Executive and HR also reach it from Home's "For your information".
- **Review method:** every screen opened at 390px for seven roles (Executive, Strategy office, Finance, HR, Supervisor, Employee, Organisation administrator), checking for anything wider than the screen outside a deliberate sideways-scrolling table, and for controls smaller than 44px.
- **Fixed:** two-column layouts on Organisation, Strategy and the handover list let their columns shrink (a wide table had pushed the structure card past the screen); a hidden budget subtotal's sentence wraps instead of running off the Plan screen; rows with buttons (structure tree, vacancy list, the plan being brought in) give their text the full line before the buttons wrap; links on the decision map and the activity page's "Corrects" line, and the role checkboxes in People and access, are now 44px targets; the development role switcher is narrower on phones.
- **Known and left:** with the development switcher in the top bar, a record page's breadcrumb on a phone shortens the current title to its first letters. Pilot builds have no development switcher, which frees the space.

## 30. Decisions on the Strategy formation slice (31 October 2026)

Source: the approved *CASPA™ Strategy Formation Specification v1.0* and the approved Strategy workspace prototype, restored to `reference/caspa-strategy-prototype.html` (it was missing from the repository). Decided by Elijah on 31 October 2026.

- **Built in five parts, each a reviewable build:** 11a calendar and sessions; 11b Conception (4Q board and workshop view, source documents and AI-drafted cards, department checklist and AI interview, consolidation, vision and mission, `vision.confirm`); 11c Consultation and Confirmation (consultation room, baseline register, compliance register); 11d Composition (plan composer, `plan.confirm`, plan document, first-year cascade); 11e Communication (communication records, plan revisions).
- **F-1 (option A), plan setup:** the Strategy office or a facilitator sets up a formed plan and names the calendar preparer, as O1 does for imported plans (the matrix's `StrategicPlan` draft). The Executive is told and decides at the two gates. No contract change. The preparer is chosen from people holding the Strategy office or facilitator role, because only they may draft workshops and deadlines under the matrix; a staff member who is to prepare the calendar is given one of those roles by the administrator.
- **F-2 (option A), department heads:** whoever answers for each unit directly below the top unit, worked out from the structure as budget holders are.
- **F-3, consultation anonymity (confirmed):** as decided for contract v1.1 on 18 October 2026: comments show the commenter's unit, never their name; the author is kept in the audit record; units smaller than `consultationMinGroupSize` (default five) show as their parent unit. The specification's open item is closed.

## 31. Strategy formation, part 11b: Conception, as built (v0.12.0, 1 November 2026)

Built to the Strategy Formation Specification v1.0 (F1, "Gates", "AI guardrails") and the approved Strategy workspace prototype. No contract change. Choices made in the build, for Elijah to confirm or change:

- **Department heads get the Strategy workspace** while a plan is being formed (`Viewer.isDepartmentHead`, F-2), as budget holders get Plan (section 21), so the interview and their department's cards are reachable.
- **Who sees and works on cards** (the matrix's FourQEntry row): a card's "owner" is the head of a department that raised it. Department heads see and check their own department's cards; other departments' cards on the organisation sheet show as a count only. The Executive sees every card but does not accept or edit them (the prototype let the Executive accept; the contract wins). The Strategy office and facilitators curate every card, including those of a department whose head is vacant.
- **Recorded without new fields:** a department sending its sheet to the Strategy office is the row's "propose", kept as an audit entry (`four_q.submit`); "Keep separate" on a suggested duplicate is an audit entry (`four_q.keep_separate`); interview answers are not stored, only the `AiTask` (kind "interview", with the plan and unit) and the cards it drafted, each pointing to it.
- **Two sheets:** department cards have scope "department"; the Strategy office adds a department's accepted cards to the organisation sheet (scope "organisation"), which is the 4Q board. Cards added from a session go straight onto the organisation sheet. Merging keeps the original as merged and adds its departments to the card it joins.
- **vision.confirm:** passes when every one of the 12 sections of the organisation sheet has an accepted card and a vision is written; an Executive confirms. Every attempt writes a `GateEvent`, blocked ones with keys such as `FORM-4Q-CELL-EMPTY:StrategicPlan:<id>:<band>.<column>` and `FORM-NO-VISION:…`. Vision and mission (optional) are written only by the Executive, by hand, and only once the board is complete (as in the prototype); once confirmed they cannot be changed here. Confirming the vision does not complete the Conception stage; the Strategy office does that, as in 11a.
- **AI, all labelled and logged:** cards drafted from a source document (kind "extract"), from the interview ("interview"), possible duplicates ("merge", on request) and a board summary for leadership ("summarise", on request, never stored and never a draft vision). With AI switched off, these are hidden and cards are added by hand.
- **"Needs you"** while Conception is open and the vision is not confirmed: each department head's next step (check drafts, take the interview, send the sheet); the Strategy office's drafts to check (organisation sheet and departments with no head) and sent sheets to add; the Executive's "Write and confirm the vision" once every section is filled.
- **Sample data:** Sample Water Utility's 2027–2031 plan holds the prototype's five source documents and its 12 AI-drafted cards in the approved wording. The prototype's Sanitation and Engineering cards are raised by Operations, which answers for them here; Commercial's head is vacant, so the Strategy office checks its cards. One section (Repositioning: Critical failure factors) starts empty, filled by an interview or a session card.
- **Wording for Elijah to approve:** the interview asks one neutral question per section, "What belongs here for [unit]?", under the book's cell name; a four-card, sector-neutral sample draft is returned for any newly added document (`SAMPLE_FOUR_Q_DRAFT`), and the stub says it is the same for any file.
- **Flat organisations:** a single-unit organisation (the NGO) has no departments below the top unit, so it has no department sheets; the Strategy office works on the organisation sheet directly.

## 32. Strategy formation, part 11c: Consultation and Confirmation (v0.13.0, 1 November 2026)

Built to the Strategy Formation Specification v1.0 (F2, F3, "AI guardrails") and the approved Strategy workspace prototype. Decided by Elijah on 1 November 2026 before the build: 1A, 2A, 3A and the sample data as recommended. Section 31 is still open.

- **Contract v1.6 (1A, 2A, 3A).** One field: `BaselineMeasure.ownerUnitId`. The measure's owner is whoever answers for that unit (`accountablePositionOfUnit`); null means the Strategy office checks it. Three permission rows: `ConsultationRound` (all members view; the Strategy office or a facilitator drafts), `ConsultationInput` (the round's audience, the Executive, the Strategy office and facilitators view; the audience, the Strategy office and facilitators draft) and `ComplianceItem` (all members view; the Strategy office, the compliance officer and owners draft; the compliance officer approves). The audience row needs one new principal, `round_audience`: a member holding a position in a unit inside the round's audience, or any member when the audience is "all". Owners of a compliance item are the heads of the departments that marked it.
- **Sample data (4).** Sample Water Utility gains a Legal and Compliance Officer (Lillian Siame, reporting to the Managing Director, role compliance) and a "Compliance" development role. The 2027–2031 plan holds the prototype's six baselines and six obligations in its wording. Owners follow the sample's units as in 11b; the staff measure has no department here, so the Strategy office checks it. As in the prototype, three baselines are already confirmed (two by Operations, one by the Strategy office); none is validated. Four existing tests that counted 12 positions now count 13.
- **The consultation room.** The Strategy office or a facilitator plans a round (all staff or chosen units, with the units within them; planned dates) and then opens and closes it by hand; the dates are never enforced. A round needs the Consultation stage open, and one round runs at a time. Attribution is always `unit_only`; "named" is never offered (F-3). Comments and ideas come from the audience; department heads record section meeting summaries for their department and the units within it; the Strategy office or a facilitator adds expert input, held as a reference and never scored. Every kind shows its unit as F-3 requires: a unit with fewer people than `consultationMinGroupSize` is shown as the unit above it, up to the top; expert input shows no unit. The author is in the record's stamp and the audit entry, never on screen. The vision appears only once confirmed, as in the prototype.
- **Who reaches the room.** Anyone in the audience of an open round gets the Strategy workspace while it is open (`Viewer.inConsultation`), as department heads do in 11b, and opens on "Have your say". "Needs you" asks the audience to have their say until they have sent something; those running the round are not asked. The Strategy office is asked to open a planned round.
- **Grouping.** On request, the AI groups what people sent (AiTask kind "cluster"), sending only the text. Groups are labelled by a shared word; ideas raised once are listed on their own. Nothing is stored.
- **The baseline register.** Owners see and check the measures of the units they answer for; the Executive and the Strategy office see all; others see a count. An AI draft waits for its owner to confirm, correct or set it aside; a measure typed or imported by a person counts as confirmed. The Strategy office validates confirmed measures; the AI never validates. Changing the value, date, unit, name or source of a validated measure clears its validation. The Strategy office may also confirm on an owner's behalf (the matrix allows it), but "Needs you" asks it only for measures with no owner or a vacant owner. The Strategy office sets owners, drafts measures from a document (AI, each tied to its page, starting with no owner) and imports a spreadsheet (Measure, Unit, Value, As of, Source, Owner unit); rows with problems are listed with reasons and not added.
- **The compliance register.** Seen by all members; shown to leadership, the Strategy office, department heads and the compliance officer. The Strategy office or the compliance officer adds obligations by hand or has the AI read them from a regulatory document, licence or policy given for this plan, each tied to its page; other documents are refused. Department heads mark the items that affect their department; the Strategy office may mark for any. Only the compliance officer reviews (aligned, needs change, not applicable), and may change an outcome; changing an item's wording clears its review. "Needs you" asks the compliance officer to review once Confirmation opens. Checking that every item is reviewed before `plan.confirm` belongs to 11d.
- **Formation home.** A progress card shows baselines validated, compliance items reviewed and inputs received, as in the prototype; Conception's checklist step 4 ("Check your baselines") is live once Consultation opens.
- **For Elijah to confirm or change:** the audience getting the Strategy workspace while a round is open; meeting summaries shown under the unit above when the section is small; the Strategy office able to confirm baselines for owners; typed and imported measures counting as confirmed; edits clearing validation and review; the six baselines' "as of" dates (set in the build); the stub's sample baseline and obligation drafts (`SAMPLE_BASELINE_DRAFT`, `SAMPLE_COMPLIANCE_DRAFT`); the officer's name.
- **Open for 11d:** the consultation room cannot show 4Q themes yet: staff may not read 4Q cards, and `Theme` has no row in the permission matrix. Standards have no `SourceDocument` kind, so a standard can be added by hand but not read by the AI.

## 33. Framework explanations without a source line (v0.13.1, 1 November 2026)

Decided by Elijah on 1 November 2026. Display only; no contract, rule or permission change. Amends section 20 (D2).

- **No source line:** framework explanations (each 6P level, the 6P model and the decision map, the 7Cs and each stage, the 4Q Model and its three bands) show the confirmed line from `en.book` and, for 6P levels, "Covers:" with the scope. The line "From Business Beyond the Strategic Plan" no longer appears under them. The string `en.explain.source` is deleted.
- **Page references kept in code:** each of the 20 lines in `en.book` keeps its `page`, for traceability to the book; pages are not shown on screen. `src/strings/book.test.ts` checks that every line keeps its page and that no source line returns.
- **Unchanged:** only the confirmed lines are shown; unconfirmed wording still uses the `[from the book]` placeholder, which a pilot build rejects (section 2, rule 6).

## 34. Decisions on Composition, part 11d (1 November 2026)

Source: the CASPA™ Strategy Formation Specification v1.0, F4 (Composition), checked against contract v1.6 and the approved Strategy workspace prototype. Decisions D11d-1 to D11d-14 accepted as recommended by Elijah on 1 November 2026. Contract v1.7 covers D11d-1, 2, 4, 5 and 7. The build choices listed in sections 31 and 32 are confirmed.

- **D11d-1, themes:** contract v1.7 adds a `Theme` row. Everyone sees a theme's title; the text of its linked 4Q cards follows the FourQEntry row, and others see how many cards are linked. The Strategy office or a facilitator drafts themes; the Strategy office accepts them (facilitators never accept). Themes may be drafted once the vision is confirmed, so a consultation round shows the accepted ones. A theme's grouping (what to sustain, what to correct, key strategic actions, risks to manage) is computed from the cells of its linked cards, not stored.
- **D11d-2, standards:** `SourceDocument.kind` gains `standard`. The AI may read obligations from a standard the organisation provides, each tied to its page, as for laws, regulations, licences and policies; never from general knowledge.
- **D11d-3, goals:** no contract change. The Strategy office or a facilitator drafts each goal, from an accepted theme or by hand, linked to its themes and 4Q cards, with an owner and a perspective. The Executive confirms each goal. Where the prototype lets the Executive make goals, the contract wins.
- **D11d-4, objectives:** contract v1.7 adds `propose: ['owner']` to the `Objective` row. A department head proposes an objective with their own position as owner, recorded in `proposedByPositionId`. The Strategy office or a facilitator drafts and merges; the Executive confirms. The goal's owner sees the proposals under their goal but does not decide them.
- **D11d-5, KPIs and targets:** contract v1.7 adds `objective_owner` to draft and propose on the `Kpi` row. The objective's owner proposes KPIs and a target for each plan year; `KpiTarget` follows its KPI's row. The Executive confirms.
- **D11d-6, baselines:** a KPI linked to a baseline measure always reads its baseline from the measure; its own `baseline` stays null. The number on the KPI is used only where no measure is linked (imported KPIs). Progress (P1) and the integrity rules resolve the baseline through one function.
- **D11d-7, indicative costs:** contract v1.7 adds `IndicativeCost` (objective, financial year, amount) with its own row: seen by the Executive, Finance, the Strategy office and the objective's owner; drafted by the objective's owner, Finance and the Strategy office. During formation the confirmed rule "Objectives' indicative costs exceed the resource envelope" compares each goal's costs for a year with that goal's envelope, and the plan's total with any whole-plan envelope. For an active year with a budget, it keeps reading budget lines.
- **D11d-8, two checks at plan confirmation, worth checking only:** an accepted critical failure factor or predicted future risk on the organisation's 4Q board that no goal or objective addresses; and a goal with no accepted objective. The AI's notes on wording that may not be measurable are labelled AI suggestions, never checks, and are not recorded at the gate.
- **D11d-9, corrective work across the plan years:** on the decision map, a new corrective activity is given a financial year within the plan period. It sits under one of the objective's KPIs (D6-1); the deficiency's timeframe stays as text.
- **D11d-10, confirming a formed plan:** must be fixed: the vision is confirmed, every compliance item is reviewed, there is at least one goal, every AI draft is accepted or rejected, and a board resolution is recorded where required. Worth checking: the existing list, the resource check and the two checks in D11d-8. "Goal has no funded activity" is left out for formed plans, since no budget exists yet.
- **D11d-11, the first year's cascade:** a plan confirmed before its first year is "confirmed", not active (C1). Its first year's KPIs, targets and corrective activities show in Cascade as a draft for next year. The Strategy office publishes it once that year has begun; publishing makes the new plan active and supersedes the old one.
- **D11d-12, the plan document:** after confirmation the AI drafts the executive summary and a narrative for each goal from the confirmed plan; every figure is a reference to its record, never typed. The Strategy office edits and finalises; once final, all members can read it. Export as a print-ready page (print to PDF) now; Word with the file-exchange slice.
- **D11d-13, scope:** v0.14.0 builds the composer up to plan confirmation (D11d-1 to 10). v0.15.0 builds the plan document and the first year's cascade (D11d-11 and 12). Communication becomes v0.16.0.
- **D11d-14, sample data:** the composer starts empty, as in the prototype. The AI stub suggests the prototype's four themes and its suggested objectives in the prototype's wording. Any new sample wording (KPIs, deficiency rows, costs and envelopes) is approved by Elijah before the build.

**Progress across the plan years (decided 1 November 2026):** a KPI keeps one baseline for the whole plan period, and progress in every year is measured from it towards that year's target (P1 unchanged). A missed year is not reset and does not become a new baseline; it shows as a slower start the next year. Later targets change only when the owner proposes and the Executive confirms, recorded as a plan revision once the plan is confirmed. Each KPI may also show the year's own movement as a plain change in value ("This year: 47% → 45%, 2 points better"), computed from the previous year's closing reading; it is information only and never feeds statuses, roll-ups, checks or ratings.

**Built as v0.14.0 (1 November 2026):** the composer up to plan confirmation (D11d-1 to 10), as a Composition tab in the Strategy workspace. A confirmed formed plan stays in the formation tracker and Composition until it becomes active (`formationInProgress` in `src/rules/formation.ts`), since Communication follows confirmation; content edits still need a draft plan. Corrective activities for a formed plan are added in the composer. Read-only views of the 4Q board and the two registers after confirmation followed in v0.15.0 (section 35, D15-11).

**Year close (decided 1 November 2026):** no new rule for missed targets or unfinished activities. Unfinished activities end with their year, shown as not complete, with their figures kept; work that still needs doing is planned as an activity in the next year's cascade. Open: the mechanics of the `year.close` gate, such as when contracts and ratings are frozen.

## 35. Decisions on the plan document and the first year's cascade, part 11d (1 November 2026)

Decisions D15-1 to D15-12, accepted as recommended by Elijah on 1 November 2026. Contract v1.8 covers D15-1 only. Built as v0.15.0.

- **D15-1, who reads the plan document:** contract v1.8: once a plan document is final, all members may read it. Drafts stay with the Executive, the Strategy office and facilitators. No field changes.
- **D15-2, what the document holds:** the AI drafts only the executive summary and one narrative per goal. Everything else is shown live from the records, never stored as text: the vision and mission; "Where we stand", the accepted 4Q cards by band; each goal's objectives and KPIs with baseline, a target for every plan year and owners; and the board resolution. Costs and envelopes are left out. Card text follows the FourQEntry row: readers who may not read 4Q cards see how many points the review recorded (open question for Elijah, recorded with v0.15.0).
- **D15-3, figures:** narratives carry no figures; figures appear only in the live tables. When an editor types a number into a narrative, a plain note says figures belong in the tables. It is a note, not a check, and does not stop finalising.
- **D15-4, drafting and finalising:** after the plan is confirmed, the Strategy office or a facilitator asks for an AI draft, edits each section, and the Strategy office accepts each one, then finalises. A final document is frozen and records the plan revision it was drafted from (`basedOnRevision`); a later revision needs a new draft.
- **D15-5, export:** a print-ready page with its own link (`#/plan-document`), printed or saved as PDF from the browser. Word export comes with the file-exchange slice.
- **D15-6, stub wording:** fixed sentences filled from the records, with no figures and no sector words. Executive summary: "[Plan title] sets out how [organisation] will move from where it stands today towards its vision: '[vision]'. The goals below each have objectives and KPIs, with a target for every year of the plan." Each goal: "This goal responds to the theme '[theme]'. Its objectives are set out below, each with the KPIs that show whether it is being achieved."
- **D15-7, next year's draft in Cascade:** once a formed plan is confirmed, Cascade gains "This year" and "Next year (draft)" for everyone with the Cascade workspace. The draft shows the plan's first year: goals, objectives, KPIs with that year's target, and that year's activities; record pages open in that year.
- **D15-8, the first year's other work:** "Add activity" on a KPI's record page, in the draft year only, for those the Activity row allows (the objective's owner, the Strategy office, facilitators). The 6P level is required.
- **D15-9, publishing and the switch-over:** the Strategy office publishes the first year only once that year has begun. The usual checks apply (an activity with no 6P level, a target on the wrong side of its baseline, an unvalidated baseline must be fixed). When it passes, the new plan becomes active and the previous active plan is superseded. The old plan's records stay readable and its open items stay in "Needs you". The first year's budget stays with the budget process.
- **D15-10, the review build's date:** a development-only date control beside the role switcher, with 18 October 2026 and 4 January 2027. It resets on reload.
- **D15-11, after confirmation:** the 4Q board, the consultation room and its rounds become read-only. In the baseline register owners still confirm measures and the Strategy office still validates them; values and wording are locked. The compliance register stays fully usable. Changing a confirmed plan's goals, objectives or targets needs a plan revision, not yet built (open item).
- **D15-12, scope:** one build, v0.15.0.
- **Built as v0.15.0 (1 November 2026).** The figures note sets aside names of records (the plan's title, goal and theme titles), which may hold numbers. Open for Elijah: whether the final document shows the accepted 4Q cards' text to everyone, and how staff reach the final document (suggested: Communication, 11e).

**Later item, plan document templates (1 November 2026):** organisations may need their final plan in a prescribed format (a government or regulator framework, a funder's results framework). A template would set layout only: chapter order and headings, which live tables appear and their columns, which narrative sections the AI drafts, fixed text, cover and annexes. It never changes figures, which stay live references, nor the meaning of 6P, 7C and 4Q names. Planned: a CASPA™ default format drafted from *Business Beyond the Strategic Plan* with page references and confirmed by Elijah, plus prescribed formats for regulators and funders. Needs a small template record (contract revision) and belongs with or after the file-exchange slice. Until then, section headings and table choices are kept in one place in the code (`src/selectors/plan-document.ts`).
