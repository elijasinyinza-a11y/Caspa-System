import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppContext, type DevRole } from '../components/AppContext';
import { BottomBar } from '../components/BottomBar';
import { IntegrityDrawer } from '../components/IntegrityDrawer';
import { Sidebar } from '../components/Sidebar';
import { TopBar } from '../components/TopBar';
import { createMemoryRepository, sampleClock } from '../data/access/repository';
import { createSampleOrgs } from '../data/sample/all';
import { SAMPLE_NOW } from '../data/sample/seed';
import { en } from '../strings/en';
import { Budget } from './Budget';
import { CascadeTree } from './CascadeTree';
import { Home } from './Home';
import { NodePage } from './NodePage';
import { useRoute } from './router';
import { Workspace } from './Workspace';

export function App() {
  const [orgs] = useState(createSampleOrgs);
  const [orgId, setOrgIdState] = useState(orgs[0]!.orgId);
  const [role, setRole] = useState<DevRole>('executive');
  const [route, navigate] = useRoute();
  const [drawer, setDrawer] = useState(false);
  // Every stored change bumps the revision, so findings and counts recompute on every screen at once.
  const [revision, setRevision] = useState(0);
  const [clock] = useState(() => sampleClock(SAMPLE_NOW));
  const scroller = useRef<HTMLDivElement>(null);
  const org = orgs.find((o) => o.orgId === orgId) ?? orgs[0]!;
  const repo = useMemo(
    () => createMemoryRepository(orgs.map((o) => o.store), org.orgId, org.devRoles[role], SAMPLE_NOW, { clock, onChange: () => setRevision((r) => r + 1) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revision is the signal that the store changed
    [orgs, org, role, clock, revision],
  );
  const closeDrawer = useCallback(() => setDrawer(false), []);
  const setOrgId = (id: string) => {
    setOrgIdState(id);
    navigate({ kind: 'workspace', w: 'home' }); // record links belong to one organisation
  };

  // A person never lands on a workspace their roles do not include. Node pages are open to all members.
  useEffect(() => {
    if (route.kind === 'workspace' && !repo.workspaces().includes(route.w)) navigate({ kind: 'workspace', w: 'home' });
  }, [repo, route, navigate]);
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [route]);

  const page =
    route.kind === 'node' ? <NodePage key={`${route.node}:${route.id}`} kind={route.node} id={route.id} />
    : route.w === 'home' ? <Home key={`${org.orgId}:${role}`} />
    : route.w === 'cascade' ? <CascadeTree key={org.orgId} />
    : route.w === 'plan' ? <Budget key={`${org.orgId}:${role}`} />
    : <Workspace w={route.w} />;

  return (
    <AppContext.Provider value={{ repo, role, setRole, orgId: org.orgId, setOrgId, route, navigate, openFindings: () => setDrawer(true) }}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3">{en.skipToContent}</a>
      <div className="flex h-full">
        <Sidebar />
        <div ref={scroller} className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          <TopBar />
          <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1100px] flex-1 px-4 pb-28 pt-6 outline-none md:px-8 md:pb-10 md:pt-8">
            {page}
          </main>
        </div>
      </div>
      <BottomBar />
      {drawer && <IntegrityDrawer onClose={closeDrawer} />}
    </AppContext.Provider>
  );
}
