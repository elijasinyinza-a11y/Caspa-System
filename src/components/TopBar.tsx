import { nodeHref } from "../routes/router";
import { en } from "../strings/en";
import { useApp, workspaceOf } from "./AppContext";
import { IntegrityPill } from "./IntegrityPill";
import { useShowCodes } from "./prefs";
import { RoleSwitcher } from "./RoleSwitcher";

const short = (t: string, n = 24) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

/**
 * The top bar. On a record page the breadcrumb is the "Part of" chain, replacing the lineage strip
 * (Clarity Specification, D6): each step is a link with its full title for screen readers. On a phone the middle
 * steps shorten to "…"; the full chain stays in "Why this matters".
 */
export function TopBar() {
  const { repo, route } = useApp();
  const [codes] = useShowCodes();
  const n = route.kind === "node" ? repo.node(route.node, route.id) : null;
  const chain = n ? n.lineage.slice(0, -1) : [];
  const terms = repo.settings().termLabels;
  const label = (r: { code: string; title: string }) => (codes ? r.code : short(r.title));
  return (
    <header className="sticky top-0 z-20 flex min-h-16 items-center gap-3 border-b border-border bg-white px-4 md:px-8">
      {!n && (
        <div className="md:hidden">
          <div className="text-16 font-bold text-navy">{en.product}</div>
        </div>
      )}
      <nav aria-label={en.breadcrumbLabel} className={`min-w-0 flex-1 ${n ? "block" : "hidden md:block"}`}>
        <ol className="flex min-w-0 flex-nowrap items-center gap-x-2 overflow-hidden text-14 md:flex-wrap">
          <li className="hidden max-w-[220px] truncate text-muted md:block" title={repo.organisation().name}>
            {repo.organisation().name}
          </li>
          <li aria-hidden="true" className="hidden text-muted md:block">›</li>
          {n ? (
            <>
              <li className="hidden md:block">
                {repo.workspaces().includes("cascade") ? (
                  <a href="#/cascade" className="inline-flex min-h-11 items-center text-muted hover:text-navy hover:underline">{en.nav.cascade}</a>
                ) : (
                  <span className="text-muted">{en.nav.cascade}</span>
                )}
              </li>
              {/* On a phone, "…" links to the record one level up; the full chain is in "Why this matters". */}
              {chain.length > 0 && (
                <li className="md:hidden">
                  <a
                    href={nodeHref(chain[chain.length - 1]!.kind, chain[chain.length - 1]!.id)}
                    aria-label={`${terms[chain[chain.length - 1]!.kind].singular}: ${chain[chain.length - 1]!.title}`}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center text-muted"
                  >
                    …
                  </a>
                </li>
              )}
              {chain.map((r) => (
                <li key={r.id} className="hidden min-w-0 items-center gap-2 md:flex">
                  <span aria-hidden="true" className="text-muted">›</span>
                  <a
                    href={nodeHref(r.kind, r.id)}
                    aria-label={`${terms[r.kind].singular}: ${r.title}`}
                    title={r.title}
                    className="inline-flex min-h-11 min-w-0 items-center truncate whitespace-nowrap text-muted hover:text-navy hover:underline"
                  >
                    {label(r)}
                  </a>
                </li>
              ))}
              <li className="flex min-w-0 items-center gap-2">
                <span aria-hidden="true" className="text-muted">›</span>
                <span aria-current="page" aria-label={`${terms[n.ref.kind].singular}: ${n.ref.title}`} title={n.ref.title} className="truncate font-semibold text-navy">
                  {label(n.ref)}
                </span>
              </li>
            </>
          ) : (
            <li aria-current="page" className="font-semibold text-navy">
              {en.nav[workspaceOf(route)]}
            </li>
          )}
        </ol>
      </nav>
      <div className="ml-auto flex shrink-0 items-center gap-2 md:gap-3">
        <span className="hidden sm:block">
          <IntegrityPill />
        </span>
        <span className="sm:hidden">
          <IntegrityPill compact />
        </span>
        <RoleSwitcher />
      </div>
    </header>
  );
}
