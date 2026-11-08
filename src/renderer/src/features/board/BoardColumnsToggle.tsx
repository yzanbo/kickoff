import { CircleDot, Folder, FolderKanban } from "lucide-react";
import { useSetting } from "@/hooks/useSetting";
import { navigate } from "@/app/router";
import type { SettingValue } from "@/lib/storage";
import { ALL_PROJECTS_BOARD_COLUMNS, BOARD_GROUPS_BY_STATE, PROJECT_BOARD_COLUMNS } from "@/lib/storageKeys";
import { Segmented } from "@/ui/Segmented";
import { ToggleButtons } from "@/ui/ToggleButtons";

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

/** 全プロジェクトのボードの列の分け方（状態ごと / 分けない。覚えておく） */
export function useAllProjectsColumns() {
  return useSetting(ALL_PROJECTS_BOARD_COLUMNS);
}

/**
 * 全プロジェクトのボードの列の分け方。「状態」と「グループ」をそれぞれオン・オフする（利用者の依頼。前は 状態 / グループ / グループ×状態 / 分けない から 1 つを選んでいた）:
 * 状態だけ = 作業中・回答待ち・未読・既読と下書きの列 / グループだけ = プロジェクトの段ごとにグループの列 / 両方 = グループの列の中を状態で小分け（グループ×状態）/
 * どちらもオフ = 下書きもチャットも状態で分けずに 1 つの並び。覚える値は今までどおり（ALL_PROJECTS_BOARD_COLUMNS の state / groups / none と BOARD_GROUPS_BY_STATE）。
 * グループは、段がプロジェクトのとき（groups）だけ出す（グループはプロジェクトごとのもの）。ほかの段で「グループ」を覚えていれば、状態をオンにした形で出す
 */
export function AllProjectsColumnsToggle({ groups }: { groups: boolean }) {
  const [saved, setValue] = useAllProjectsColumns();
  const [byState, setByState] = useGroupsByState();
  const groupOn = groups && saved === "groups";
  const stateOn = groupOn ? byState : saved !== "none";
  const toggle = (key: "state" | "groups") => {
    if (key === "groups") {
      if (groupOn) setValue(byState ? "state" : "none");
      else {
        setByState(stateOn);
        setValue("groups");
      }
    } else if (groupOn) setByState(!byState);
    else setValue(stateOn ? "none" : "state");
  };
  return (
    <ToggleButtons<"state" | "groups">
      className="view-toggle"
      label="列の分け方"
      onToggle={toggle}
      options={[
        { key: "state", label: "状態", icon: CircleDot, on: stateOn, tip: "状態（作業中・回答待ち・未読・既読）で分ける（押すたびにオン・オフ。グループと両方オンなら、グループの列の中を状態で分ける）" },
        ...(groups
          ? [
              {
                key: "groups" as const,
                label: "グループ",
                icon: Folder,
                on: groupOn,
                tip: "プロジェクトごとにグループの列に分ける（押すたびにオン・オフ。カードをドラッグしてグループを移す）",
              },
            ]
          : []),
      ]}
    />
  );
}
