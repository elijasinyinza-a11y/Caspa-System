# Next session

v0.28.0 delivered 18 November 2026 (the Strategy landing, BUILD-BRIEF section 52; v0.27.0 in-year cascade changes, section 51 in the archive, the same day): `npm run verify` clean, 903 tests. Onboarding decisions in section 50 (archive); v0.25.0 in section 49
(archive); v0.24.0 in section 48 and v0.23.0 in section 47.

## Slice 21 (7 November 2026): onboarding, built as v0.26.0 — the first usability round is next
Agreed sequence step 2. Brought into it, all confirmed by Elijah on 7 November 2026:

1. **Forming schedule** (*CASPA™ Forming Schedule Specification v0.1*, a doc in the Project's chats; prototype
   `reference/caspa-forming-schedule-prototype.html`). Strategy › Forming the next plan shows meetings and milestones grouped
   by month, in place of the stage list, with a stage strip. Done is computed from records where they exist (session held,
   department sheets submitted, consultation closed, gate passed); otherwise the item's owner or the Strategy office marks it
   done. Decision-log actions are closed by the assignee or the Strategy office, and leave "Needs you" (this settles the
   item open since 23 October 2026). Board approval stays within plan confirmation. Contract v1.18, fields only.
2. **4Q flip chart** (*CASPA™ 4Q Group Work Specification v0.1*; prototype `reference/caspa-4q-groups-prototype.html`).
   Groups in the 4Q review session, one scribe per group, no sign-in for other members. Cards go to the board as "to review"
   and do not fill a section until accepted. The Strategy office accepts, edits, merges or rejects (never a facilitator).
   The Strategy office may close and reopen a group; reopening covers only cards still waiting for review. Contract v1.19,
   fields only.
3. **Remove card:** for typed or accepted 4Q cards, by whoever may edit the card, with a reason. Kept in the record. A
   section that empties counts as unfilled. A removed suggestion doesn't come back. Refused if the card is linked to a theme
   or objective, or after plan confirmation.
4. **Plan-size guide:** KPIs per objective and activities per KPI. Set by HR, off by default, advisory only (worth
   checking, never blocking).

Decided 7 November 2026 (Elijah, "go by your recommendations"): onboarding opens the second door and prepares the usability
round; Remove card and the plan-size guide are contract v1.20 (HR sets the guide); a KPI owner role in the switcher; objectives per
contract as a third guide setting. All built in v0.26.0 (BUILD-BRIEF section 50).

Next: Elijah runs the first usability round with `#/usability`. Failures are fixed and re-tested before the next slice ships.

Usability test (D5, section 20; deferred by section 27): five people new to CASPA™, at least two likely pilot users; pass
when each task is completed unaided by at least 4 of 5. Nothing is recorded as passed until a real round runs.

## Later in the agreed sequence
3. File exchange (budget utilisation) and plan revisions. Includes recording a rate KPI's two parts (for example billed
   and supplied) with a "From totals" combining option, so shares of a rate combine exactly.
4. The backend phase.

Open questions for a later slice: shares of a share; activity shares by unit in Performance (an activity carried out by
several units shows each unit's part only through contracts today).

## To settle with Elijah
- 4Q A4: showing a failure factor's cause level in the plan document (agreed; not yet built).
- A share's score uses the reading against its target (as R1), not KPI progress (P1), because shares hold no baseline.
- Which 6P levels a position may be held to (for an authority rule); today the level is only shown as a fact.
- Staff survey "Why we ask" book lines; the survey tool's later refinement.
- Spending-against-results thresholds. (Decision-log action completion is settled by the forming schedule, item 1.)

## Review of 10 November 2026: findings to settle with Elijah
A review of the whole build at v0.26.0. The quick corrections were made in v0.26.1 (README). The rest are proposals;
none is decided, and none changes the agreed sequence unless Elijah says so.

1. **Usability round.** Its five tasks cover finding and reading, and one budget fix. Proposed: a second set of tasks for
   making things (issue a contract, record and verify progress, set up a structure from the spreadsheet, add a 4Q card),
   and putting one real plan, with names removed, through the import door.
2. **The backend seam.** `Repository` is synchronous and the screens call it directly (about 200 distinct calls, almost
   no loading or failure states). With permissions enforced on a server, every read becomes a request, so the brief's
   "rewrites routing only" (section 3) will not hold as written. Proposed: a backend-readiness specification before file
   exchange, covering page-shaped loads, loading and failure states, and two people changing the same record.
3. **Screens are not tested.** Routes and components have the router test only. Proposed: a few browser tests that walk
   the README "Try it" scripts, and an automated accessibility check.
4. **Scale.** Sample Scale Test Organisation has 288 activities but 18 positions and one contract. Proposed: a generated
   organisation of about 1,000 staff with contracts and progress updates, with time limits on Home, Cascade and Reviews.
5. **Contract freeze review** before the backend, after the open rules under "To settle with Elijah" are decided.
6. **Is the cycle alive?** A view for the Strategy office of contracts issued, updates arriving and time to verify,
   computed from existing records.
7. **Project files and instructions** in the claude.ai Project are from v0.6 and point to a handoff file that is not
   there; replace them with this repository's zip and current instructions.

## Workspace gaps found 11 November 2026 (while the usability round is prepared)
Elijah is not ready to run the round yet. A look at all four workspaces as each role found these; the small display
fixes are in v0.26.2. Each of the rest needs a short specification confirmed by Elijah before any build.

1. **Cascade: a published cascade cannot be corrected.** Built as v0.27.0 (18 November 2026, BUILD-BRIEF section 51).
   Usability task 6 tests it (added in v0.28.0 by SL-7; task 3 is run as the Supervisor, who cannot assign owners).
2. **Plan: nobody can add or edit a budget line**; lines exist only in sample data, and unit submissions
   (`budget.submit_unit`) were never picked up. Needs Elijah's decision on where lines come from.
3. **Strategy: the landing page shows no goals, reasons, vision or mission.** Built as v0.28.0 (BUILD-BRIEF section 52).
   Note for the usability round: task 7 overlaps task 1 (both ask what the employee's work serves); task 7 adds "how it
   is going". Elijah may keep both or drop one.
4. **Performance: the Executive sees only direct reports**; nobody has an organisation-wide picture of contracts issued,
   updates arriving and verification waiting.
5. **Record pages: a KPI shows only its latest reading**, with no history or trend.
