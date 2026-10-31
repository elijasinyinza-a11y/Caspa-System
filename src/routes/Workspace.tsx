import { WorkspaceHeader } from '../components/WorkspaceHeader';
import { identity } from '../components/identity';
import { en, type WorkspaceKey } from '../strings/en';

export function Workspace({ w }: { w: Exclude<WorkspaceKey, 'home' | 'cascade' | 'plan' | 'strategy'> }) {
  return (
    <>
      <WorkspaceHeader w={w} title={en.nav[w]} intro={en.workspaceIntro[w]} />
      <div className={`rounded-xl border border-border border-t-4 bg-white p-5 ${identity[w].edge}`}>
        <p className="text-14 text-muted">{en.notBuilt}</p>
      </div>
    </>
  );
}
