# CASPA™ Frontend — Build Brief v1.1

Read this whole file before writing any code. It holds the standing rules (sections 1 to 12) and the navigation rule (section 37). Slice 21, onboarding with the forming schedule and 4Q group work (section 50), is built as v0.26.0; the first usability round is next. Section 45 records the direction after the pilot. Section 12 says which source wins when sources disagree.

**Decision archive.** The decisions behind slices already built, sections 13 to 36, 38 to 44 and 46, are in `DECISIONS-ARCHIVE.md`, with their numbers unchanged: a reference to "BUILD-BRIEF section N" in code, tests or documents finds section N there. Search the archive when a question needs an earlier decision; it does not need to be read in full. When a slice is delivered, its section moves from this file to the archive (split agreed by Elijah on 4 November 2026; no decision changed).

**Current state.** Data contract v1.20 (`src/contract/caspa-data-contract.ts`, whose header lists every revision). Slices and versions are listed in `README.md`; work in progress, and what comes next, is in `NEXT.md`.

## 1. What you are building

CASPA™ is a strategy execution platform: it traces every budget line, KPI and employee objective back to the strategic goal it serves, and checks that the chain holds. One product, four workspaces — **Strategy, Cascade, Plan, Performance** — on one shared data model.

This build is **frontend first**. There is no backend yet. All data comes from an in-memory sample store behind a data-access layer that the real backend will replace later without changes to the screens.

The build is done in Claude chat sessions within the CASPA™ Project. Each slice is delivered twice from the same code: as a zip of the repository, and as a single self-contained HTML build published for review. The zip is added to the Project files so the next session can continue.

## 2. Rules you must never break

