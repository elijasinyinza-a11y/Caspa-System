import type { ProgressStatus } from "../rules/kpi-progress";
import { formatPercent } from "../selectors/format";
import { en } from "../strings/en";

/** Status always carries its written label; colour is never the only signal. Red stays reserved for hard blocks. */
const tone: Record<ProgressStatus, string> = {
  on_track: "border-complete-border bg-complete-bg text-complete-text",
  target_met: "border-complete-border bg-complete-bg text-complete-text",
  at_risk: "border-advisory-border bg-advisory-bg text-advisory-text",
  behind: "border-advisory-border bg-advisory-bg text-advisory-text",
  target_not_met: "border-advisory-border bg-advisory-bg text-advisory-text",
  no_data: "border-info-border bg-info-bg text-info-text",
};

export function StatusBadge({ status }: { status: ProgressStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-12 font-semibold ${tone[status]}`}
    >
      {en.status[status]}
    </span>
  );
}

/**
 * A progress bar: the bar clamps to 0–100% (P3), the text shows the true value. The thin mark is the
 * share expected by now (P10). With no figure, the bar is empty and says "No data", never 0%.
 */
export function ProgressBar({
  share,
  trueShare,
  expected,
  status,
  label,
  compact = false,
}: {
  share: number | null;
  trueShare?: number | null;
  expected?: number;
  status: ProgressStatus;
  label: string;
  compact?: boolean;
}) {
  const shown = trueShare === undefined ? share : trueShare;
  const pct = shown === null ? null : formatPercent(shown);
  // In a compact row with no reading yet, the status words alone say it; an empty bar adds nothing.
  if (compact && pct === null) return <StatusBadge status={status} />;
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div
        className={`relative ${compact ? "h-1.5" : "h-2"} min-w-[64px] flex-1 rounded-full bg-info-bg`}
        role="img"
        aria-label={en.progress.bar(
          label,
          pct ?? en.status.no_data,
          en.status[status],
        )}
      >
        {share !== null && (
          <div
            className={`${compact ? "h-1.5" : "h-2"} rounded-full bg-chart-1`}
            style={{ width: `${Math.min(100, Math.max(0, share * 100))}%` }}
          />
        )}
        {expected !== undefined && share !== null && (
          <div
            aria-hidden="true"
            className="absolute -top-1 h-[calc(100%+8px)] w-0.5 rounded bg-chart-2"
            style={{ left: `calc(${Math.min(100, expected * 100)}% - 1px)` }}
          />
        )}
      </div>
      <span className="tabular w-12 shrink-0 text-right text-14 font-semibold text-navy">
        {pct ?? "—"}
      </span>
      <StatusBadge status={status} />
    </div>
  );
}
