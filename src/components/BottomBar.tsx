import { en } from "../strings/en";
import { useApp, workspaceOf } from "./AppContext";
import { WorkspaceIcon } from "./icons";

/** Phone layout: the sidebar becomes a bottom bar limited to the person's own workspaces. */
export function BottomBar() {
  const { repo, route, navigate } = useApp();
  // Phone layout review (slice 10, option A, 31 October 2026): every workspace the role has, at most five;
  // Organisation moves to the top bar on phones.
  const items = repo.workspaces();
  return (
    <nav
      aria-label={en.nav.label}
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-white md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <ul
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
        }}
      >
        {items.map((w) => {
          const active = workspaceOf(route) === w;
          return (
            <li key={w}>
              <a
                href={`#/${w}`}
                onClick={(e) => {
                  e.preventDefault();
                  navigate({ kind: "workspace", w });
                }}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-12 ${active ? "font-semibold text-navy" : "text-muted"}`}
              >
                <WorkspaceIcon w={w} />
                {en.nav[w]}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
