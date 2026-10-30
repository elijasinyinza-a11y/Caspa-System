# CASPA™ frontend

The strategy execution system of KarisMind™. Frontend-first build: the screens read an in-memory sample
store through a data-access layer that the real backend replaces later. Read `BUILD-BRIEF.md` (v1.1,
with decisions to 28 October 2026, including the clarity decisions in section 20) first.

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
7. Organisation setup (Organisation Setup Specification v0.3; decisions D7-1 to D7-14, BUILD-BRIEF section 23) — prototype approved 29 October 2026 (`reference/caspa-setup-prototype.html`); build next as v0.7.0
8. Onboarding: the two doors
9. Phone layout review (responsive from slice 1)

Agreed 29 October 2026: once slice 7 is built, draft a specification for a short slice after onboarding covering the
vacancy risk view (vacant and acting positions ranked by the records, budget lines and supervised contracts they hold)
and the handover list when a holder changes. Both are selectors over existing records; any stored handover note needs a
contract revision.

## Sample organisations

Sample Water Utility is the demo used for review. Three test organisations break its assumptions:
Sample Community Health NGO (flat, July–June year, UGX, renamed terms), Sample Packaging Manufacturer
(five levels, April–March year, staff reporting outside their unit) and Sample Scale Test Organisation
(288 activities, long names). Every rules and selector test runs against all four. In the review build,
the Executive of Sample Water Utility belongs to all four, so the organisation switcher reaches them.

The development role switcher has six roles: Executive, Strategy office, Finance, HR, Supervisor and
Employee. In the NGO one person holds both Finance and HR, so its queue shows items merged across roles.

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

- The Clarity Specification document is not in the Project files; adding it helps later sessions.

- Budget holders and Plan, budget phasing and 4Q labels: decided 28 October 2026 (BUILD-BRIEF section 21).
- Usability test participants: being recruited; first round before slice 8.
- File-exchange slice: budget utilisation is planned; the spending-against-results rule awaits confirmation of its thresholds (BUILD-BRIEF section 21).

- The achievement rule for lower-is-better contract objectives (scored "not confirmed" for now).
- Decision-log actions carry no completion field, so every action from a held session stays in
  "Needs you".
- Finding messages still use system terms rather than the organisation's renamed labels.
