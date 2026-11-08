import { Folder, FolderPlus } from "lucide-react";
import { useState } from "react";
import { api } from "@/api";
import { useAction } from "@/hooks/useAction";
import { promptDialog, reportFailure } from "@/ui/dialogs";
import { ErrorText } from "@/ui/ErrorText";
import { InlineName } from "@/ui/InlineName";

/** プロジェクトのボードのツールバーの「整える」の「グループを作成」（名前を聞くダイアログで作る） */
export function GroupCreateToolButton({ projectId }: { projectId: number }) {
  const create = async () => {
    const name = await promptDialog({ title: "新しいグループ", label: "グループ名", placeholder: "例: コードレビュー", confirmLabel: "作成" });
    if (name?.trim()) await api.createGroup(projectId, name.trim()).catch(reportFailure("グループを作成できませんでした"));
  };
  return (
    <button className="btn btn-sm" onClick={() => void create()}>
      <FolderPlus size={13} /> <span className="btn-label">グループを作成</span>
    </button>
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
