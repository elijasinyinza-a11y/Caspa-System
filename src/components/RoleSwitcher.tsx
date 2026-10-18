import { en } from '../strings/en';
import { useApp, type DevRole } from './AppContext';

const ROLES: DevRole[] = ['executive', 'finance', 'supervisor', 'employee'];

/** Development only: not part of the product. */
export function RoleSwitcher() {
  const { role, setRole } = useApp();
  return (
    <>
      <div role="group" aria-label={en.devSwitcher.label} className="hidden items-center gap-1 rounded-xl border border-dashed border-control p-1 lg:flex">
        <span className="px-2 text-12 text-muted">{en.devSwitcher.viewingAs}</span>
        {ROLES.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={role === r}
            onClick={() => setRole(r)}
            className={`min-h-11 rounded-lg px-3 text-13 font-semibold ${role === r ? 'bg-navy text-white' : 'border border-border bg-white text-navy hover:border-navy'}`}
          >
            {en.roles[r]}
          </button>
        ))}
      </div>
      <div className="lg:hidden">
        <label htmlFor="dev-role" className="sr-only">{en.devSwitcher.label}: {en.devSwitcher.viewingAs}</label>
        <select id="dev-role" value={role} onChange={(e) => setRole(e.target.value as DevRole)} className="min-h-11 rounded-lg border border-dashed border-control bg-white px-2 text-13 font-semibold text-navy">
          {ROLES.map((r) => <option key={r} value={r}>{en.roles[r]}</option>)}
        </select>
      </div>
    </>
  );
}
