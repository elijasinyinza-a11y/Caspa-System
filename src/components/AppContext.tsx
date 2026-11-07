import { createContext, useContext } from "react";
import type { ISODate } from "../contract/caspa-data-contract";
import type { Repository } from "../data/access/repository";
import type { DevRole } from "../data/sample/all";
import type { Route } from "../routes/router";

export type { DevRole };

export interface AppState {
  repo: Repository;
  role: DevRole;
  setRole: (r: DevRole) => void;
  orgId: string;
  setOrgId: (id: string) => void;
  /** Development only: every organisation in the review build, the roles available in the current one, and the dates (D15-10). */
  dev: { orgs: { id: string; name: string }[]; roles: DevRole[]; dates: ISODate[] };
  /** The date the review build runs at (D15-10). */
  now: ISODate;
  setNow: (d: ISODate) => void;
  /** The repository on the organisation's records as they are, for actions on next year's draft (D15-7). */
  base: Repository;
  /** Cascade and record pages show this year, or next year's draft (D15-7). */
  year: 'this' | 'next';
  setYear: (y: 'this' | 'next') => void;
  /** Next year's draft, when a confirmed plan's first year is not yet published. */
  nextYear: { label: string; planTitle: string } | null;
  /** The pages on screen show next year's draft. */
  preview: boolean;
  route: Route;
  navigate: (r: Route) => void;
  openFindings: () => void;
  /** A short confirmation read out to screen readers and shown under the top bar until the next page (v0.18.0). */
  toast: string | null;
  say: (message: string | null) => void;
}

export const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(AppContext);
  if (!v) throw new Error("useApp outside AppContext");
  return v;
}

/** The workspace a route belongs to, for navigation highlights. Node pages sit in Cascade. */
export const workspaceOf = (r: Route) =>
  r.kind === "workspace" ? r.w : r.kind === "org" ? null : r.kind === "planDocument" || r.kind === "strategy" || r.kind === "boardPaper" ? "strategy" : r.kind === "progress" || r.kind === "reviews" || r.kind === "targets" || r.kind === "contracts" || r.kind === "print" ? "performance" : r.kind === "survey" ? "home" : "cascade";
