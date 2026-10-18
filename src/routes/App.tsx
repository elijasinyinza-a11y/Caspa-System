import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppContext, type DevRole } from '../components/AppContext';
import { BottomBar } from '../components/BottomBar';
import { IntegrityDrawer } from '../components/IntegrityDrawer';
import { Sidebar } from '../components/Sidebar';
import { TopBar } from '../components/TopBar';
import { createMemoryRepository } from '../data/access/repository';
import { createSeed, DEV_ROLE_MEMBERSHIPS, ORG, SAMPLE_NOW } from '../data/sample/seed';
import { en } from '../strings/en';
import { Home } from './Home';
import { useRoute } from './router';
import { Workspace } from './Workspace';

export function App() {
  const [stores] = useState(() => [createSeed()]);
  const [role, setRole] = useState<DevRole>('executive');
  const [route, navigate] = useRoute();
  const [drawer, setDrawer] = useState(false);
  const repo = useMemo(() => createMemoryRepository(stores, ORG, DEV_ROLE_MEMBERSHIPS[role], SAMPLE_NOW), [stores, role]);
  const closeDrawer = useCallback(() => setDrawer(false), []);

  // A person never lands on a workspace their roles do not include.
  useEffect(() => {
    if (!repo.workspaces().includes(route)) navigate('home');
  }, [repo, route, navigate]);

  return (
    <AppContext.Provider value={{ repo, role, setRole, route, navigate, openFindings: () => setDrawer(true) }}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3">{en.skipToContent}</a>
      <div className="flex h-full">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          <TopBar />
          <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1100px] flex-1 px-4 pb-28 pt-6 md:px-8 md:pb-10 md:pt-8">
            {route === 'home' ? <Home /> : <Workspace w={route} />}
          </main>
        </div>
      </div>
      <BottomBar />
      {drawer && <IntegrityDrawer onClose={closeDrawer} />}
    </AppContext.Provider>
  );
}
