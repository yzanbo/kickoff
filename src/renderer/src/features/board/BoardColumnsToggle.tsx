import { CircleDot, Folder } from "lucide-react";
import { useSetting } from "@/hooks/useSetting";
import { ALL_PROJECTS_BOARD_COLUMNS, BOARD_GROUPS_BY_STATE, PROJECT_BOARD_COLUMNS } from "@/lib/storageKeys";
import { ToggleButtons } from "@/ui/ToggleButtons";

/** グループの列の中を状態で小分けにするか（列の「状態」と「グループ」の両方オン = グループ×状態。全プロジェクト・プロジェクトのボードで共通） */
export function useGroupsByState() {
  return useSetting(BOARD_GROUPS_BY_STATE);
}

/** ボードの列の分け方（状態ごと / グループの列 / 分けない。全プロジェクトのボードとプロジェクトのボードで別に覚える） */
export function useBoardColumns(allProjects: boolean) {
  return useSetting(allProjects ? ALL_PROJECTS_BOARD_COLUMNS : PROJECT_BOARD_COLUMNS);
}

/**
 * ボードの列の分け方。「状態」と「グループ」をそれぞれオン・オフする（利用者の依頼。全プロジェクトのボードで作り、プロジェクトのボードにも置いた）:
 * 状態だけ = 作業中・回答待ち・未読・既読と下書きの列 / グループだけ = グループの列（カードをドラッグしてグループを移す）/
 * 両方 = グループの列の中を状態で小分け（グループ×状態）/ どちらもオフ = 下書きもチャットも状態で分けずに 1 つの並び。
 * 覚える値は useBoardColumns の state / groups / none と BOARD_GROUPS_BY_STATE。
 * groups でなければ「グループ」を出さない（全プロジェクトのボードは段がプロジェクトのときだけ。グループはプロジェクトごとのもの）。
 * 出さないときに「グループ」を覚えていれば、状態をオンにした形で出す
 */
export function BoardColumnsToggle({ allProjects, groups }: { allProjects: boolean; groups: boolean }) {
  const [saved, setValue] = useBoardColumns(allProjects);
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
                tip: allProjects
                  ? "プロジェクトごとにグループの列に分ける（押すたびにオン・オフ。カードをドラッグしてグループを移す）"
                  : "グループを列にして縦に並べる（押すたびにオン・オフ。カードをドラッグしてグループを移す）",
              },
            ]
          : []),
      ]}
    />
  );
}
