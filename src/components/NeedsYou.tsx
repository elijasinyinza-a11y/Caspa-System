import type { NeedsYouItem } from "../selectors/needs-you";
import { formatDate } from "../selectors/format";
import { hrefFor } from "../routes/router";
import { en } from "../strings/en";
import { useApp } from "./AppContext";

/** When an item is due, in words. Overdue uses the advisory style; red stays reserved for hard blocks. */
function Due({ item }: { item: NeedsYouItem }) {
  if (!item.due) return <span className="text-13 text-muted">{en.needsYou.noDue}</span>;
  const d = item.daysOverdue ?? 0;
  if (d > 0) {
    return (
      <span className="inline-flex items-center rounded-full border border-advisory-border bg-advisory-bg px-2 py-0.5 text-12 font-semibold text-advisory-text">
        {en.needsYou.overdue(d, formatDate(item.due))}
      </span>
    );
  }
  return (
    <span className="tabular text-13 font-semibold text-navy">
      {d === 0 ? en.needsYou.dueToday : en.needsYou.due(formatDate(item.due))}
    </span>
  );
}

function Kind({ item }: { item: NeedsYouItem }) {
  const tone =
    item.severity === "blocking"
      ? "border-block-border bg-block-bg text-block-text"
      : item.severity === "advisory"
        ? "border-advisory-border bg-advisory-bg text-advisory-text"
        : "border-info-border bg-info-bg text-info-text";
  const label =
    item.severity === "blocking"
      ? en.integrity.hardBlock
      : item.severity === "advisory"
        ? en.integrity.advisoryFlag
        : en.needsYou.kind[item.kind];
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-12 font-semibold ${tone}`}>
      {label}
    </span>
  );
}

/** "Needs you": first on every home, merged across the person's roles, soonest first. */
export function NeedsYou({ items }: { items: NeedsYouItem[] }) {
  const { repo, openFindings } = useApp();
  const reachable = repo.workspaces();
  const action = (item: NeedsYouItem) => {
    const link = item.link;
    const cls =
      "inline-flex min-h-11 shrink-0 items-center rounded-lg border border-control bg-white px-3 text-14 font-semibold text-navy hover:bg-cream";
    if (!link) return null;
    if (link.kind === "findings") {
      return (
        <button type="button" onClick={openFindings} className={cls}>
          {en.needsYou.openFindings}
        </button>
      );
    }
    if (link.kind === "workspace" && !reachable.includes(link.w)) return null;
    const href = link.kind === "node" ? hrefFor({ kind: "node", node: link.node, id: link.id }) : hrefFor({ kind: "workspace", w: link.w });
    return (
      <a href={href} className={cls}>
        {en.needsYou.open}
        <span className="sr-only">: {item.title}</span>
      </a>
    );
  };

  return (
    <section aria-labelledby="needs-you" className="mb-6 rounded-xl border border-border bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="needs-you" className="text-18 font-bold text-navy">
          {en.needsYou.title} <span className="tabular text-muted">({items.length})</span>
        </h2>
      </div>
      <p className="mt-1 max-w-[70ch] text-13 text-muted">{en.needsYou.intro}</p>
      {items.length === 0 ? (
        <p className="mt-4 text-14 text-text">{en.needsYou.empty}</p>
      ) : (
        <ol className="mt-4 divide-y divide-border">
          {items.map((item) => (
            <li key={item.key} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Kind item={item} />
                  <Due item={item} />
                  {item.as && <span className="text-12 text-muted">{en.needsYou.as(en.needsYou.asRole[item.as])}</span>}
                </div>
                <p className="mt-1 text-14 font-semibold text-navy">{item.title}</p>
                {item.detail && <p className="text-13 text-muted">{item.detail}</p>}
              </div>
              {action(item)}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
