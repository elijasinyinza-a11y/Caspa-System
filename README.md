# CASPA™ frontend

The strategy execution system of KarisMind™. Frontend-first build: the screens read an in-memory sample
store through a data-access layer that the real backend replaces later. Read `BUILD-BRIEF.md` first (standing
rules and the open slice), then `NEXT.md` (work in progress). Earlier decisions are in `DECISIONS-ARCHIVE.md`,
with their section numbers unchanged. The data contract is v1.10.

## Run

    npm install
    npm run dev       # local development
    npm run verify    # typecheck, lint, tests, name, colour, sector and plain-words checks
    npm run build     # dist/index.html: one self-contained file for review

## Continuing in a new chat

Add the latest repository zip to the CASPA™ Project files. The next session copies it out, runs
`npm install` and `npm run verify`, and continues with the next slice in BUILD-BRIEF.md section 9.

## Slices

1. Shell — done (v0.1.0)
2. Universal cascade-node page, cascade tree, KPI progress (P1–P10), test organisations — done (v0.2.0)
3. Integrity drawer: explain, fix links, acknowledgements — done (v0.3.0)
4. Role homes, "Needs you" queue, ratings (R1–R10) in the rules engine — done (v0.4.0);
   node-page display changes, BUILD-BRIEF section 18 — approved 28 October 2026 (v0.4.1)
5. Budget gate: consolidated view, linking, submission, approval and return — done (v0.5.0);
   clarity retrofit, BUILD-BRIEF section 20 — done (v0.5.1)
6. Six-point decision map, with changing an activity's 6P level — done (v0.6.0). 4Q band-specific cell names
   (v0.5.2); header change (v0.5.3)
7. Organisation setup (Organisation Setup Specification v0.3; decisions D7-1 to D7-14, BUILD-BRIEF section 23) — done (v0.7.0)
8. Onboarding: the two doors (Onboarding Specification v0.1; decisions O1 to O9, BUILD-BRIEF section 28) — done (v0.8.0)
9. Vacancies and handover (Vacancy and Handover Specification v0.1; decisions H1 to H9, BUILD-BRIEF section 26) — done (v0.9.0)
10. Phone layout review (BUILD-BRIEF section 29) — done (v0.10.0)
11. Strategy formation (BUILD-BRIEF section 30), in five parts: 11a calendar and sessions — done (v0.11.0); 11b Conception — done (v0.12.0);
    11c Consultation and Confirmation — done (v0.13.0); 11d Composition — composer done (v0.14.0), plan document and first year's cascade done (v0.15.0); 11e Communication — done (v0.16.0)
12. Navigation: sidebar sub-menus (Navigation Specification v1.1; NV-1 to NV-9, BUILD-BRIEF section 37) — done (v0.17.0)
13. Offline progress capture (Offline Progress Capture Specification v1.0; OP-1 to OP-12, BUILD-BRIEF section 39, now in the archive) — done (v0.18.0)
14. Staff voice: a survey staff answer directly — direction and basis confirmed (BUILD-BRIEF section 38); specified after v0.18.0

Specified 30 October 2026 as slice 9 (BUILD-BRIEF section 26).

## Sample organisations

Sample Water Utility is the demo used for review. Three test organisations break its assumptions:
Sample Community Health NGO (flat, July–June year, UGX, renamed terms), Sample Packaging Manufacturer
(five levels, April–March year, staff reporting outside their unit) and Sample Scale Test Organisation
(288 activities, long names). Every rules and selector test runs against all four. In the review build,
the Executive of Sample Water Utility belongs to all four, so the organisation switcher reaches them.

The development role switcher has six roles: Executive, Strategy office, Finance, HR, Supervisor and
Employee, plus the organisation administrator and, where one exists, Compliance (Sample Water Utility, from v0.13.0)
and a consultant. In the NGO one person holds both Finance and HR, so its queue shows items merged across roles.

## Next chat: staff voice (slice 14)

- Start from this zip: `npm install`, `npm run verify` (687 tests). Then specify staff voice from BUILD-BRIEF section 38
  (in `DECISIONS-ARCHIVE.md`): specification for Elijah's confirmation, then prototype, then build as v0.19.0.
  See `NEXT.md`.

