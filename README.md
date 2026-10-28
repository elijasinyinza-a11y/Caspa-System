# CASPA™ frontend

The strategy execution system of KarisMind™. Frontend-first build: the screens read an in-memory sample
store through a data-access layer that the real backend replaces later. Read `BUILD-BRIEF.md` (v1.1,
with decisions to 28 October 2026) first.

## Run

    npm install
    npm run dev       # local development
    npm run verify    # typecheck, lint, tests, name, colour and sector checks
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
5. Budget gate: consolidated view, linking, submission, approval and return — done (v0.5.0)
6. Six-point decision map — next
7. Organisation setup (Organisation Setup Specification v0.2)
8. Onboarding: the two doors
9. Phone layout review (responsive from slice 1)

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

## Budget gate notes (v0.5.0)

- Approved 28 October 2026; recorded in BUILD-BRIEF section 19. No contract change.
- Demo on Sample Water Utility: as Finance, Submit is blocked by "Vehicle hire, Zone C"; link it (for example
  to A1.1.1.1) and ZMW 180,000 moves into G1 while the total stays ZMW 2,650,000. Under contract v1.3 the
  Executive or Strategy office acknowledges the G3 flag (Finance cannot). Finance submits; the Executive
  approves with a board resolution reference, or returns it with a reason.
- Every attempt, blocked or passed, is in the gate record. Records reset on reload in the review build.

## Open items for Elijah

- Confirm: budget holders get the Plan workspace (BUILD-BRIEF section 19, last point).
- Whether CASPA™ or the ERP owns monthly or quarterly budget phasing; this decides the file-exchange slice.

- The achievement rule for lower-is-better contract objectives (scored "not confirmed" for now).
- Decision-log actions carry no completion field, so every action from a held session stays in
  "Needs you".
- Finding messages still use system terms rather than the organisation's renamed labels.
