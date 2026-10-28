import { useId, useRef, useState } from "react";
import { aiStub, type AiDraft } from "../ai";
import type { FindingView } from "../data/access/repository";
import type { AcknowledgeResult } from "../data/access/repository";
import { isBlocking } from "../rules/integrity";
import { formatDate } from "../selectors/format";
import { useApp } from "./AppContext";
import type { NodeKind } from "../selectors/node";
import { hrefFor, nodeHref } from "../routes/router";
import { en } from "../strings/en";

type Explain =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; draft: AiDraft }
  | { state: "failed" };

const button =
  "inline-flex min-h-11 items-center rounded-lg border border-control bg-white px-3 text-14 font-semibold text-navy hover:bg-cream";

/**
 * One integrity finding. Hard blocks and advisory flags differ by written label, border weight and
 * background — never colour alone. The AI may explain a finding; it never clears one. An acknowledged
 * advisory flag stays listed with its reason, in the neutral Info style; a lapsed one is open again.
 */
export function FindingCard({
  view,
  here,
  onNavigate,
  short,
}: {
  view: FindingView;
  /** The node page this card sits on, so it does not link to itself. */
  here?: { node: NodeKind; id: string };
  onNavigate?: () => void;
  /** A short form of the message, used on the finding's own record page (Build Brief, section 18). */
  short?: string;
}) {
  const { repo } = useApp();
  const { finding, routedTo, routedToMe, fix, ack } = view;
  const block = isBlocking(finding);
  const acknowledged = ack.state === "acknowledged";
  const [explain, setExplain] = useState<Explain>({ state: "idle" });
  const [form, setForm] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<
    Exclude<AcknowledgeResult, { ok: true }>["error"] | null
  >(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const panelId = useId();
  const reasonId = useId();
  const open = explain.state !== "idle";

  const startAck = () => {
    setForm(true);
    setError(null);
    setTimeout(() => reasonRef.current?.focus(), 0);
  };
  const saveAck = () => {
    const r = repo.acknowledge(finding.key, reason);
    if (r.ok) {
      setForm(false);
      setReason("");
      setError(null);
    } else {
      setError(r.error);
      reasonRef.current?.focus();
    }
  };
  const tone = block
    ? "border-2 border-block-border bg-block-bg"
    : acknowledged
      ? "border border-info-border bg-info-bg"
      : "border border-advisory-border bg-advisory-bg";
  const labelTone = block
    ? "text-block-text"
    : acknowledged
      ? "text-info-text"
      : "text-advisory-text";

  const toggle = async () => {
    if (open) return setExplain({ state: "idle" });
    setExplain({ state: "loading" });
    try {
      setExplain({
        state: "ready",
        draft: await aiStub.explainFinding(finding),
      });
    } catch {
      setExplain({ state: "failed" });
    }
  };

  const showFix =
    fix &&
    !(
      here &&
      fix.kind === "node" &&
      fix.node === here.node &&
      fix.id === here.id
    );
  const fixHref = fix
    ? fix.kind === "node"
      ? nodeHref(fix.node, fix.id)
      : hrefFor({ kind: "workspace", w: fix.w })
    : "";
  const fixLabel = fix
    ? fix.kind === "node"
      ? en.integrity.fixNode(fix.code)
      : en.integrity.fixWorkspace(en.nav[fix.w])
    : "";

  return (
    <li className={`rounded-lg p-4 ${tone}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-12 font-bold ${labelTone}`}>
          {block ? en.integrity.hardBlock : en.integrity.advisoryFlag}
        </span>
        {acknowledged && (
          <span className="rounded-full border border-info-border bg-white px-2 py-0.5 text-12 font-semibold text-info-text">
            {en.integrity.acknowledged}
          </span>
        )}
        {routedToMe && (
          <span className="rounded-full border border-info-border bg-white px-2 py-0.5 text-12 font-semibold text-info-text">
            {en.integrity.sentToYou}
          </span>
        )}
      </div>
      <p className="mt-1 text-14 text-text">{short ?? finding.message}</p>
      <p className="mt-2 text-12 text-muted">
        {block
          ? en.integrity.blocks(
              en.list(finding.blocksAt.map((g) => en.gates[g])),
            )
          : en.integrity.advisoryNote}{" "}
        {en.integrity.routedTo(
          routedTo.length ? en.list(routedTo) : en.integrity.nobody,
        )}
      </p>
      {ack.state === "acknowledged" && (
        <div className="mt-2 rounded-lg border border-info-border bg-white p-3 text-13 text-text">
          <p>
            {en.integrity.ackBy(ack.by, formatDate(ack.on))}{" "}
            {en.integrity.ackLapseNote}
          </p>
          <p className="mt-1">{en.integrity.ackReason(ack.reason)}</p>
        </div>
      )}
      {ack.state === "lapsed" && (
        <p className="mt-2 text-13 text-text">
          {en.integrity.ackLapsed(ack.by, formatDate(ack.on))}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {showFix && (
          <a href={fixHref} onClick={onNavigate} className={button}>
            {fixLabel}
          </a>
        )}
        {view.canAcknowledge && !acknowledged && !form && (
          <button type="button" onClick={startAck} className={button}>
            {ack.state === "lapsed"
              ? en.integrity.acknowledgeAgain
              : en.integrity.acknowledge}
          </button>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={panelId}
          className={button}
        >
          {open ? en.integrity.explainHide : en.integrity.explain}
        </button>
      </div>
      {form && (
        <div className="mt-3 rounded-lg border border-control bg-white p-3">
          <label
            htmlFor={reasonId}
            className="block text-14 font-semibold text-navy"
          >
            {en.integrity.ackReasonLabel}
          </label>
          <p id={`${reasonId}-hint`} className="mt-1 text-12 text-muted">
            {en.integrity.ackReasonHint}
          </p>
          <textarea
            id={reasonId}
            ref={reasonRef}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError(null);
            }}
            rows={3}
            required
            aria-invalid={error === "reason_required"}
            aria-describedby={`${reasonId}-hint${error ? ` ${reasonId}-error` : ""}`}
            className="mt-2 w-full rounded-lg border border-control p-2 text-14 text-text"
          />
          {error && (
            <p
              id={`${reasonId}-error`}
              role="alert"
              className="mt-1 text-13 font-semibold text-block-text"
            >
              {en.integrity.ackError[error]}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveAck}
              className="inline-flex min-h-11 items-center rounded-lg bg-navy px-3 text-14 font-semibold text-white hover:bg-text"
            >
              {en.integrity.ackSave}
            </button>
            <button
              type="button"
              onClick={() => {
                setForm(false);
                setError(null);
              }}
              className={button}
            >
              {en.integrity.ackCancel}
            </button>
          </div>
        </div>
      )}
      {!fix && !here && (
        <p className="mt-2 text-12 text-muted">{en.integrity.noFixLink}</p>
      )}
      <div id={panelId} aria-live="polite">
        {explain.state === "loading" && (
          <p className="mt-3 text-13 text-muted">{en.integrity.explaining}</p>
        )}
        {explain.state === "failed" && (
          <p className="mt-3 text-13 text-text">{en.integrity.explainFailed}</p>
        )}
        {explain.state === "ready" && (
          <div className="mt-3 rounded-lg border border-info-border bg-white p-3">
            <div className="text-12 font-bold text-info-text">
              {en.integrity.aiDraft}
            </div>
            <p className="mt-1 text-14 text-text">{explain.draft.text}</p>
            <p className="mt-2 text-12 text-muted">{en.integrity.aiNote}</p>
          </div>
        )}
      </div>
    </li>
  );
}
