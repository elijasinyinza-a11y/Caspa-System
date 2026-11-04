/**
 * Sub-menu helpers (v0.17.0; Navigation Specification v1.1, NV-2): where each entry links, which one is current, and
 * the phone's row of links under the workspace header. On wider screens the entries sit in the sidebar instead.
 */
import type { MenuEntry } from "../selectors/nav";
import { en } from "../strings/en";
import { hrefFor, type Route } from "../routes/router";
import { useApp } from "./AppContext";

export const entryHref = (e: MenuEntry): string =>
  e.w === "strategy" ? hrefFor({ kind: "strategy", entry: e.entry }) : e.w === "performance" ? hrefFor({ kind: "progress" }) : hrefFor({ kind: "org", tab: e.entry });

export const isCurrentEntry = (r: Route, e: MenuEntry): boolean =>
  e.w === "strategy"
    ? (r.kind === "strategy" && r.entry === e.entry) || (e.entry === "plan-document" && r.kind === "planDocument") || (e.entry === "communication" && r.kind === "boardPaper")
    : e.w === "performance" ? r.kind === "progress"
    : r.kind === "org" && !r.handover && r.tab === e.entry;

export function EntryRow({ w }: { w: "strategy" | "organisation" | "performance" }) {
  const { repo, route } = useApp();
  const entries = repo.menu()[w];
  if (!entries.length) return null;
  const overviewHref = w === "organisation" ? hrefFor({ kind: "org" }) : hrefFor({ kind: "workspace", w });
  const onOverview = !entries.some((e) => isCurrentEntry(route, e));
  const name = w === "organisation" ? en.setup.nav : en.nav[w];
  const cls = (here: boolean) =>
    `-mb-px inline-flex min-h-11 shrink-0 items-center border-b-4 px-3 text-14 ${here ? "border-navy font-bold text-navy" : "border-transparent text-muted hover:text-navy"}`;
  return (
    <nav aria-label={en.menu.rowLabel(name)} className="mb-4 flex gap-1 overflow-x-auto border-b border-border md:hidden">
      <a href={overviewHref} aria-current={onOverview ? "page" : undefined} className={cls(onOverview)}>{w === "organisation" ? en.setup.tabs.structureEntry : en.menu.overview}</a>
      {entries.map((e) => {
        const here = isCurrentEntry(route, e);
        return <a key={e.entry} href={entryHref(e)} aria-current={here ? "page" : undefined} className={cls(here)}>{en.menu.entry[e.label]}</a>;
      })}
    </nav>
  );
}
