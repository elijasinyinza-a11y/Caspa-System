import { useEffect, useId, useRef, useState } from "react";
import { en, type WorkspaceKey } from "../strings/en";
import { useApp, workspaceOf } from "./AppContext";
import { identity } from "./identity";
import { entryHref, isCurrentEntry } from "./SubMenu";
import type { MenuEntry } from "../selectors/nav";

/**
 * One workspace in the sidebar. Pointing at it, or reaching it with the keyboard, shows its purpose sentence after a
 * short pause; it stays open while pointed at and closes with Escape (WCAG 1.4.13). Screen readers hear the same
 * sentence as the link's description. The sidebar only appears on wider screens; phones use the bottom bar.
 */
function NavItem({ w, active, go, href, label, intro, mark, sub = false }: {
  w?: WorkspaceKey; active: boolean; go: () => void;
  /** A sub-menu entry under its workspace (NV-2): indented, with the workspace's identity marker when current. */
  sub?: boolean;
  /** For items that are not workspaces, such as Organisation. */
  href?: string; label?: string; intro?: string; mark?: string;
}) {
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
        href={href ?? `#/${w}`}
        onClick={(e) => { e.preventDefault(); hide(); go(); }}
        onFocus={() => show(0)}
        onBlur={hide}
        aria-current={active ? "page" : undefined}
        aria-describedby={tipId}
        className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-14 ${active ? "bg-white/15 font-semibold" : "text-white/85 hover:bg-white/10"}`}
      >
        {sub ? <span aria-hidden="true" className={`h-4 w-1 shrink-0 rounded-sm ${active ? mark : "bg-transparent"}`} />
          : <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-sm ${mark ?? (w === "home" || !w ? "bg-white" : identity[w].mark)}`} />}
        {label ?? (w ? en.nav[w] : "")}
      </a>
      {/* Always in the page for screen readers; shown on screen only while open. */}
      <span
        id={tipId}
        role="tooltip"
        className={`absolute left-full top-1/2 z-50 ml-3 w-64 -translate-y-1/2 rounded-lg bg-white p-3 text-13 text-text shadow-lg ring-1 ring-border ${open ? "block" : "sr-only"}`}
      >
        {intro ?? (w ? en.workspaceIntro[w] : "")}
      </span>
    </li>
  );
}

/** The current workspace's entries, indented under it (NV-2). */
function SubList({ entries, mark }: { entries: MenuEntry[]; mark: string }) {
  const { route } = useApp();
  if (!entries.length) return null;
  return (
    <ul className="mt-1 mb-2 ml-4 space-y-1 border-l border-white/20 pl-2">
      {entries.map((e) => (
        <NavItem key={e.entry} sub href={entryHref(e)} label={en.menu.entry[e.label]} intro={en.menu.purpose[e.label]} mark={mark}
          active={isCurrentEntry(route, e)} go={() => { window.location.hash = entryHref(e).slice(1); }} />
      ))}
    </ul>
  );
}

export function Sidebar() {
  const { repo, route, navigate, orgId, setOrgId } = useApp();
  const orgs = repo.organisationsForPerson();
  const menu = repo.menu();
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
            <li key={w} className="list-none">
              <ul>
                <NavItem w={w} active={route.kind === "workspace" && route.w === w || (workspaceOf(route) === w && !(w === "strategy" && menu.strategy.some((e) => isCurrentEntry(route, e))))}
                  go={() => navigate({ kind: "workspace", w })} />
              </ul>
              {w === "strategy" && workspaceOf(route) === "strategy" && <SubList entries={menu.strategy} mark={identity.strategy.mark} />}
            </li>
          ))}
        </ul>
        {/* Organisation sits below the four workspaces, for every member (D7-13). It is not a 7Cs stage. */}
        <div aria-hidden="true" className="my-3 border-t border-white/20" />
        <ul>
          <NavItem href="#/organisation" label={en.setup.nav} intro={en.setup.navPurpose} mark="border border-white/70" active={route.kind === "org" && !menu.organisation.some((e) => isCurrentEntry(route, e))} go={() => navigate({ kind: "org" })} />
        </ul>
        {route.kind === "org" && <SubList entries={menu.organisation} mark="bg-white" />}
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
