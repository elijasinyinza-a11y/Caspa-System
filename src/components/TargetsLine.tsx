/** The one line a broken-down KPI shows in Cascade (v0.21.0, Targets Specification section 5). Nothing else changes there. */
import { hrefFor } from "../routes/router";
import { formatDate, formatNumber } from "../selectors/format";
import { en } from "../strings/en";
import { useApp } from "./AppContext";

export function TargetsLine({ kpiId, unit }: { kpiId: string; unit: string }) {
  const { repo } = useApp();
  const l = repo.targets.cascadeLine(kpiId);
  if (!l) return null;
  const latest = l.combinedLatest === null ? "" : `${formatNumber(Math.round(l.combinedLatest * 10) / 10)}${unit === "%" ? "%" : ` ${unit}`}`;
  const reachable = repo.menu().performance.some((e) => e.entry === "targets");
  return (
    <p className="border-t border-border pt-3 text-14 text-text">
      {en.targets.cascadeLine(l.shares, latest)}{" "}
      {l.fromShares && (
        // TG-4: the KPI's figure comes from its verified shares, complete periods only.
        <span className="block text-13 text-muted">
          {l.fromShares.latest === null || l.fromShares.showing === null
            ? en.targets.fromSharesNone(l.fromShares.reported, l.fromShares.of)
            : l.fromShares.showing === l.fromShares.latest
              ? en.targets.fromShares(l.fromShares.reported, l.fromShares.of, formatDate(l.fromShares.latest))
              : en.targets.fromSharesShowing(l.fromShares.reported, l.fromShares.of, formatDate(l.fromShares.latest), formatDate(l.fromShares.showing))}
        </span>
      )}
      {reachable && <a className="inline-flex min-h-11 items-center font-semibold text-navy underline" href={hrefFor({ kind: "targets", breakdownId: l.breakdownId })}>{en.targets.cascadeLink}</a>}
    </p>
  );
}
