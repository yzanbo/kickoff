import type { ReactNode } from "react";

/** 入力欄の 1 行（名前・入力・補足） */
export function Field({ label, help, children }: { label: ReactNode; help?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {help && <span className="field-help">{help}</span>}
    </label>
  );
}
