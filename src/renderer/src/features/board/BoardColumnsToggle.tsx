import { CircleDot, Folder, FolderKanban, LayoutGrid } from "lucide-react";
import { useSetting } from "@/hooks/useSetting";
import { navigate } from "@/app/router";
import type { SettingValue } from "@/lib/storage";
import { ALL_PROJECTS_BOARD_COLUMNS, BOARD_GROUPS_BY_STATE, PROJECT_BOARD_COLUMNS } from "@/lib/storageKeys";
import { Segmented } from "@/ui/Segmented";

export type BoardColumns = SettingValue<typeof PROJECT_BOARD_COLUMNS>;

/** プロジェクトのボードの列の分け方（最後に見た方。ボードのタブのリンク先に使う） */
export function useBoardColumns() {
  return useSetting(PROJECT_BOARD_COLUMNS);
}

/** グループの列の中を状態で小分けにするか（列の分け方の「グループ×状態」。グループのボード・全プロジェクトの列: グループで共通） */
export function useGroupsByState() {
  return useSetting(BOARD_GROUPS_BY_STATE);
}

/** 列の分け方のボタンの「グループ×状態」（グループの列の中を状態の小見出しで区切る） */
const GROUPS_STATE_OPTION = {
  value: "groupsState" as const,
  label: "グループ×状態",
  icon: FolderKanban,
  tip: "グループの列の中を、状態（作業中・回答待ち・未読・既読）で小分けにする",
};

/**
 * プロジェクトのボードの列の切り替え（状態 = カンバン / グループ = 自分で作ったグループの列 / グループ×状態 = グループの列の中を状態で小分け）。
 * 選んだ方の画面へ移る（グループの列は以前の「グループ」タブの画面。最後に見た方は ProjectPage が覚える）
 */
export function BoardColumnsToggle({ projectId, value }: { projectId: number; value: BoardColumns }) {
  const [byState, setByState] = useGroupsByState();
  // 選んだ方は、移った先の画面（ProjectPage）が覚える。グループ×状態はグループのボードで、中の小分けだけを覚える
  return (
    <Segmented<BoardColumns | "groupsState">
      className="view-toggle"
      label="列の分け方"
      value={value === "groups" && byState ? "groupsState" : value}
      onChange={(next) => {
        if (next !== "state") setByState(next === "groupsState");
        navigate({ name: "project", id: projectId, tab: next === "state" ? "board" : "groups" });
      }}
      options={[{ value: "state", label: "状態", icon: CircleDot }, { value: "groups", label: "グループ", icon: Folder }, GROUPS_STATE_OPTION]}
    />
  );
}

export type AllProjectsColumns = SettingValue<typeof ALL_PROJECTS_BOARD_COLUMNS>;

/** 全プロジェクトのボードの列の分け方（状態ごと / 分けない。覚えておく） */
export function useAllProjectsColumns() {
  return useSetting(ALL_PROJECTS_BOARD_COLUMNS);
}

/**
 * 全プロジェクトのボードの列の切り替え（状態 = 作業中・回答待ち・未読・既読と下書きの列 / グループ = プロジェクトの段ごとにグループの列（グループ×状態なら列の中を状態で小分け） /
 * 分けない = 下書きもチャットも状態で分けずに 1 つの並び）。プロジェクトのボードの「状態 / グループ」と同じ位置に置く。
 * グループは、段がプロジェクトのとき（groups）だけ出す（グループはプロジェクトごとのもの）。ほかの段で「グループ」を覚えていれば、状態を選んでいる形で出す
 */
export function AllProjectsColumnsToggle({ groups }: { groups: boolean }) {
  const [saved, setValue] = useAllProjectsColumns();
  const [byState, setByState] = useGroupsByState();
  const value = !groups && saved === "groups" ? "state" : saved === "groups" && byState ? "groupsState" : saved;
  return (
    <Segmented<AllProjectsColumns | "groupsState">
      className="view-toggle"
      label="列の分け方"
      value={value}
      onChange={(next) => {
        if (next === "groups" || next === "groupsState") setByState(next === "groupsState");
        setValue(next === "groupsState" ? "groups" : next);
      }}
      options={[
        { value: "state", label: "状態", icon: CircleDot, tip: "下書き・作業中・回答待ち・未読・既読の列に分ける" },
        ...(groups
          ? [{ value: "groups" as const, label: "グループ", icon: Folder, tip: "プロジェクトごとにグループの列に分ける（カードをドラッグしてグループを移す）" }, GROUPS_STATE_OPTION]
          : []),
        { value: "none", label: "分けない", icon: LayoutGrid, tip: "状態で分けずに、下書き → 最近動いた順に並べる" },
      ]}
    />
  );
}
