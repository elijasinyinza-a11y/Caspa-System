# CASPA™ Frontend — Build Brief v1.1

Read this whole file before writing any code. Put it in the repository root and treat it as the instructions for this build. Section 12 says which source wins when sources disagree; section 13 records the decisions behind v1.1. Sections 14 to 25 record decisions made since; the latest is dated 30 October 2026.

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
