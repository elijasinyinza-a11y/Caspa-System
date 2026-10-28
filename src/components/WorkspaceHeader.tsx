import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { en, type WorkspaceKey } from "../strings/en";
import { Explain, usePref } from "./Explain";
import { identity } from "./identity";

/** The 7Cs stage a workspace sits in, explained on tap with the confirmed lines from the book. */
function SevenCStage({ stage }: { stage: string }) {
  const named = Object.keys(en.book.sevenCStage).filter((c) => stage.includes(c));
  return (
    <Explain
      term={<span className="text-muted underline decoration-dotted underline-offset-4">{en.sevenCPrefix} {stage}</span>}
      label={en.explain.open(`${en.sevenCPrefix} ${stage}`)}
      triggerClass="inline-flex min-h-11 items-center text-13"
    >
      <span className="block font-semibold">{en.explain.sevenCIntro(stage)}</span>
      <span className="mt-1 block">{en.book.sevenC.text}</span>
      {named.map((c) => (
        <span key={c} className="mt-2 block"><span className="font-semibold">{c}: </span>{en.book.sevenCStage[c]!.text}</span>
      ))}
      <span className="mt-1 block text-12 text-border">{en.explain.source}</span>
    </Explain>
  );
}

/**
 * Every workspace opens with its name, its place in the 7Cs and one plain purpose sentence (Clarity Specification,
 * principle C1), a "What is this page?" link, a first-visit note and at most one next step (C6).
 * With `clampTitle` a long title shows on two lines with "Show full title" (Build Brief, section 18).
 */
export function WorkspaceHeader({
  w,
  title,
  intro,
  clampTitle = false,
  next,
}: {
  w: WorkspaceKey;
  title: string;
  intro: string;
  clampTitle?: boolean;
  /** The one next step for this person on this screen, if any. */
  next?: ReactNode;
}) {
  const [full, setFull] = useState(false);
  const [long, setLong] = useState(false);
  const [help, setHelp] = useState(false);
  const [seen, setSeen] = usePref<boolean>(`seen:${w}`, false);
  const ref = useRef<HTMLHeadingElement>(null);
  // Offer "Show full title" only when the two-line clamp actually cuts the title.
  useLayoutEffect(() => {
    if (!clampTitle || full) return;
    const h = ref.current;
    setLong(!!h && h.scrollHeight > h.clientHeight + 1);
  }, [clampTitle, full, title]);
  const page = en.pageHelp[w];
  return (
    <div className="mb-6">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-0 text-13">
        <span className={`flex items-center gap-2 font-semibold ${identity[w].text}`}>
          <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-sm ${identity[w].mark}`} />
          {en.nav[w]}
        </span>
        <SevenCStage stage={en.sevenC[w]} />
      </p>
      {clampTitle ? (
        <h1 ref={ref} className={`mt-1 max-w-[70ch] text-22 font-bold text-navy md:text-28 ${full ? "" : "line-clamp-2"}`}>
          {title}
        </h1>
      ) : (
        <h1 className="mt-1 text-28 font-bold text-navy md:text-34">{title}</h1>
      )}
      {clampTitle && (long || full) && (
        <button type="button" onClick={() => setFull(!full)} aria-expanded={full} className="inline-flex min-h-11 items-center text-14 font-semibold text-navy underline underline-offset-4">
          {full ? en.node.hideFullTitle : en.node.showFullTitle}
        </button>
      )}
      <p className="mt-1 max-w-[70ch] text-16 text-text">{intro}</p>
      {!clampTitle && (
        <>
          <button type="button" aria-expanded={help} onClick={() => setHelp(!help)} className="inline-flex min-h-11 items-center text-14 font-semibold text-navy underline underline-offset-4">
            {help ? en.pageHelp.hide : en.pageHelp.link}
          </button>
          {help && (
            <dl className="mt-1 max-w-[70ch] space-y-1 rounded-lg bg-info-bg p-4 text-14">
              <div><dt className="inline font-semibold text-navy">{en.pageHelp.shows}: </dt><dd className="inline">{page.shows}</dd></div>
              <div><dt className="inline font-semibold text-navy">{en.pageHelp.connects}: </dt><dd className="inline">{page.connects}</dd></div>
              <div><dt className="inline font-semibold text-navy">{en.pageHelp.usually}: </dt><dd className="inline">{page.usually}</dd></div>
            </dl>
          )}
          {!seen && (
            <div role="note" className="mt-3 flex max-w-[80ch] flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-white px-4 py-3">
              <p className="text-14 text-text">{en.firstVisit[w]}</p>
              <button type="button" onClick={() => setSeen(true)} className="min-h-11 rounded-lg border border-control bg-white px-4 text-14 font-semibold text-navy hover:border-navy">
                {en.firstVisit.dismiss}
              </button>
            </div>
          )}
        </>
      )}
      {next && (
        <div className="mt-3 flex max-w-[80ch] flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-white px-4 py-3 ring-1 ring-border">
          <span className="text-13 text-muted">{en.nextStep}</span>
          {next}
        </div>
      )}
    </div>
  );
}
