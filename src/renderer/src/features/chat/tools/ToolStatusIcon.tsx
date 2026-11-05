import { Check, Minus, X } from "lucide-react";
import { TOOL_STATUS_LABELS, type ToolStatus } from "./toolStatus";

/** ツールの呼び出し・まとまりの状態のアイコン（行の左端）: 実行中 = 回る印 / 完了 = ✓ / 失敗 = ✕ / 中断 = − */
export function ToolStatusIcon({ status }: { status: ToolStatus }) {
  const label = TOOL_STATUS_LABELS[status];
  return (
    <span className={`tool-status ${status}`} role="img" aria-label={label} title={label}>
      {status === "running" ? (
        <span className="spinner small" />
      ) : status === "done" ? (
        <Check size={13} strokeWidth={2.5} aria-hidden />
      ) : status === "failed" ? (
        <X size={13} strokeWidth={2.5} aria-hidden />
      ) : (
        <Minus size={13} strokeWidth={2.5} aria-hidden />
      )}
    </span>
  );
}
