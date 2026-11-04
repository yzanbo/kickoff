import { CircleDot, Folder } from "lucide-react";
import { useSharedChoice } from "@/hooks/useStoredState";
import { navigate } from "@/app/router";
import { BOARD_COLUMNS_KEY } from "@/lib/storageKeys";
import { Segmented } from "@/ui/Segmented";

export type BoardColumns = "state" | "groups";
const BOARD_COLUMNS_CHOICES: readonly BoardColumns[] = ["state", "groups"];

/** プロジェクトのボードの列の分け方（最後に見た方。ボードのタブのリンク先に使う） */
export function useBoardColumns() {
  return useSharedChoice<BoardColumns>(BOARD_COLUMNS_KEY, BOARD_COLUMNS_CHOICES, "state");
}

/**
 * プロジェクトのボードの列の切り替え（状態 = カンバン / グループ = 自分で作ったグループの列）。
 * 選んだ方の画面へ移る（グループの列は以前の「グループ」タブの画面。最後に見た方は ProjectPage が覚える）
 */
export function BoardColumnsToggle({ projectId, value }: { projectId: number; value: BoardColumns }) {
  // 選んだ方は、移った先の画面（ProjectPage）が覚える
  return (
    <Segmented<BoardColumns>
      className="view-toggle"
      label="列の分け方"
      value={value}
      onChange={(next) => navigate({ name: "project", id: projectId, tab: next === "groups" ? "groups" : "board" })}
      options={[
        { value: "state", label: "状態", icon: CircleDot },
        { value: "groups", label: "グループ", icon: Folder },
      ]}
    />
  );
}
