import { Folder, FolderPlus } from "lucide-react";
import { InlineName } from "../InlineName";
import type { GroupBoardState } from "./useGroupBoard";

/** グループのボードの末尾の列・行: 「グループを作成」のボタン。押すと名前の入力欄（見出しと同じ形）になる */
export function GroupCreateForm({ board }: { board: GroupBoardState }) {
  if (!board.creating) {
    return (
      <button className="group-add" onClick={() => board.setCreating(true)}>
        <FolderPlus size={14} /> グループを作成
      </button>
    );
  }
  return (
    <header className="column-head">
      <Folder size={13} className="muted" aria-hidden />
      <InlineName placeholder="グループ名（例: コードレビュー）" onSubmit={board.createGroup} onCancel={() => board.setCreating(false)} />
    </header>
  );
}