1. **One source of truth.** Every total, percentage, count, progress figure, status and finding is computed from stored records by a selector or the rules engine. Never hard-code a figure in a component. Never store a computed value.
2. **The contract is fixed.** `src/contract/caspa-data-contract.ts` is the data contract (v1.20 now; each revision is made only on Elijah's decision and listed in its header). Copy it in unchanged. If a screen seems to need a new field, stop and ask; do not add it.
3. **Rules engine separate from screens.** Integrity rules, gates, KPI progress and ratings are pure TypeScript functions in `src/rules`. No React, no I/O, no dates from the system clock (pass "now" in). They must run unchanged on a server later.
4. **The AI is stubbed.** Anything AI does (explain a finding, draft text, extract from documents) goes through `src/ai`, which in this build returns fixed sample text labelled "AI draft". The AI never decides, scores, confirms or clears anything.
5. **Permissions are enforced in the data-access layer**, not only hidden in the UI. A screen asking for data it may not see gets the restricted version (e.g. "funded" instead of an amount).
6. **No invented framework content.** The 6P decision levels are Principle, Process, People, Policy, Procedure, Practices ("Procedure" as in the book, decided 28 October 2026; the contract key stays `procedures`), with the scopes in `SIX_P_SCOPE`. The 7Cs are Conception, Consultation, Confirmation, Composition, Communication, Coordination, Controlling. Framework explanations on screen use only the confirmed lines in `en.book` (section 20); where wording is needed and not confirmed, use a visible placeholder: `[from the book]`, which a pilot build rejects. Friction signals are not part of this build. Leadership assessments are described generically ("expert input, such as a leadership assessment report"); no assessment product is named in screens, data or copy.
7. **Names.** The product is CASPA™. Never use: Karis Strategy, Karis Cascade, Cascade Engine, Karis Plan, Karis Performance, KarisLearning, Karis D'Cesion, SLI, KarisMind (the company is Karislabs Technologies; decided November 2026). Never name any real organisation in data, copy or comments. The sample organisation is **Sample Water Utility**.
8. **Tokens only.** No colour, font or font size outside the token set in section 5.

## 3. Stack

- Vite with React, TypeScript in `strict` mode
- `vite-plugin-singlefile`, so the review build is one self-contained HTML file (scripts, styles and data inlined; DM Sans from Google Fonts with a system fallback stack)
- Hash-based routing, so the single file works anywhere without a server
- Tailwind CSS with the theme **replaced** (not extended) by the tokens below, so off-palette classes do not exist
- No component library; small in-house components
- Vitest for `src/rules` and `src/selectors`
- ESLint and Prettier
- The code is kept on GitHub (uploaded through GitHub's web page) and deployed on Vercel. `.github/workflows/verify.yml` runs `npm run verify` and the build on every upload (v0.26.1). A later move to Next.js for the backend phase rewrites routing only; contract, data access, rules, selectors, AI stub and components carry over unchanged

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
| brand-cyan | #00B2B8 | Karislabs Technologies mark only — never text, buttons or outlines |

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

These are the first ten screens as first planned, all built; every slice since is listed in `README.md`, and what comes next is in `NEXT.md`. Build each as its own pull request. Elijah will share screenshots of the approved canvas; match them. Where a screenshot differs from this brief — for example older scorecard perspective labels such as "Service Delivery" — this brief wins.

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

Strategy formation screens were built as slice 11 (v0.11.0 to v0.16.0). They are specified in the approved *CASPA™ Strategy Formation Specification v1.0* as amended by section 13 and shown in the approved Strategy workspace prototype, `reference/caspa-strategy-prototype.html` (open it in a browser; it is the behaviour to match, not code to copy). That slice covers plan setup and both doors, the preparer-built formation calendar, the 4Q board and workshop mode, the department checklist and AI interview, vision and mission, consultation, the baseline and compliance registers, the plan composer with its checks and confirmation gate, the plan document, communication records and sessions with decision logs. Offline progress capture followed as slice 13 (v0.18.0).

## 10. Quality bar

- WCAG 2.2 AA: contrast, 44px targets, labelled controls, keyboard focus visible.
- Works at 390px wide and on slow connections; no autoplay; images compressed.
- All interface text in one strings file, ready for translation later.
- `tsc --noEmit` clean, tests pass, `check-names` and `check-colours` pass, before any slice is delivered.

## 11. When unsure

Stop and ask rather than guess — especially about framework wording, new fields, permissions, or any figure you cannot derive from the store.

## 12. Which source wins

When sources disagree: (1) Elijah's confirmed decisions, the latest winning; (2) the data contract; (3) the Strategy Formation Specification; (4) this brief; (5) the approved prototypes and screenshots, as behaviour to match; (6) the earlier handoff, background only.

## 37. Decisions on navigation: sidebar sub-menus (2 November 2026)

Source: the *CASPA™ Navigation Specification v1.0* (a doc in the Project's chats), decisions NV-1 to NV-8 confirmed as recommended by Elijah, and NV-9 agreed the same day (specification v1.1). No contract change; navigation only. Prototype approved 2 November 2026 (`reference/caspa-navigation-prototype.html`); built as v0.17.0, before offline progress capture.

- **NV-1, the rule:** an item is a sub-menu entry under its workspace only when all six hold. N-1, its own page with its own address. N-2, at least one role returns to it on different days. N-3, not a filter, mode or part of another entry. N-4, shown only to those who can use it and only while it holds something (permissions decide; the menu adds no access). N-5, at most four under one workspace for any one person at any time (NV-9). N-6, named as its page heading reads, in plain words and the organisation's term labels; 6P, 7Cs and 4Q names are never relabelled. Anything that fails stays a tab, a section, a part of a record page or a "Needs you" item.
- **NV-2, behaviour:** sub-entries show only under the workspace the person is in, as 44px links with the workspace's identity marker for the current one (`aria-current="page"`), each with its purpose sentence on pointing or keyboard focus as in section 20. On a phone the bottom bar keeps the workspaces only (section 29); the entries appear as one row of links under the workspace header.
- **NV-3, Registers:** the baseline and compliance registers share one entry, "Registers", with two tabs; Compliance opens first for the compliance officer.
- **NV-4, after confirmation:** the 4Q board and Consultation are read-only once the plan is confirmed; they stay readable as stages of Forming the next plan until the plan is active, and the accepted cards live on in the plan document.
- **NV-5, addresses:** entries move under their workspace (`#/strategy/<entry>`, `#/organisation/<entry>`), and tabs that stay tabs get addresses too. `#/communication`, `#/plan-document` and `#/organisation/vacancies` redirect. `#/board-paper/<goalId>` and the plan document's print version keep their own addresses.
- **NV-6, stays inside:** department sheets (the 4Q board opens on the head's own sheet), workshop view, the documents behind AI drafts, vision and mission, calendar and sessions.
- **NV-7, one menu model:** entries are computed in `src/selectors/nav.ts`; a test checks N-4, N-5 and that every entry opens, for every role in all five sample organisations.
- **NV-8, later slices:** each slice's specification lists its pages against N-1 to N-6. Expected: Performance › Progress updates (v0.18.0, offline progress capture), Performance › Reviews (v0.19.0), Plan › File exchange (v0.20.0), Strategy › Plan revisions (v0.21.0). The order after v0.18.0 is proposed; the second usability round runs after these slices, before the pilot.
- **NV-9, a cap of four, reached by grouping:** when more than four pass for a person, apply in order: C-1, one entry per piece of work, not per screen (pages serving the same outcome over the same period share one entry, opening where the work is now); C-2, lasting entries keep fixed places and temporary work arrives as one entry; C-3, an entry the person may only read becomes a link from a page where they act; C-4, "Needs you" items and must-fix checks always link straight to the exact page. Entries are never ranked by use, so the menu does not shift from week to week. The 4Q board, Consultation and Composition become stages of **Forming the next plan**, which opens on the open stage and shows a stage row (Overview, Conception, Consultation, Composition) styled apart from page tabs; addresses `#/strategy/forming/<stage>`. Vision and mission sit in Conception; the calendar and sessions in the overview. An audience member whose only formation work is the round sees the entry as "Have your say", with no stage row. Plan revisions (v0.21.0) settle their placement in their own specification so the cap holds.
- **Entries now:** Strategy: Forming the next plan (while a plan is being formed), Registers, Plan document, Communication; the Strategy office sees all four only while a confirmed plan's document is being drafted. Organisation: Vacancies; People and access (organisation administrator). Home, Cascade, Plan and Performance have none yet.

## 45. Direction after the pilot: an intelligent management platform (6 November 2026)

Agreed with Elijah as a direction, to be specified after the pilot; nothing is built now.

- **Foundations already laid:** one traced chain from goal to person, verified figures only, a full audit and gate history, staff voice, and a rules engine kept apart from the AI layer.
- **In order of value and safety:** noticing early (projections from verified trends, late dependency chains, spending against results once thresholds are confirmed; mostly rules-engine arithmetic); explaining in plain words with links to the records; suggesting options that people accept or reject, labelled and traced; learning across years by offering verified results to the next plan's 4Q review; conversation within each role's visibility.
- **Lines kept:** the AI never scores, decides, approves or clears; no predictions about individuals' performance or ratings; staff-survey anonymity and role visibility bind the AI as they bind screens; framework content only from the book or Elijah's confirmed input; every organisation can switch AI off.
- **Needs first:** the backend, pilot organisations through at least one full cycle, and data good enough to learn from.


## 50. Decisions on onboarding, the forming schedule and 4Q group work, slice 21 (7 November 2026)

Sources: Elijah's decisions of 7 November 2026; the *CASPA™ Forming Schedule Specification v0.1* and the *CASPA™ 4Q Group Work Specification v0.1* (docs in the Project's chats), with their prototypes in `reference/`; the *CASPA™ Clarity Specification v0.1*, "Usability test kit". Contract v1.18, v1.19 and v1.20 (fields and one permission row). Built as v0.26.0.

- **Forming schedule (v1.18).** Strategy › Forming the next plan › Overview shows a schedule of meetings and milestones grouped by month, with a stage strip (Open, Close, Reopen for the Strategy office; each stage's book line opens on tap), in place of the stage list and the calendar tab (their old addresses open the schedule). Done is computed where a record says so: a session held, every department's 4Q sheet submitted, the consultation round closed, a confirmation passed. Anything else is marked done by its owner or the Strategy office once its date has come. Statuses: Done, Today, In n days (within a week), Overdue. Plan confirmation shows "Needs the board's resolution" when the setting is on; board approval stays inside plan confirmation. "Build the schedule" offers the usual sequence once, undated, in plain names; the preparer dates, renames or removes items. Undated and done items never reach "Needs you".
- **Decision-log actions (v1.18).** Closed by the person assigned or the Strategy office, and reopened by the same people; each step is an audit entry. A done action leaves "Needs you" (settles the item open since 23 October 2026).
- **4Q flip chart (v1.19).** Groups in the 4Q review session, set up by the Strategy office until the session is held, each with its sections, one scribe and other members by name only. The scribe enters cards on the group's flip chart (`#/flipchart/<session>/<group>`); cards are kept on the device offline and sent on reconnect. Group cards go to the board as "to review" (stored as drafts that need checking, never labelled as AI drafts), never fill a section until accepted, and only the Strategy office accepts, edits, merges or rejects them. The Strategy office closes a group for review and may reopen it; reopening covers only cards still waiting for review. The board filters "To review" by group, in the board and the workshop view.
- **Remove card (v1.20).** Typed or accepted cards only (drafts are rejected instead), by whoever may edit the card, with a reason; kept in the record and listed under "Removed cards". A section that empties counts as unfilled; a removed suggestion is not offered again. Refused while the card is linked to a theme, goal or objective (goals added, as goals hold the "why"), or once the plan is confirmed.
- **Plan-size guide (v1.20).** KPIs per objective, activities per KPI and objectives per contract, set by HR under Performance › Contracts › Overview (the `PlanSizeGuide` row; HR's second setting after the rating scheme). Each is off by default. Above a number is "Worth checking" for the record's owner (rules `GUIDE-OBJECTIVE-MANY-KPIS`, `GUIDE-KPI-MANY-ACTIVITIES`, and a contract-drafting check), never blocking. Objectives per contract was added as the third setting on Elijah's go-ahead.
- **The second door.** "Form a new strategy" is open (O6's "Coming later" lifted): with no plan yet, it opens formation's plan setup, and the plan is then worked in Forming the next plan.
- **Usability test.** `#/usability` (review build only, linked beside the role switcher on wide screens) holds the five tasks of the Clarity Specification's kit word for word, each starting from the sample's first state in its role, and a results sheet only the facilitator fills in, kept in that browser. A task passes when at least 4 of 5 complete it unaided. Nothing is recorded as passed until a real round runs.
- **Development role switcher.** A KPI owner role: the holder of the position owning the most KPIs with no assigned role (in Sample Water Utility, Joseph Tembo, Head of Operations).
- **Sample data.** Sample Water Utility's 2027–2031 plan carries the prototypes' schedule and three 4Q review groups mapped onto its own people (`src/data/sample/schedule-samples.ts`); Conception is open. Tests that start formation from nothing take it out first (`clearSampleSchedule`).
