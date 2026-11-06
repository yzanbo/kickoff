import { PanelRight } from "lucide-react";
import type { PopoutRoute } from "@/app/popout";
import { postToMainWindow } from "@/app/windowBus";
import { flushMemoDrafts } from "@/features/memo/memoGuards";

/**
 * 別ウィンドウの「右の欄に戻す」: 中身をメインのウィンドウのチャットの画面の右の欄で開き直し（dockPopout）、このウィンドウを閉じる
 * （閉じ方は聞かない。メモの書きかけは残してから閉じるので、右の欄で未保存のまま続きを書ける）
 */
export function PopoutDockButton({ route }: { route: PopoutRoute }) {
  return (
    <button
      type="button"
      className="btn btn-sm"
      title="メインのウィンドウの、チャットの画面の右の欄で開き直して、このウィンドウを閉じる"
      onClick={() => {
        flushMemoDrafts();
        postToMainWindow({ type: "dockPopout", route });
        void (window.kickoff ? window.kickoff.windows.closeSelf() : window.close());
      }}
    >
      <PanelRight size={13} aria-hidden /> 右の欄に戻す
    </button>
  );
}
