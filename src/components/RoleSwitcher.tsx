import { en } from "../strings/en";
import { useApp, type DevRole } from "./AppContext";

/** Development only: not part of the product. Every sample organisation, and the roles each one has. */
export function RoleSwitcher() {
  const { role, setRole, dev, orgId, setOrgId } = useApp();
  return (
    <div role="group" aria-label={en.devSwitcher.label} className="flex items-center gap-1 rounded-xl border border-dashed border-control p-1">
      <label htmlFor="dev-org" className="sr-only">{en.devSwitcher.label}: {en.orgSwitcher.label}</label>
      <select
        id="dev-org"
        value={orgId}
        onChange={(e) => setOrgId(e.target.value)}
        className="hidden min-h-11 max-w-[200px] rounded-lg border border-control bg-white px-2 text-13 font-semibold text-navy lg:block"
      >
        {dev.orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <label htmlFor="dev-role" className="sr-only">{en.devSwitcher.label}: {en.devSwitcher.viewingAs}</label>
      <select
        id="dev-role"
        value={role}
        onChange={(e) => setRole(e.target.value as DevRole)}
        className="min-h-11 max-w-[180px] rounded-lg border border-control bg-white px-2 text-13 font-semibold text-navy"
      >
        {dev.roles.map((r) => <option key={r} value={r}>{en.devSwitcher.viewingAs}: {en.roles[r]}</option>)}
      </select>
    </div>
  );
}
