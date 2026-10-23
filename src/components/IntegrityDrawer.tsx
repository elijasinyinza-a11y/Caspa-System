import { useEffect, useRef, useState } from "react";
import { isBlocking } from "../rules/integrity";
import { en } from "../strings/en";
import { countFindings, type FindingView } from "../data/access/repository";
import { useApp } from "./AppContext";
import { FindingCard } from "./FindingCard";

type Severity = "all" | "blocks" | "advisory" | "acknowledged";

/** Hard blocks first, then open advisory flags (lapsed ones included), then acknowledged flags. */
const rank = (v: FindingView) =>
  isBlocking(v.finding) ? 0 : v.ack.state === "acknowledged" ? 2 : 1;
const bucket = (v: FindingView): Exclude<Severity, "all"> =>
  (["blocks", "advisory", "acknowledged"] as const)[rank(v)]!;

/**
 * The integrity drawer, available on every screen. Findings come from the rules engine through the
 * data-access layer on every render, so a fix anywhere shows here at once. Hard blocks come first.
 */
export function IntegrityDrawer({ onClose }: { onClose: () => void }) {
  const { repo } = useApp();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [severity, setSeverity] = useState<Severity>("all");
  const [mineOnly, setMineOnly] = useState(false);

  const all = [...repo.findings()].sort((x, y) => rank(x) - rank(y));
  const c = countFindings(all);
  const mine = all.filter((v) => v.routedToMe);
  const items = all
    .filter((v) => severity === "all" || bucket(v) === severity)
    .filter((v) => !mineOnly || v.routedToMe);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [onClose]);

  const options: { key: Severity; label: string }[] = [
    { key: "all", label: en.integrity.filterAll(all.length) },
    { key: "blocks", label: en.integrity.filterBlocks(c.blocking) },
    { key: "advisory", label: en.integrity.filterAdvisory(c.advisory) },
    ...(c.acknowledged > 0 || severity === "acknowledged"
      ? [
          {
            key: "acknowledged" as const,
            label: en.integrity.filterAcknowledged(c.acknowledged),
          },
        ]
      : []),
  ];

  return (
    <div
      className="fixed inset-0 z-30 flex justify-end bg-navy/30"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="findings-title"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-[440px] flex-col bg-white shadow-xl"
        style={{
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div className="flex items-start justify-between gap-4 p-5 pb-3">
          <h2 id="findings-title" className="text-18 font-bold text-navy">
            {en.integrity.drawerTitle}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={en.integrity.close}
            className="grid h-11 w-11 place-items-center rounded-lg border border-control text-18 text-navy hover:bg-cream"
          >
            ×
          </button>
        </div>
        <p className="px-5 text-13 text-muted">{en.integrity.drawerIntro}</p>

        {all.length > 0 && (
          <div className="mt-4 space-y-3 px-5">
            <fieldset>
              <legend className="sr-only">{en.integrity.filterLabel}</legend>
              <div className="flex flex-wrap gap-2">
                {options.map((o) => (
                  <label
                    key={o.key}
                    className={`flex min-h-11 cursor-pointer items-center rounded-full border px-3 text-13 font-semibold focus-within:outline focus-within:outline-[3px] focus-within:outline-offset-2 focus-within:outline-focus ${severity === o.key ? "border-navy bg-navy text-white" : "border-control bg-white text-navy hover:bg-cream"}`}
                  >
                    <input
                      type="radio"
                      name="severity"
                      value={o.key}
                      checked={severity === o.key}
                      onChange={() => setSeverity(o.key)}
                      className="sr-only"
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-14 text-text">
              <input
                type="checkbox"
                checked={mineOnly}
                onChange={(e) => setMineOnly(e.target.checked)}
                className="h-5 w-5 accent-navy"
              />
              {en.integrity.mineOnly(mine.length)}
            </label>
            <p className="text-12 text-muted" aria-live="polite">
              {en.integrity.summary(items.length, all.length)}
            </p>
          </div>
        )}

        <ul className="mt-3 flex-1 space-y-3 overflow-y-auto px-5 pb-5">
          {all.length === 0 && (
            <li className="rounded-lg border border-complete-border bg-complete-bg p-4 text-14 text-complete-text">
              {en.integrity.empty}
            </li>
          )}
          {all.length > 0 && items.length === 0 && (
            <li className="rounded-lg border border-info-border bg-info-bg p-4 text-14 text-info-text">
              {en.integrity.emptyFiltered}
            </li>
          )}
          {items.map((v) => (
            <FindingCard key={v.finding.key} view={v} onNavigate={onClose} />
          ))}
        </ul>
      </div>
    </div>
  );
}
