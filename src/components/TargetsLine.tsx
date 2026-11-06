/** The one line a broken-down KPI shows in Cascade (v0.21.0, Targets Specification section 5). Nothing else changes there. */
import { hrefFor } from "../routes/router";
import { formatNumber } from "../selectors/format";
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
      {reachable && <a className="inline-flex min-h-11 items-center font-semibold text-navy underline" href={hrefFor({ kind: "targets", breakdownId: l.breakdownId })}>{en.targets.cascadeLink}</a>}
    </p>
  );
}
