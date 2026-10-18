/** Small line icons drawn in currentColor, so they take the token colour of their context. */
import type { WorkspaceKey } from '../strings/en';

const paths: Record<WorkspaceKey, string> = {
  home: 'M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z',
  strategy: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  cascade: 'M12 4v4M12 8H6v4M12 8h6v4M6 12v4m0 0H3m3 0h3m9-4v4m0 0h-3m3 0h3',
  plan: 'M5 4h14v16H5zM9 9h6M9 13h6M9 17h3',
  performance: 'M5 4h14v16H5zM8.5 12.5l2.5 2.5 4.5-5',
};

export function WorkspaceIcon({ w }: { w: WorkspaceKey }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[w]} />
    </svg>
  );
}
