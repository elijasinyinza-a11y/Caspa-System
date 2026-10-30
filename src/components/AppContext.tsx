import { createContext, useContext } from "react";
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
  route: Route;
  navigate: (r: Route) => void;
  openFindings: () => void;
}

export const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(AppContext);
  if (!v) throw new Error("useApp outside AppContext");
  return v;
}

/** The workspace a route belongs to, for navigation highlights. Node pages sit in Cascade. */
export const workspaceOf = (r: Route) =>
  r.kind === "workspace" ? r.w : "cascade";
