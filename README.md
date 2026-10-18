# CASPA™ frontend

The strategy execution system of KarisMind™. Frontend-first build: the screens read an in-memory sample
store through a data-access layer that the real backend replaces later. Read `BUILD-BRIEF.md` (v1.1) first.

## Run

    npm install
    npm run dev       # local development
    npm run verify    # typecheck, lint, tests, name and colour checks
    npm run build     # dist/index.html: one self-contained file for review

## Continuing in a new chat

Add the latest repository zip to the CASPA™ Project files. The next session copies it out, runs
`npm install` and `npm run verify`, and continues with the next slice in BUILD-BRIEF.md section 9.

## Slices

1. Shell — done (v0.1.0)
2. Universal cascade-node page
3. Integrity drawer: explain, fix links, acknowledgements
4. Role homes, with KPI progress (P1–P10) and ratings (R1–R10) in the rules engine
5. Budget gate
6. Six-point decision map
7. Onboarding: the two doors
8. Phone layout review (responsive from slice 1)
