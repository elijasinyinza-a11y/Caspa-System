# Next session: v0.18.0, offline progress capture (slice 13), work in progress

Checkpoint saved 4 November 2026 (steps 1 to 3 done; `npm run verify` clean, 664 tests). Prototype approved by Elijah, with three answers:
landing status uses P10 (verified progress against the share of the year elapsed);
the purpose sentence and the "total since <year start>" hint are approved; only the
latest missed period is asked for, one item per objective.

## Done
- Brief split (4 November 2026): BUILD-BRIEF.md keeps sections 1–12, 37 and 39; sections 13–36 and 38 are in
  DECISIONS-ARCHIVE.md with their numbers unchanged. No decision changed.
- Contract v1.10: ProgressUpdate.returned; rows ProgressUpdate, ActivityProgress, KpiActual.
- Seed: `returned: null` everywhere; OP-11 update `pu-co-b-1-2026-09` (260 meters, saved offline).
- src/rules/progress.ts: periods, due, marks, arrival checks, verifierPosition (OP-6), superseding.
  rating.ts and selectors/node.ts use latestVerified (OP-4 tie-break; R6 unchanged).
- permissions.ts (ProgressUpdate subject, OP-6 "supervisor", owners of ActivityProgress/KpiActual);
  viewer.ts (now, hasSignedContract, verifiesProgress).
- src/data/access/device.ts and progress.ts (capture, waiting to send, sending in saved order, arrival checks,
  verify and return online or queued offline, activity and KPI figures); repository.progress.
- Strings: en.capture (incl. periodName), menu entry "Progress updates" and its approved purpose sentence.
- Step 1: route `progress` (#/performance/progress[/mine[/<id>]|/verify]), guarded like workspaces; one device
  per session in App.tsx (useState), passed as options.device. The route shows the Performance placeholder until step 4.
- Step 2: repo.progress.needs(): "Report progress for <period>", "Send a corrected figure for <period>",
  "Verify N progress updates"; undated; merged into home().needsYou with sortQueue.
- Step 3: performanceMenu in selectors/nav.ts; Menu.performance from repo.progress.page() (N-4); sidebar sub-list
  and phone row (EntryRow w="performance", placed in Workspace.tsx for now).
- Tests: menu.test.ts (N-4/N-5 for Performance, every role, five organisations; SWU: employee and supervisor only);
  progress-needs.test.ts (OP-10 items, device counts as reported, return, OP-6 vacant fallback);
  home.test.ts queues updated for the two new items.

## To do, in order
4. Screens: Performance landing (replace the Workspace placeholder for performance; keep EntryRow under the header),
   ProgressUpdates page with tabs Mine and To verify (opensOn from repo.progress.page()), "Record progress" on
   activity pages (repo.progress.activityForm/recordActivity, under "How it's done"), "Record a reading" on KPI pages
   (kpiForm/recordKpi), "Work offline" switch in TopBar beside the role switcher, with waiting counts
   (repo.progress.waiting()) and the offline bar (en.capture.offlineBar). Match reference/caspa-progress-prototype.html.
5. check-plain-words: reject "sync" and "outbox" in user-facing strings.
6. Tests for src/rules/progress.ts (January, April and July year starts; offline ordering and same-period
   replacement; arrival failures; acting holder; R6 unchanged) and the 390px check.
7. README, BUILD-BRIEF (move section 39 to the archive once delivered), package.json 0.18.0, npm run verify,
   repository zip, published review build.
