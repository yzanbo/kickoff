import { Activity } from "lucide-react";
import { useEffect, useState } from "react";
import type { DiagnosticsState } from "@shared/ipc";
import { useTicker } from "@/hooks/useTicker";
import { ErrorText } from "@/ui/ErrorText";
import { CloseButton } from "@/ui/IconButton";
import { DiagnosticsPath } from "./DiagnosticsPath";

/**
 * 性能の記録の様子（画面の右下の小さな印）。記録はメニューの「ヘルプ → 性能の記録を取る」か設定の「診断」から始まり、
 * メインプロセスが知らせる。記録中も操作を止めずに続けられるよう、ダイアログにはしない
 */
export function DiagnosticsIndicator() {
  const [state, setState] = useState<DiagnosticsState | null>(null);
  useEffect(() => window.kickoff?.diagnostics.onState(setState), []);
  if (!state) return null;
  return (
    <div className={`diagnostics-indicator ${state.state}`} role="status">
      <Activity size={14} aria-hidden className="diagnostics-icon" />
      <div className="diagnostics-body">
        <DiagnosticsMessage state={state} />
      </div>
      {(state.state === "done" || state.state === "error") && <CloseButton label="閉じる" size={14} onClick={() => setState(null)} />}
    </div>
  );
}

function DiagnosticsMessage({ state }: { state: DiagnosticsState }) {
  useTicker(state.state === "recording" ? 500 : 3_600_000);
  switch (state.state) {
    case "recording": {
      const left = Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000));
      return (
        <>
          <strong>性能を記録しています… あと {left} 秒</strong>
          <span className="muted small">重いと感じる操作（文字の入力など）を、そのまま続けてください</span>
        </>
      );
    }
    case "saving":
      return <strong>保存中…</strong>;
    case "error":
      return (
        <>
          <strong>記録できませんでした</strong>
          <ErrorText message={state.message} />
        </>
      );
    case "done": {
      const s = state.summary;
      return (
        <>
          <strong>性能の記録を保存しました</strong>
          <span className="muted small">
            画面の要素 {s.domNodes.toLocaleString()} 個 · メモリ {s.heapMB} MB · 1 秒あたり JavaScript {s.scriptMsPerSec} ms・レイアウト {s.layoutMsPerSec} ms
          </span>
          <DiagnosticsPath dir={state.dir} />
        </>
      );
    }
  }
}