## Offline progress capture (v0.18.0)

- BUILD-BRIEF section 39 (now in `DECISIONS-ARCHIVE.md`); Offline Progress Capture Specification v1.0, OP-1 to OP-12;
  prototype approved (`reference/caspa-progress-prototype.html`). Contract v1.10 (`ProgressUpdate.returned`; rows
  ProgressUpdate, ActivityProgress, KpiActual). 687 tests (21 in `src/rules/progress.test.ts`, plus menu, route and
  "Needs you" tests).
- Code: rules in `src/rules/progress.ts`; the device and sending in `src/data/access/device.ts` and `progress.ts`
  (`repo.progress`); screens in `src/routes/Performance.tsx` (landing, Progress updates with Mine and To verify) and
  `src/components/RecordFigure.tsx` (Record progress, Record a reading); "Work offline", waiting counts and the
  offline bar in `src/components/TopBar.tsx`. `check-plain-words` rejects "sync" and "outbox".
- Try it on Sample Water Utility: as Employee, open "Report progress for September" in Needs you, turn on
  "Work offline", enter 2,150 readings (it asks why it is lower), save, then turn "Work offline" off: it is sent to
  Esther Banda. As Supervisor, verify the 260 meters: the employee's bar moves to 65%, At risk. Return the readings
  update with a reason; as Employee, "Returned" shows the reason and Needs you asks for a corrected figure. As
  Supervisor, open "Complete monthly meter-reading routes" and use "Record progress".
- Display details settled in the build (no decision changed): on a phone the development controls take a second row
  of the top bar; "Record progress" and "Record a reading" open on the latest period that has ended; confirmations
  show under the top bar until the next page. Unsent updates and every change reset on reload.

## Navigation: sidebar sub-menus (v0.17.0)

