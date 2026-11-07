import { CircleDot, Folder, LayoutGrid } from "lucide-react";
import { useSetting } from "@/hooks/useSetting";
import { navigate } from "@/app/router";
import type { SettingValue } from "@/lib/storage";
import { ALL_PROJECTS_BOARD_COLUMNS, PROJECT_BOARD_COLUMNS } from "@/lib/storageKeys";
import { Segmented } from "@/ui/Segmented";

export type BoardColumns = SettingValue<typeof PROJECT_BOARD_COLUMNS>;

/** プロジェクトのボードの列の分け方（最後に見た方。ボードのタブのリンク先に使う） */
export function useBoardColumns() {
  return useSetting(PROJECT_BOARD_COLUMNS);
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

export type AllProjectsColumns = SettingValue<typeof ALL_PROJECTS_BOARD_COLUMNS>;

/** 全プロジェクトのボードの列の分け方（状態ごと / 分けない。覚えておく） */
export function useAllProjectsColumns() {
  return useSetting(ALL_PROJECTS_BOARD_COLUMNS);
}

/**
 * 全プロジェクトのボードの列の切り替え（状態 = 作業中・回答待ち・未読・既読と下書きの列 / 分けない = 下書きもチャットも状態で分けずに 1 つの並び）。
 * プロジェクトのボードの「状態 / グループ」と同じ位置に置く（全プロジェクトにはグループの列がないので、代わりに分けない並び）
 */
export function AllProjectsColumnsToggle() {
  const [value, setValue] = useAllProjectsColumns();
  return (
    <Segmented<AllProjectsColumns>
      className="view-toggle"
      label="列の分け方"
      value={value}
      onChange={setValue}
      options={[
        { value: "state", label: "状態", icon: CircleDot, tip: "下書き・作業中・回答待ち・未読・既読の列に分ける" },
        { value: "none", label: "分けない", icon: LayoutGrid, tip: "状態で分けずに、下書き → 最近動いた順に並べる" },
      ]}
    />
  );
}
