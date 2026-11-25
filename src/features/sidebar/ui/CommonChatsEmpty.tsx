import { SquarePen } from "lucide-react";
import { open } from "@/foundation/ui/navigation/open";

/**
 * 共通の枠の、チャットがないときの案内（枠はいつも出すので、空のときは何をする所かと始め方を出す）。
 * ボタンは見出しの「新しいチャット」と同じく、共通の新しいチャットを開く
 */
export function CommonChatsEmpty({ projectId }: { projectId: number }) {
  return (
    <div className="workspace-empty">
      <p className="empty-note workspace-empty-text">どのプロジェクトにも属さない相談・調べものはここで。始めたチャットは、ここに並びます。</p>
      <button className="sidebar-new" onClick={() => open({ kind: "newChat", projectId })}>
        <SquarePen size={14} /> 新しいチャット
      </button>
    </div>
  );
}
