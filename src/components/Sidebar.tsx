import { useEffect, useId, useRef, useState } from "react";
import { en, type WorkspaceKey } from "../strings/en";
import { useApp, workspaceOf } from "./AppContext";
import { identity } from "./identity";

/**
 * One workspace in the sidebar. Pointing at it, or reaching it with the keyboard, shows its purpose sentence after a
 * short pause; it stays open while pointed at and closes with Escape (WCAG 1.4.13). Screen readers hear the same
 * sentence as the link's description. The sidebar only appears on wider screens; phones use the bottom bar.
 */
function NavItem({ w, active, go }: { w: WorkspaceKey; active: boolean; go: () => void }) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const tipId = useId();
  const show = (delay: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setOpen(false);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") hide(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <li className="relative" onMouseEnter={() => show(400)} onMouseLeave={hide}>
      <a
        href={`#/${w}`}
        onClick={(e) => { e.preventDefault(); hide(); go(); }}
        onFocus={() => show(0)}
        onBlur={hide}
        aria-current={active ? "page" : undefined}
        aria-describedby={tipId}
        className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-14 ${active ? "bg-white/15 font-semibold" : "text-white/85 hover:bg-white/10"}`}
      >
        <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-sm ${w === "home" ? "bg-white" : identity[w].mark}`} />
        {en.nav[w]}
      </a>
      {/* Always in the page for screen readers; shown on screen only while open. */}
      <span
        id={tipId}
        role="tooltip"
        className={`absolute left-full top-1/2 z-50 ml-3 w-64 -translate-y-1/2 rounded-lg bg-white p-3 text-13 text-text shadow-lg ring-1 ring-border ${open ? "block" : "sr-only"}`}
      >
        {en.workspaceIntro[w]}
      </span>
    </li>
  );
}

export function Sidebar() {
  const { repo, route, navigate, orgId, setOrgId } = useApp();
  const orgs = repo.organisationsForPerson();
  return (
    <aside className="hidden md:flex w-[232px] shrink-0 flex-col bg-navy text-white">
      <div className="flex items-center gap-3 px-5 pt-6 pb-7">
        <div
          aria-hidden="true"
          className="grid h-9 w-9 place-items-center rounded-lg bg-white text-16 font-bold text-navy"
        >
          C
        </div>
        <div>
          <div className="text-18 font-bold leading-none">{en.product}</div>
          <div className="mt-1 text-12 text-white/70">{en.parentBrand}</div>
        </div>
      </div>
      <nav aria-label={en.nav.label} className="flex-1 px-3">
        <ul className="space-y-1">
          {repo.workspaces().map((w) => (
            <NavItem key={w} w={w} active={workspaceOf(route) === w} go={() => navigate({ kind: "workspace", w })} />
          ))}
        </ul>
      </nav>
      {orgs.length > 1 && (
        <div className="m-3 rounded-lg bg-white/10 p-3">
          <label htmlFor="org-switch" className="text-12 text-white/70">
            {en.orgSwitcher.label}
          </label>
          <select
            id="org-switch"
            className="mt-1 min-h-11 w-full rounded-lg border border-white/30 bg-navy px-2 text-14 text-white"
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </aside>
  );
}
