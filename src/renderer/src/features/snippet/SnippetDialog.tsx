import { useModalDialog } from "@/hooks/useModalDialog";
import { CloseButton } from "@/ui/IconButton";
import { openSettings } from "@/features/settings/openSettings";
import { SnippetManager, type SnippetEditing } from "./SnippetManager";

/**
 * チャット欄の帯の「定型文を管理」で開くダイアログ。このプロジェクトで使う定型文（共通とこのプロジェクトだけのもの）を、
 * 設定と同じ SnippetManager で足す・直す・並べ替える・消す。ほかのプロジェクトのものも含めたすべては、設定の「定型文」で見る
 */
export function SnippetDialog({ projectId, initialEditing, onClose }: { projectId: number; initialEditing?: SnippetEditing; onClose: () => void }) {
  // 書きかけのフォームを、背景を押して消さない
  const dialog = useModalDialog({ closeOnBackdrop: false });
  return (
    <dialog ref={dialog.ref} className="dialog app-dialog snippet-dialog" aria-label="定型文" onClose={onClose}>
      <div className="app-dialog-body">
        <div className="snippet-dialog-head">
          <h2 className="app-dialog-title">定型文</h2>
          <CloseButton title="閉じる（Esc）" size={16} onClick={dialog.close} />
        </div>
        <SnippetManager projectId={projectId} initialEditing={initialEditing} />
        <div className="snippet-dialog-foot">
          <button
            type="button"
            className="link-button small"
            onClick={() => {
              dialog.close();
              openSettings("snippets");
            }}
          >
            ほかのプロジェクトのものも含めて、すべての定型文を設定で見る
          </button>
        </div>
      </div>
    </dialog>
  );
}
