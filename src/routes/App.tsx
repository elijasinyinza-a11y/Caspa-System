import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppContext, type DevRole } from '../components/AppContext';
import { BottomBar } from '../components/BottomBar';
import { IntegrityDrawer } from '../components/IntegrityDrawer';
import { Sidebar } from '../components/Sidebar';
import { OfflineBar, TopBar } from '../components/TopBar';
import { createMemoryRepository, sampleClock } from '../data/access/repository';
import { createDevice } from '../data/access/device';
import { ALL_DEV_ROLES } from '../data/sample/all';
import { createReviewOrgs, devMembership } from '../data/sample/review';
import { asIfActive } from '../rules/onboarding';
import type { ISODate } from '../contract/caspa-data-contract';

/** D15-10: the dates the review build can run at. */
const DEV_DATES = ['2026-10-18', '2027-01-04'] as ISODate[];
import { OrganisationPage } from './organisation/OrganisationPage';
import { PlanDocumentPrint } from './PlanDocument';
import { BoardPaperPrint } from './Communication';
import { Strategy, StrategyEntryPage } from './Strategy';
import { HandoverPage } from './organisation/Vacancies';
import { SAMPLE_NOW } from '../data/sample/seed';
import { en } from '../strings/en';
import { Budget } from './Budget';
import { CascadeTree } from './CascadeTree';
import { DecisionMapPage } from './DecisionMap';
import { Home } from './Home';
import { NodePage } from './NodePage';
import { hrefFor, useRoute } from './router';
import { PerformanceLanding, ProgressUpdates } from './Performance';
import { SurveyAnswer, SurveyStaffResults } from './Survey';
import { ReviewsPage } from './Reviews';
import { TargetsPage } from './Targets';
import { ContractsPage } from './Contracts';

