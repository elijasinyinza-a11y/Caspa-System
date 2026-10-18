import { createContext, useContext } from 'react';
import type { Repository } from '../data/access/repository';
import type { DEV_ROLE_MEMBERSHIPS } from '../data/sample/seed';
import type { WorkspaceKey } from '../strings/en';

export type DevRole = keyof typeof DEV_ROLE_MEMBERSHIPS;

export interface AppState {
  repo: Repository;
  role: DevRole;
  setRole: (r: DevRole) => void;
  route: WorkspaceKey;
  navigate: (w: WorkspaceKey) => void;
  openFindings: () => void;
}

export const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(AppContext);
  if (!v) throw new Error('useApp outside AppContext');
  return v;
}
