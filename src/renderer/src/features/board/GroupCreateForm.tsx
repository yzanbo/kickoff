import { Folder, FolderPlus } from "lucide-react";
import { useState } from "react";
import { api } from "@/api";
import { useAction } from "@/hooks/useAction";
import { promptDialog, reportFailure } from "@/ui/dialogs";
import { ErrorText } from "@/ui/ErrorText";
import { InlineName } from "@/ui/InlineName";
import type { GroupBoardState } from "./useGroupBoard";

/**
 * ツールバーの「整える」の「グループを作成」（プロジェクトのカンバンとグループのボードで同じボタン。列の分け方を切り替えてもツールバーの形が変わらないように両方に置く）。
 * onClick を省くと、名前を聞くダイアログで作る（カンバン。グループの列がないので、その場の名前の欄を出す所がない）
 */
export function GroupCreateToolButton({ projectId, onClick }: { projectId: number; onClick?: () => void }) {
  const create = async () => {
    const name = await promptDialog({ title: "新しいグループ", label: "グループ名", placeholder: "例: コードレビュー", confirmLabel: "作成" });
    if (name?.trim()) await api.createGroup(projectId, name.trim()).catch(reportFailure("グループを作成できませんでした"));
  };
  return (
    <button className="btn btn-sm" onClick={onClick ?? (() => void create())}>
      <FolderPlus size={13} /> <span className="btn-label">グループを作成</span>
    </button>
  );
}

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
 * 全プロジェクトのボード（列: グループ。ボード・リストとも）の、プロジェクトの段の見出しの「グループを作成」（プロジェクト名の右）。
 * 押すとその場で名前の入力欄になり、決めるとそのプロジェクトにグループを作る（段の中のいちばん下・いちばん右に置くと、グループの多いプロジェクトで探しにくいため）
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
