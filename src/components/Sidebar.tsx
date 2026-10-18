import { en } from '../strings/en';
import { useApp } from './AppContext';
import { identity } from './identity';

export function Sidebar() {
  const { repo, route, navigate } = useApp();
  const orgs = repo.organisationsForPerson();
  return (
    <aside className="hidden md:flex w-[232px] shrink-0 flex-col bg-navy text-white">
      <div className="flex items-center gap-3 px-5 pt-6 pb-7">
        <div aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-lg bg-white text-16 font-bold text-navy">C</div>
        <div>
          <div className="text-18 font-bold leading-none">{en.product}</div>
          <div className="mt-1 text-12 text-white/70">{en.parentBrand}</div>
        </div>
      </div>
      <nav aria-label={en.nav.label} className="flex-1 px-3">
        <ul className="space-y-1">
          {repo.workspaces().map((w) => {
            const active = route === w;
            return (
              <li key={w}>
                <a
                  href={`#/${w}`}
                  onClick={(e) => { e.preventDefault(); navigate(w); }}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-14 ${active ? 'bg-white/15 font-semibold' : 'text-white/85 hover:bg-white/10'}`}
                >
                  <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-sm ${w === 'home' ? 'bg-white' : identity[w].mark}`} />
                  {en.nav[w]}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
      {orgs.length > 1 && (
        <div className="m-3 rounded-lg bg-white/10 p-3">
          <label htmlFor="org-switch" className="text-12 text-white/70">{en.orgSwitcher.label}</label>
          <select id="org-switch" className="mt-1 min-h-11 w-full rounded-lg border border-white/30 bg-navy px-2 text-14 text-white" defaultValue={repo.organisation().id}>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
      )}
    </aside>
  );
}