export function App() {
  const [orgs] = useState(createReviewOrgs);
  // Slice 13 (OP-7): one device for the session, so what waits to send survives role switches; resets on reload.
  const [device] = useState(createDevice);
  const [toast, setToast] = useState<string | null>(null);
  const [orgId, setOrgIdState] = useState(orgs[0]!.orgId);
  const [role, setRole] = useState<DevRole>('executive');
  const [route, navigate] = useRoute();
  const [drawer, setDrawer] = useState(false);
  // Every stored change bumps the revision, so findings and counts recompute on every screen at once.
  const [revision, setRevision] = useState(0);
  // D15-10: the review build's date, 18 October 2026 or 4 January 2027 (development only; resets on reload).
  const [now, setNow] = useState<ISODate>(SAMPLE_NOW);
  const clock = useMemo(() => sampleClock(now), [now]);
  const [year, setYear] = useState<'this' | 'next'>('this');
  const scroller = useRef<HTMLDivElement>(null);
  const org = orgs.find((o) => o.orgId === orgId) ?? orgs[0]!;
  // Development roles this organisation has now; Sample New Organisation gains most of them once confirmed.
  const roles = ALL_DEV_ROLES.filter((r) => devMembership(org, r, now) !== null);
  const viewing: DevRole = roles.includes(role) ? role : roles[0]!;
  // Keep the role actually shown, so a confirmation that adds roles does not switch the person away.
  useEffect(() => { if (viewing !== role) setRole(viewing); }, [viewing, role]);
  const base = useMemo(
    () => createMemoryRepository(orgs.map((o) => o.store), org.orgId, devMembership(org, viewing, now)!, now, { clock, device, onChange: () => setRevision((r) => r + 1) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revision is the signal that the store changed
    [orgs, org, viewing, clock, revision, now, device],
  );
  // D15-7: next year's draft. Cascade and record pages read a view of the records in which the confirmed plan counts
  // as active, dated at the start of its first year; the view shares the record lists, so changes are kept.
  const next = base.firstYear.page();
  const nextYear = next ? { label: next.yearLabel, planTitle: next.planTitle } : null;
  const showsNext = year === 'next' && !!next && (route.kind === 'node' || route.kind === 'map' || (route.kind === 'workspace' && route.w === 'cascade'));
  const repo = useMemo(() => {
    if (!showsNext || !next) return base;
    const start = `${next.financialYear}-${String(org.store.organisation.financialYearStartMonth).padStart(2, '0')}-01` as ISODate;
    const at = now > start ? now : start;
    const view = asIfActive(org.store, next.planId);
    return createMemoryRepository(orgs.map((o) => (o.orgId === org.orgId ? view : o.store)), org.orgId, devMembership(org, viewing, now)!, at, { clock, device, onChange: () => setRevision((r) => r + 1) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- base changes with every stored change
  }, [base, showsNext]);
  const closeDrawer = useCallback(() => setDrawer(false), []);
  const setOrgId = (id: string) => {
    setOrgIdState(id);
    navigate({ kind: 'workspace', w: 'home' }); // record links belong to one organisation
  };

  // A person never lands on a workspace their roles do not include. Node pages are open to all members.
  useEffect(() => {
    if (route.kind === 'workspace' && !repo.workspaces().includes(route.w)) navigate({ kind: 'workspace', w: 'home' });
    // Progress updates is guarded like a workspace: only for people its page holds something for (N-4).
    if (route.kind === 'contracts' && !repo.menu().performance.some((e) => e.entry === 'contracts')) navigate({ kind: 'workspace', w: repo.workspaces().includes('performance') ? 'performance' : 'home' });
    if (route.kind === 'targets' && !repo.menu().performance.some((e) => e.entry === 'targets')) navigate({ kind: 'workspace', w: repo.workspaces().includes('performance') ? 'performance' : 'home' });
    if (route.kind === 'reviews' && !repo.menu().performance.some((e) => e.entry === 'reviews')) navigate({ kind: 'workspace', w: repo.workspaces().includes('performance') ? 'performance' : 'home' });
    if (route.kind === 'progress' && !repo.menu().performance.some((e) => e.entry === 'progress')) navigate({ kind: 'workspace', w: repo.workspaces().includes('performance') ? 'performance' : 'home' });
    // An organisation that has not confirmed its structure opens on Organisation, where its setup is (D7-13).
    if (route.kind === 'workspace' && route.w === 'home' && !repo.structureConfirmed()) navigate({ kind: 'org' });
  }, [repo, route, navigate]);
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [route]);
  // A confirmation belongs to the page it was given on.
  useEffect(() => { const clear = () => setToast(null); window.addEventListener('hashchange', clear); return () => window.removeEventListener('hashchange', clear); }, []);

  const page =
    route.kind === 'org' && route.handover ? <HandoverPage key={`${org.orgId}:${viewing}:${route.handover}`} positionId={route.handover} />
    : route.kind === 'org' ? <OrganisationPage key={`${org.orgId}:${viewing}`} tab={route.tab} />
    : route.kind === 'node' ? <NodePage key={`${route.node}:${route.id}:${route.from ?? ''}`} kind={route.node} id={route.id} from={route.from} />
    : route.kind === 'planDocument' ? <PlanDocumentPrint key={`${org.orgId}:${viewing}`} />
    : route.kind === 'strategy' ? <StrategyEntryPage key={`${org.orgId}:${viewing}:${hrefFor(route)}`} entry={route.entry} stage={route.stage} tab={route.tab} goalId={route.goalId} />
    : route.kind === 'boardPaper' ? <BoardPaperPrint key={`${org.orgId}:${viewing}:${route.goalId}`} goalId={route.goalId} />
    : route.kind === 'contracts' ? <ContractsPage key={`${org.orgId}:${viewing}:${route.contractId ?? ''}`} tab={route.tab} contractId={route.contractId} />
    : route.kind === 'targets' ? <TargetsPage key={`${org.orgId}:${viewing}:${route.breakdownId ?? ''}:${route.shareId ?? ''}:${route.setup ?? ''}`} breakdownId={route.breakdownId} shareId={route.shareId} setup={route.setup} />
    : route.kind === 'reviews' ? <ReviewsPage key={`${org.orgId}:${viewing}`} tab={route.tab} reviewId={route.reviewId} />
    : route.kind === 'survey' ? (route.results ? <SurveyStaffResults key={`${org.orgId}:${viewing}:${route.roundId}`} roundId={route.roundId} /> : <SurveyAnswer key={`${org.orgId}:${viewing}:${route.roundId}`} roundId={route.roundId} />)
    : route.kind === 'progress' ? <ProgressUpdates key={`${org.orgId}:${viewing}`} tab={route.tab} objectiveId={route.objectiveId} />
    : route.kind === 'map' ? <DecisionMapPage key={`${org.orgId}:${viewing}:${route.objectiveId}:${route.deficiencyId ?? ''}`} objectiveId={route.objectiveId} deficiencyId={route.deficiencyId} />
    : route.w === 'home' ? <Home key={`${org.orgId}:${viewing}`} />
    : route.w === 'cascade' ? <CascadeTree key={`${org.orgId}:${viewing}`} />
    : route.w === 'plan' ? <Budget key={`${org.orgId}:${viewing}`} />
    : route.w === 'strategy' ? <Strategy key={`${org.orgId}:${viewing}`} />
    : <PerformanceLanding key={`${org.orgId}:${viewing}`} />;

  return (
    <AppContext.Provider value={{ repo, role: viewing, setRole, orgId: org.orgId, setOrgId, dev: { orgs: orgs.map((o) => ({ id: o.orgId, name: o.store.organisation.name })), roles, dates: DEV_DATES }, now, setNow, base, year, setYear, nextYear, preview: showsNext, route, navigate, openFindings: () => setDrawer(true), toast, say: setToast }}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3">{en.skipToContent}</a>
      <div className="flex h-full">
        <div data-chrome className="contents"><Sidebar /></div>
        <div ref={scroller} className="print-flow flex min-w-0 flex-1 flex-col overflow-y-auto">
          <div data-chrome className="contents"><TopBar /><OfflineBar /></div>
          <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1100px] flex-1 px-4 pb-28 pt-6 outline-none md:px-8 md:pb-10 md:pt-8">
            <div role="status" aria-live="polite">
              {toast && <p className="mb-4 rounded-lg border border-complete-border bg-complete-bg px-3 py-2 text-14 text-complete-text">{toast}</p>}
            </div>
            {page}
          </main>
        </div>
      </div>
      <div data-chrome className="contents"><BottomBar /></div>
      {drawer && <IntegrityDrawer onClose={closeDrawer} />}
    </AppContext.Provider>
  );
}
