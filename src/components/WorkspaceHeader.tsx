import { en, type WorkspaceKey } from "../strings/en";
import { identity } from "./identity";

/** Every workspace states its place in the 7Cs of leading strategy. */
export function WorkspaceHeader({
  w,
  title,
  intro,
}: {
  w: WorkspaceKey;
  title: string;
  intro: string;
}) {
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
      <h1 className="mt-2 text-28 font-bold text-navy md:text-34">{title}</h1>
      <p className="mt-1 max-w-[70ch] text-14 text-muted">{intro}</p>
    </div>
  );
}
