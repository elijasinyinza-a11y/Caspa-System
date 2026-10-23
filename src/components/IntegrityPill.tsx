import { countFindings } from "../data/access/repository";
import { en } from "../strings/en";
import { useApp } from "./AppContext";

/** Counts come from the rules engine through the data-access layer on every render. */
export function IntegrityPill({ compact = false }: { compact?: boolean }) {
  const { repo, openFindings } = useApp();
  const {
    blocking: b,
    advisory: a,
    acknowledged: k,
    total,
  } = countFindings(repo.findings());
  return (
    <button
      type="button"
      onClick={openFindings}
      aria-label={en.integrity.pillLabel(b, a, k)}
      aria-haspopup="dialog"
      className="flex min-h-11 items-center gap-2 rounded-full border border-control bg-white px-3 text-14 text-text hover:border-navy"
    >
      {total === 0 ? (
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="grid h-5 w-5 place-items-center rounded-full border border-complete-border bg-complete-bg text-12 font-bold text-complete-text"
          >
            ✓
          </span>
          {!compact && en.integrity.allClear}
        </span>
      ) : (
        <>
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="tabular grid h-6 min-w-6 place-items-center rounded-full bg-block-text px-1 text-12 font-bold text-white"
            >
              {b}
            </span>
            {!compact && en.integrity.blocking}
          </span>
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="tabular grid h-6 min-w-6 place-items-center rounded-full border border-advisory-border bg-advisory-bg px-1 text-12 font-bold text-advisory-text"
            >
              {a}
            </span>
            {!compact && en.integrity.advisory}
          </span>
          {k > 0 && !compact && (
            <span className="flex items-center gap-1.5 text-muted">
              <span
                aria-hidden="true"
                className="tabular grid h-6 min-w-6 place-items-center rounded-full border border-info-border bg-info-bg px-1 text-12 font-bold text-info-text"
              >
                {k}
              </span>
              {en.integrity.acknowledgedShort}
            </span>
          )}
        </>
      )}
    </button>
  );
}
