import { Folder, FolderPlus } from "lucide-react";
import { useState } from "react";
import { api } from "@/api";
import { useAction } from "@/hooks/useAction";
import { ErrorText } from "@/ui/ErrorText";
import { InlineName } from "@/ui/InlineName";
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

/**
 * 全プロジェクトのボードのリスト（列: グループ）の、プロジェクトの段の見出しの「グループを作成」（プロジェクト名の右）。
 * 押すとその場で名前の入力欄になり、決めるとそのプロジェクトにグループを作る（段の中のいちばん下に並べると、グループの多いプロジェクトで探しにくいため）
 */
export function LaneGroupCreate({ projectId }: { projectId: number }) {
  const [creating, setCreating] = useState(false);
  const { error, guard } = useAction();
  return (
    <span className="lane-group-create">
      {creating ? (
        <>
          <Folder size={13} className="muted" aria-hidden />
          <InlineName
            placeholder="グループ名（例: コードレビュー）"
            onSubmit={(name) => {
              setCreating(false);
              void guard(() => api.createGroup(projectId, name));
            }}
            onCancel={() => setCreating(false)}
          />
        </>
      ) : (
        <button type="button" className="lane-group-add" onClick={() => setCreating(true)}>
          <FolderPlus size={13} /> グループを作成
        </button>
      )}
      <ErrorText message={error} />
    </span>
  );
}