- BUILD-BRIEF section 37; Navigation Specification v1.1 (a doc in the Project's chats), NV-1 to NV-9; prototype
  approved 2 November 2026 (`reference/caspa-navigation-prototype.html`). No contract change. 658 tests (49 in
  `src/data/access/menu.test.ts`, 3 in `src/routes/router.test.ts`).
- Code: the rule in `src/selectors/nav.ts` (`strategyMenu`, `organisationMenu`, `openStageOf`, `MENU_CAP` = 4); each
  person's menu from the data-access results in `src/data/access/menu.ts` (`repo.menu()`), so it grants nothing;
  `src/components/SubMenu.tsx` (entry links, the phone row); the sidebar lists the current workspace's entries.
- Strategy's entries: Forming the next plan (`#/strategy/forming/<stage>/<tab>`, stage row Overview, Conception,
  Consultation, Composition, opening on the stage open now; "Have your say" for the round's audience), Registers
  (`#/strategy/registers/<tab>`, Compliance first for the compliance officer), Plan document
  (`#/strategy/plan-document`, print at `/print`) and Communication (`#/strategy/communication/<goalId>`).
  Organisation's: Vacancies and People and access (administrator). `#/communication` and `#/plan-document` redirect.
- "Needs you" items for Strategy now open their exact entry, stage and tab (C-4).
- Try it on Sample Water Utility: as Strategy office the sidebar shows Forming the next plan, Registers and
  Communication under Strategy; as Compliance, Registers opens on Compliance; as HR, Organisation shows Vacancies and
  People and access. At 390px the entries are a row of links under the header. Checked at 390px for eight roles.

## Communication, part 11e (v0.16.0)

- BUILD-BRIEF section 36 (D16-1 to D16-12) and the ten build points confirmed by Elijah on 2 November 2026; contract
  v1.9 (D16-1, D16-5; no field changes). 605 tests (14 new in `src/data/access/communication.test.ts`, 2 in
  `src/data/access/first-year.test.ts`, 6 in `src/data/access/all-orgs.test.ts`).
- Code: `src/rules/communication.ts` (which plans and goals, status, first version, meeting units, the goals still
  needing a record), `src/data/access/communication.ts`, `src/routes/Communication.tsx` (the page at
  `#/communication`, the record on goal pages, the board paper at `#/board-paper/<goalId>`, the Home card), the
  stub's `draftCommunication` and `draftAudienceVersions`, and the "owner" rule for records in `permissions.ts`.
- Try it on Sample Water Utility. As Strategy office, Strategy › Communication: G1 is complete; open it to see the
  three parts, its linked 4Q point shown live, the three versions and the Commercial meeting of 15 October 2026.
  "Print as a board paper" opens the board version. G2 to G4 show "No context yet" and are in "Needs you": open G2,
  "Write the record", "Suggest wording (AI)", save, then "Draft the versions (AI)" and accept each. As Executive,
  Home lists only G4 (the Managing Director owns it); G1 opens on the board version. As Employee, open G1 from the
  contract: the staff version first, the 4Q point as a count. Department heads who do not own the goal
  (tested with the Head of Operations on G1) log meetings for their own department only.
- After confirming the 2027–2031 plan and finalising its document (see v0.15.0 below), everyone's Home shows "Our
  strategic plan", the document shows the accepted 4Q cards to all readers (D16-1), and its confirmed goals are listed
  on the Communication page from Composition onward.
- Not built (section 36): anonymous staff feedback during execution needs a new record (later item).

## Plan document and first year's cascade (v0.15.0)

- BUILD-BRIEF section 35; contract v1.8 (a final plan document is read by all members). 565 tests (4 new in
  `src/data/access/first-year.test.ts`).
- Code: `src/data/access/plan-document.ts`, `src/selectors/plan-document.ts` (layout in one place, live content,
  the figures note), `src/routes/PlanDocument.tsx` (panel and the print version at `#/plan-document`),
  `src/data/access/first-year.ts` (adding next year's work, publishing and the switch-over),
  `src/components/NextYear.tsx`, and the development date control in `src/components/RoleSwitcher.tsx`.
- Try it on Sample Water Utility, after confirming the 2027–2031 plan (see v0.14.0 below). As Strategy office, open
  Strategy › Formation › Plan document, "Draft the plan document (AI)", accept each section, finalise, and open the
  print version; as Employee the final document opens at `#/plan-document`. In Cascade choose "Next year (draft):
  FY2027": the publish panel lists what must be fixed. On a KPI page in the draft year, "Add activity". Set the date
  to 4 January 2027 beside the role switcher; owners confirm their measures and the Strategy office validates them in
  the baseline register; then "Publish the cascade": the 2027–2031 plan becomes active and the 2022–2026 plan is
  superseded.
- After confirmation the 4Q board, room and baseline register stay readable and locked (owners still confirm and the
  Strategy office still validates measures); the compliance register stays open.
- Settled in section 36 (D16-1, D16-2): the final document's 4Q card text and how staff reach it, built in v0.16.0.

## Composition, part 11d (v0.14.0)

- BUILD-BRIEF section 34; contract v1.7. 561 tests (15 new in `src/data/access/composition-flow.test.ts`, 4 in
  `src/data/access/composition.test.ts`, 2 in `src/strings/book.test.ts`).
- Code: `src/rules/composition.ts` (groupings, decisions, checks, the resource check, codes), `src/rules/baseline.ts`
  (a KPI's baseline through its measure), `src/data/access/composition.ts`, `src/routes/Composition.tsx`, the stub's
  Composition calls in `src/ai`, and the approved sample wording in `src/data/sample/composition.ts`.
- Try it on Sample Water Utility. Conception first: as Strategy office, open Conception on the Formation tab, accept
  the 12 drafted cards, add each department's sheet to the board, and add a card for the empty section; as Executive,
  write the vision and mission and confirm. Then as Strategy office open Composition in the tracker and, on the
  Composition tab, "Suggest themes (AI)", accept them and "Make it a goal"; as Executive confirm the goals; as Strategy
  office "Suggest objectives" and "Suggest a KPI (AI)" (Non-revenue water: baseline 47% from the register, targets 44
  to 32). As Finance set an envelope; with costs above it, the side panel shows it as worth checking. As Compliance
  review the six items, as Executive confirm every item, as Strategy office "Send to the Executive", then as Executive
  confirm with a board resolution reference.
- Department heads (for example the Head of Operations, or Finance, who heads the Finance department) propose
  objectives as their owners and add KPIs to them. Employees see themes and goals, card counts only.
- After confirmation the 4Q board and the registers stay readable (v0.15.0).

## Framework explanations (v0.13.1)

- BUILD-BRIEF section 33. Explanations of the 6P levels, the 7Cs stages and the 4Q bands no longer show
  "From Business Beyond the Strategic Plan"; `en.explain.source` is deleted. Page references stay in `en.book`, not
  on screen. 541 tests (2 new, `src/strings/book.test.ts`). No contract change.

## Strategy formation, part 11c: Consultation and Confirmation (v0.13.0)

- BUILD-BRIEF section 32; Strategy Formation Specification v1.0 (F2, F3). Contract v1.6: `BaselineMeasure.ownerUnitId`,
  the principal `round_audience`, and rows for consultation rounds, consultation inputs and compliance items.
  539 tests (40 new, `src/rules/consultation.test.ts`, `src/data/access/consultation.test.ts`).
- Try it on Sample Water Utility. As Strategy office, open Strategy and, under Formation › Stages, open Consultation and
  Confirmation. In "Consultation room", plan a round for all staff and open it. As Employee (Mary Chileshe), Strategy
  opens on "Have your say": send an idea. It shows as "Commercial", because Zone B has fewer than five people. As
  Executive, the room lists what was sent; "Group what people sent" is the AI grouping. As Finance (Ruth Phiri),
  "Baseline register" shows only Finance's measure: confirm it. As Strategy office, validate it, set an owner for the
  staff measure, and try "Draft baselines" or the spreadsheet import. As Compliance (Lillian Siame), the
  "Compliance register" opens first: review each item. As Finance, mark the items that affect Finance.
- Code: `src/rules/consultation.ts`, `src/data/access/consultation.ts`, `src/routes/Consultation.tsx`, tabs in
  `src/routes/Formation.tsx`, AI stub additions in `src/ai/index.ts`. Every change is an audit entry; every AI call is
  an `AiTask`.

## Strategy formation, part 11b: Conception (v0.12.0)

- BUILD-BRIEF section 31; Strategy Formation Specification v1.0 (F1). No contract change. 499 tests (25 new,
  `src/rules/conception.test.ts`, `src/data/access/conception.test.ts`).
- Try it on Sample Water Utility. As Strategy office (Bwalya Musonda), open Strategy, then under Formation › Stages open
  Conception. "4Q board" shows the organisation sheet in Table 2 layout; under "Department sheets", open each sheet,
  accept the AI drafts and add them to the organisation sheet. "Look for duplicates" pairs the two non-revenue water
  cards; merge them. One section is still empty: add a card from the session, or, as Finance (Ruth Phiri), open
  "Finance’s part" and answer the interview. "Workshop view" is the projector layout. As Executive (Chanda Mulenga),
  "Vision and mission" opens once all 12 sections have an accepted card: "Summarise the board", write the vision and
  confirm it. The tracker then shows the vision as confirmed.
- Code: `src/rules/conception.ts` (cells, departments, checklist, vision checks), `src/data/access/conception.ts`,
  `src/routes/Conception.tsx`, AI stub additions in `src/ai/index.ts`. Every AI call is an `AiTask`; every attempt to
  confirm the vision is a `GateEvent`.

## Strategy formation, part 11a: calendar and sessions (v0.11.0)

- BUILD-BRIEF section 30 (F-1 to F-3); Strategy Formation Specification v1.0; the approved Strategy workspace
  prototype restored to `reference/caspa-strategy-prototype.html`. No contract change. 474 tests (9 new,
  `src/data/access/formation.test.ts`).
- Try it on Sample Water Utility: as Strategy office (Bwalya Musonda), open Strategy. Below the running 2022–2026 plan,
  "Strategic Plan 2027–2031" is being formed. Edit plan setup (process owner, calendar preparer), open Conception, then
  in "Formation calendar" set stage dates, the two target dates and a deadline for all department heads, and publish.
  The deadline then appears in each department head's "Needs you" (for example as Finance). In "Sessions", start from a
  package or add a session; mark it held and its decision-log actions reach their owners.
- Rules: `src/rules/formation.ts` (department heads, leadership, default participants, packages, agenda, what is worth
  checking, escalation). Data access: `src/data/access/formation.ts`. Screens: `src/routes/Formation.tsx`.
- "Worth checking" here (calendar not published, a purpose with no session) is shown on the formation page to the
  process owner and Strategy office only; it is not added to the integrity rule catalogue. Overdue deadlines reach
  the owner's supervisor after the organisation's escalation days. Onboarding's "Form a new strategy" door stays
  "Coming later" until the formation stages are built (11b to 11d).

## Phone layout notes (v0.10.0)

- BUILD-BRIEF section 29 (option A). The bottom bar holds every workspace the role has; Organisation is in the top bar
  on phones. Every screen was checked at 390px for seven roles: nothing is wider than the screen outside a deliberate
  sideways-scrolling table, and every control is at least 44px.
- Try it: open the review build at 390px wide (or a phone). As Executive, the bottom bar shows Home, Strategy,
  Cascade, Plan and Performance; Organisation is the button beside the checks pill.

## Vacancies and handover notes (v0.9.0)

- BUILD-BRIEF section 26; Vacancy and Handover Specification v0.1. No contract change. 465 tests (12 new,
  `src/data/access/vacancy.test.ts`).
- Seed (H2): the Head of Commercial post at Sample Water Utility is vacant from 1 September 2026, and the NGO's
  Programme Coordinator is acting from 1 August 2026. Tests that assumed the Head of Commercial was held now use a
  date before the vacancy or expect it.
- Try it on Sample Water Utility: as Executive, Home's "For your information" counts the vacancy; open Organisation ›
  Vacant and acting positions and "What it holds". As Organisation administrator, edit the Commercial Officer and clear
  the holder: the dialog says what the vacant post keeps; the Commercial Officer then lists first, because two
  contracts have no supervisor (H1). Open a handover list; as HR, "Write a handover note" gives an AI draft that is
  not stored (H7). Employees get no vacancy tab and can open only their own post's list.
- Code: `src/selectors/vacancy.ts` (what a position holds, H1 order), `repo.structure.vacancies()`, `handover()`,
  `holdingsPreview()`, `handoverNote()`, `src/routes/organisation/Vacancies.tsx`, routes `#/organisation/vacancies`
  and `#/organisation/handover/<positionId>`. H4 "managers" means a position that answers for a unit and that others
  report to, so a one-person unit's holder gets no vacancy view.

## Onboarding notes (v0.8.0)

- BUILD-BRIEF section 28; Onboarding Specification v0.1 (a doc in the Project's chats). No contract change.
  453 tests (13 new, `src/data/access/onboarding.test.ts`).
- Try it: pick Sample New Organisation and confirm its structure (Organisation, sample file). As Strategy office
  (Joseph Lungu), Home asks "Do you have a current strategic plan?"; choose "Bring your existing plan", save plan
  setup, then "Use the sample plan document". Accept each AI draft item and choose an owner for A1.1.1.2. As
  Executive (Mutale Banda), enter the vision and mission in Strategy. As Strategy office, send it; as Executive,
  confirm it from "Needs you" with a board resolution. As Strategy office, publish: the existing rules block it (one
  activity with no 6P level, five baselines not validated); fix both and publish. The goals then appear in Cascade.
- Code: `src/rules/onboarding.ts` (owner matching, codes, checks, "Getting started"), `src/data/access/onboarding.ts`
  (plan setup, the three routes, confirm, publish), `src/routes/Strategy.tsx`; Home shows the first question and
  "Getting started". The plan being brought in is stored as records in a draft plan; every screen reads only the
  active plan, so nothing shows elsewhere until confirmation.
- Changed with it: integrity checks now cover only the active plan's activities; a rule that blocks at one gate is
  still shown as worth checking at another (`checkGate`); the four running sample organisations are seeded with a
  passed `cascade.publish`. Records reset on reload in the review build.

## Who sees the structure (v0.7.2)

- BUILD-BRIEF section 25; contract v1.5. Each organisation sets who sees its structure (Organisation › Details and
  settings › "Who sees the organisation structure"). Default: everyone sees all of it. Every member always sees
  their own line. 440 tests (16 new).
- Try it on Sample Water Utility as Organisation administrator: untick Finance, choose "Their own line only" and
  save; then view as Employee (Mary Chileshe sees 3 units and 5 positions) or Finance (Ruth Phiri sees her unit and
  the Managing Director). The Executive, Strategy office and HR still see everything.

## Permission fix (v0.7.1)

- The Organisation page no longer sends assigned roles, access end dates, the Executive's name for the "is told"
  message or the removal lists to anyone but administrators; emails were already limited. The screens were
  unchanged; this closes the gap in the data-access layer (rule 5; the Membership row of the matrix).
  424 tests (6 new).

## Organisation setup notes (v0.7.0)

- BUILD-BRIEF sections 23 and 24; Organisation Setup Specification v0.3 (a doc in the Project's chats). Contract v1.4
  (D7-5, D7-6): three permission rows and an optional email, nothing else. 418 tests (48 new):
  `src/rules/setup.test.ts` and `src/data/access/setup.test.ts`, including about 5,000 positions with time limits.
- Code: `src/rules/setup.ts` (checks, who answers for each unit, edit guards, removal), `src/data/access/setup/`
  (draft structure, spreadsheet import, a small .xlsx/.csv reader and writer, confirmation, data access),
  `src/routes/organisation/`, route `#/organisation`. Sample New Organisation in `src/data/sample/new-org.ts`; the
  5,000-position structure is `largeStructureRows()` in `src/data/sample/scale.ts`.
- Try it: in the development preview pick Sample New Organisation (it opens on Organisation, as its administrator,
  Ireen Sakala). Build the structure, choose "Use the sample file", fix row 13 and the shared email, then confirm on
  "Review and confirm". Switch to Executive: Home shows "Structure confirmed by Ireen Sakala". "Use the sample
  organogram" gives the AI draft: accept each item, merge Ireen with her twin and give someone the Executive role.
  "Consultant" can build but not confirm.
- On Sample Water Utility as Organisation administrator (Natasha Kabwe): remove Head of Operations (eleven records,
  with who can reassign each), Meter Reader, Zone B (signed contract) or Commercial (positions, units and budget
  lines); set the Managing Director's line manager to the Commercial Officer (refused as a loop). Changes are saved
  at once and listed under "Changes". Everyone else sees the structure read-only, without emails.
- The draft structure, like other changes in the review build, resets on reload.

## Slice 4 notes (v0.4.0)

- Seed additions approved 23 October 2026: Human Resources Manager and Strategy and Planning Manager;
  gate due dates (consolidated budget 6 November 2026, budget approval 27 November 2026, contract issue
  31 January 2026, review completion 15 January 2027); preset A rating scheme; one open mid-year review
  for the Zone B contract.
- Ratings are measured against the full-year personal target from verified progress only, shown as
  provisional, and visible only through the Review row (employee, supervisor, next-level reviewer, HR).

## Node-page display notes (v0.4.1)

- Approved 28 October 2026; recorded in BUILD-BRIEF section 18. Display only: no change to the contract,
  rules or permissions.
- Goal and objective pages group budget lines by the next level down, always, with subtotals from the
  node selector; KPI and activity pages list every line.
- Titles appear once, panels sit at natural height in two columns, child rows are one line, and advisory
  flags fold into a strip. Hard blocks are never folded.

## Clarity retrofit notes (v0.5.1)

- Recorded in BUILD-BRIEF section 20. No contract change. 259 tests; `check-plain-words` added to `npm run verify`.
- Try on Sample Water Utility: as Supervisor, Cascade opens on "Your part" with "Needs attention only" on; as
  Finance, the next step is to link "Vehicle hire, Zone C"; open a record from Plan and "What it costs" opens
  first; tap any 6P level, the 7Cs stage in a header, or "Must fix" / "Worth checking" for an explanation.
- Employees have no Cascade workspace in the current role mapping, so "Your part" applies to supervisors here;
  their record pages are reached from their contract on Home, where links open at "Who delivers it".
- The 4Q column labels now follow Table 2 of the book (for example "Critical success factors").

## 4Q cell names (v0.5.2)

- BUILD-BRIEF section 21. Each 4Q band uses the book's own cell names from Table 2: Retraction reads "Past
  successes" and "Past failures", Repositioning "Present successes" and "Present failures", Projection keeps its
  four names. `en.fourQ.column` is keyed by band, then column, and typed against the contract's `FourQCell`.
- Try on Sample Water Utility: open G1; under "Why this matters" the reason reads "Retraction: Past failures".
- 272 tests (13 new, in `src/strings/four-q.test.ts`). No contract change.

## Decision map notes (v0.6.0)

- BUILD-BRIEF section 22; CASPA™ Slice 6 Specification v0.2 (a doc in the Project's chats). No contract change.
  370 tests (98 new): `src/rules/cascade-edit.test.ts`, `src/selectors/decision-map.test.ts`,
  `src/data/access/decision-map.test.ts`.
- Try on Sample Water Utility as Strategy office: open Cascade, open G1, and choose "Decision map" beside O1.2. On the
  People row, "Add corrective activity" links an existing activity or adds a new one (A1.2.1.5); the check clears.
  "Remove link" brings it back.
- Open "Replace faulty customer meters" and choose "Change level" under "How it's done": pick People, give a reason.
  The Meter Reader, Zone B commitment is sent for review, and the map shows "Solved at People".
- The Executive sees the map and can mark the check as checked, but cannot change corrective work. Finance, HR,
  supervisors and employees see only how many deficiencies are recorded. In the scale organisation the Supervisor
  owns O2.1, so the owner's view can be tried there.
- Code: `src/rules/cascade-edit.ts` (next activity code, link options, checks), `src/selectors/decision-map.ts`
  (every figure on the map), repository writes with audit entries, `src/routes/DecisionMap.tsx`, route `#/map/<id>`.
- Fixed: `createSeed()` now returns its own copy of every record. Before, all seed stores shared the activity
  records, which only mattered once activities could be changed.

## Slice 6 specification (confirmed 29 October 2026)

- The CASPA™ Slice 6 Specification v0.2 (six-point decision map) is a doc in the Project's chats; decisions in
  BUILD-BRIEF section 22. No contract change.
- Sample wording and the prototype approved 29 October 2026; built as v0.6.0.
- D6-6 (29 October 2026): an activity's 6P level can be changed from its record page, with a required reason kept
  in the audit entry; signed commitments from it are asked to review the change.

## Header change (v0.5.3)

- Workspace headers show the 7Cs stage name alone ("Coordination"), without the "7Cs:" prefix. It still opens
  its explanation on tap. 272 tests.

## Budget gate notes (v0.5.0)

- Approved 28 October 2026; recorded in BUILD-BRIEF section 19. No contract change.
- Demo on Sample Water Utility: as Finance, Submit is blocked by "Vehicle hire, Zone C"; link it (for example
  to A1.1.1.1) and ZMW 180,000 moves into G1 while the total stays ZMW 2,650,000. Under contract v1.3 the
  Executive or Strategy office acknowledges the G3 flag (Finance cannot). Finance submits; the Executive
  approves with a board resolution reference, or returns it with a reason.
- Every attempt, blocked or passed, is in the gate record. Records reset on reload in the review build.

## Open items for Elijah

- Part 11c choices and wording to confirm (BUILD-BRIEF section 32), and two points for 11d: 4Q themes in the
  consultation room (no `Theme` permission row) and standards as source documents (no document kind).
- Part 11b choices and wording to confirm (BUILD-BRIEF section 31): department heads' Strategy workspace, the
  Executive viewing but not accepting 4Q cards, the interview question, the sample document draft, flat organisations.
- Slice 7 choices to confirm (BUILD-BRIEF section 24): the phone bottom bar, the "Consultant" development role, and
  who answers for a unit whose top positions are linked only through someone outside it.

- The Clarity Specification document is not in the Project files; adding it helps later sessions.

- Budget holders and Plan, budget phasing and 4Q labels: decided 28 October 2026 (BUILD-BRIEF section 21).
- Usability test: deferred by Elijah on 31 October 2026 (BUILD-BRIEF section 27); it runs before the pilot.
- File-exchange slice: budget utilisation is planned; the spending-against-results rule awaits confirmation of its thresholds (BUILD-BRIEF section 21).

- The achievement rule for lower-is-better contract objectives (scored "not confirmed" for now).
- Decision-log actions carry no completion field, so every action from a held session stays in
  "Needs you".
- Finding messages still use system terms rather than the organisation's renamed labels.
