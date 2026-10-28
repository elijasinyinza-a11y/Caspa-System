/** Display preferences shared across screens (Clarity Specification, section 6 and D4). */
import { useApp } from './AppContext';
import { usePref } from './Explain';

/** "Show codes": on by default for the Executive, Strategy office and Finance; anyone can switch it. */
export function useShowCodes(): [boolean, (v: boolean) => void] {
  const { repo, role } = useApp();
  const r = repo.viewer.roles;
  return usePref<boolean>(`codes:${role}`, r.includes('executive') || r.includes('strategy_office') || r.includes('finance'));
}
