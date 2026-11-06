import { hrefFor, nodeHref } from "../routes/router";
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
  const { repo, route, navigate } = useApp();
  const [codes] = useShowCodes();
  const onMap = route.kind === "map";
  const n = route.kind === "node" ? repo.node(route.node, route.id) : onMap ? repo.node("objective", route.objectiveId) : null;
  // On a decision map the objective itself is the last link, and "Decision map" is the current step.
  const chain = n ? (onMap ? n.lineage : n.lineage.slice(0, -1)) : [];
  const terms = repo.settings().termLabels;
  const label = (r: { code: string; title: string }) => (codes ? r.code : short(r.title));
  return (
    <header className="sticky top-0 z-20 flex min-h-16 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-white px-4 py-2 md:flex-nowrap md:px-8 md:py-0">
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
                {onMap ? (
                  <span aria-current="page" className="truncate font-semibold text-navy">{en.decisionMap.title}</span>
                ) : (
                  <span aria-current="page" aria-label={`${terms[n.ref.kind].singular}: ${n.ref.title}`} title={n.ref.title} className="truncate font-semibold text-navy">
                    {label(n.ref)}
                  </span>
                )}
              </li>
            </>
          ) : (
            route.kind === "org" ? (
              <>
                <li className="font-semibold text-navy">{en.setup.nav}</li>
                <li aria-hidden="true" className="text-muted">›</li>
                <li aria-current="page" className="font-semibold text-navy">{route.handover ? en.vacancy.handover : route.tab === "people" ? en.menu.entry.people : route.tab ? en.vacancy.tab : repo.structureConfirmed() ? en.setup.crumbStructure : en.setup.crumbSetup}</li>
              </>
            ) : route.kind === "strategy" ? (
              <>
                <li><a href="#/strategy" className="inline-flex min-h-11 items-center text-muted hover:text-navy hover:underline">{en.nav.strategy}</a></li>
                <li aria-hidden="true" className="text-muted">›</li>
                <li aria-current="page" className="font-semibold text-navy">
                  {en.menu.entry[repo.menu().strategy.find((e) => e.entry === route.entry)?.label ?? route.entry] ?? en.nav.strategy}
                </li>
              </>
            ) : route.kind === "progress" || route.kind === "reviews" ? (
              <>
                <li><a href="#/performance" className="inline-flex min-h-11 items-center text-muted hover:text-navy hover:underline">{en.nav.performance}</a></li>
                <li aria-hidden="true" className="text-muted">›</li>
                <li aria-current="page" className="font-semibold text-navy">{en.menu.entry[route.kind === "reviews" ? "reviews" : "progress"]}</li>
              </>
            ) : (
              <li aria-current="page" className="font-semibold text-navy">
                {en.nav[workspaceOf(route) ?? "home"]}
              </li>
            )
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
        {/* Phones (slice 10, option A): Organisation sits here; the bottom bar holds the role's workspaces. */}
        <a
          href="#/organisation"
          onClick={(e) => { e.preventDefault(); navigate({ kind: "org" }); }}
          aria-current={route.kind === "org" ? "page" : undefined}
          title={en.setup.nav}
          className={`inline-flex h-11 w-11 items-center justify-center rounded-lg border md:hidden ${route.kind === "org" ? "border-navy bg-info-bg text-navy" : "border-control text-navy"}`}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="3" width="6" height="5" rx="1" /><rect x="3" y="16" width="6" height="5" rx="1" /><rect x="15" y="16" width="6" height="5" rx="1" />
            <path d="M12 8v4M6 16v-4h12v4" />
          </svg>
          <span className="sr-only">{en.setup.nav}</span>
        </a>
        <WaitingLinks />
      </div>
      {/* Development controls: on a phone they take their own row, so nothing is cut off at 390px. */}
      <div className="flex w-full min-w-0 items-center justify-end gap-2 md:w-auto md:shrink-0">
        <RoleSwitcher />
        <WorkOffline />
      </div>
    </header>
  );
}

/** What waits on this device, and what couldn't be sent, linking to where it is shown (slice 13). */
function WaitingLinks() {
  const { repo } = useApp();
  if (!repo.menu().performance.some((e) => e.entry === "progress")) return null;
  const w = repo.progress.waiting();
  const n = w.updates + w.decisions;
  const link = "inline-flex min-h-11 items-center rounded-full border px-3 text-13 font-semibold";
  return (
    <>
      {n > 0 && (
        <a href={hrefFor({ kind: "progress", tab: w.updates ? "mine" : "verify" })} className={`${link} border-info-border bg-info-bg text-info-text`}>
          <span className="hidden sm:inline">{w.updates && w.decisions ? en.capture.waitingBoth(n) : en.capture.waitingTop(n, !w.updates)}</span>
          <span className="sm:hidden" aria-hidden="true">{n}</span>
          <span className="sr-only sm:hidden">{w.updates && w.decisions ? en.capture.waitingBoth(n) : en.capture.waitingTop(n, !w.updates)}</span>
        </a>
      )}
      {w.failed > 0 && (
        <a href={hrefFor({ kind: "progress", tab: "mine" })} className={`${link} border-advisory-border bg-advisory-bg text-advisory-text`}>
          {en.capture.failedTop(w.failed)}
        </a>
      )}
    </>
  );
}

/**
 * Development switch "Work offline" (OP-7), beside the role switcher: acts as if this device had no connection.
 * Turning it off sends what waits, in the order saved, and says what happened.
 */
function WorkOffline() {
  const { repo, say } = useApp();
  const off = repo.progress.offline();
  const toggle = () => {
    const sent = repo.progress.setOffline(!off);
    if (!sent) return say(null);
    const who = repo.progress.page().mine?.verifier ?? en.capture.yourSupervisor;
    const parts: string[] = [];
    if (sent.sent && sent.failed) parts.push(en.capture.toasts.sentSome(sent.sent, sent.failed));
    else if (sent.sent) parts.push(en.capture.toasts.sent(sent.sent, who));
    else if (sent.failed) parts.push(en.capture.toasts.failed);
    if (sent.decisions) parts.push(en.capture.toasts.decisionsSent(sent.decisions));
    say(parts.length ? parts.join(" ") : null);
  };
  return (
    <button
      type="button"
      role="switch"
      aria-checked={off}
      onClick={toggle}
      title={en.capture.workOfflineHint}
      className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-dashed border-control bg-white px-2 text-13 font-semibold text-navy"
    >
      <span aria-hidden="true" className={`relative h-5 w-9 rounded-full border border-control ${off ? "bg-navy" : "bg-info-bg"}`}>
        <span className={`absolute top-0.5 h-3.5 w-3.5 rounded-full ${off ? "left-4 bg-white" : "left-0.5 bg-muted"}`} />
      </span>
      {/* The label shows where there is room; elsewhere it is read out and shown on pointing. */}
      <span className="hidden xl:inline">{en.capture.workOffline}</span>
      <span className="sr-only xl:hidden">{en.capture.workOffline}</span>
    </button>
  );
}

/** Shown under the top bar while this device is offline (OP-7). */
export function OfflineBar() {
  const { repo } = useApp();
  if (!repo.progress.offline()) return null;
  return (
    <div role="status" className="border-b border-advisory-border bg-advisory-bg px-4 py-2 text-14 text-advisory-text md:px-8">
      {en.capture.offlineBar}
    </div>
  );
}
