# CASPA™ frontend

The strategy execution system of KarisMind™. Frontend-first build: the screens read an in-memory sample
store through a data-access layer that the real backend replaces later. Read `BUILD-BRIEF.md` (v1.1) first.

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
4. Role homes, "Needs you" queue, ratings (R1–R10) in the rules engine — done (v0.4.0)
5. Budget gate
6. Six-point decision map
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
- Open items for Elijah: the achievement rule for lower-is-better contract objectives (scored as
  "not confirmed" for now); decision-log actions carry no completion field, so every action from a held
  session stays in "Needs you"; finding messages still use system terms rather than renamed labels.
