import type { ReactNode } from "react";

export default function ContextHelp({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return <>
    <button type="button" className="context-help" aria-label={label} popoverTarget={id}
      style={{ anchorName: `--${id}` }}>?</button>
    <div id={id} className="context-help-popover" popover="auto" role="note" aria-label={label}
      style={{ positionAnchor: `--${id}` }}>
      {children}
    </div>
  </>;
}
