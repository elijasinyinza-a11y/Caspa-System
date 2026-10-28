import { useLayoutEffect, useRef, useState } from "react";
import { en, type WorkspaceKey } from "../strings/en";
import { identity } from "./identity";

/**
 * Every workspace states its place in the 7Cs of leading strategy. With `clampTitle` (node pages,
 * Build Brief section 18) a long title shows on two lines at a smaller size, with "Show full title".
 */
export function WorkspaceHeader({
  w,
  title,
  intro,
  clampTitle = false,
}: {
  w: WorkspaceKey;
  title: string;
  intro: string;
  clampTitle?: boolean;
}) {
  const [full, setFull] = useState(false);
  const [long, setLong] = useState(false);
  const ref = useRef<HTMLHeadingElement>(null);
  // Offer "Show full title" only when the two-line clamp actually cuts the title.
  useLayoutEffect(() => {
    if (!clampTitle || full) return;
    const h = ref.current;
    setLong(!!h && h.scrollHeight > h.clientHeight + 1);
  }, [clampTitle, full, title]);
  return (
    <div className="mb-6">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-13">
        <span
          className={`flex items-center gap-2 font-semibold ${identity[w].text}`}
        >
          <span
            aria-hidden="true"
            className={`h-2.5 w-2.5 rounded-sm ${identity[w].mark}`}
          />
          {en.nav[w]}
        </span>
        <span className="text-muted">
          {en.sevenCPrefix} {en.sevenC[w]}
        </span>
      </p>
      {clampTitle ? (
        <h1
          ref={ref}
          className={`mt-2 max-w-[70ch] text-22 font-bold text-navy md:text-28 ${full ? "" : "line-clamp-2"}`}
        >
          {title}
        </h1>
      ) : (
        <h1 className="mt-2 text-28 font-bold text-navy md:text-34">{title}</h1>
      )}
      {clampTitle && (long || full) && (
        <button
          type="button"
          onClick={() => setFull(!full)}
          aria-expanded={full}
          className="inline-flex min-h-11 items-center text-14 font-semibold text-navy underline underline-offset-4"
        >
          {full ? en.node.hideFullTitle : en.node.showFullTitle}
        </button>
      )}
      <p className="mt-1 max-w-[70ch] text-14 text-muted">{intro}</p>
    </div>
  );
}
